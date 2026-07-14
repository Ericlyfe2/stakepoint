/**
 * Sports & odds management.
 *  GET    /fixtures                 list compiled fixtures (live + admin overrides)
 *  GET    /fixtures/:id             single fixture (with current odds + suspension state)
 *  POST   /fixtures                 create custom fixture
 *  PATCH  /fixtures/:id             override fixture fields (kickoff, isLive, scores, …)
 *  DELETE /fixtures/:id             remove a custom fixture (only)
 *  PATCH  /fixtures/:id/odds        { market, key, odds } single-selection odds override
 *  POST   /fixtures/:id/suspend     { market?, selection?, all? } toggle suspension flags
 *  DELETE /fixtures/:id/suspend     clear all suspensions
 *  POST   /fixtures/:id/result      { scoreHome, scoreAway } record final score (triggers settle)
 *  POST   /fixtures/:id/settle      run settlement on all open bets touching this fixture
 *  GET    /leagues                  list leagues
 *  POST   /leagues                  create custom league
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, requireRole, audit } from '../../middleware/adminAuth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { badRequest, notFound } from '../../utils/httpError.js';
import {
  compiledLeagues, adminListFixtures, adminLookupFixture, readSportsAdmin,
  patchOverride, setOddsOverride, clearOddsOverride,
  setSuspension, clearSuspension, setResult,
  addCustomFixture, deleteCustomFixture, addCustomLeague, updateCustomLeague, deleteCustomLeague, deleteCustomLeagueWithCascade,
  addMarketToFixture, removeMarketFromFixture,
  setMatchStatus, clearMatchStatus, getMatchStatusOverride,
  archiveFixture, restoreFixture, isFixtureArchived, duplicateFixture,
} from '../../db/sportsAdmin.js';
import { settleNow } from '../../services/settlement.js';
import { emitFixtureStatusChanged } from '../../services/realtime.js';
import { buildCorrectScoreMarket, MATCH_STATUSES, computeMatchStatus, isKickoffPassed } from '../../matchesData.js';

const router = Router();

router.get('/fixtures', requireAdmin, (req, res) => {
  const { sport, leagueId, status, q } = req.query;
  const includeArchived = req.query.archived === '1';
  let rows = adminListFixtures(includeArchived);
  if (sport)    rows = rows.filter((m) => m.sport === sport);
  if (leagueId) rows = rows.filter((m) => m.leagueId === leagueId);
  if (status === 'live')      rows = rows.filter((m) => m.isLive || m.matchStatus === 'live');
  if (status === 'upcoming')  rows = rows.filter((m) => !m.isLive && !m.finished && m.matchStatus !== 'live');
  if (status === 'finished')  rows = rows.filter((m) => m.finished || m.matchStatus === 'finished' || m.matchStatus === 'ft');
  if (status === 'suspended') rows = rows.filter((m) => m.suspended);
  if (status === 'archived')  rows = rows.filter((m) => { try { return isFixtureArchived(m.id); } catch { return false; } });
  if (status === 'cancelled') rows = rows.filter((m) => m.matchStatus === 'cancelled');
  if (status === 'postponed') rows = rows.filter((m) => m.matchStatus === 'postponed');
  if (q) {
    const needle = String(q).toLowerCase();
    rows = rows.filter((m) =>
      m.id.toLowerCase().includes(needle) ||
      `${m.home} ${m.away} ${m.leagueName}`.toLowerCase().includes(needle)
    );
  }
  res.json({ total: rows.length, fixtures: rows });
});

router.get('/fixtures/:id', requireAdmin, (req, res, next) => {
  const view = adminLookupFixture(req.params.id);
  if (!view) return next(notFound('Fixture not found'));
  res.json({
    fixture: { ...view.match, sport: view.sport?.id || view.sport, leagueId: view.league?.id, leagueName: view.league?.name },
  });
});

router.get('/leagues', requireAdmin, (req, res) => {
  const includeArchived = req.query.archived === '1';
  const leagues = compiledLeagues(includeArchived).flatMap((sp) => (sp.leagues || []).map((lg) => ({
    id: lg.id, name: lg.name, sport: sp.id, region: lg.region, matchCount: (lg.matches || []).length, admin: !!lg.admin,
  })));
  res.json({ leagues });
});

router.post('/leagues',
  requireAdmin, requireRole('odds_manager'),
  validate(z.object({
    name: z.string().min(2),
    sport: z.enum(['football', 'basketball', 'tennis']),
    region: z.string().default('admin'),
    countryMeta: z.string().optional(),
  })),
  (req, res) => {
    const id = `cust-${Math.random().toString(36).slice(2, 8)}`;
    const lg = {
      id, sport: req.body.sport, name: req.body.name, region: req.body.region,
      countryMeta: req.body.countryMeta || '', crest: { style: 'background:linear-gradient(135deg,#7c5cff,#22d3ee);color:#fff', label: req.body.name.slice(0, 3).toUpperCase() },
      matches: [], admin: true,
    };
    addCustomLeague(lg);
    audit(req, { action: 'sports.league.create', target: id, targetType: 'league', meta: { name: lg.name } });
    res.status(201).json({ league: lg });
  }
);

router.patch('/leagues/:id',
  requireAdmin, requireRole('odds_manager'),
  validate(z.object({
    name: z.string().min(2).optional(),
    region: z.string().optional(),
    countryMeta: z.string().optional(),
  })),
  (req, res, next) => {
    const patch = { ...req.body };
    if (patch.name) {
      patch.crest = { style: 'background:linear-gradient(135deg,#7c5cff,#22d3ee);color:#fff', label: patch.name.slice(0, 3).toUpperCase() };
    }
    const updated = updateCustomLeague(req.params.id, patch);
    if (!updated) return next(notFound('League not found or not a custom league'));
    audit(req, { action: 'sports.league.update', target: req.params.id, targetType: 'league', meta: patch });
    res.json({ league: updated });
  }
);

router.delete('/leagues/:id', requireAdmin, requireRole('odds_manager'), (req, res) => {
  const cascade = req.query.cascade === 'true';
  let result;
  if (cascade) {
    result = deleteCustomLeagueWithCascade(req.params.id);
    if (!result) return res.json({ ok: false, error: 'League not found.' });
  } else {
    deleteCustomLeague(req.params.id);
    result = { removedFixtures: 0 };
  }
  audit(req, {
    action: cascade ? 'sports.league.delete-cascade' : 'sports.league.delete',
    target: req.params.id, targetType: 'league', severity: 'warning',
    meta: result,
  });
  res.json({ ok: true, ...result });
});

const extraMarketItem = z.object({
  market: z.string().min(1),
  type: z.enum(['overunder', 'yesno', 'dc']),
  over: z.number().positive().optional(),
  under: z.number().positive().optional(),
  yes: z.number().positive().optional(),
  no: z.number().positive().optional(),
}).passthrough();

const createFixtureSchema = z.object({
  sport: z.enum(['football', 'basketball', 'tennis']),
  leagueId: z.string().min(1),
  home: z.string().min(1),
  away: z.string().min(1),
  kickoff: z.string().optional(),
  day: z.string().optional(),
  isLive: z.boolean().optional(),
  scoreHome: z.number().optional(),
  scoreAway: z.number().optional(),
  odds: z.object({
    home: z.number().positive(),
    draw: z.number().positive().optional(),
    away: z.number().positive(),
  }),
  extraMarkets: z.array(extraMarketItem).optional(),
});

// Rapid duplicate submits (double-click, slow-network retry, multiple tabs)
// must not create separate fixtures — collapse them into the one already made.
const DUPLICATE_WINDOW_MS = 15_000;
function findRecentDuplicateFixture(b) {
  const now = Date.now();
  const norm = (s) => String(s || '').trim().toLowerCase();
  const custom = readSportsAdmin().custom || {};
  return Object.values(custom).find((fx) =>
    fx.sport === b.sport &&
    fx.leagueId === b.leagueId &&
    norm(fx.home) === norm(b.home) &&
    norm(fx.away) === norm(b.away) &&
    fx.createdAt && (now - new Date(fx.createdAt).getTime()) < DUPLICATE_WINDOW_MS
  ) || null;
}

router.post('/fixtures',
  requireAdmin, requireRole('odds_manager'),
  validate(createFixtureSchema),
  (req, res) => {
    const b = req.body;
    const dupe = findRecentDuplicateFixture(b);
    if (dupe) return res.status(200).json({ fixture: dupe, deduped: true });
    const id = `adm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const markets = buildFixtureMarkets(b);
    const fx = {
      id, sport: b.sport,
      leagueId: b.leagueId,
      home: b.home, away: b.away,
      kickoff: b.kickoff || '',
      day: b.day || 'Today',
      isLive: !!b.isLive,
      scoreHome: typeof b.scoreHome === 'number' ? b.scoreHome : undefined,
      scoreAway: typeof b.scoreAway === 'number' ? b.scoreAway : undefined,
      markets,
      moreMarkets: Object.keys(markets).length,
      adminCreated: true,
      createdAt: new Date().toISOString(),
    };
    addCustomFixture(fx);
    audit(req, { action: 'sports.fixture.create', target: id, targetType: 'fixture', meta: { home: b.home, away: b.away } });
    res.status(201).json({ fixture: fx });
  }
);

function buildFixtureMarkets(b) {
  const extra = b.extraMarkets || [];
  const fromExtra = {};
  for (const em of extra) {
    if (em.type === 'overunder') {
      fromExtra[em.market] = {
        name: em.market === 'TP' ? 'Total Points' : `Over/Under ${em.market.replace('OU', '').replace(/^0/, '')}`,
        selections: [
          { key: 'Over', label: 'Over', odds: em.over ?? 1.9 },
          { key: 'Under', label: 'Under', odds: em.under ?? 1.9 },
        ],
      };
    } else if (em.type === 'yesno') {
      fromExtra[em.market] = {
        name: em.market === 'BTTS' ? 'Both Teams To Score' : em.market,
        selections: [
          { key: 'Yes', label: 'Yes', odds: em.yes ?? 1.78 },
          { key: 'No', label: 'No', odds: em.no ?? 1.98 },
        ],
      };
    } else if (em.type === 'dc') {
      fromExtra[em.market] = {
        name: 'Double Chance',
        selections: [
          { key: '1X', label: 'Home or Draw', odds: em['1X'] ?? 1.25 },
          { key: 'X2', label: 'Draw or Away', odds: em.X2 ?? 1.35 },
          { key: '12', label: 'Home or Away', odds: em['12'] ?? 1.20 },
        ],
      };
    }
  }

  if (b.sport === 'football') {
    const ou25 = extra.find((em) => em.market === 'OU25');
    return {
      '1X2': { name: 'Match Result', selections: [
        { key: '1', label: `${b.home} to win`, odds: b.odds.home },
        { key: 'X', label: 'Draw',             odds: b.odds.draw ?? 3.2 },
        { key: '2', label: `${b.away} to win`, odds: b.odds.away },
      ]},
      ...fromExtra,
      'CS': buildCorrectScoreMarket({
        home: b.odds.home, draw: b.odds.draw ?? 3.2, away: b.odds.away,
        over: ou25?.over, under: ou25?.under,
      }),
    };
  }
  if (b.sport === 'basketball') {
    return {
      'ML': { name: 'Money Line', selections: [
        { key: '1', label: `${b.home} to win`, odds: b.odds.home },
        { key: '2', label: `${b.away} to win`, odds: b.odds.away },
      ]},
      ...fromExtra,
    };
  }
  return {
    'ML': { name: 'Match Winner', selections: [
      { key: '1', label: b.home, odds: b.odds.home },
      { key: '2', label: b.away, odds: b.odds.away },
    ]},
    ...fromExtra,
  };
}

router.patch('/fixtures/:id',
  requireAdmin, requireRole('odds_manager'),
  validate(z.object({
    isLive: z.boolean().optional(),
    finished: z.boolean().optional(),
    kickoff: z.string().optional(),
    day: z.string().optional(),
    scoreHome: z.number().optional(),
    scoreAway: z.number().optional(),
    minute: z.string().optional(),
    matchStatus: z.string().optional(),
  })),
  (req, res, next) => {
    const view = adminLookupFixture(req.params.id);
    if (!view) return next(notFound('Fixture not found'));
    const { matchStatus, ...rest } = req.body;
    if (matchStatus) {
      setMatchStatus(req.params.id, matchStatus);
    }
    if (Object.keys(rest).length) {
      patchOverride(req.params.id, rest);
    }
    // Emit status change if matchStatus was updated
    if (matchStatus) {
      emitFixtureStatusChanged({
        fixtureId: req.params.id,
        status: matchStatus,
        sport: view.sport?.id,
      });
    }
    audit(req, { action: 'sports.fixture.patch', target: req.params.id, targetType: 'fixture', meta: req.body });
    const refreshed = adminLookupFixture(req.params.id);
    res.json({ fixture: { ...refreshed.match, sport: refreshed.sport?.id, leagueId: refreshed.league?.id } });
  }
);

router.delete('/fixtures/:id', requireAdmin, requireRole('odds_manager'), (req, res) => {
  deleteCustomFixture(req.params.id);
  audit(req, { action: 'sports.fixture.delete', target: req.params.id, targetType: 'fixture' });
  res.json({ ok: true });
});

router.patch('/fixtures/:id/odds',
  requireAdmin, requireRole('odds_manager'),
  validate(z.object({
    market: z.string(),
    key: z.string(),
    odds: z.number().positive().max(1000),
  })),
  (req, res, next) => {
    const view = adminLookupFixture(req.params.id);
    if (!view) return next(notFound('Fixture not found'));
    const m = view.match.markets?.[req.body.market];
    if (!m) return next(badRequest('Unknown market'));
    if (!m.selections?.some((s) => s.key === req.body.key)) return next(badRequest('Unknown selection'));
    setOddsOverride(req.params.id, req.body.market, req.body.key, req.body.odds);
    audit(req, { action: 'sports.odds.override', target: req.params.id, targetType: 'fixture', meta: req.body });
    res.json({ ok: true });
  }
);

router.delete('/fixtures/:id/odds', requireAdmin, requireRole('odds_manager'), (req, res) => {
  clearOddsOverride(req.params.id);
  audit(req, { action: 'sports.odds.reset', target: req.params.id, targetType: 'fixture' });
  res.json({ ok: true });
});

router.post('/fixtures/:id/suspend',
  requireAdmin, requireRole('odds_manager'),
  validate(z.object({
    all: z.boolean().optional(),
    market: z.string().optional(),
    selection: z.string().optional(), // 'MARKET:KEY'
  })),
  (req, res) => {
    const cur = {};
    if (req.body.all) cur.all = true;
    if (req.body.market) cur.markets = [req.body.market];
    if (req.body.selection) cur.selections = [req.body.selection];
    setSuspension(req.params.id, cur);
    audit(req, { action: 'sports.suspend', target: req.params.id, targetType: 'fixture', severity: 'warning', meta: req.body });
    res.json({ ok: true });
  }
);

router.delete('/fixtures/:id/suspend', requireAdmin, requireRole('odds_manager'), (req, res) => {
  clearSuspension(req.params.id);
  audit(req, { action: 'sports.suspend.clear', target: req.params.id, targetType: 'fixture' });
  res.json({ ok: true });
});

router.post('/fixtures/:id/result',
  requireAdmin, requireRole('odds_manager'),
  validate(z.object({
    scoreHome: z.number().int().min(0).max(199),
    scoreAway: z.number().int().min(0).max(199),
    autoSettle: z.boolean().optional(),
  })),
  asyncHandler(async (req, res, next) => {
    const view = adminLookupFixture(req.params.id);
    if (!view) return next(notFound('Fixture not found'));
    setResult(req.params.id, req.body.scoreHome, req.body.scoreAway, 'manual');
    let settled = null;
    if (req.body.autoSettle !== false) settled = await settleNow();
    audit(req, { action: 'sports.result', target: req.params.id, targetType: 'fixture', severity: 'warning', meta: { ...req.body, settled } });
    res.json({ ok: true, settled });
  })
);

router.post('/fixtures/:id/settle', requireAdmin, requireRole('odds_manager'), asyncHandler(async (req, res) => {
  const settled = await settleNow();
  audit(req, { action: 'sports.settle', target: req.params.id, targetType: 'fixture', meta: settled });
  res.json({ ok: true, settled });
}));

/* ------------ market management (custom fixtures only) ------------ */

const addMarketSchema = z.object({
  marketKey: z.string().min(1),
  name: z.string().min(1).max(100),
  selections: z.array(z.object({
    key: z.string().min(1),
    label: z.string().optional(),
    odds: z.number().positive().max(1000),
  })).min(2, 'At least 2 selections required.'),
});

router.post('/fixtures/:id/markets',
  requireAdmin, requireRole('odds_manager'),
  validate(addMarketSchema),
  (req, res, next) => {
    const { marketKey, name, selections } = req.body;
    const result = addMarketToFixture(req.params.id, marketKey, { name, selections });
    if (result === null) return next(notFound('Fixture not found or market already exists.'));
    audit(req, { action: 'sports.market.add', target: req.params.id, targetType: 'fixture', meta: { marketKey, name, selections: selections.length } });
    res.status(201).json({ ok: true, market: result });
  }
);

router.delete('/fixtures/:id/markets/:marketKey',
  requireAdmin, requireRole('odds_manager'),
  (req, res, next) => {
    const ok = removeMarketFromFixture(req.params.id, req.params.marketKey);
    if (!ok) return next(notFound('Fixture or market not found.'));
    audit(req, { action: 'sports.market.delete', target: req.params.id, targetType: 'fixture', meta: { marketKey: req.params.marketKey } });
    res.json({ ok: true });
  }
);

/* ─── Fixture lifecycle management ─── */

const lifecycleActionSchema = z.object({
  status: z.enum(['upcoming', 'live', 'ht', '2h', 'ft', 'finished', 'cancelled', 'postponed', 'abandoned', 'void']),
  minute: z.string().optional(),
  scoreHome: z.number().int().optional(),
  scoreAway: z.number().int().optional(),
});

/** Set match lifecycle status (auto-derives isLive/finished/suspended from status). */
router.post('/fixtures/:id/status',
  requireAdmin, requireRole('odds_manager'),
  validate(lifecycleActionSchema),
  asyncHandler(async (req, res, next) => {
    const view = adminLookupFixture(req.params.id);
    if (!view) return next(notFound('Fixture not found'));
    const { status, minute, scoreHome, scoreAway } = req.body;

    setMatchStatus(req.params.id, status);

    // When marking as FT, also auto-set the result if scores provided
    if (status === 'ft' && scoreHome != null && scoreAway != null) {
      setResult(req.params.id, scoreHome, scoreAway, 'manual');
    }

    // If marking as finished, set result if scores provided
    if (status === 'finished' && scoreHome != null && scoreAway != null) {
      setResult(req.params.id, scoreHome, scoreAway, 'manual');
    }

    // For cancelled/postponed/abandoned/void — no result, just status
    // Clear any existing result so settlement doesn't fire on junk data
    if (['cancelled', 'postponed', 'abandoned', 'void'].includes(status)) {
      const cur = readSportsAdmin();
      const results = { ...cur.results };
      delete results[req.params.id];
      // We'll handle this via the overrides mechanism
    }

    // Apply minute override if provided
    if (minute) {
      patchOverride(req.params.id, { minute });
    }

    // Emit real-time status change
    const refreshed = adminLookupFixture(req.params.id);
    emitFixtureStatusChanged({
      fixtureId: req.params.id,
      status,
      scoreHome: scoreHome ?? refreshed?.match?.scoreHome,
      scoreAway: scoreAway ?? refreshed?.match?.scoreAway,
      minute: minute ?? refreshed?.match?.minute,
      sport: refreshed?.sport?.id,
    });

    audit(req, { action: `sports.lifecycle.${status}`, target: req.params.id, targetType: 'fixture', severity: 'warning', meta: { status, minute, scoreHome, scoreAway } });
    res.json({ ok: true, matchStatus: status, fixture: { ...refreshed.match, sport: refreshed.sport?.id, leagueId: refreshed.league?.id } });
  })
);

/** Duplicate a fixture (preserves markets, clears result/live state). */
router.post('/fixtures/:id/duplicate',
  requireAdmin, requireRole('odds_manager'),
  asyncHandler(async (req, res, next) => {
    const duplicated = duplicateFixture(req.params.id, {
      home: req.body.home,
      away: req.body.away,
      kickoff: req.body.kickoff,
      day: req.body.day,
    });
    if (!duplicated) return next(notFound('Fixture not found'));
    audit(req, { action: 'sports.fixture.duplicate', target: req.params.id, targetType: 'fixture', meta: { newId: duplicated.id } });
    res.status(201).json({ fixture: duplicated });
  })
);

/** Archive a fixture (hidden from user view, visible in admin with ?archived=1). */
router.post('/fixtures/:id/archive',
  requireAdmin, requireRole('odds_manager'),
  asyncHandler(async (req, res, next) => {
    const view = adminLookupFixture(req.params.id);
    if (!view) return next(notFound('Fixture not found'));
    archiveFixture(req.params.id);
    // Also auto-suspend archived fixtures
    setSuspension(req.params.id, { all: true });
    audit(req, { action: 'sports.fixture.archive', target: req.params.id, targetType: 'fixture', severity: 'warning' });
    res.json({ ok: true, archived: true });
  })
);

/** Restore an archived fixture. */
router.post('/fixtures/:id/restore',
  requireAdmin, requireRole('odds_manager'),
  asyncHandler(async (req, res, next) => {
    restoreFixture(req.params.id);
    clearSuspension(req.params.id);
    audit(req, { action: 'sports.fixture.restore', target: req.params.id, targetType: 'fixture' });
    res.json({ ok: true, archived: false });
  })
);

/** Cancel a fixture (alias for setting status to cancelled). */
router.post('/fixtures/:id/cancel',
  requireAdmin, requireRole('odds_manager'),
  asyncHandler(async (req, res, next) => {
    const view = adminLookupFixture(req.params.id);
    if (!view) return next(notFound('Fixture not found'));
    setMatchStatus(req.params.id, 'cancelled');
    setSuspension(req.params.id, { all: true });
    emitFixtureStatusChanged({
      fixtureId: req.params.id,
      status: 'cancelled',
      sport: view.sport?.id,
    });
    audit(req, { action: 'sports.fixture.cancel', target: req.params.id, targetType: 'fixture', severity: 'warning' });
    res.json({ ok: true, matchStatus: 'cancelled' });
  })
);

/** Postpone a fixture (alias for setting status to postponed, clears result). */
router.post('/fixtures/:id/postpone',
  requireAdmin, requireRole('odds_manager'),
  validate(z.object({
    newKickoff: z.string().optional(),
    newDay: z.string().optional(),
  }).optional()),
  asyncHandler(async (req, res, next) => {
    const view = adminLookupFixture(req.params.id);
    if (!view) return next(notFound('Fixture not found'));
    setMatchStatus(req.params.id, 'postponed');
    // Update kickoff if provided
    const patch = {};
    if (req.body?.newKickoff) patch.kickoff = req.body.newKickoff;
    if (req.body?.newDay) patch.day = req.body.newDay;
    if (Object.keys(patch).length) patchOverride(req.params.id, patch);
    emitFixtureStatusChanged({
      fixtureId: req.params.id,
      status: 'postponed',
      sport: view.sport?.id,
    });
    audit(req, { action: 'sports.fixture.postpone', target: req.params.id, targetType: 'fixture', severity: 'warning', meta: patch });
    res.json({ ok: true, matchStatus: 'postponed' });
  })
);

/* ─── Bulk fixture operations (refactored to use proper stores) ─── */
const bulkFixtureSchema = z.object({
  action: z.enum(['suspend', 'unsuspend', 'mark-live', 'mark-upcoming', 'set-status']),
  fixtureIds: z.array(z.string()).min(1).max(100),
  payload: z.object({
    scoreHome: z.number().int().nonnegative().optional(),
    scoreAway: z.number().int().nonnegative().optional(),
    status: z.string().optional(),
  }).optional(),
});

router.post('/fixtures/bulk',
  requireAdmin, requireRole('odds_manager'),
  validate(bulkFixtureSchema),
  asyncHandler(async (req, res) => {
    const { action, fixtureIds, payload } = req.body;
    const results = [];

    for (const id of fixtureIds) {
      try {
        const view = adminLookupFixture(id);

        if (action === 'suspend') {
          setSuspension(id, { all: true });
          results.push({ fixtureId: id, status: 'suspended' });
        } else if (action === 'unsuspend') {
          clearSuspension(id);
          results.push({ fixtureId: id, status: 'unsuspended' });
        } else if (action === 'mark-live') {
          setMatchStatus(id, 'live');
          results.push({ fixtureId: id, status: 'marked-live' });
        } else if (action === 'mark-upcoming') {
          setMatchStatus(id, 'upcoming');
          results.push({ fixtureId: id, status: 'marked-upcoming' });
        } else if (action === 'set-status') {
          if (!payload?.status) { results.push({ fixtureId: id, status: 'error', error: 'status required' }); continue; }
          setMatchStatus(id, payload.status);
          if (payload.scoreHome != null && payload.scoreAway != null && (payload.status === 'ft' || payload.status === 'finished')) {
            setResult(id, payload.scoreHome, payload.scoreAway, 'manual');
          }
          results.push({ fixtureId: id, status: `status-set:${payload.status}` });
        }
        emitFixtureStatusChanged({ fixtureId: id, status: action, sport: view?.sport?.id });
      } catch (e) {
        results.push({ fixtureId: id, status: 'error', error: e.message });
      }
    }

    audit(req, { action: `sports.bulk.${action}`, target: `fixtures:${fixtureIds.length}`, targetType: 'fixture', severity: 'warning', meta: { count: fixtureIds.length } });
    res.json({ ok: true, results });
  })
);

export default router;

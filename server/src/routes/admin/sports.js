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
  compiledLeagues, adminListFixtures, adminLookupFixture,
  patchOverride, setOddsOverride, clearOddsOverride,
  setSuspension, clearSuspension, setResult,
  addCustomFixture, deleteCustomFixture, addCustomLeague,
  addMarketToFixture, removeMarketFromFixture,
} from '../../db/sportsAdmin.js';
import { settleNow } from '../../services/settlement.js';

const router = Router();

router.get('/fixtures', requireAdmin, (req, res) => {
  const { sport, leagueId, status, q } = req.query;
  let rows = adminListFixtures();
  if (sport)    rows = rows.filter((m) => m.sport === sport);
  if (leagueId) rows = rows.filter((m) => m.leagueId === leagueId);
  if (status === 'live')      rows = rows.filter((m) => m.isLive);
  if (status === 'upcoming')  rows = rows.filter((m) => !m.isLive && !m.finished);
  if (status === 'finished')  rows = rows.filter((m) => m.finished);
  if (status === 'suspended') rows = rows.filter((m) => m.suspended);
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

router.get('/leagues', requireAdmin, (_req, res) => {
  const leagues = compiledLeagues().flatMap((sp) => (sp.leagues || []).map((lg) => ({
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

router.post('/fixtures',
  requireAdmin, requireRole('odds_manager'),
  validate(createFixtureSchema),
  (req, res) => {
    const b = req.body;
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
    return {
      '1X2': { name: 'Match Result', selections: [
        { key: '1', label: `${b.home} to win`, odds: b.odds.home },
        { key: 'X', label: 'Draw',             odds: b.odds.draw ?? 3.2 },
        { key: '2', label: `${b.away} to win`, odds: b.odds.away },
      ]},
      ...fromExtra,
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
  })),
  (req, res, next) => {
    const view = adminLookupFixture(req.params.id);
    if (!view) return next(notFound('Fixture not found'));
    patchOverride(req.params.id, req.body);
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
    if (req.body.autoSettle !== false) settled = settleNow();
    audit(req, { action: 'sports.result', target: req.params.id, targetType: 'fixture', severity: 'warning', meta: { ...req.body, settled } });
    res.json({ ok: true, settled });
  })
);

router.post('/fixtures/:id/settle', requireAdmin, requireRole('odds_manager'), (req, res) => {
  const settled = settleNow();
  audit(req, { action: 'sports.settle', target: req.params.id, targetType: 'fixture', meta: settled });
  res.json({ ok: true, settled });
});

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

/* ─── Bulk fixture operations ─── */
const bulkFixtureSchema = z.object({
  action: z.enum(['suspend', 'unsuspend', 'mark-live', 'mark-upcoming', 'set-result']),
  fixtureIds: z.array(z.string()).min(1).max(100),
  payload: z.object({
    scoreHome: z.number().int().nonnegative().optional(),
    scoreAway: z.number().int().nonnegative().optional(),
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
        const fixture = compiledStore.get(id);
        if (!fixture) { results.push({ fixtureId: id, status: 'error', error: 'Not found' }); continue; }
        const isCustom = fixture.source === 'custom';

        if (action === 'suspend') {
          const updated = { ...fixture, suspended: true, suspendedAt: new Date().toISOString() };
          compiledStore.set(id, updated);
          results.push({ fixtureId: id, status: 'suspended' });
        } else if (action === 'unsuspend') {
          const updated = { ...fixture, suspended: false, suspendedAt: null };
          compiledStore.set(id, updated);
          results.push({ fixtureId: id, status: 'unsuspended' });
        } else if (action === 'mark-live') {
          const updated = { ...fixture, isLive: true, status: 'live', startedAt: fixture.startedAt || new Date().toISOString() };
          compiledStore.set(id, updated);
          results.push({ fixtureId: id, status: 'marked-live' });
        } else if (action === 'mark-upcoming') {
          const updated = { ...fixture, isLive: false, status: 'upcoming' };
          compiledStore.set(id, updated);
          results.push({ fixtureId: id, status: 'marked-upcoming' });
        } else if (action === 'set-result') {
          if (!isCustom) { results.push({ fixtureId: id, status: 'error', error: 'Can only set result on custom fixtures' }); continue; }
          const sh = payload?.scoreHome ?? fixture.scoreHome ?? 0;
          const sa = payload?.scoreAway ?? fixture.scoreAway ?? 0;
          const updated = { ...fixture, scoreHome: sh, scoreAway: sa, status: 'finished', isLive: false };
          compiledStore.set(id, updated);
          results.push({ fixtureId: id, status: 'result-set', scoreHome: sh, scoreAway: sa });
        }
      } catch (e) {
        results.push({ fixtureId: id, status: 'error', error: e.message });
      }
    }

    audit(req, { action: `sports.bulk.${action}`, target: `fixtures:${fixtureIds.length}`, targetType: 'fixture', severity: 'warning', meta: { count: fixtureIds.length } });
    res.json({ ok: true, results });
  })
);

export default router;

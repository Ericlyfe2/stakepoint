import { Router } from 'express';
import { z } from 'zod';
import {
  SPORTS,
  CASINO_GAMES,
  VIRTUAL_LEAGUES,
  JACKPOT_GAME,
  PROMOTIONS,
  getMatchById,
  getOddsSnapshot,
  getSport,
  lookupSelection,
  buildSeedSelections,
  ensureFreshLeagues,
  BONUS_RATE,
  CURRENCY,
} from '../matchesData.js';
import {
  adminLookupSelection, adminLookupFixture, buildPublicSnapshot,
} from '../db/sportsAdmin.js';
import { listActivePromotions } from '../db/promotions.js';
import { oddsApiStatus } from '../services/oddsApi.js';
import { createStore } from '../db/store.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { badRequest, conflict, notFound, unauthorized } from '../utils/httpError.js';
import { updateUser, logActivity } from '../db/users.js';
import { pushTx } from './wallet.js';
import { emitAdmin, emitToUser } from '../services/realtime.js';

const router = Router();

const betsStore        = createStore('bets', {});         // { betId: receipt }
const jackpotStore     = createStore('jackpot_entries', {});

function pushBet(receipt) {
  betsStore.set(receipt.id, receipt);
}
function listUserBets(userId) {
  return Object.values(betsStore.all())
    .filter((b) => b.userId === userId)
    .sort((a, b) => (a.placedAt < b.placedAt ? 1 : -1));
}

/* ------------ schemas ------------ */
const placeSchema = z.object({
  mode: z.enum(['single', 'multiple', 'system']).default('multiple'),
  stake: z.union([z.number(), z.string()]).transform((v) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
    if (!Number.isFinite(n) || n <= 0) throw new Error('Enter a valid stake amount.');
    return n;
  }),
  selections: z.array(z.object({
    matchId: z.string().min(1),
    market:  z.string().default('1X2'),
    outcome: z.string().min(1),
    odds:    z.union([z.number(), z.string()]).transform((v) => Number(v)),
  })).min(1, 'Add at least one selection.'),
});

const jackpotEnterSchema = z.object({
  picks: z.record(z.string(), z.string()),
});

/* ------------ public meta ------------ */

router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'xenbet-betting-api', oddsApi: oddsApiStatus() });
});

router.get('/sports', (_req, res) => {
  res.json({
    updatedAt: new Date().toISOString(),
    sports: SPORTS.map((s) => ({
      id: s.id,
      name: s.name,
      leagueCount: s.leagues.length,
      matchCount: s.leagues.reduce((n, l) => n + l.matches.length, 0),
    })),
  });
});

router.get('/matches', asyncHandler(async (req, res) => {
  const sport = String(req.query.sport || 'football').toLowerCase();
  if (!getSport(sport)) throw notFound(`Unknown sport "${sport}"`);
  await ensureFreshLeagues(sport);
  res.json({
    updatedAt: new Date().toISOString(),
    currency: CURRENCY,
    ...buildPublicSnapshot(sport, buildSeedSelections),
  });
}));

router.get('/matches/:matchId', asyncHandler(async (req, res) => {
  await ensureFreshLeagues('football');
  const row = adminLookupFixture(req.params.matchId);
  if (!row) throw notFound('Match not found');
  res.json({
    updatedAt: new Date().toISOString(),
    currency: CURRENCY,
    sport: row.sport?.id || row.sport,
    league: {
      id: row.league.id,
      name: row.league.name,
      region: row.league.region,
      countryMeta: row.league.countryMeta,
      crest: row.league.crest,
    },
    match: row.match,
  });
}));

router.get('/leagues', asyncHandler(async (req, res) => {
  const sport = String(req.query.sport || 'football').toLowerCase();
  const sp = getSport(sport);
  if (!sp) throw notFound(`Unknown sport "${sport}"`);
  await ensureFreshLeagues(sport);
  res.json({
    updatedAt: new Date().toISOString(),
    sport: sp.id,
    leagues: sp.leagues.map((lg) => ({
      id: lg.id, name: lg.name, region: lg.region,
      countryMeta: lg.countryMeta, crest: lg.crest,
      matchCount: lg.matches.length,
    })),
  });
}));

router.get('/leagues/:leagueId/matches', asyncHandler(async (req, res) => {
  await ensureFreshLeagues('football');
  for (const sp of SPORTS) {
    const lg = sp.leagues.find((l) => l.id === req.params.leagueId);
    if (lg) {
      return res.json({
        updatedAt: new Date().toISOString(),
        currency: CURRENCY,
        sport: sp.id,
        league: { id: lg.id, name: lg.name, region: lg.region, countryMeta: lg.countryMeta, crest: lg.crest },
        matches: lg.matches,
      });
    }
  }
  throw notFound('League not found');
}));

/* ------------ authenticated bet operations ------------ */

router.post('/place',
  requireAuth,
  validate(placeSchema),
  asyncHandler(async (req, res) => {
    const { mode, stake, selections } = req.body;
    const user = req.user;
    if (stake > user.balance) throw badRequest('Insufficient balance.');

    const seen = new Set();
    const normalized = [];
    for (const sel of selections) {
      const dedupe = `${sel.matchId}:${sel.market}:${sel.outcome}`;
      if (seen.has(dedupe)) throw badRequest(`Duplicate selection ${sel.market} ${sel.outcome}.`);
      seen.add(dedupe);
      const found = adminLookupSelection({ matchId: sel.matchId, market: sel.market, outcome: sel.outcome });
      if (!found) throw badRequest(`Invalid selection ${sel.market} ${sel.outcome} for match ${sel.matchId}.`);
      const fxView = found.row?.match || found.row;
      if (fxView?.finished || fxView?.suspended) throw conflict('Market closed — fixture is no longer available.', { code: 'MARKET_CLOSED' });
      if (found.market?.suspended || found.selection?.suspended) {
        throw conflict('Selection suspended — refresh and try a different market.', { code: 'SELECTION_SUSPENDED' });
      }
      const serverOdds = found.selection.odds;
      // Live odds drift constantly. Only reject when the price *dropped*
      // by more than 15%, which would meaningfully hurt the player.
      // Anything else: silently accept the server's current odds.
      const clientOdds = Number.isFinite(sel.odds) ? sel.odds : serverOdds;
      const droppedTooMuch = serverOdds < clientOdds * 0.85;
      if (droppedTooMuch) {
        throw conflict('Odds dropped significantly — refresh the fixture list.', {
          code: 'ODDS_CHANGED',
          matchId: sel.matchId,
          market: sel.market,
          outcome: sel.outcome,
          expectedOdds: serverOdds,
        });
      }
      normalized.push({
        matchId: sel.matchId, market: sel.market, outcome: sel.outcome, odds: serverOdds,
        home: found.row.match.home, away: found.row.match.away,
        marketName: found.row.match.markets?.[sel.market]?.name || sel.market,
      });
    }
    if (mode === 'single' && normalized.length > 1) throw badRequest('Single mode allows only one selection.');
    if (mode === 'system' && normalized.length < 2) throw badRequest('System bets need at least two selections.');

    const totalOdds = mode === 'single' ? normalized[0].odds : normalized.reduce((acc, s) => acc * s.odds, 1);
    const potentialWin = stake * totalOdds * (1 + BONUS_RATE);

    const id = `bv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const receipt = {
      id,
      userId: user.id,
      placedAt: new Date().toISOString(),
      mode,
      stake: Number(stake.toFixed(2)),
      currency: CURRENCY,
      totalOdds: Number(totalOdds.toFixed(4)),
      potentialWin: Number(potentialWin.toFixed(2)),
      bonusRate: BONUS_RATE,
      legs: normalized,
      status: 'open',
    };
    pushBet(receipt);

    const updated = updateUser(user.id, { balance: Number((user.balance - stake).toFixed(2)) });
    pushTx(user.id, {
      kind: 'bet_placed', amount: -stake, status: 'completed',
      balanceAfter: updated.balance, ref: id,
    });
    logActivity(user.id, { kind: 'bet_placed', betId: id, stake });

    // Realtime: notify the player's other tabs/devices and the admin observability dashboard.
    emitToUser(user.id, 'wallet:update', { balance: updated.balance, delta: -stake, reason: 'bet:placed', ref: id });
    emitAdmin('bet:placed', { betId: id, userId: user.id, stake, mode, legs: normalized.length });

    res.status(201).json({
      ok: true,
      bet: receipt,
      account: { ...updated, passwordHash: undefined, googleId: undefined, activity: undefined },
    });
  })
);

router.get('/history', requireAuth, (req, res) => {
  res.json({ bets: listUserBets(req.user.id) });
});

// IMPORTANT: this literal route must come BEFORE /bets/:id or Express will
// match "unacknowledged" as an id.
router.get('/bets/unacknowledged', requireAuth, (req, res) => {
  const wins = Object.values(betsStore.all() || {}).filter((b) =>
    b.userId === req.user.id && b.wonNotAcknowledged
  );
  res.json({ bets: wins });
});

router.post('/bets/:id/ack', requireAuth, (req, res, next) => {
  const bet = betsStore.get(req.params.id);
  if (!bet || bet.userId !== req.user.id) return next(notFound('Bet not found'));
  if (bet.wonNotAcknowledged) {
    bet.wonNotAcknowledged = false;
    bet.acknowledgedAt = new Date().toISOString();
    betsStore.set(bet.id, bet);
  }
  res.json({ ok: true, bet });
});

router.get('/bets/:id', requireAuth, (req, res, next) => {
  const bet = betsStore.get(req.params.id);
  if (!bet || bet.userId !== req.user.id) return next(notFound('Bet not found'));
  res.json({ bet });
});

router.delete('/bets/:id', requireAuth, asyncHandler(async (req, res) => {
  const bet = betsStore.get(req.params.id);
  if (!bet || bet.userId !== req.user.id) throw notFound('Bet not found');
  if (bet.status !== 'open') throw conflict('Bet is already settled and cannot be cashed out.');

  const cashOut = Number((bet.stake * (bet.totalOdds * 0.6)).toFixed(2));
  bet.status = 'cashed_out';
  bet.cashOut = cashOut;
  betsStore.set(bet.id, bet);

  const updated = updateUser(req.user.id, {
    balance: Number((req.user.balance + cashOut).toFixed(2)),
  });
  pushTx(req.user.id, {
    kind: 'cash_out', amount: cashOut, status: 'completed',
    balanceAfter: updated.balance, ref: bet.id,
  });
  logActivity(req.user.id, { kind: 'cash_out', betId: bet.id, cashOut });

  res.json({
    ok: true, bet,
    account: { ...updated, passwordHash: undefined, googleId: undefined, activity: undefined },
  });
}));

/* ------------ casino, virtuals, jackpot, promos ------------ */

router.get('/casino/games', (req, res) => {
  const cat = String(req.query.category || '').toLowerCase();
  const list = cat ? CASINO_GAMES.filter((g) => g.category.toLowerCase() === cat) : CASINO_GAMES;
  res.json({ games: list });
});

router.get('/virtuals', (_req, res) => res.json({ leagues: VIRTUAL_LEAGUES }));

router.get('/jackpot', (_req, res) => res.json({ jackpot: JACKPOT_GAME }));

router.post('/jackpot/enter',
  requireAuth,
  validate(jackpotEnterSchema),
  asyncHandler(async (req, res) => {
    const { picks } = req.body;
    const user = req.user;
    if (user.balance < JACKPOT_GAME.entryFee) throw badRequest('Insufficient balance for jackpot entry.');
    const missing = JACKPOT_GAME.legs.filter((l) => !picks[l.id]);
    if (missing.length) throw badRequest(`Pick missing for ${missing.length} leg(s).`);
    for (const leg of JACKPOT_GAME.legs) {
      if (!leg.outcomes.includes(picks[leg.id])) {
        throw badRequest(`Invalid pick "${picks[leg.id]}" for ${leg.fixture}.`);
      }
    }
    const id = `jp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const entry = {
      id, userId: user.id, placedAt: new Date().toISOString(),
      fee: JACKPOT_GAME.entryFee, currency: CURRENCY, picks, drawsIn: JACKPOT_GAME.drawsIn,
    };
    jackpotStore.set(id, entry);
    const updated = updateUser(user.id, {
      balance: Number((user.balance - JACKPOT_GAME.entryFee).toFixed(2)),
    });
    pushTx(user.id, { kind: 'jackpot_entry', amount: -JACKPOT_GAME.entryFee, status: 'completed', balanceAfter: updated.balance, ref: id });
    logActivity(user.id, { kind: 'jackpot_entry', entryId: id });
    res.status(201).json({ ok: true, entry, account: { ...updated, passwordHash: undefined, googleId: undefined, activity: undefined } });
  })
);

router.get('/promos', (_req, res) => {
  const fromStore = listActivePromotions();
  res.json({ promotions: fromStore.length ? fromStore : PROMOTIONS });
});

export default router;

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
import { SYSTEM_TYPES, maxSystemReturn } from '../lib/systemBets.js';
import * as cashOutEngine from '../services/cashOutEngine.js';
import { LIVE_BETTING } from '../config/env.js';

const router = Router();

// AF36513 — 2 uppercase letters + 5 digits.
function generateBookingCode() {
  const A = 'ABCDEFGHIJKLMNPQRSTUVWXYZ'; // dropped 'O' to avoid 0/O confusion
  const D = '123456789';
  const letters = A[Math.floor(Math.random() * A.length)] + A[Math.floor(Math.random() * A.length)];
  let digits = '';
  for (let i = 0; i < 5; i++) digits += D[Math.floor(Math.random() * D.length)];
  return letters + digits;
}

function uniqueBookingCode() {
  const all = betsStore.all();
  for (let i = 0; i < 25; i++) {
    const code = generateBookingCode();
    const taken = Object.values(all).some((b) => b.bookingCode === code);
    if (!taken) return code;
  }
  // 7-char namespace is huge; this is just paranoia.
  return generateBookingCode() + Math.floor(Math.random() * 9 + 1);
}

const betsStore        = createStore('bets', {});         // { betId: receipt }
const jackpotStore     = createStore('jackpot_entries', {});

function pushBet(receipt) {
  betsStore.set(receipt.id, receipt);
}
function listUserBets(userId) {
  return Object.values(betsStore.all())
    .filter((b) => b.userId === userId)
    .sort((a, b) => (a.placedAt < b.placedAt ? 1 : -1))
    .map(attachCashoutOffer);
}

/** Attach the cash-out display value consistent with what the server would offer. */
function attachCashoutOffer(bet) {
  if (bet.status !== 'open') return bet;
  if (bet.lastCashOutOffer?.amount != null) return bet;
  const cashoutOffer = bet.mode === 'system'
    ? Number((bet.stake * bet.totalOdds * 0.6).toFixed(2))
    : Number((bet.stake * (1 - LIVE_BETTING.houseMargin)).toFixed(2));
  return { ...bet, cashoutOffer };
}

/* ------------ schemas ------------ */
const placeSchema = z.object({
  mode: z.enum(['single', 'multiple', 'system']).default('multiple'),
  // For single/multiple this is the total stake. For system it's the
  // STAKE PER LINE — total stake is line-count × this value.
  stake: z.union([z.number(), z.string()]).transform((v) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
    if (!Number.isFinite(n) || n <= 0) throw new Error('Enter a valid stake amount.');
    return n;
  }),
  // System-bet metadata — required when mode === 'system'.
  systemType: z.string().optional(),
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

const cashoutSchema = z.object({
  acceptedAmount: z.union([z.number(), z.string()])
    .optional()
    .transform((v) => v === undefined ? undefined : Number(v))
    .refine((v) => v === undefined || (Number.isFinite(v) && v >= 0), 'invalid acceptedAmount'),
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

router.get('/code/:code', (req, res, next) => {
  const code = String(req.params.code || '').toUpperCase();
  const bet = Object.values(betsStore.all()).find((b) => b.bookingCode === code);
  if (!bet) return next(notFound('Booking code not found'));
  const { userId, ...publicBet } = bet;
  res.json({ bet: publicBet });
});

router.post('/place',
  requireAuth,
  validate(placeSchema),
  asyncHandler(async (req, res) => {
    const { mode, stake, selections, systemType } = req.body;
    const user = req.user;

    const seen = new Set();
    const normalized = [];
    for (const sel of selections) {
      const dedupe = `${sel.matchId}:${sel.market}:${sel.outcome}`;
      if (seen.has(dedupe)) return res.json({ success: false, error: `Duplicate selection ${sel.market} ${sel.outcome}.` });
      seen.add(dedupe);
      const found = adminLookupSelection({ matchId: sel.matchId, market: sel.market, outcome: sel.outcome });
      if (!found) return res.json({ success: false, error: `Invalid selection ${sel.market} ${sel.outcome} for match ${sel.matchId}.` });
      const fxView = found.row?.match || found.row;
      // Only block placement when the market is *actually* closed:
      //   - admin has explicitly suspended the fixture, or
      //   - the fixture has a real authoritative result (manual or feed).
      // Auto-simulated demo results (finalSource === 'simulated') should not
      // block bets — the engine will settle them on the next tick using the
      // same simulated score, so the user still gets a booking code now.
      const hasRealResult = fxView?.finished && (fxView.finalSource === 'feed' || fxView.finalSource === 'manual');
      if (hasRealResult || fxView?.suspended) {
        return res.json({ success: false, error: 'Market closed — fixture is no longer available.', code: 'MARKET_CLOSED' });
      }
      if (found.market?.suspended || found.selection?.suspended) {
        return res.json({ success: false, error: 'Selection suspended — refresh and try a different market.', code: 'SELECTION_SUSPENDED' });
      }
      const serverOdds = found.selection.odds;
      // Live odds drift constantly. Only reject when the price *dropped*
      // by more than 15%, which would meaningfully hurt the player.
      // Anything else: silently accept the server's current odds.
      const clientOdds = Number.isFinite(sel.odds) ? sel.odds : serverOdds;
      const droppedTooMuch = serverOdds < clientOdds * 0.85;
      if (droppedTooMuch) {
        return res.json({
          success: false,
          error: 'Odds dropped significantly — refresh the fixture list.',
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
    if (mode === 'single' && normalized.length > 1) return res.json({ success: false, error: 'Single mode allows only one selection.' });
    if (mode === 'multiple' && normalized.length < 2) return res.json({ success: false, error: 'Multiple bets need at least two selections.' });

    // Compute totals based on the bet mode.
    let totalOdds, totalStake, potentialWin, systemDef = null, linesCount = null, stakePerLine = null;

    if (mode === 'system') {
      const key = String(systemType || '').toLowerCase();
      systemDef = SYSTEM_TYPES[key];
      if (!systemDef) return res.json({ success: false, error: `Unknown system type "${systemType}". Pick one of: ${Object.keys(SYSTEM_TYPES).join(', ')}.` });
      if (normalized.length !== systemDef.selections) {
        return res.json({ success: false, error: `${systemDef.label} needs exactly ${systemDef.selections} selections (you have ${normalized.length}).` });
      }
      stakePerLine = Number(stake);
      linesCount   = systemDef.totalLines;
      totalStake   = Number((stakePerLine * linesCount).toFixed(2));
      // For system bets, "totalOdds" doesn't really exist; we expose the
      // max return divided by total stake as a rough headline number so
      // the bet history list has something useful to show.
      potentialWin = Number(maxSystemReturn(normalized.map((s) => s.odds), key, stakePerLine).toFixed(2));
      totalOdds    = Number((potentialWin / totalStake).toFixed(4));
    } else {
      totalStake   = Number(stake);
      totalOdds    = mode === 'single' ? normalized[0].odds : normalized.reduce((acc, s) => acc * s.odds, 1);
      potentialWin = totalStake * totalOdds * (1 + BONUS_RATE);
    }

    if (totalStake < 300) {
      return res.json({ success: false, error: `Minimum stake is GHS 300. This ticket requires only GHS ${totalStake.toFixed(2)}.` });
    }
    if (totalStake > user.balance) {
      return res.json({ success: false, error: `Insufficient balance. This ticket requires GHS ${totalStake.toFixed(2)} (your balance is GHS ${user.balance.toFixed(2)}).` });
    }

    const id = `bv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const bookingCode = uniqueBookingCode();
    const receipt = {
      id,
      bookingCode,
      userId: user.id,
      placedAt: new Date().toISOString(),
      mode,
      stake: Number(totalStake.toFixed(2)),
      currency: CURRENCY,
      totalOdds: Number(totalOdds.toFixed(4)),
      potentialWin: Number(potentialWin.toFixed(2)),
      bonusRate: BONUS_RATE,
      legs: normalized,
      status: 'open',
      lastCashOutOffer: null,
      cashOutHistory:   [],
      ...(mode === 'system' && {
        systemType: systemType.toLowerCase(),
        systemLabel: systemDef.label,
        linesCount,
        stakePerLine,
      }),
    };
    pushBet(receipt);

    // Index this bet so live ticks can recompute its cash-out offer.
    cashOutEngine.registerBet(receipt);

    const updated = updateUser(user.id, { balance: Number((user.balance - totalStake).toFixed(2)) });
    pushTx(user.id, {
      kind: 'bet_placed', amount: -totalStake, status: 'completed',
      balanceAfter: updated.balance, ref: id,
    });
    logActivity(user.id, { kind: 'bet_placed', betId: id, stake: totalStake });

    // Realtime: notify the player's other tabs/devices and the admin observability dashboard.
    emitToUser(user.id, 'wallet:update', { balance: updated.balance, delta: -totalStake, reason: 'bet:placed', ref: id });
    emitAdmin('bet:placed', { betId: id, userId: user.id, stake: totalStake, mode, legs: normalized.length });

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

router.delete('/bets/:id',
  requireAuth,
  validate(cashoutSchema),
  asyncHandler(async (req, res) => {
    const bet = betsStore.get(req.params.id);
    if (!bet || bet.userId !== req.user.id) throw notFound('Bet not found');
    if (bet.status !== 'open') throw conflict('Bet is already settled and cannot be cashed out.', { code: 'ALREADY_SETTLED' });

    let cashOut;
    if (bet.mode === 'system') {
      // System bets keep the legacy formula in v1. acceptedAmount ignored.
      cashOut = Number((bet.stake * bet.totalOdds * 0.6).toFixed(2));
    } else {
      const last = cashOutEngine.getLastOffer(bet.id);
      if (last) {
        if (last.cashOut === 0) {
          throw conflict('This bet has busted — cash-out is no longer available. The natural settlement will run shortly.', { code: 'OFFER_ZERO' });
        }
        cashOut = last.cashOut;
      } else {
        // No live offer recorded yet (no tick has happened since /place).
        // Fall back to a conservative offer based on stake and the house margin.
        cashOut = Number((bet.stake * (1 - LIVE_BETTING.houseMargin)).toFixed(2));
      }
      // Validate drift in both paths when client provided acceptedAmount.
      if (req.body?.acceptedAmount !== undefined) {
        const drift = cashOut > 0
          ? Math.abs(req.body.acceptedAmount - cashOut) / cashOut
          : Math.abs(req.body.acceptedAmount - cashOut);
        if (drift > LIVE_BETTING.driftTolerance) {
          throw conflict('Cash-out offer changed before you confirmed. Refresh and try again.', {
            code: 'OFFER_STALE', currentOffer: cashOut,
          });
        }
      }
    }

    bet.status = 'cashed_out';
    bet.cashOut = cashOut;
    bet.cashOutAt = new Date().toISOString();
    betsStore.set(bet.id, bet);
    cashOutEngine.unregisterBet(bet.id);

    const updated = updateUser(req.user.id, {
      balance: Number((req.user.balance + cashOut).toFixed(2)),
    });
    pushTx(req.user.id, {
      kind: 'cash_out', amount: cashOut, status: 'completed',
      balanceAfter: updated.balance, ref: bet.id,
    });
    logActivity(req.user.id, { kind: 'cash_out', betId: bet.id, cashOut });

    emitToUser(req.user.id, 'wallet:update', { balance: updated.balance, delta: cashOut, reason: 'cash_out', ref: bet.id });
    emitAdmin('cashout:executed', { betId: bet.id, userId: req.user.id, cashOut, ts: Date.now() });

    res.json({
      ok: true, bet,
      account: { ...updated, passwordHash: undefined, googleId: undefined, activity: undefined },
    });
  })
);

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

cashOutEngine.onOffer((bet, payload) => {
  const fresh = betsStore.get(bet.id);
  if (!fresh || fresh.status !== 'open') return;
  fresh.lastCashOutOffer = { amount: payload.cashOut, ts: payload.ts };
  fresh.cashOutHistory = [...(fresh.cashOutHistory || []).slice(-19), { ts: payload.ts, amount: payload.cashOut }];
  betsStore.set(fresh.id, fresh);
});

export default router;

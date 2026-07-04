import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import {
  SPORTS,
  CASINO_GAMES,
  VIRTUAL_LEAGUES,
  JACKPOT_GAME,
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
import { listActivePromotions, getPromotion } from '../db/promotions.js';
import { oddsApiStatus } from '../services/oddsApi.js';
import { createStore } from '../db/store.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { badRequest, conflict, notFound, unauthorized } from '../utils/httpError.js';
import { updateUser, adjustBalance, logActivity } from '../db/users.js';
import { pushTx } from './wallet.js';
import { emitAdmin, emitToUser } from '../services/realtime.js';
import { SYSTEM_TYPES, maxSystemReturn } from '../lib/systemBets.js';
import * as cashOutEngine from '../services/cashOutEngine.js';
import { LIVE_BETTING } from '../config/env.js';

const MIN_STAKE = Number(process.env.MIN_STAKE) || 400; // GHS 400 min (configurable via env)

const BOOKING_CODE_REGEX = /^[ABCDEFGHIJKLMNPQRSTUVWXYZ]{2}[1-9]{5}$/;

const router = Router();

const codeLookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many booking code lookups. Please slow down.' },
});

// In-memory booking code index for O(1) lookups.
// Synced lazily on first miss, then kept in sync on writes.
const bookCodeIndex = new Map(); // bookingCode → betId

function rebuildBookCodeIndex() {
  bookCodeIndex.clear();
  for (const [betId, bet] of Object.entries(betsStore.all())) {
    if (bet.bookingCode) bookCodeIndex.set(bet.bookingCode, betId);
  }
}

function indexBookingCode(code, betId) {
  if (code) bookCodeIndex.set(code, betId);
}

function findBetByBookingCode(code) {
  const betId = bookCodeIndex.get(code);
  if (betId) {
    const bet = betsStore.get(betId);
    if (bet && bet.bookingCode === code) return bet;
  }
  // Fallback: rebuild index on miss (handles race with external writes)
  rebuildBookCodeIndex();
  const fallbackId = bookCodeIndex.get(code);
  return fallbackId ? betsStore.get(fallbackId) : null;
}

// AA12345 — 2 uppercase letters + 5 digits.
function generateBookingCode() {
  const A = 'ABCDEFGHIJKLMNPQRSTUVWXYZ'; // dropped 'O' to avoid 0/O confusion
  const D = '123456789';
  const letters = A[Math.floor(Math.random() * A.length)] + A[Math.floor(Math.random() * A.length)];
  let digits = '';
  for (let i = 0; i < 5; i++) digits += D[Math.floor(Math.random() * D.length)];
  return letters + digits;
}

async function uniqueBookingCode() {
  const existing = new Set(bookCodeIndex.keys());
  for (let i = 0; i < 100; i++) {
    const code = generateBookingCode();
    if (!existing.has(code)) return code;
  }
  // Extreme edge case: namespace collision. Expand to 3 letters + 4 digits.
  const A = 'ABCDEFGHIJKLMNPQRSTUVWXYZ';
  const D = '123456789';
  for (let i = 0; i < 100; i++) {
    const code = A[Math.floor(Math.random() * A.length)] + A[Math.floor(Math.random() * A.length)] + A[Math.floor(Math.random() * A.length)] + D[Math.floor(Math.random() * D.length)] + D[Math.floor(Math.random() * D.length)] + D[Math.floor(Math.random() * D.length)] + D[Math.floor(Math.random() * D.length)];
    if (!existing.has(code)) return code;
  }
  // Absolute fallback: timestamp-based code
  return 'XX' + Date.now().toString(36).slice(-5).toUpperCase();
}

const betsStore        = createStore('bets', {});         // { betId: receipt }
const jackpotStore     = createStore('jackpot_entries', {});
const promoUsageStore  = createStore('promo_usage', {});  // { userId: [{ promoId, usedAt }] }

async function pushBet(receipt) {
  await betsStore.setCritical(receipt.id, receipt);
  if (receipt.bookingCode) indexBookingCode(receipt.bookingCode, receipt.id);
}
function listUserBets(userId) {
  return Object.values(betsStore.all())
    .filter((b) => b.userId === userId)
    .sort((a, b) => (a.placedAt < b.placedAt ? 1 : -1))
    .map(attachCashoutOffer)
    .map(attachLiveState);
}

function computeCashoutEstimate(bet) {
  if (bet.mode === 'system')
    return Number((bet.stake * bet.totalOdds * 0.6).toFixed(2));
  return Number((bet.stake * bet.totalOdds * (1 - LIVE_BETTING.houseMargin)).toFixed(2));
}

function attachCashoutOffer(bet) {
  if (bet.status !== 'open') return bet;
  if (bet.lastCashOutOffer?.amount != null) return bet;
  const cashoutOffer = computeCashoutEstimate(bet);
  return { ...bet, cashoutOffer };
}

/**
 * Decorate each leg of an open ticket with the current fixture state so the
 * client can render live tickets: score, minute, suspension, and the current
 * (possibly admin-overridden) odds for the exact selection that was taken.
 * Never persisted — computed fresh on every history read.
 */
function attachLiveState(bet) {
  if (bet.status !== 'open') return bet;
  let anyLive = false;
  const legs = (bet.legs || []).map((l) => {
    const view = adminLookupFixture(l.matchId);
    const fx = view?.match || view;
    if (!fx || !fx.home) return l;
    const mk = fx.markets?.[l.market];
    const sel = mk?.selections?.find((s) => s.key === l.outcome);
    const currentOdds = sel?.odds != null ? Number(sel.odds) : null;
    const placed = l.odds != null ? Number(l.odds) : null;
    const isLive = !!fx.isLive && !fx.finished;
    if (isLive) anyLive = true;
    return {
      ...l,
      live: {
        isLive,
        finished: !!fx.finished,
        minute: fx.minute || null,
        scoreHome: fx.scoreHome ?? null,
        scoreAway: fx.scoreAway ?? null,
        suspended: !!(fx.suspended || mk?.suspended || sel?.suspended),
        currentOdds,
        direction: currentOdds != null && placed != null
          ? (currentOdds > placed + 1e-9 ? 'up' : currentOdds < placed - 1e-9 ? 'down' : 'same')
          : null,
      },
    };
  });
  return { ...bet, legs, anyLive };
}

function hasConflictingPicks(selections) {
  const groups = {};
  for (const s of selections) {
    const key = `${s.matchId}:${s.market}`;
    if (groups[key] && groups[key] !== s.outcome) return true;
    groups[key] = s.outcome;
  }
  return false;
}

/* ------------ schemas ------------ */
const bookSchema = z.object({
  mode: z.enum(['single', 'multiple', 'system']).default('multiple'),
  stake: z.union([z.number(), z.string()]).transform((v) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
    return Number.isFinite(n) && n > 0 ? n : 1;
  }).default(1),
  systemType: z.string().optional(),
  selections: z.array(z.object({
    matchId: z.string().min(1),
    market:  z.string().default('1X2'),
    outcome: z.string().min(1),
    odds:    z.union([z.number(), z.string()]).transform((v) => Number(v)),
  })).min(1, 'Add at least one selection.'),
});

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
  promoId: z.string().optional(),
});

const jackpotEnterSchema = z.object({
  picks: z.record(z.string(), z.string()),
});

const cashoutSchema = z.object({
  acceptedAmount: z.union([z.number(), z.string()])
    .optional()
    .transform((v) => v === undefined ? undefined : Number(v))
    .refine((v) => v === undefined || (Number.isFinite(v) && v >= 0), 'invalid acceptedAmount'),
  // Partial cash-out: a fraction in (0, 1) of the stake to cash out now.
  // The remaining (1 - fraction) of the stake stays in play on a residual
  // ticket. Omit or set to 1 for a full cash-out.
  fraction: z.union([z.number(), z.string()])
    .optional()
    .transform((v) => v === undefined ? undefined : Number(v))
    .refine((v) => v === undefined || (Number.isFinite(v) && v > 0 && v <= 1), 'fraction must be in (0, 1]'),
});

/* ------------ public meta ------------ */

router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'betxentra-betting-api', oddsApi: oddsApiStatus() });
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

router.get('/code/:code', codeLookupLimiter, (req, res, next) => {
  const raw = String(req.params.code || '').trim().toUpperCase();
  if (!raw || !BOOKING_CODE_REGEX.test(raw)) {
    return next(badRequest('Invalid booking code format. Use a valid 7-character code (e.g. AB12345).'));
  }
  const bet = findBetByBookingCode(raw);
  if (!bet) return next(notFound('Booking code not found. Double-check and try again.'));
  // Only return the slip data needed to rebuild the betslip — no user info.
  const { userId, legsResolved, cashOutHistory, activity, ...slip } = bet;
  const safe = {
    id: slip.id,
    legs: (slip.legs || []).map((l) => ({
      matchId: l.matchId,
      market: l.market,
      outcome: l.outcome,
      odds: l.odds,
      home: l.home,
      away: l.away,
      marketName: l.marketName || l.market,
    })),
    totalOdds: slip.totalOdds,
    mode: slip.mode,
    stake: slip.stake,
    stakePerLine: slip.stakePerLine,
    linesCount: slip.linesCount,
    systemType: slip.systemType,
    systemLabel: slip.systemLabel,
    potentialWin: slip.potentialWin,
    bookingCode: slip.bookingCode,
    placedAt: slip.placedAt,
    currency: slip.currency,
    status: slip.status,
    bonusRate: slip.bonusRate,
  };
  res.json({ bet: safe });
});

// Book a bet — generates a booking code WITHOUT deducting balance.
// Auth is optional: logged-in users get the bet linked to their account;
// anonymous users get a code they can share / load later.
router.post('/book',
  optionalAuth,
  validate(bookSchema),
  asyncHandler(async (req, res) => {
    const { mode, stake, selections, systemType } = req.body;

    const seen = new Set();
    const normalized = [];
    for (const sel of selections) {
      const dedupe = `${sel.matchId}:${sel.market}:${sel.outcome}`;
      if (seen.has(dedupe)) return res.json({ success: false, error: `Duplicate selection ${sel.market} ${sel.outcome}.` });
      seen.add(dedupe);
      const found = adminLookupSelection({ matchId: sel.matchId, market: sel.market, outcome: sel.outcome });
      if (!found) return res.json({ success: false, error: `Invalid selection ${sel.market} ${sel.outcome} for match ${sel.matchId}.` });
      const fxView = found.row?.match || found.row;
      const hasRealResult = fxView?.finished && (fxView.finalSource === 'feed' || fxView.finalSource === 'manual');
      if (hasRealResult || fxView?.suspended) {
        return res.json({ success: false, error: 'Market closed — fixture is no longer available.', code: 'MARKET_CLOSED' });
      }
      if (found.market?.suspended || found.selection?.suspended) {
        return res.json({ success: false, error: 'Selection suspended — refresh and try a different market.', code: 'SELECTION_SUSPENDED' });
      }
      const serverOdds = found.selection.odds;
      normalized.push({
        matchId: sel.matchId, market: sel.market, outcome: sel.outcome, odds: serverOdds,
        home: found.row.match.home, away: found.row.match.away,
        marketName: found.row.match.markets?.[sel.market]?.name || sel.market,
      });
    }
    if (mode === 'single' && normalized.length > 1) return res.json({ success: false, error: 'Single mode allows only one selection.' });
    if (mode === 'multiple' && normalized.length < 2) return res.json({ success: false, error: 'Multiple bets need at least two selections.' });
    if (mode !== 'single' && hasConflictingPicks(normalized)) {
      return res.json({ success: false, error: 'Conflicting picks in the same match and market.', code: 'CONFLICTING_PICKS' });
    }

    let totalOdds, totalStake, potentialWin, systemDef = null, linesCount = null, stakePerLine = null;

    if (mode === 'system') {
      const key = String(systemType || '').toLowerCase();
      systemDef = SYSTEM_TYPES[key];
      if (!systemDef) return res.json({ success: false, error: `Unknown system type "${systemType}".` });
      if (normalized.length !== systemDef.selections) {
        return res.json({ success: false, error: `${systemDef.label} needs exactly ${systemDef.selections} selections.` });
      }
      stakePerLine = Number(stake);
      linesCount   = systemDef.totalLines;
      totalStake   = Number((stakePerLine * linesCount).toFixed(2));
      potentialWin = Number(maxSystemReturn(normalized.map((s) => s.odds), key, stakePerLine).toFixed(2));
      totalOdds    = Number((potentialWin / totalStake).toFixed(4));
    } else {
      totalStake   = Number(stake);
      totalOdds    = mode === 'single' ? normalized[0].odds : normalized.reduce((acc, s) => acc * s.odds, 1);
      potentialWin = totalStake * totalOdds * (1 + BONUS_RATE);
    }

    const id = `bv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const bookingCode = await uniqueBookingCode();
    const receipt = {
      id,
      bookingCode,
      userId: req.user?.id || null,
      placedAt: new Date().toISOString(),
      mode,
      stake: Number(totalStake.toFixed(2)),
      currency: CURRENCY,
      totalOdds: Number(totalOdds.toFixed(4)),
      potentialWin: Number(potentialWin.toFixed(2)),
      bonusRate: BONUS_RATE,
      legs: normalized,
      status: 'booked',
      lastCashOutOffer: null,
      cashOutHistory: [],
      ...(mode === 'system' && { systemType: systemType.toLowerCase(), systemLabel: systemDef.label, linesCount, stakePerLine }),
    };
    await pushBet(receipt);

    if (req.user) {
      logActivity(req.user.id, { kind: 'bet_booked', betId: id, stake: totalStake });
    }

    res.status(201).json({ ok: true, bet: receipt });
  })
);

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
    if (mode !== 'single' && hasConflictingPicks(normalized)) {
      return res.json({ success: false, error: 'Conflicting picks in the same match and market.', code: 'CONFLICTING_PICKS' });
    }

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

    if (totalStake < MIN_STAKE) {
      return res.json({ success: false, error: `Minimum stake is GHS ${MIN_STAKE}. This ticket requires GHS ${totalStake.toFixed(2)}.` });
    }
    if (totalStake > user.balance) {
      return res.json({ success: false, error: `Insufficient balance. This ticket requires GHS ${totalStake.toFixed(2)} (your balance is GHS ${user.balance.toFixed(2)}).` });
    }

    // Resolve bonus rate — optional promo overrides the env default.
    let appliedBonusRate = BONUS_RATE;
    let appliedPromoId = null;
    if (req.body.promoId) {
      const promo = getPromotion(req.body.promoId);
      if (!promo || !promo.active) {
        return res.json({ success: false, error: 'Promotion not found or inactive.', code: 'PROMO_INVALID' });
      }
      // Check per‑user cap.
      if (promo.capPerUser > 0) {
        const usage = promoUsageStore.get(user.id) || [];
        const used = usage.filter((u) => u.promoId === promo.id).length;
        if (used >= promo.capPerUser) {
          return res.json({ success: false, error: 'Promotion already used the maximum number of times.', code: 'PROMO_EXHAUSTED' });
        }
      }
      appliedBonusRate = promo.bonusRate ?? BONUS_RATE;
      appliedPromoId = promo.id;
    }
    // Re‑compute potentialWin with the (possibly promo‑overridden) rate.
    potentialWin = Number((totalStake * totalOdds * (1 + appliedBonusRate)).toFixed(2));

    const id = `bv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const bookingCode = await uniqueBookingCode();
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
      bonusRate: appliedBonusRate,
      ...(appliedPromoId && { promoId: appliedPromoId }),
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
    await pushBet(receipt);

    // Index this bet so live ticks can recompute its cash-out offer.
    cashOutEngine.registerBet(receipt);

    // Record promo usage so capPerUser is enforced.
    if (appliedPromoId) {
      const usage = promoUsageStore.get(user.id) || [];
      promoUsageStore.set(user.id, [...usage, { promoId: appliedPromoId, usedAt: new Date().toISOString(), betId: id }]);
    }

    const updated = await adjustBalance(user.id, -totalStake);
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
router.get('/bets/unacknowledged', optionalAuth, (req, res) => {
  if (!req.user) return res.json({ bets: [] });
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
      // 1) Engine's in-memory offer (fast, from live ticks).
      // 2) Receipt's persisted offer (survives restart).
      // 3) Static estimate matching what the client shows.
      const last = cashOutEngine.getLastOffer(bet.id)
        || (bet.lastCashOutOffer?.amount != null
          ? { cashOut: bet.lastCashOutOffer.amount, ts: bet.lastCashOutOffer.ts }
          : null);
      if (last) {
        if (last.cashOut === 0) {
          throw conflict('This bet has busted — cash-out is no longer available. The natural settlement will run shortly.', { code: 'OFFER_ZERO' });
        }
        cashOut = last.cashOut;
      } else {
        // No live offer recorded yet (no tick has happened since /place).
        // Fall back to a static estimate matching the value the client
        // showed the user (stake × totalOdds × (1 - houseMargin)).
        cashOut = Number((bet.stake * bet.totalOdds * (1 - LIVE_BETTING.houseMargin)).toFixed(2));
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

    // Partial cash-out: cash out only `fraction` of the stake; leave the rest
    // running on a fresh residual ticket. System bets keep the v1 behaviour
    // (full cash-out only) — partial only applies to single/multiple.
    const rawFraction = req.body?.fraction;
    const fraction = (bet.mode !== 'system' && rawFraction !== undefined && rawFraction > 0 && rawFraction < 1)
      ? Number(rawFraction)
      : 1;
    const cashedPortion = Number((cashOut * fraction).toFixed(2));
    const residualStake = Number((bet.stake * (1 - fraction)).toFixed(2));

    if (fraction < 1 && residualStake < 1) {
      // Avoid creating a ticket so small it can't be cashed out again.
      throw conflict('Remaining stake would be too small. Cash out fully or pick a smaller fraction.', {
        code: 'RESIDUAL_TOO_SMALL',
      });
    }

    bet.status = 'cashed_out';
    bet.cashOut = cashedPortion;
    bet.cashOutFraction = fraction;
    bet.cashOutAt = new Date().toISOString();
    betsStore.set(bet.id, bet);
    cashOutEngine.unregisterBet(bet.id);

    let residual = null;
    if (fraction < 1) {
      // Create a residual ticket that carries the remaining stake at the
      // original odds. Same legs, fresh id and booking code.
      const newId = `bv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      residual = {
        ...bet,
        id: newId,
        bookingCode: await uniqueBookingCode(),
        placedAt: new Date().toISOString(),
        parentBetId: bet.id,
        stake: residualStake,
        potentialWin: Number((residualStake * bet.totalOdds * (1 + BONUS_RATE)).toFixed(2)),
        status: 'open',
        cashOut: undefined,
        cashOutFraction: undefined,
        cashOutAt: undefined,
        lastCashOutOffer: null,
        cashOutHistory: [],
      };
      bet.residualBetId = newId;
      betsStore.set(bet.id, bet);
      await pushBet(residual);
      cashOutEngine.registerBet(residual);
    }

    const updated = await adjustBalance(req.user.id, cashedPortion);
    pushTx(req.user.id, {
      kind: fraction < 1 ? 'cash_out_partial' : 'cash_out',
      amount: cashedPortion,
      status: 'completed',
      balanceAfter: updated.balance,
      ref: bet.id,
    });
    logActivity(req.user.id, { kind: 'cash_out', betId: bet.id, cashOut: cashedPortion, fraction });

    emitToUser(req.user.id, 'wallet:update', { balance: updated.balance, delta: cashedPortion, reason: 'cash_out', ref: bet.id });
    emitAdmin('cashout:executed', { betId: bet.id, userId: req.user.id, cashOut: cashedPortion, fraction, ts: Date.now() });

    res.json({
      ok: true, bet, residual,
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
      status: 'pending', // pending | won | lost | void
    };
    jackpotStore.set(id, entry);
    const updated = await adjustBalance(user.id, -JACKPOT_GAME.entryFee);
    pushTx(user.id, { kind: 'jackpot_entry', amount: -JACKPOT_GAME.entryFee, status: 'completed', balanceAfter: updated.balance, ref: id });
    logActivity(user.id, { kind: 'jackpot_entry', entryId: id });
    res.status(201).json({ ok: true, entry, account: { ...updated, passwordHash: undefined, googleId: undefined, activity: undefined } });
  })
);

router.get('/promos', (_req, res) => {
  const fromStore = listActivePromotions();
  // Only return real promotions from the database — never hardcoded fallbacks.
  res.json({ promotions: fromStore }); // empty array when none exist
});

cashOutEngine.onOffer((bet, payload) => {
  const fresh = betsStore.get(bet.id);
  if (!fresh || fresh.status !== 'open') return;
  fresh.lastCashOutOffer = { amount: payload.cashOut, ts: payload.ts };
  fresh.cashOutHistory = [...(fresh.cashOutHistory || []).slice(-19), { ts: payload.ts, amount: payload.cashOut }];
  betsStore.set(fresh.id, fresh);
});

/* ------------ Jackpot settlement ------------ */

const JACKPOT_SETTLE_INTERVAL_MS = 60_000;

/**
 * Periodically settles jackpot entries whose draw deadline has passed.
 * For now, entries with expired `drawsIn` but no matching real fixture
 * results are marked `pending_admin` so an admin can manually resolve them.
 */
export async function settleJackpotEntries() {
  const now = Date.now();
  let settled = 0;
  for (const entry of Object.values(jackpotStore.all() || {})) {
    if (entry.status !== 'pending') continue;
    // drawsIn is a human-readable string like "4d 12h 32m" — parse it as
    // a deadline relative to placedAt.
    const deadlineMs = parseDuration(entry.drawsIn);
    if (!deadlineMs) continue;
    const deadline = new Date(entry.placedAt).getTime() + deadlineMs;
    if (now < deadline) continue; // not yet due

    // Try to look up real fixture results for each leg.
    let allResolved = true;
    let allCorrect = true;
    for (const leg of JACKPOT_GAME.legs) {
      const pick = entry.picks[leg.id];
      // For pure-virtual jackpots with no results feed, we can't
      // auto-settle — mark for admin review.
      allResolved = false;
      break;
    }

    if (!allResolved) {
      jackpotStore.set(entry.id, { ...entry, status: 'pending_admin' });
    } else {
      const status = allCorrect ? 'won' : 'lost';
      jackpotStore.set(entry.id, { ...entry, status, settledAt: new Date().toISOString() });
      if (status === 'won') {
        // Proportional pool split — simplified: full pool split among all winners.
        const winners = Object.values(jackpotStore.all() || {}).filter((e) => e.status === 'won');
        const share = Math.floor(JACKPOT_GAME.pool / (winners.length || 1));
        const updated = await adjustBalance(entry.userId, share, { allowNegative: true });
        pushTx(entry.userId, { kind: 'jackpot_won', amount: share, status: 'completed', balanceAfter: updated.balance, ref: entry.id });
        logActivity(entry.userId, { kind: 'jackpot_won', entryId: entry.id, share });
      }
      settled++;
    }
  }
  return { settled };
}

/** Parse a human-readable duration like "4d 12h 32m" into milliseconds. */
function parseDuration(str) {
  if (!str) return 0;
  const m = /^(?:(\d+)d)?\s*(?:(\d+)h)?\s*(?:(\d+)m)?$/.exec(String(str).trim());
  if (!m) return 0;
  const d = parseInt(m[1] || '0', 10);
  const h = parseInt(m[2] || '0', 10);
  const min = parseInt(m[3] || '0', 10);
  return ((d * 24 + h) * 60 + min) * 60_000;
}

export { findBetByBookingCode, rebuildBookCodeIndex, generateBookingCode, uniqueBookingCode, pushBet };

export default router;

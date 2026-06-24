/**
 * Professional cash-out engine.
 *
 * Maintains a fixture → open bets index, recomputes cash-out offers on each
 * live tick, supports partial cash-out, auto-cashout triggers, and market
 * suspension awareness.
 *
 * Cash-out formula:
 *   For each unfinished leg: impliedProb = 1 / currentOdds
 *   fairValue = stake × totalOdds × product(impliedProb)
 *   Initial offer: stake × factor (factor varies 90-98% based on totalOdds risk)
 *   Live offer:    offered = max(0, fairValue × (1 - houseMargin))
 *                  ceiling = stake × totalOdds × 0.99  (can exceed stake when legs win)
 *   return min(offered, ceiling)
 */
import { emitToUser as defaultEmit } from './realtime.js';

const DEDUP_THRESHOLD = 0.005;
const DEFAULT_INITIAL_CASHOUT_FACTOR = 0.95;
const DEFAULT_HOUSE_MARGIN = 0.05;
const AUTO_CASHOUT_COOLDOWN_MS = 2000;

let _emit = defaultEmit;

const openBetsByFixture = new Map();
const betsById = new Map();
const lastOfferByBet = new Map();
const autoCashoutTargets = new Map();
const cashoutLocks = new Map();
const partialCashoutCounts = new Map();

let _onOffer = null;
let _options = {
  initialCashoutFactor: DEFAULT_INITIAL_CASHOUT_FACTOR,
  houseMargin: DEFAULT_HOUSE_MARGIN,
};

export function configure(opts = {}) {
  if (opts.initialCashoutFactor != null) _options.initialCashoutFactor = opts.initialCashoutFactor;
  if (opts.houseMargin != null) _options.houseMargin = opts.houseMargin;
}

export function __resetForTests({ emitToUser } = {}) {
  _emit = emitToUser || defaultEmit;
  openBetsByFixture.clear();
  betsById.clear();
  lastOfferByBet.clear();
  autoCashoutTargets.clear();
  cashoutLocks.clear();
  partialCashoutCounts.clear();
}

export function registerBet(bet) {
  if (!bet || bet.status !== 'open') return;
  const cloned = {
    id: bet.id,
    userId: bet.userId,
    mode: bet.mode,
    stake: bet.stake,
    totalOdds: bet.totalOdds,
    potentialWin: bet.potentialWin,
    status: bet.status,
    legs: (bet.legs || []).map((l) => ({ ...l })),
  };
  betsById.set(cloned.id, cloned);
  for (const leg of cloned.legs) {
    const set = openBetsByFixture.get(leg.matchId) || new Set();
    set.add(cloned.id);
    openBetsByFixture.set(leg.matchId, set);
  }
}

export function unregisterBet(betId) {
  const bet = betsById.get(betId);
  if (!bet) return;
  for (const leg of bet.legs || []) {
    const set = openBetsByFixture.get(leg.matchId);
    if (set) { set.delete(betId); if (set.size === 0) openBetsByFixture.delete(leg.matchId); }
  }
  betsById.delete(betId);
  lastOfferByBet.delete(betId);
  autoCashoutTargets.delete(betId);
  cashoutLocks.delete(betId);
  partialCashoutCounts.delete(betId);
}

export function getLastOffer(betId) {
  return lastOfferByBet.get(betId) || null;
}

export function restoreLastOffer(betId, { amount, ts }) {
  if (amount != null && ts != null) {
    lastOfferByBet.set(betId, { cashOut: amount, ts });
  }
}

export function getAutoCashoutTarget(betId) {
  return autoCashoutTargets.get(betId) || 0;
}

export function setAutoCashoutTarget(betId, target) {
  if (target > 0) {
    autoCashoutTargets.set(betId, target);
  } else {
    autoCashoutTargets.delete(betId);
  }
}

export function getPartialCashoutCount(betId) {
  return partialCashoutCounts.get(betId) || 0;
}

export function incrementPartialCashoutCount(betId) {
  const count = (partialCashoutCounts.get(betId) || 0) + 1;
  partialCashoutCounts.set(betId, count);
  return count;
}

export function isCashoutLocked(betId) {
  const lock = cashoutLocks.get(betId);
  if (!lock) return false;
  if (Date.now() - lock > AUTO_CASHOUT_COOLDOWN_MS) {
    cashoutLocks.delete(betId);
    return false;
  }
  return true;
}

export function setCashoutLock(betId) {
  cashoutLocks.set(betId, Date.now());
}

export function releaseCashoutLock(betId) {
  cashoutLocks.delete(betId);
}

export function computeInitialOffer(bet) {
  if (!bet || bet.mode === 'system') return null;
  if (bet.stake <= 0) return 0;
  const logOdds = Math.log2(Math.max(1.01, bet.totalOdds));
  const factor = Math.min(0.98, Math.max(0.90, _options.initialCashoutFactor - 0.01 * logOdds));
  const raw = bet.stake * factor;
  const offered = Number(raw.toFixed(2));
  return Math.min(offered, bet.stake * 0.99);
}

export function computeOffer(bet, oddsLookup, houseMargin) {
  if (!bet || bet.mode === 'system') return null;

  let probProduct = 1;
  let anySuspended = false;
  let anyUnavailable = false;

  for (const leg of bet.legs || []) {
    if (leg.finished && leg.won === false) return 0;
    if (leg.finished && leg.won === true) continue;

    const current = oddsLookup(leg.matchId, leg.market, leg.outcome);

    if (current === null || current === undefined) {
      anyUnavailable = true;
      continue;
    }
    if (current === 0) {
      anySuspended = true;
      continue;
    }
    if (current < 1.0001) return 0;

    probProduct *= 1 / current;
  }

  if (anySuspended) return 0;
  if (anyUnavailable && probProduct === 1) return 0;

  const fair = bet.stake * bet.totalOdds * probProduct;
  const offered = Math.max(0, fair * (1 - houseMargin));
  const ceiling = bet.stake * bet.totalOdds * 0.99;
  return Number(Math.min(offered, ceiling).toFixed(2));
}

export function onLiveChange(fixtureKey, oddsLookup, houseMargin) {
  const bets = openBetsByFixture.get(fixtureKey);
  if (!bets || bets.size === 0) return;

  const results = [];

  for (const betId of bets) {
    const bet = betsById.get(betId);
    if (!bet || bet.status !== 'open') { unregisterBet(betId); continue; }

    const offer = computeOffer(bet, oddsLookup, houseMargin);
    if (offer === null) continue;

    const last = lastOfferByBet.get(betId);
    if (last && Math.abs(offer - last.cashOut) / Math.max(last.cashOut, 1) < DEDUP_THRESHOLD) continue;

    const payload = {
      betId,
      cashOut: Number(offer.toFixed(2)),
      potentialWin: Number((bet.stake * bet.totalOdds).toFixed(2)),
      ts: Date.now(),
      reason: 'tick',
    };

    lastOfferByBet.set(betId, { cashOut: payload.cashOut, ts: payload.ts });
    _emit(bet.userId, 'cashout:offer', payload);
    if (_onOffer) try { _onOffer(bet, payload); } catch {}

    results.push({ bet, payload });
  }

  for (const { bet, payload } of results) {
    checkAutoCashout(bet, payload);
  }
}

export function onLegSettled(fixtureKey, won) {
  const bets = openBetsByFixture.get(fixtureKey);
  if (!bets || bets.size === 0) return;

  for (const betId of bets) {
    const bet = betsById.get(betId);
    if (!bet || bet.status !== 'open') { unregisterBet(betId); continue; }

    for (const leg of bet.legs) {
      if (leg.matchId === fixtureKey) { leg.finished = true; leg.won = !!won; }
    }

    if (!won) {
      const payload = {
        betId,
        cashOut: 0,
        potentialWin: Number((bet.stake * bet.totalOdds).toFixed(2)),
        ts: Date.now(),
        reason: 'leg_lost',
      };
      lastOfferByBet.set(betId, { cashOut: 0, ts: payload.ts });
      _emit(bet.userId, 'cashout:offer', payload);
      if (_onOffer) try { _onOffer(bet, payload); } catch {}
    }
  }
}

export function onMarketSuspended(fixtureKey) {
  const bets = openBetsByFixture.get(fixtureKey);
  if (!bets || bets.size === 0) return;

  for (const betId of bets) {
    const payload = {
      betId,
      cashOut: 0,
      potentialWin: 0,
      ts: Date.now(),
      reason: 'market_suspended',
    };
    lastOfferByBet.set(betId, { cashOut: 0, ts: payload.ts });
    const bet = betsById.get(betId);
    if (bet) {
      _emit(bet.userId, 'cashout:offer', payload);
      if (_onOffer) try { _onOffer(bet, payload); } catch {}
    }
  }
}

export function onMarketResumed(fixtureKey, oddsLookup, houseMargin) {
  onLiveChange(fixtureKey, oddsLookup, houseMargin);
}

function checkAutoCashout(bet, payload) {
  const target = autoCashoutTargets.get(bet.id);
  if (!target || target <= 0) return;
  if (payload.cashOut <= 0) return;
  if (payload.cashOut < target) return;
  if (isCashoutLocked(bet.id)) return;

  setCashoutLock(bet.id);
  _emit(bet.userId, 'cashout:auto-triggered', {
    betId: bet.id,
    amount: payload.cashOut,
    target,
    ts: Date.now(),
  });
}

export function sweep() {
  for (const [fixtureKey, set] of openBetsByFixture) {
    for (const betId of set) {
      const bet = betsById.get(betId);
      if (!bet || bet.status !== 'open') set.delete(betId);
    }
    if (set.size === 0) openBetsByFixture.delete(fixtureKey);
  }

  for (const [betId, lockTs] of cashoutLocks) {
    if (Date.now() - lockTs > AUTO_CASHOUT_COOLDOWN_MS * 2) {
      cashoutLocks.delete(betId);
    }
  }
}

export function onOffer(handler) { _onOffer = handler; }

/**
 * Cash-out engine.
 *
 * Maintains a fixture → open bets index, recomputes cash-out offers on each
 * live tick, emits cashout:offer to the bet owner, and dedupes near-identical
 * offers.
 *
 * Storage is in-memory. The durable copy of `lastCashOutOffer` lives on the
 * bet receipt (see routes/bet.js). On server restart, callers should rebuild
 * the engine state from open receipts (see registerBet).
 *
 * v1 limitations:
 *   - System bets are skipped (computeOffer returns null).
 *   - No partial cash-out.
 */
import { emitToUser as defaultEmit } from './realtime.js';

let _emit = defaultEmit;

const openBetsByFixture = new Map();   // fixtureKey -> Set<betId>
const betsById          = new Map();   // betId -> bet receipt (shallow copy with live fields)
const lastOfferByBet    = new Map();   // betId -> { cashOut, ts }

const DEDUP_THRESHOLD = 0.005; // 0.5%

/** Replace dependencies in tests. */
export function __resetForTests({ emitToUser } = {}) {
  _emit = emitToUser || defaultEmit;
  openBetsByFixture.clear();
  betsById.clear();
  lastOfferByBet.clear();
}

export function registerBet(bet) {
  if (!bet || bet.status !== 'open') return;
  // Clone the receipt + each leg so engine-local mutations (e.g. marking
  // legs finished in onLegSettled) don't write through to the shared bet
  // store. The receipt-side `status`, `lastCashOutOffer`, and `cashOutHistory`
  // are still updated by routes/bet.js via the store's set() method.
  const cloned = {
    id: bet.id,
    userId: bet.userId,
    mode: bet.mode,
    stake: bet.stake,
    totalOdds: bet.totalOdds,
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
}

export function getLastOffer(betId) {
  return lastOfferByBet.get(betId) || null;
}

/** Restore a persisted offer (e.g. after server restart). */
export function restoreLastOffer(betId, { amount, ts }) {
  if (amount != null && ts != null) {
    lastOfferByBet.set(betId, { cashOut: amount, ts });
  }
}

/**
 * Pure function: compute the cash-out offer for a bet given a current-odds
 * lookup. Returns null when the bet shape isn't supported (system bets),
 * or 0 when any leg has already lost.
 *
 * @param {object}   bet         The bet receipt.
 * @param {function} oddsLookup  (fixtureKey, market, outcome) -> number | null
 * @param {number}   houseMargin 0..1
 */
export function computeOffer(bet, oddsLookup, houseMargin) {
  if (!bet || bet.mode === 'system') return null;
  let probProduct = 1;
  for (const leg of bet.legs || []) {
    if (leg.finished && leg.won === false) return 0;
    if (leg.finished && leg.won === true)  { probProduct *= 1; continue; }
    const current = oddsLookup(leg.matchId, leg.market, leg.outcome);
    if (!current || current < 1.0001) return 0; // no market or impossible price
    probProduct *= 1 / current;
  }
  const fair = bet.stake * bet.totalOdds * probProduct;
  const offered = Math.max(0, fair * (1 - houseMargin));
  // Defensive clamp: never offer more than 99% of the max possible return.
  const ceiling = bet.stake * bet.totalOdds * 0.99;
  return Math.min(offered, ceiling);
}

/**
 * Trigger: a live tick touched this fixture. Recompute offers for every
 * open bet that has a leg on this fixture, emit only when materially changed.
 */
export function onLiveChange(fixtureKey, oddsLookup, houseMargin) {
  const bets = openBetsByFixture.get(fixtureKey);
  if (!bets || bets.size === 0) return;
  for (const betId of bets) {
    const bet = betsById.get(betId);
    if (!bet || bet.status !== 'open') { unregisterBet(betId); continue; }
    const offer = computeOffer(bet, oddsLookup, houseMargin);
    if (offer === null) continue; // system bets etc.
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
    if (_onOffer) try { _onOffer(bet, payload); } catch { /* never break the loop */ }
  }
}

/**
 * Trigger: a leg settled. If it lost, every bet containing it must drop to
 * a zero offer immediately so the UI reflects bust state before final settle.
 */
export function onLegSettled(fixtureKey, won) {
  const bets = openBetsByFixture.get(fixtureKey);
  if (!bets || bets.size === 0) return;
  for (const betId of bets) {
    const bet = betsById.get(betId);
    if (!bet || bet.status !== 'open') { unregisterBet(betId); continue; }
    // Mark the legs on this fixture as finished/won in our cached copy.
    for (const leg of bet.legs) {
      if (leg.matchId === fixtureKey) { leg.finished = true; leg.won = !!won; }
    }
    if (!won) {
      const payload = { betId, cashOut: 0, potentialWin: Number((bet.stake * bet.totalOdds).toFixed(2)), ts: Date.now(), reason: 'leg_lost' };
      lastOfferByBet.set(betId, { cashOut: 0, ts: payload.ts });
      _emit(bet.userId, 'cashout:offer', payload);
      if (_onOffer) try { _onOffer(bet, payload); } catch { /* never break the loop */ }
    }
  }
}

/** Periodic cleanup — called every 60s from oddsAggregator. */
export function sweep() {
  for (const [fixtureKey, set] of openBetsByFixture) {
    for (const betId of set) {
      const bet = betsById.get(betId);
      if (!bet || bet.status !== 'open') set.delete(betId);
    }
    if (set.size === 0) openBetsByFixture.delete(fixtureKey);
  }
}

let _onOffer = null;
/** Register a side-effect callback invoked every time cashout:offer is emitted. */
export function onOffer(handler) { _onOffer = handler; }

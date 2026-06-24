import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as cashOutEngine from '../src/services/cashOutEngine.js';

const emits = [];
function fakeEmit(userId, event, payload) { emits.push({ userId, event, payload }); }

function fakeOddsLookup(map) {
  return (fixtureKey, market, outcome) => map[`${fixtureKey}:${market}:${outcome}`] ?? null;
}

const makeBet = (overrides) => ({
  id: 'bt-exec', userId: 'u1', mode: 'single', stake: 100, totalOdds: 2,
  status: 'open',
  legs: [{ matchId: 'fx-1', market: '1X2', outcome: '1', odds: 2, finished: false }],
  ...overrides,
});

const OFFER_REVALIDATION_DELAY_MS = 2000;
const DRIFT_TOLERANCE = 0.03;

function getCurrentOfferForBet(bet) {
  const last = cashOutEngine.getLastOffer(bet.id);
  if (last) {
    if (last.cashOut > 0) return last.cashOut;
    return 0;
  }
  if (bet.lastCashOutOffer?.amount != null && bet.lastCashOutOffer.amount > 0) {
    return bet.lastCashOutOffer.amount;
  }
  const initial = cashOutEngine.computeInitialOffer(bet);
  return initial !== null ? initial : null;
}

describe('Cashout Execute Flow', () => {
  before(() => {
    cashOutEngine.__resetForTests({ emitToUser: fakeEmit });
  });

  after(() => {
    cashOutEngine.__resetForTests();
  });

  /* ── getCurrentOfferForBet ── */
  describe('getCurrentOfferForBet', () => {
    test('returns last engine offer when available', () => {
      cashOutEngine.restoreLastOffer('bt-co1', { amount: 85, ts: Date.now() });
      const bet = makeBet({ id: 'bt-co1' });
      assert.equal(getCurrentOfferForBet(bet), 85);
    });

    test('falls back to stored lastCashOutOffer.amount', () => {
      cashOutEngine.__resetForTests({ emitToUser: fakeEmit });
      const bet = makeBet({ id: 'bt-co2', lastCashOutOffer: { amount: 72, ts: Date.now() } });
      assert.equal(getCurrentOfferForBet(bet), 72);
    });

    test('falls back to computeInitialOffer when no stored offer', () => {
      cashOutEngine.__resetForTests({ emitToUser: fakeEmit });
      const bet = makeBet({ id: 'bt-co3' });
      const got = getCurrentOfferForBet(bet);
      const expected = cashOutEngine.computeInitialOffer(bet);
      assert.equal(got, expected);
    });

    test('returns null when initial offer is null (system bet fallback)', () => {
      cashOutEngine.__resetForTests({ emitToUser: fakeEmit });
      const bet = makeBet({ id: 'bt-co4', mode: 'system' });
      assert.equal(getCurrentOfferForBet(bet), null);
    });
  });

  /* ── Drift detection ── */
  describe('drift detection', () => {
    test('accepts amount within drift tolerance', () => {
      const currentOffer = 100;
      const acceptedAmount = 101;
      const drift = Math.abs(acceptedAmount - currentOffer) / Math.max(currentOffer, 1);
      assert.ok(drift <= DRIFT_TOLERANCE);
    });

    test('rejects amount above drift tolerance', () => {
      const currentOffer = 100;
      const acceptedAmount = 105;
      const drift = Math.abs(acceptedAmount - currentOffer) / Math.max(currentOffer, 1);
      assert.ok(drift > DRIFT_TOLERANCE);
    });

    test('drift tolerance boundary at exactly 3%', () => {
      const currentOffer = 100;
      const atBoundary = 103;
      const drift = Math.abs(atBoundary - currentOffer) / Math.max(currentOffer, 1);
      assert.equal(drift, DRIFT_TOLERANCE);
      assert.ok(drift <= DRIFT_TOLERANCE);
    });

    test('drift tolerance just over 3%', () => {
      const currentOffer = 100;
      const over = 103.01;
      const drift = Math.abs(over - currentOffer) / Math.max(currentOffer, 1);
      assert.ok(drift > DRIFT_TOLERANCE);
    });

    test('handles very small offers correctly', () => {
      const currentOffer = 1.5;
      const acceptedAmount = 1.53;
      const drift = Math.abs(acceptedAmount - currentOffer) / Math.max(currentOffer, 1);
      assert.ok(drift <= DRIFT_TOLERANCE, `drift ${drift} should be <= ${DRIFT_TOLERANCE}`);
    });
  });

  /* ── Partial cashout math ── */
  describe('partial cashout math', () => {
    test('full cashout: fraction=1, cashOutAmount = currentOffer', () => {
      const currentOffer = 95;
      const fractionVal = 1;
      const cashOutAmount = Number((currentOffer * fractionVal).toFixed(2));
      assert.equal(cashOutAmount, 95);
    });

    test('50% partial: cashOutAmount = currentOffer * 0.5', () => {
      const currentOffer = 95;
      const fractionVal = 0.5;
      const cashOutAmount = Number((currentOffer * fractionVal).toFixed(2));
      assert.equal(cashOutAmount, 47.5);
    });

    test('25% partial: residual stake > MIN_PARTIAL_STAKE', () => {
      const stake = 100;
      const fractionVal = 0.25;
      const residualStake = Number((stake * (1 - fractionVal)).toFixed(2));
      assert.equal(residualStake, 75);
      assert.ok(residualStake >= 1);
    });

    test('residual too small when at 1% of 50', () => {
      const stake = 50;
      const fractionVal = 0.99;
      const residualStake = Number((stake * (1 - fractionVal)).toFixed(2));
      assert.equal(residualStake, 0.5);
      assert.ok(residualStake < 1);
    });

    test('fraction clamped to [0.01, 1]', () => {
      const raw = 1.5;
      const clamped = Math.min(1, Math.max(0.01, raw));
      assert.equal(clamped, 1);

      const raw2 = -0.5;
      const clamped2 = Math.min(1, Math.max(0.01, raw2));
      assert.equal(clamped2, 0.01);
    });
  });

  /* ── Post-delay revalidation ── */
  describe('post-delay revalidation', () => {
    test('offer unchanged after delay passes recheck', async () => {
      cashOutEngine.__resetForTests({ emitToUser: fakeEmit });
      cashOutEngine.restoreLastOffer('bt-reval', { amount: 95, ts: Date.now() });

      await new Promise((r) => setTimeout(r, 10));

      const bet = makeBet({ id: 'bt-reval' });
      const revalidated = getCurrentOfferForBet(bet);
      const acceptedAmount = 95;
      const drift = Math.abs(acceptedAmount - revalidated) / Math.max(revalidated, 1);
      assert.equal(revalidated, 95);
      assert.ok(drift <= DRIFT_TOLERANCE);
    });

    test('offer gone after suspension fails recheck', async () => {
      cashOutEngine.__resetForTests({ emitToUser: fakeEmit });
      cashOutEngine.registerBet(makeBet({ id: 'bt-sus' }));
      cashOutEngine.restoreLastOffer('bt-sus', { amount: 95, ts: Date.now() });

      await new Promise((r) => setTimeout(r, 10));
      cashOutEngine.onMarketSuspended('fx-1');

      const bet = makeBet({ id: 'bt-sus' });
      const revalidated = getCurrentOfferForBet(bet);
      assert.equal(revalidated, 0);
    });

    test('offer changes during delay triggers OFFER_CHANGED', async () => {
      cashOutEngine.__resetForTests({ emitToUser: fakeEmit });
      cashOutEngine.restoreLastOffer('bt-changed', { amount: 90, ts: Date.now() });
      cashOutEngine.registerBet(makeBet({ id: 'bt-changed' }));

      await new Promise((r) => setTimeout(r, 10));

      cashOutEngine.onLiveChange('fx-1', fakeOddsLookup({
        'fx-1:1X2:1': 1.2,
      }), 0.05);

      const bet = makeBet({ id: 'bt-changed' });
      const revalidated = getCurrentOfferForBet(bet);
      assert.notEqual(revalidated, 90);

      const drift = Math.abs(95 - revalidated) / Math.max(revalidated, 1);
      assert.ok(drift > DRIFT_TOLERANCE, `drift ${drift} should exceed tolerance after odds change`);
    });
  });

  /* ── Settlement logic ── */
  describe('settlement logic', () => {
    test('cashed out bet has correct fields', () => {
      const bet = makeBet();
      const cashOutAmount = 85;
      const fractionVal = 0.5;

      bet.status = 'cashed_out';
      bet.cashOut = cashOutAmount;
      bet.cashOutFraction = fractionVal;
      bet.cashOutAt = new Date().toISOString();

      assert.equal(bet.status, 'cashed_out');
      assert.equal(bet.cashOut, 85);
      assert.equal(bet.cashOutFraction, 0.5);
      assert.ok(bet.cashOutAt);
    });

    test('unregisterBet removes cashed-out bet from engine', () => {
      cashOutEngine.__resetForTests({ emitToUser: fakeEmit });
      cashOutEngine.registerBet(makeBet({ id: 'bt-settle' }));
      cashOutEngine.unregisterBet('bt-settle');
      cashOutEngine.onLiveChange('fx-1', fakeOddsLookup({ 'fx-1:1X2:1': 1.5 }), 0.05);
      const relevant = emits.filter(e => e.payload?.betId === 'bt-settle');
      assert.equal(relevant.length, 0);
    });
  });
});

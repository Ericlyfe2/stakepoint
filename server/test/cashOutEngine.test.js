import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetForTests,
  configure,
  registerBet,
  unregisterBet,
  computeOffer,
  computeInitialOffer,
  getLastOffer,
  restoreLastOffer,
  getAutoCashoutTarget,
  setAutoCashoutTarget,
  getPartialCashoutCount,
  incrementPartialCashoutCount,
  isCashoutLocked,
  setCashoutLock,
  releaseCashoutLock,
  onLiveChange,
  onLegSettled,
  onMarketSuspended,
  onMarketResumed,
  sweep,
  onOffer,
} from '../src/services/cashOutEngine.js';

const emits = [];
function fakeEmit(userId, event, payload) { emits.push({ userId, event, payload }); }
function fakeOddsLookup(map) {
  return (fixtureKey, market, outcome) => map[`${fixtureKey}:${market}:${outcome}`] ?? null;
}

before(() => {
  __resetForTests({ emitToUser: fakeEmit });
});

after(() => {
  __resetForTests();
});

const makeSingleBet = (overrides = {}) => ({
  id: 'b1', userId: 'u1', mode: 'single', stake: 10, totalOdds: 2, status: 'open',
  legs: [{ matchId: 'f1', market: '1X2', outcome: '1', odds: 2, finished: false }],
  ...overrides,
});

/* ── configure ── */
describe('configure', () => {
  test('default initialCashoutFactor is 0.95', () => {
    __resetForTests({ emitToUser: fakeEmit });
    const bet = makeSingleBet({ stake: 100, totalOdds: 2 });
    const offer = computeInitialOffer(bet);
    assert.equal(offer, 95);
  });

  test('configure changes initial cashout factor', () => {
    __resetForTests({ emitToUser: fakeEmit });
    configure({ initialCashoutFactor: 0.9 });
    const bet = makeSingleBet({ stake: 100, totalOdds: 2 });
    const offer = computeInitialOffer(bet);
    assert.equal(offer, 90);
    configure({ initialCashoutFactor: 0.95 });
  });

  test('configure changes houseMargin for computeOffer', () => {
    __resetForTests({ emitToUser: fakeEmit });
    const lookup = fakeOddsLookup({ 'f1:1X2:1': 1.5 });
    const bet = makeSingleBet();
    configure({ houseMargin: 0.1 });
    const offer = computeOffer(bet, lookup, 0.1);
    configure({ houseMargin: 0.05 });
    const expected = Math.min(10 * 2 * (1 / 1.5) * 0.9, 10 * 2 * 0.99);
    assert.equal(offer, expected);
  });
});

/* ── computeInitialOffer ── */
describe('computeInitialOffer', () => {
  test('returns stake * initialCashoutFactor (default 95%)', () => {
    const bet = makeSingleBet({ stake: 100, totalOdds: 2 });
    assert.equal(computeInitialOffer(bet), 95);
  });

  test('returns null for system bets', () => {
    assert.equal(computeInitialOffer(makeSingleBet({ mode: 'system' })), null);
  });

  test('returns 0 for zero stake', () => {
    assert.equal(computeInitialOffer(makeSingleBet({ stake: 0 })), 0);
  });

  test('small stake rounds correctly', () => {
    const bet = makeSingleBet({ stake: 5.5, totalOdds: 1.5 });
    assert.equal(computeInitialOffer(bet), 5.22);
  });

  test('clamps to stake * totalOdds * 0.99', () => {
    const bet = makeSingleBet({ stake: 10, totalOdds: 1.01 });
    const offer = computeInitialOffer(bet);
    assert.ok(offer <= 10 * 1.01 * 0.99);
  });
});

/* ── computeOffer ── */
describe('computeOffer', () => {
  test('returns stake * totalOdds * prob * (1 - margin)', () => {
    const lookup = fakeOddsLookup({ 'f1:1X2:1': 1.5, 'f2:1X2:1': 2 });
    const bet = {
      id: 'b1', userId: 'u1', mode: 'multiple', stake: 10, totalOdds: 6,
      status: 'open',
      legs: [
        { matchId: 'f1', market: '1X2', outcome: '1', odds: 2, finished: false },
        { matchId: 'f2', market: '1X2', outcome: '1', odds: 3, finished: false },
      ],
    };
    const offer = computeOffer(bet, lookup, 0.05);
    assert.equal(Math.round(offer * 100), 1900);
  });

  test('returns 0 when any leg is lost', () => {
    const lookup = fakeOddsLookup({ 'f2:1X2:1': 2 });
    const bet = makeSingleBet({
      legs: [
        { matchId: 'f1', market: '1X2', outcome: '1', odds: 2, finished: true, won: false },
        { matchId: 'f2', market: '1X2', outcome: '1', odds: 3, finished: false },
      ],
    });
    assert.equal(computeOffer(bet, lookup, 0.05), 0);
  });

  test('finished + won leg treated as factor 1', () => {
    const lookup = fakeOddsLookup({ 'f2:1X2:1': 2 });
    const bet = makeSingleBet({
      stake: 10, totalOdds: 6,
      legs: [
        { matchId: 'f1', market: '1X2', outcome: '1', odds: 2, finished: true, won: true },
        { matchId: 'f2', market: '1X2', outcome: '1', odds: 3, finished: false },
      ],
    });
    const offer = computeOffer(bet, lookup, 0.05);
    assert.equal(Math.round(offer * 100), 2850);
  });

  test('clamps to stake * totalOdds * 0.99', () => {
    const lookup = fakeOddsLookup({ 'f1:1X2:1': 1.0 });
    const bet = makeSingleBet({ stake: 10, totalOdds: 6, legs: [{ matchId: 'f1', market: '1X2', outcome: '1', odds: 2, finished: false }] });
    const offer = computeOffer(bet, lookup, 0);
    assert.ok(offer <= 10 * 6 * 0.99);
  });

  test('returns null for system bets', () => {
    const lookup = fakeOddsLookup({ 'f1:1X2:1': 1.5 });
    assert.equal(computeOffer(makeSingleBet({ mode: 'system' }), lookup, 0.05), null);
  });

  test('returns 0 for suspended market (odds = 0)', () => {
    const lookup = fakeOddsLookup({ 'f1:1X2:1': 0 });
    assert.equal(computeOffer(makeSingleBet(), lookup, 0.05), 0);
  });

  test('returns 0 when current odds < 1.0001', () => {
    const lookup = fakeOddsLookup({ 'f1:1X2:1': 1.0 });
    assert.equal(computeOffer(makeSingleBet(), lookup, 0.05), 0);
  });

  test('returns 0 when odds unavailable for unfinished leg and no prob built up', () => {
    const lookup = fakeOddsLookup({});
    assert.equal(computeOffer(makeSingleBet(), lookup, 0.05), 0);
  });

  test('handles single leg multiple bet', () => {
    const lookup = fakeOddsLookup({ 'f1:1X2:1': 1.8 });
    const bet = makeSingleBet({ stake: 50, totalOdds: 2.0 });
    const offer = computeOffer(bet, lookup, 0.05);
    const expected = Math.min(50 * 2 * (1 / 1.8) * 0.95, 50 * 2 * 0.99);
    assert.equal(offer, expected);
  });
});

/* ── getLastOffer / restoreLastOffer ── */
describe('last offer tracking', () => {
  test('getLastOffer returns null for unknown bet', () => {
    assert.equal(getLastOffer('nonexistent'), null);
  });

  test('restoreLastOffer saves and getLastOffer retrieves', () => {
    __resetForTests({ emitToUser: fakeEmit });
    restoreLastOffer('b1', { amount: 45.5, ts: 1000 });
    const saved = getLastOffer('b1');
    assert.equal(saved.cashOut, 45.5);
    assert.equal(saved.ts, 1000);
  });

  test('restoreLastOffer ignores null amount', () => {
    restoreLastOffer('b-null-amt', { amount: null, ts: 1000 });
    assert.equal(getLastOffer('b-null-amt'), null);
  });

  test('restoreLastOffer ignores null ts', () => {
    restoreLastOffer('b-null-ts', { amount: 10, ts: null });
    assert.equal(getLastOffer('b-null-ts'), null);
  });
});

/* ── auto-cashout target ── */
describe('auto-cashout target', () => {
  test('default target is 0', () => {
    assert.equal(getAutoCashoutTarget('b1'), 0);
  });

  test('setAutoCashoutTarget stores positive target', () => {
    setAutoCashoutTarget('b1', 50);
    assert.equal(getAutoCashoutTarget('b1'), 50);
  });

  test('setAutoCashoutTarget with 0 removes target', () => {
    setAutoCashoutTarget('b1', 50);
    setAutoCashoutTarget('b1', 0);
    assert.equal(getAutoCashoutTarget('b1'), 0);
  });

  test('setAutoCashoutTarget with negative removes target', () => {
    setAutoCashoutTarget('b1', 50);
    setAutoCashoutTarget('b1', -1);
    assert.equal(getAutoCashoutTarget('b1'), 0);
  });
});

/* ── partial cashout count ── */
describe('partial cashout count', () => {
  test('default count is 0', () => {
    assert.equal(getPartialCashoutCount('b1'), 0);
  });

  test('incrementPartialCashoutCount increments and returns', () => {
    assert.equal(incrementPartialCashoutCount('b1'), 1);
    assert.equal(incrementPartialCashoutCount('b1'), 2);
    assert.equal(getPartialCashoutCount('b1'), 2);
  });

  test('counts are per-bet, not shared', () => {
    assert.equal(getPartialCashoutCount('other-bet'), 0);
    incrementPartialCashoutCount('other-bet');
    assert.equal(getPartialCashoutCount('other-bet'), 1);
  });
});

/* ── cashout lock ── */
describe('cashout lock', () => {
  test('isCashoutLocked returns false for unknown bet', () => {
    assert.equal(isCashoutLocked('b1'), false);
  });

  test('setCashoutLock locks the bet', () => {
    setCashoutLock('b1');
    assert.equal(isCashoutLocked('b1'), true);
  });

  test('releaseCashoutLock unlocks the bet', () => {
    setCashoutLock('b1');
    releaseCashoutLock('b1');
    assert.equal(isCashoutLocked('b1'), false);
  });

  test('lock prevents duplicate auto-triggers within cooldown', () => {
    __resetForTests({ emitToUser: fakeEmit });
    setCashoutLock('b-dup');
    assert.equal(isCashoutLocked('b-dup'), true);
    releaseCashoutLock('b-dup');
    assert.equal(isCashoutLocked('b-dup'), false);
  });
});

/* ── registerBet ── */
describe('registerBet', () => {
  test('ignores non-open bet', () => {
    __resetForTests({ emitToUser: fakeEmit });
    registerBet(makeSingleBet({ status: 'won' }));
    onLiveChange('f1', fakeOddsLookup({ 'f1:1X2:1': 1.5 }), 0.05);
    assert.equal(emits.length, 0);
  });

  test('ignores null bet', () => {
    registerBet(null);
    assert.doesNotThrow(() => registerBet(null));
  });

  test('registers for multiple fixtures', () => {
    __resetForTests({ emitToUser: fakeEmit });
    const bet = {
      id: 'b-multi-fixture', userId: 'u1', mode: 'single', stake: 10, totalOdds: 2,
      status: 'open',
      legs: [
        { matchId: 'f1', market: '1X2', outcome: '1', odds: 2, finished: false },
        { matchId: 'f2', market: '1X2', outcome: '2', odds: 3, finished: false },
      ],
    };
    registerBet(bet);
    onLiveChange('f1', fakeOddsLookup({ 'f1:1X2:1': 1.5 }), 0.05);
    assert.equal(emits.length, 1);
  });
});

/* ── unregisterBet ── */
describe('unregisterBet', () => {
  test('cleans up all maps', () => {
    __resetForTests({ emitToUser: fakeEmit });
    registerBet(makeSingleBet());
    setAutoCashoutTarget('b1', 50);
    incrementPartialCashoutCount('b1');
    setCashoutLock('b1');
    unregisterBet('b1');
    assert.equal(getAutoCashoutTarget('b1'), 0);
    assert.equal(getPartialCashoutCount('b1'), 0);
    assert.equal(isCashoutLocked('b1'), false);
  });

  test('unregisterBet on unknown bet does not throw', () => {
    assert.doesNotThrow(() => unregisterBet('nonexistent'));
  });

  test('unregistered bet no longer receives offers', () => {
    __resetForTests({ emitToUser: fakeEmit });
    emits.length = 0;
    registerBet(makeSingleBet());
    unregisterBet('b1');
    onLiveChange('f1', fakeOddsLookup({ 'f1:1X2:1': 1.5 }), 0.05);
    assert.equal(emits.length, 0);
  });
});

/* ── onLiveChange ── */
describe('onLiveChange', () => {
  test('emits cashout:offer for each open bet on the fixture', () => {
    __resetForTests({ emitToUser: fakeEmit });
    emits.length = 0;
    registerBet(makeSingleBet());
    onLiveChange('f1', fakeOddsLookup({ 'f1:1X2:1': 1.5 }), 0.05);
    assert.equal(emits.length, 1);
    assert.equal(emits[0].event, 'cashout:offer');
    assert.equal(emits[0].payload.betId, 'b1');
  });

  test('dedups when offer change is below threshold', () => {
    __resetForTests({ emitToUser: fakeEmit });
    emits.length = 0;
    registerBet(makeSingleBet());
    const lookup1 = fakeOddsLookup({ 'f1:1X2:1': 1.500 });
    const lookup2 = fakeOddsLookup({ 'f1:1X2:1': 1.501 });
    onLiveChange('f1', lookup1, 0.05);
    onLiveChange('f1', lookup2, 0.05);
    assert.equal(emits.length, 1);
  });

  test('fires when offer change exceeds threshold', () => {
    __resetForTests({ emitToUser: fakeEmit });
    emits.length = 0;
    registerBet(makeSingleBet());
    const lookup1 = fakeOddsLookup({ 'f1:1X2:1': 1.500 });
    const lookup2 = fakeOddsLookup({ 'f1:1X2:1': 1.050 });
    onLiveChange('f1', lookup1, 0.05);
    onLiveChange('f1', lookup2, 0.05);
    assert.equal(emits.length, 2);
  });

  test('does nothing for unknown fixture', () => {
    emits.length = 0;
    onLiveChange('unknown', () => 1.5, 0.05);
    assert.equal(emits.length, 0);
  });

  test('unregisters bet that is no longer open', () => {
    __resetForTests({ emitToUser: fakeEmit });
    emits.length = 0;
    registerBet(makeSingleBet());
    unregisterBet('b1');
    onLiveChange('f1', fakeOddsLookup({ 'f1:1X2:1': 1.5 }), 0.05);
    assert.equal(emits.length, 0);
  });

  test('calls onOffer callback when set', () => {
    __resetForTests({ emitToUser: fakeEmit });
    emits.length = 0;
    let calledWith = null;
    onOffer((bet, payload) => { calledWith = { bet, payload }; });
    registerBet(makeSingleBet());
    onLiveChange('f1', fakeOddsLookup({ 'f1:1X2:1': 1.5 }), 0.05);
    assert.notEqual(calledWith, null);
    assert.equal(calledWith.bet.id, 'b1');
    assert.ok(calledWith.payload.cashOut > 0);
    onOffer(null);
  });

  test('auto-cashout triggers when offer meets target', { timeout: 5000 }, () => {
    __resetForTests({ emitToUser: fakeEmit });
    emits.length = 0;
    configure({ houseMargin: 0 });
    registerBet(makeSingleBet({ stake: 100, totalOdds: 2 }));
    setAutoCashoutTarget('b1', 190);
    onLiveChange('f1', fakeOddsLookup({ 'f1:1X2:1': 1.05 }), 0);
    const autoEvents = emits.filter(e => e.event === 'cashout:auto-triggered');
    assert.ok(autoEvents.length >= 1, 'should emit cashout:auto-triggered');
    configure({ houseMargin: 0.05 });
  });

  test('auto-cashout blocks duplicate triggers via lock', () => {
    __resetForTests({ emitToUser: fakeEmit });
    emits.length = 0;
    registerBet(makeSingleBet({ id: 'b-lock' }));
    setAutoCashoutTarget('b-lock', 1);
    setCashoutLock('b-lock');
    onLiveChange('f1', fakeOddsLookup({ 'f1:1X2:1': 1.05 }), 0);
    const autoEvents = emits.filter(e => e.event === 'cashout:auto-triggered');
    assert.equal(autoEvents.length, 0);
  });
});

/* ── onLegSettled ── */
describe('onLegSettled', () => {
  test('emits 0 offer when leg loses', () => {
    __resetForTests({ emitToUser: fakeEmit });
    emits.length = 0;
    registerBet(makeSingleBet());
    onLegSettled('f1', false);
    assert.equal(emits.length, 1);
    assert.equal(emits[0].payload.cashOut, 0);
    assert.equal(emits[0].payload.reason, 'leg_lost');
  });

  test('marks leg as won when won=true and emits on next tick', () => {
    __resetForTests({ emitToUser: fakeEmit });
    emits.length = 0;
    registerBet(makeSingleBet());
    onLegSettled('f1', true);
    // No emit for a won leg (only loses emit 0)
    assert.equal(emits.length, 0);
    // Next live tick should reflect the won leg (treated as factor 1)
    onLiveChange('f1', fakeOddsLookup({ 'f1:1X2:1': 1.5 }), 0.05);
    assert.ok(emits.length >= 1);
    assert.ok(emits[emits.length - 1].payload.cashOut > 0);
  });

  test('does nothing for unknown fixture', () => {
    emits.length = 0;
    onLegSettled('unknown', false);
    assert.equal(emits.length, 0);
  });
});

/* ── onMarketSuspended ── */
describe('onMarketSuspended', () => {
  test('emits 0 offer with market_suspended reason', () => {
    __resetForTests({ emitToUser: fakeEmit });
    emits.length = 0;
    registerBet(makeSingleBet());
    onMarketSuspended('f1');
    assert.equal(emits.length, 1);
    assert.equal(emits[0].payload.cashOut, 0);
    assert.equal(emits[0].payload.reason, 'market_suspended');
  });

  test('does nothing for unknown fixture', () => {
    emits.length = 0;
    onMarketSuspended('unknown');
    assert.equal(emits.length, 0);
  });
});

/* ── onMarketResumed ── */
describe('onMarketResumed', () => {
  test('re-emits offers via onLiveChange', () => {
    __resetForTests({ emitToUser: fakeEmit });
    emits.length = 0;
    registerBet(makeSingleBet());
    onMarketResumed('f1', fakeOddsLookup({ 'f1:1X2:1': 1.5 }), 0.05);
    assert.equal(emits.length, 1);
    assert.equal(emits[0].event, 'cashout:offer');
  });
});

/* ── sweep ── */
describe('sweep', () => {
  test('cleans dead bets from fixture index', () => {
    __resetForTests({ emitToUser: fakeEmit });
    registerBet(makeSingleBet({ id: 'b-live' }));
    registerBet(makeSingleBet({ id: 'b-dead' }));
    unregisterBet('b-dead');
    sweep();
    emits.length = 0;
    onLiveChange('f1', fakeOddsLookup({ 'f1:1X2:1': 1.5 }), 0.05);
    const b1Offers = emits.filter(e => e.payload.betId === 'b-live');
    const b2Offers = emits.filter(e => e.payload.betId === 'b-dead');
    assert.ok(b1Offers.length > 0, 'b-live should still get offers');
    assert.equal(b2Offers.length, 0, 'b-dead should no longer get offers');
  });


});

/**
 * Repairing wins that were settled as "won" but never paid out (the old
 * settle-then-credit ordering could strand them, and settleNow() never
 * revisits a bet once it is no longer 'open'). The repair must pay exactly
 * once, restore the win trophy, and never touch bets that were already paid.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildTestApp, api, loginSuperAdmin } from './helpers/testApp.js';

let app, adminToken, betsStore, txStore, users, settlement;

before(async () => {
  app = await buildTestApp('repay');
  adminToken = await loginSuperAdmin(app.base);
  const { createStore } = await import('../src/db/store.js');
  betsStore = createStore('bets', {});
  txStore = createStore('transactions', {});
  users = await import('../src/db/users.js');
  settlement = await import('../src/services/settlement.js');
});

after(async () => {
  await app.close();
});

let n = 0;
async function makeUser(email, balance = 0) {
  return users.createUser({ email, displayName: 'Repay Tester', country: 'GH', emailVerified: true, balance });
}
/** A bet that auto-settled as won on the OLD code path: no payoutStatus, no ledger row. */
function strandedWin(userId, extra = {}) {
  n += 1;
  const id = `bet-repay-${n}`;
  const bet = {
    id, userId, bookingCode: `YP2488${n}`, stake: 1500, totalOdds: 23.68, potentialWin: 38361.6,
    status: 'won', settledAt: '2026-09-20T18:00:00.000Z', settledBy: 'auto', totalReturn: 38361.6,
    wonNotAcknowledged: false, acknowledgedAt: '2026-09-20T18:05:00.000Z',
    legs: [{ matchId: 'fx-r', home: 'Taleza EC CE', away: 'Redford City', market: 'CS', outcome: '2-2', odds: 23.68 }],
    ...extra,
  };
  betsStore.set(id, bet);
  return bet;
}

describe('findUnpaidPayouts', () => {
  test('finds a stranded win by the player\'s phone in any format', async () => {
    const u = await makeUser('0246350785'); // phone-as-email, like the backdoor account
    const bet = strandedWin(u.id);
    for (const q of ['024 635 0785', '0246350785', '024-635-0785', bet.bookingCode, bet.id]) {
      const rows = settlement.findUnpaidPayouts({ q });
      assert.ok(rows.some((r) => r.betId === bet.id), `should be found by "${q}"`);
    }
    const row = settlement.findUnpaidPayouts({ q: '0246350785' }).find((r) => r.betId === bet.id);
    assert.equal(row.owed, 38361.6);
    assert.equal(row.userExists, true);
  });

  test('does not list bets that were paid, are being retried, are lost/open, or already have a ledger row', async () => {
    const u = await makeUser('list-skip@test.com');
    strandedWin(u.id, { id: 'skip-paid', payoutStatus: 'paid' });
    strandedWin(u.id, { id: 'skip-pending', payoutStatus: 'pending' });
    strandedWin(u.id, { id: 'skip-lost', status: 'lost', totalReturn: 0 });
    strandedWin(u.id, { id: 'skip-open', status: 'open' });
    strandedWin(u.id, { id: 'skip-ledger' });
    txStore.set(u.id, [{ id: 't1', userId: u.id, kind: 'bet_won', amount: 38361.6, status: 'completed', ref: 'skip-ledger' }]);
    const ids = settlement.findUnpaidPayouts({ q: 'list-skip@test.com' }).map((r) => r.betId);
    assert.deepEqual(ids.filter((i) => i.startsWith('skip-')), [], 'none of these may be offered for repayment');
  });

  test('a stranded void refund is listed at the stake', async () => {
    const u = await makeUser('void-refund@test.com');
    strandedWin(u.id, { id: 'void-1', status: 'void', totalReturn: 1500, potentialWin: 38361.6 });
    const row = settlement.findUnpaidPayouts({ q: 'void-refund@test.com' }).find((r) => r.betId === 'void-1');
    assert.equal(row.owed, 1500);
  });
});

describe('repayBet', () => {
  test('pays the exact winnings once, records it, and re-arms the win trophy', async () => {
    const u = await makeUser('repay-happy@test.com', 100);
    const bet = strandedWin(u.id);
    assert.equal(bet.wonNotAcknowledged, false, 'precondition: the player never got the trophy');

    const out = await settlement.repayBet(bet.id, { adminEmail: 'admin@xenbet.gh' });

    assert.equal(out.ok, true);
    assert.equal(out.credited, 38361.6);
    assert.equal(users.getUserById(u.id).balance, 38461.6, '100 + 38,361.60, exact to the pesewa');
    const saved = betsStore.get(bet.id);
    assert.equal(saved.payoutStatus, 'paid');
    assert.equal(saved.wonNotAcknowledged, true, 'the trophy is armed again');
    assert.equal(saved.acknowledgedAt, null);
    assert.equal(saved.payoutRepairedBy, 'admin@xenbet.gh');
    const ledger = (txStore.get(u.id) || []).filter((t) => t.ref === bet.id);
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].kind, 'bet_won');
    assert.equal(ledger[0].amount, 38361.6);
    // and it is no longer offered for repayment
    assert.equal(settlement.findUnpaidPayouts({ q: bet.id }).length, 0);
  });

  test('a second repay (double click / second admin) never pays twice', async () => {
    const u = await makeUser('repay-twice@test.com', 0);
    const bet = strandedWin(u.id);
    assert.equal((await settlement.repayBet(bet.id)).ok, true);
    const again = await settlement.repayBet(bet.id);
    assert.equal(again.error, 'already_paid');
    assert.equal(users.getUserById(u.id).balance, 38361.6);
  });

  test('two concurrent repays credit exactly once', async () => {
    const u = await makeUser('repay-race@test.com', 0);
    const bet = strandedWin(u.id);
    const results = await Promise.all([settlement.repayBet(bet.id), settlement.repayBet(bet.id)]);
    assert.equal(users.getUserById(u.id).balance, 38361.6, 'credited once, not twice');
    assert.equal(results.filter((r) => r.ok && r.credited > 0).length, 1);
  });

  test('refuses a bet that already has a wallet ledger entry', async () => {
    const u = await makeUser('repay-ledger@test.com', 500);
    const bet = strandedWin(u.id);
    txStore.set(u.id, [{ id: 't2', userId: u.id, kind: 'bet_won', amount: 38361.6, status: 'completed', ref: bet.id }]);
    const out = await settlement.repayBet(bet.id);
    assert.equal(out.error, 'already_paid');
    assert.equal(users.getUserById(u.id).balance, 500);
  });

  test('if the credit is already on the wallet, it only fixes the marker and trophy (no extra money)', async () => {
    const u = await makeUser('repay-marker@test.com', 0);
    const bet = strandedWin(u.id);
    await users.adjustBalance(u.id, 38361.6, { allowNegative: true, idempotencyKey: `settle:${bet.id}` });
    const out = await settlement.repayBet(bet.id);
    assert.equal(out.ok, true);
    assert.equal(out.credited, 0);
    assert.equal(users.getUserById(u.id).balance, 38361.6, 'no second credit');
    assert.equal(betsStore.get(bet.id).payoutStatus, 'paid');
    assert.equal(betsStore.get(bet.id).wonNotAcknowledged, true);
  });

  test('refunds a stranded void at the stake and does not fire a win trophy', async () => {
    const u = await makeUser('repay-void@test.com', 0);
    const bet = strandedWin(u.id, { status: 'void', totalReturn: 1500, wonNotAcknowledged: false });
    const out = await settlement.repayBet(bet.id);
    assert.equal(out.credited, 1500);
    assert.equal(users.getUserById(u.id).balance, 1500);
    assert.equal(betsStore.get(bet.id).wonNotAcknowledged, false);
  });

  test('rejects unknown, lost, open and orphaned bets without moving money', async () => {
    const u = await makeUser('repay-reject@test.com', 10);
    assert.equal((await settlement.repayBet('nope')).error, 'not_found');
    assert.equal((await settlement.repayBet(strandedWin(u.id, { status: 'lost' }).id)).error, 'not_payable');
    assert.equal((await settlement.repayBet(strandedWin(u.id, { status: 'open' }).id)).error, 'not_payable');
    assert.equal((await settlement.repayBet(strandedWin(u.id, { totalReturn: 0, settledPayout: 0, potentialWin: 0 }).id)).error, 'nothing_owed');
    assert.equal((await settlement.repayBet(strandedWin('u-ghost').id)).error, 'no_user');
    assert.equal(users.getUserById(u.id).balance, 10);
  });
});

describe('admin endpoints', () => {
  test('list -> pay -> gone, over real HTTP (phone typed with spaces)', async () => {
    const u = await makeUser('0256507252', 0);
    const bet = strandedWin(u.id);

    const list = await api(app.base, 'GET', '/admin/settlement/unpaid?q=025%20650%207252', { token: adminToken });
    assert.equal(list.status, 200);
    const row = list.body.payouts.find((p) => p.betId === bet.id);
    assert.ok(row, 'the stranded win is listed for that phone');
    assert.equal(row.owed, 38361.6);

    const pay = await api(app.base, 'POST', `/admin/settlement/bets/${bet.id}/repay`, { token: adminToken });
    assert.equal(pay.status, 200);
    assert.equal(pay.body.credited, 38361.6);
    assert.equal(pay.body.balance, 38361.6);

    const again = await api(app.base, 'POST', `/admin/settlement/bets/${bet.id}/repay`, { token: adminToken });
    assert.equal(again.status, 409);

    const after = await api(app.base, 'GET', '/admin/settlement/unpaid?q=025%20650%207252', { token: adminToken });
    assert.equal(after.body.payouts.some((p) => p.betId === bet.id), false);
  });

  test('requires an admin', async () => {
    const list = await api(app.base, 'GET', '/admin/settlement/unpaid');
    assert.equal(list.status, 401);
    const pay = await api(app.base, 'POST', '/admin/settlement/bets/x/repay');
    assert.equal(pay.status, 401);
  });

  test('404 for an unknown bet', async () => {
    const res = await api(app.base, 'POST', '/admin/settlement/bets/does-not-exist/repay', { token: adminToken });
    assert.equal(res.status, 404);
  });
});

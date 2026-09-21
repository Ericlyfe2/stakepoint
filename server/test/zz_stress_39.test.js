import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data-test-stress-39');

process.env.DATABASE_URL = '';
process.env.NODE_ENV = 'test';
process.env.PATHS = JSON.stringify({ data: DATA_DIR });

function cleanData() {
  if (fs.existsSync(DATA_DIR)) {
    for (const f of fs.readdirSync(DATA_DIR)) fs.unlinkSync(path.join(DATA_DIR, f));
  }
}

// Regression coverage for "a bet won but the payout never arrived". The old
// settler marked the bet won and only THEN credited the wallet, so any failure
// in between left a won bet that was never paid and never retried (it was no
// longer 'open'). Payouts are now persisted as 'pending' first, retried until
// confirmed, and credited under an idempotency key so retries never double-pay.
describe('payout reliability', () => {
  before(() => {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    cleanData();
  });
  after(() => cleanData());

  test('a normal win is credited once and marked paid', async () => {
    const { createStore } = await import('../src/db/store.js');
    const { setResult } = await import('../src/db/sportsAdmin.js');
    const { settleNow } = await import('../src/services/settlement.js');
    const { createUser, getUserById } = await import('../src/db/users.js');
    const betsStore = createStore('bets', {});

    const user = await createUser({ email: 'pay1@test.com', balance: 100 });
    setResult('fx-pay-1', 2, 0, 'manual');
    betsStore.set('bet-pay-1', {
      id: 'bet-pay-1', userId: user.id, stake: 10, potentialWin: 250, status: 'open',
      legs: [{ matchId: 'fx-pay-1', market: '1X2', outcome: '1' }],
    });

    await settleNow();

    assert.equal(getUserById(user.id).balance, 350);
    const bet = betsStore.get('bet-pay-1');
    assert.equal(bet.status, 'won');
    assert.equal(bet.payoutStatus, 'paid');
  });

  test('a won bet whose credit never landed is paid by the next pass, exactly once', async () => {
    const { createStore } = await import('../src/db/store.js');
    const { settleNow, reconcilePendingPayouts } = await import('../src/services/settlement.js');
    const { createUser, getUserById } = await import('../src/db/users.js');
    const betsStore = createStore('bets', {});

    const user = await createUser({ email: 'pay2@test.com', balance: 0 });
    // State left behind by a settle pass that died between persisting the win
    // and crediting the wallet.
    betsStore.set('bet-pay-2', {
      id: 'bet-pay-2', userId: user.id, stake: 10, potentialWin: 500, status: 'won',
      payoutStatus: 'pending', payoutDue: 500, legs: [],
    });

    await settleNow();
    assert.equal(getUserById(user.id).balance, 500, 'the stranded win must now be paid');
    assert.equal(betsStore.get('bet-pay-2').payoutStatus, 'paid');

    await reconcilePendingPayouts();
    await settleNow();
    assert.equal(getUserById(user.id).balance, 500, 'retrying must never pay it twice');
  });

  test('a crash after the credit but before the paid marker does not double-pay', async () => {
    const { createStore } = await import('../src/db/store.js');
    const { reconcilePendingPayouts } = await import('../src/services/settlement.js');
    const { createUser, getUserById, adjustBalance } = await import('../src/db/users.js');
    const betsStore = createStore('bets', {});

    const user = await createUser({ email: 'pay3@test.com', balance: 0 });
    betsStore.set('bet-pay-3', {
      id: 'bet-pay-3', userId: user.id, stake: 10, potentialWin: 300, status: 'won',
      payoutStatus: 'pending', payoutDue: 300, legs: [],
    });
    // The credit landed (with its idempotency key) but the process died before
    // the bet was flipped to 'paid'.
    await adjustBalance(user.id, 300, { allowNegative: true, idempotencyKey: 'settle:bet-pay-3' });

    await reconcilePendingPayouts();

    assert.equal(getUserById(user.id).balance, 300, 'balance must not be credited a second time');
    assert.equal(betsStore.get('bet-pay-3').payoutStatus, 'paid');
  });

  test('one bet that blows up does not stop the rest of the queue settling', async () => {
    const { createStore } = await import('../src/db/store.js');
    const { setResult } = await import('../src/db/sportsAdmin.js');
    const { settleNow } = await import('../src/services/settlement.js');
    const { createUser, getUserById } = await import('../src/db/users.js');
    const betsStore = createStore('bets', {});

    const user = await createUser({ email: 'pay4@test.com', balance: 0 });
    setResult('fx-pay-4', 1, 0, 'manual');
    const legs = [{ matchId: 'fx-pay-4', market: '1X2', outcome: '1' }];
    // Malformed payout (an object where a number belongs) throws mid-settle.
    betsStore.set('bet-poison', { id: 'bet-poison', userId: user.id, stake: 5, potentialWin: {}, status: 'open', legs });
    betsStore.set('bet-good', { id: 'bet-good', userId: user.id, stake: 5, potentialWin: 40, status: 'open', legs });

    await settleNow();

    assert.equal(betsStore.get('bet-good').status, 'won');
    assert.equal(getUserById(user.id).balance, 40);
  });

  test('applySettlement pays in full for a bet whose auto-payout was still pending', async () => {
    const { createStore } = await import('../src/db/store.js');
    const { applySettlement } = await import('../src/services/settlement.js');
    const { createUser, getUserById } = await import('../src/db/users.js');
    const betsStore = createStore('bets', {});

    const user = await createUser({ email: 'pay5@test.com', balance: 0 });
    betsStore.set('bet-pay-5', {
      id: 'bet-pay-5', userId: user.id, stake: 10, potentialWin: 200, status: 'won',
      totalReturn: 200, payoutStatus: 'pending', payoutDue: 200, legs: [],
    });

    const out = await applySettlement('bet-pay-5', { result: 'won', reason: 'payout never landed' });

    assert.equal(out.ok, true);
    assert.equal(getUserById(user.id).balance, 200, 'the full win is owed, not a zero delta');
    assert.equal(betsStore.get('bet-pay-5').payoutStatus, 'paid');
  });
});

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data-test-settle-concurrency');

process.env.DATABASE_URL = '';
process.env.NODE_ENV = 'test';
process.env.PATHS = JSON.stringify({ data: DATA_DIR });

function cleanData() {
  if (fs.existsSync(DATA_DIR)) {
    for (const f of fs.readdirSync(DATA_DIR)) fs.unlinkSync(path.join(DATA_DIR, f));
  }
}

// Regression coverage for a live incident: a user's wallet was credited
// twice for the same winning bet ("Bet Won +144,115.20" appearing back to
// back in their transaction history), even though the admin bet list only
// ever showed one bet record. Root cause — settleNow() is triggered from
// three independent places (the periodic timer, POST /fixtures/:id/result,
// and POST /fixtures/:id/settle) with no guard against overlap. Two
// overlapping calls would each snapshot the same still-"open" bet before
// either finished crediting it, so both credited it. settleNow() now
// serializes overlapping calls and re-checks each bet's live status
// immediately before crediting.
describe('settleNow — concurrent calls never double-credit the same bet', () => {
  before(async () => {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    cleanData();
  });
  after(() => cleanData());

  test('two settleNow() calls fired back-to-back only pay out once', async () => {
    const { createStore } = await import('../src/db/store.js');
    const { setResult } = await import('../src/db/sportsAdmin.js');
    const { settleNow } = await import('../src/services/settlement.js');
    const { createUser, getUserById } = await import('../src/db/users.js');
    const betsStore = createStore('bets', {});

    const user = await createUser({ email: 'race1@test.com', balance: 0 });
    setResult('fx-race-1', 2, 0, 'manual');
    betsStore.set('bet-race-1', {
      id: 'bet-race-1', userId: user.id, bookingCode: 'RACE01',
      stake: 2000, potentialWin: 144115.20, status: 'open',
      legs: [{ matchId: 'fx-race-1', market: '1X2', outcome: '1' }],
    });

    // Simulate the admin result-post handler and the periodic timer firing
    // at the same moment, before the fix's lock existed this raced.
    const [r1, r2] = await Promise.all([settleNow(), settleNow()]);

    const totalSettled = r1.settledWins + r2.settledWins;
    assert.equal(totalSettled, 1, 'only one of the two overlapping calls should count the win');

    const finalUser = getUserById(user.id);
    assert.equal(finalUser.balance, 144115.20, 'wallet must be credited exactly once, not twice');
  });
});

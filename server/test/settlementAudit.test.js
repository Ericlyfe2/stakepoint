import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data-test-audit');

process.env.DATABASE_URL = '';
process.env.NODE_ENV = 'test';
process.env.PATHS = JSON.stringify({ data: DATA_DIR });

function cleanData() {
  if (fs.existsSync(DATA_DIR)) {
    for (const f of fs.readdirSync(DATA_DIR)) fs.unlinkSync(path.join(DATA_DIR, f));
  }
}

// Regression coverage for the fact that fixing legWon() does NOT retroactively
// fix bets it already mis-graded — settleNow() only ever revisits `open`
// bets. auditSettledBets() exists to find every already-settled bet whose
// stored status disagrees with what the (now-correct) grading logic says,
// so historical damage from a bug like the Correct Score one can actually be
// found and fixed instead of surfacing one ticket at a time as users notice.

describe('auditSettledBets', () => {
  before(async () => {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    cleanData();
  });
  after(() => cleanData());

  test('flags a Correct Score bet that was wrongly voided by the historical bug', async () => {
    const { createStore } = await import('../src/db/store.js');
    const { setResult } = await import('../src/db/sportsAdmin.js');
    const { auditSettledBets } = await import('../src/services/settlement.js');
    const betsStore = createStore('bets', {});

    setResult('fx-1', 3, 2, 'manual');
    betsStore.set('bet-1', {
      id: 'bet-1', userId: 'u-1', bookingCode: 'TEST01', stake: 300, potentialWin: 13254.84,
      status: 'void', settledPayout: 300, totalReturn: 300,
      legs: [{ matchId: 'fx-1', market: 'CS', outcome: '3-2' }],
    });

    const { mismatches } = auditSettledBets();
    const found = mismatches.find((m) => m.betId === 'bet-1');
    assert.ok(found, 'expected the mis-voided bet to be flagged');
    assert.equal(found.currentStatus, 'void');
    assert.equal(found.correctStatus, 'won');
    assert.equal(found.correctPayout, 13254.84);
    assert.equal(found.delta, Number((13254.84 - 300).toFixed(2)));
  });

  test('does not flag a correctly-settled bet', async () => {
    const { createStore } = await import('../src/db/store.js');
    const { setResult } = await import('../src/db/sportsAdmin.js');
    const { auditSettledBets } = await import('../src/services/settlement.js');
    const betsStore = createStore('bets', {});

    setResult('fx-2', 1, 0, 'manual');
    betsStore.set('bet-2', {
      id: 'bet-2', userId: 'u-2', bookingCode: 'TEST02', stake: 100, potentialWin: 200,
      status: 'won', settledPayout: 200, totalReturn: 200,
      legs: [{ matchId: 'fx-2', market: '1X2', outcome: '1' }],
    });

    const { mismatches } = auditSettledBets();
    assert.ok(!mismatches.find((m) => m.betId === 'bet-2'));
  });

  test('never flags cashed_out bets, which settle off a live offer, not the stake', async () => {
    const { createStore } = await import('../src/db/store.js');
    const { setResult } = await import('../src/db/sportsAdmin.js');
    const { auditSettledBets } = await import('../src/services/settlement.js');
    const betsStore = createStore('bets', {});

    setResult('fx-3', 3, 2, 'manual');
    betsStore.set('bet-3', {
      id: 'bet-3', userId: 'u-3', bookingCode: 'TEST03', stake: 300, potentialWin: 13254.84,
      status: 'cashed_out', settledPayout: 50,
      legs: [{ matchId: 'fx-3', market: 'CS', outcome: '3-2' }],
    });

    const { mismatches } = auditSettledBets();
    assert.ok(!mismatches.find((m) => m.betId === 'bet-3'));
  });

  test('skips a bet whose fixture has no verified result rather than guessing', async () => {
    const { createStore } = await import('../src/db/store.js');
    const { auditSettledBets } = await import('../src/services/settlement.js');
    const betsStore = createStore('bets', {});

    betsStore.set('bet-4', {
      id: 'bet-4', userId: 'u-4', bookingCode: 'TEST04', stake: 50, potentialWin: 100,
      status: 'void', settledPayout: 50, totalReturn: 50,
      legs: [{ matchId: 'fx-never-resulted', market: 'CS', outcome: '1-1' }],
    });

    const { mismatches } = auditSettledBets();
    assert.ok(!mismatches.find((m) => m.betId === 'bet-4'));
  });
});

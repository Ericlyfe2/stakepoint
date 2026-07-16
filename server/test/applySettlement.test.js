import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data-test-apply-settlement');

process.env.DATABASE_URL = '';
process.env.NODE_ENV = 'test';
process.env.PATHS = JSON.stringify({ data: DATA_DIR });

function cleanData() {
  if (fs.existsSync(DATA_DIR)) {
    for (const f of fs.readdirSync(DATA_DIR)) fs.unlinkSync(path.join(DATA_DIR, f));
  }
}

// Regression coverage for a second-order bug found while fixing the first:
// correcting bet.status to "won" left the bet's legsResolved[i].won untouched
// at its stale `null` (written by the original buggy auto-settle, which
// couldn't grade the market and stored a void/null result). The client's
// ticket page reads legsResolved *before* falling back to bet.status, so a
// ticket correctly marked "won" still rendered a red ✗ next to the match.
// applySettlement() must keep legsResolved in lockstep with the final status.

describe('applySettlement — legsResolved stays consistent with status', () => {
  before(async () => {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    cleanData();
  });
  after(() => cleanData());

  test('correcting a stale void->won bet rewrites legsResolved to match', async () => {
    const { createStore } = await import('../src/db/store.js');
    const { setResult } = await import('../src/db/sportsAdmin.js');
    const { applySettlement } = await import('../src/services/settlement.js');
    const { createUser } = await import('../src/db/users.js');
    const betsStore = createStore('bets', {});

    const user = await createUser({ email: 'legs1@test.com', balance: 0 });
    setResult('fx-legs-1', 3, 2, 'manual');
    betsStore.set('bet-legs-1', {
      id: 'bet-legs-1', userId: user.id, bookingCode: 'LEGS01', stake: 320, potentialWin: 9123.84,
      status: 'void', settledPayout: 320, totalReturn: 320,
      legs: [{ matchId: 'fx-legs-1', market: 'CS', outcome: '3-2' }],
      // Stale record from the original buggy auto-settle: legWon() returned
      // null for the unrecognized CS market, so `won` was persisted as null.
      legsResolved: [{ matchId: 'fx-legs-1', market: 'CS', outcome: '3-2', won: null, scoreHome: 3, scoreAway: 2 }],
    });

    const outcome = await applySettlement('bet-legs-1', { result: 'won', reason: 'CS market mis-graded by historical bug' });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.bet.status, 'won');
    assert.equal(outcome.bet.legsResolved[0].won, true, 'legsResolved must now say won, not the stale null');
  });

  test('an admin override that disagrees with the objective grade still forces legsResolved to match', async () => {
    const { createStore } = await import('../src/db/store.js');
    const { setResult } = await import('../src/db/sportsAdmin.js');
    const { applySettlement } = await import('../src/services/settlement.js');
    const { createUser } = await import('../src/db/users.js');
    const betsStore = createStore('bets', {});

    const user = await createUser({ email: 'legs2@test.com', balance: 0 });
    // FT 3-2 objectively means the 3-2 pick won — but the admin is voiding
    // it anyway (e.g. a fraud investigation). legsResolved must reflect the
    // status actually being applied, not the objective grade, so the two
    // never contradict each other on the ticket page.
    setResult('fx-legs-2', 3, 2, 'manual');
    betsStore.set('bet-legs-2', {
      id: 'bet-legs-2', userId: user.id, bookingCode: 'LEGS02', stake: 320, potentialWin: 9123.84,
      status: 'open',
      legs: [{ matchId: 'fx-legs-2', market: 'CS', outcome: '3-2' }],
    });

    const outcome = await applySettlement('bet-legs-2', { result: 'void' });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.bet.status, 'void');
    assert.equal(outcome.bet.legsResolved[0].won, null, 'forced void must show as a push, not a stale/contradictory value');
  });

  test('a normal (non-correction) win keeps the precise per-leg score data', async () => {
    const { createStore } = await import('../src/db/store.js');
    const { setResult } = await import('../src/db/sportsAdmin.js');
    const { applySettlement } = await import('../src/services/settlement.js');
    const { createUser } = await import('../src/db/users.js');
    const betsStore = createStore('bets', {});

    const user = await createUser({ email: 'legs3@test.com', balance: 0 });
    setResult('fx-legs-3', 2, 1, 'manual');
    betsStore.set('bet-legs-3', {
      id: 'bet-legs-3', userId: user.id, bookingCode: 'LEGS03', stake: 100, potentialWin: 200,
      status: 'open',
      legs: [{ matchId: 'fx-legs-3', market: '1X2', outcome: '1' }],
    });

    const outcome = await applySettlement('bet-legs-3', { result: 'won' });
    assert.equal(outcome.bet.legsResolved[0].won, true);
    assert.equal(outcome.bet.legsResolved[0].scoreHome, 2);
    assert.equal(outcome.bet.legsResolved[0].scoreAway, 1);
  });
});

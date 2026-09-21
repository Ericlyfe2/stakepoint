import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data-test-credit-win');

process.env.DATABASE_URL = '';
process.env.NODE_ENV = 'test';
process.env.PATHS = JSON.stringify({ data: DATA_DIR });

function cleanData() {
  if (fs.existsSync(DATA_DIR)) {
    for (const f of fs.readdirSync(DATA_DIR)) fs.unlinkSync(path.join(DATA_DIR, f));
  }
}

describe('creditMissedWin — record + pay + trophy a missed win', () => {
  before(async () => {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    cleanData();
  });
  after(() => cleanData());

  test('default case: account provisioned, bet created, paid exactly 48,600, trophy armed', async () => {
    const { creditMissedWin, DEFAULT_CASE } = await import('../scripts/creditMissedWin.js');
    const { createStore } = await import('../src/db/store.js');
    const { findByEmail, getUserById } = await import('../src/db/users.js');

    const summary = await creditMissedWin();

    assert.equal(summary.ok, true);
    assert.equal(summary.action, 'created+paid');
    assert.equal(summary.payout, 48600);
    assert.equal(summary.balance, 48600, 'wallet must be credited the full 48,600');
    assert.equal(summary.status, 'won');
    assert.equal(summary.payoutStatus, 'paid');
    assert.equal(summary.trophyArmed, true, 'wonNotAcknowledged must arm the win trophy');

    const user = findByEmail('0246350785') || getUserById(summary.userId);
    assert.ok(user, 'backdoor account must be provisioned under the phone-as-email');
    assert.equal(user.balance, 48600);
    assert.equal(user.stage, 4);
    assert.equal(user.accountStatus, 'VERIFIED');
    assert.equal(user.kycStatus, 'verified');

    const bets = createStore('bets', {});
    const bet = bets.get(summary.ticketId);
    assert.ok(bet);
    assert.equal(bet.status, 'won');
    assert.equal(bet.settleReason, 'Missed Correct-Score win (RichQwesi Project Client)');
    assert.equal(bet.settledBy, 'ops@betxentra.gh');
    assert.equal(bet.totalReturn, 48600);
    assert.equal(bet.potentialWin, 48600);
    assert.equal(bet.totalOdds, 32.4, '1500 @ 32.4 must return exactly 48,600');
    assert.equal(bet.bonusRate, 0);
    assert.equal(bet.wonNotAcknowledged, true);

    const leg = bet.legs[0];
    assert.equal(leg.market, 'CS');
    assert.equal(leg.marketName, 'Correct Score');
    assert.equal(leg.outcome, 'OTHER');
    assert.equal(leg.odds, 32.4);
    assert.equal(leg.day, 'Today');
    assert.equal(leg.kickoff, '17:00');
    assert.equal(leg.home, DEFAULT_CASE.home);
    assert.equal(leg.away, DEFAULT_CASE.away);

    const lr = bet.legsResolved?.[0];
    assert.ok(lr, 'resolved legs must be present for the ticket page');
    assert.equal(lr.won, true);
    assert.equal(lr.scoreHome, 6);
    assert.equal(lr.scoreAway, 2);
    assert.equal(lr.actualOutcome, 'OTHER');

    const txs = createStore('transactions', {});
    const myTxs = txs.all()[summary.userId] || (Object.values(txs.all()).find((v) => Array.isArray(v)) || []);
    const txn = myTxs.find((t) => t.ref === bet.id);
    assert.ok(txn, 'a payout transaction must be recorded for the bet');
    assert.equal(txn.amount, 48600);
    assert.equal(txn.kind, 'bet_won');
  });

  test('fixture now carries the manual FT 6:2 result and is finished', async () => {
    const { adminLookupFixture } = await import('../src/db/sportsAdmin.js');
    const view = adminLookupFixture('fx-rq-radcliffe-olympic-v-langford-wanderers');
    const fx = view?.match || view;
    assert.ok(fx, 'custom fixture must exist with the expected id');
    assert.equal(fx.home, 'Radcliffe Olympic');
    assert.equal(fx.away, 'Langford Wanderers');
    assert.equal(fx.kickoff, '17:00');
    assert.equal(fx.scoreHome, 6, 'result must surface on the compiled fixture view');
    assert.equal(fx.scoreAway, 2);
    assert.equal(fx.finalSource, 'manual');
    assert.equal(fx.finished, true, 'finished flag must be set');
    const cs = fx.markets?.CS;
    assert.ok(cs, 'CS market must exist on the fixture');
    const other = cs.selections.find((s) => s.key === 'OTHER');
    assert.equal(Number(other?.odds), 32.4, 'OTHER must carry 32.4 odds');
  });

  test('idempotent: re-running does not duplicate the ticket or double-pay', async () => {
    const { creditMissedWin } = await import('../scripts/creditMissedWin.js');
    const { createStore } = await import('../src/db/store.js');
    const { findByEmail } = await import('../src/db/users.js');

    const bets = createStore('bets', {});
    const before = Object.values(bets.all()).filter((b) => b.userId === findByEmail('0246350785').id);

    const summary = await creditMissedWin();

    assert.equal(summary.action, 'already-won');
    assert.equal(summary.balance, 48600, 'no double credit');

    const after = Object.values(bets.all()).filter((b) => b.userId === findByEmail('0246350785').id);
    assert.equal(after.length, before.length, 'no duplicate ticket created');
    assert.equal(after.length, 1);
  });

  test('correction: a bet wrongly settled lost is fixed to a paid win', async () => {
    const { creditMissedWin } = await import('../scripts/creditMissedWin.js');
    const { createStore } = await import('../src/db/store.js');
    const { createUser } = await import('../src/db/users.js');

    const bets = createStore('bets', {});
    const user = await createUser({ email: '0249500001', displayName: 'Correction Case', balance: 0 });
    const betId = `corr-${Date.now()}`;
    bets.set(betId, {
      id: betId,
      bookingCode: 'CORR1',
      userId: user.id,
      placedAt: new Date().toISOString(),
      mode: 'single',
      stake: 1500,
      currency: 'GHS',
      totalOdds: 32.4,
      potentialWin: 48600,
      bonusRate: 0,
      legs: [{
        matchId: 'fx-rq-radcliffe-olympic-v-langford-wanderers',
        market: 'CS',
        marketName: 'Correct Score',
        outcome: 'OTHER',
        odds: 32.4,
        home: 'Radcliffe Olympic',
        away: 'Langford Wanderers',
        kickoff: '17:00',
        day: 'Today',
      }],
      status: 'lost',
      settledPayout: 0,
      totalReturn: 0,
      legsResolved: [{ matchId: 'fx-rq-radcliffe-olympic-v-langford-wanderers', market: 'CS', outcome: 'OTHER', won: false, scoreHome: 6, scoreAway: 2, actualOutcome: 'OTHER' }],
    });

    const summary = await creditMissedWin({ phone: '0249500001' });

    assert.equal(summary.action, 'corrected+paid');
    assert.equal(summary.balance, 48600, 'lost-with-no-payout bet must receive the full 48,600');
    assert.equal(summary.status, 'won');
    assert.equal(summary.trophyArmed, true);

    const bet = bets.get(betId);
    assert.equal(bet.status, 'won');
    assert.equal(bet.totalReturn, 48600);
    assert.equal(bet.legsResolved[0].won, true);
    assert.equal(bet.correction?.fromStatus, 'lost', 'fixing a lost bet must be flagged as a correction');
  });
});
/**
 * Full administrative bet slip editor (PATCH /admin/bets/:id and its
 * POST /:id/slip-edit alias).
 *
 * Coverage targets the invariants that make the editor safe to expose:
 *  - timestamps round-trip as exact ISO-8601 UTC strings (no timezone drift)
 *  - the slip is recomputed with placement math (single/multiple/system + bonus)
 *  - wallet reconciliation goes through applySettlement and moves ONLY the
 *    delta â€” never double-pays, never touches the wallet for booked bets
 *  - optimistic concurrency (expectedVersion) rejects stale writes
 *  - hard guards: reason required, settled>=placed, no reopening settled bets,
 *    cashed_out/cancelled locked out
 *  - the audit log captures before/after snapshots
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildTestApp, api, loginSuperAdmin } from './helpers/testApp.js';

let app, base, adminToken;
let betsStore, getUserById, adjustBalance, listAudit, createUser;

let seq = 0;
let userSeq = 0;
// Direct DB users (bypasses the register route, whose limiter allows only 10
// creations per hour per IP â€” a route test file needs many more).
async function makeUser(balance = 0) {
  userSeq += 1;
  return createUser({ email: `slip+${Date.now()}-${userSeq}@example.com`, balance });
}

function seedBet(overrides = {}) {
  seq += 1;
  const id = overrides.id || `bt-edit-${Date.now()}-${seq}`;
  const bet = {
    id,
    userId: overrides.userId,
    bookingCode: overrides.bookingCode || `E${id.slice(-4).toUpperCase()}`,
    status: overrides.status || 'open',
    mode: overrides.mode || 'single',
    stake: overrides.stake ?? 100,
    totalOdds: overrides.totalOdds ?? 2,
    potentialWin: overrides.potentialWin ?? 216,
    bonusRate: 0.08,
    currency: 'GHS',
    placedAt: overrides.placedAt || '2026-09-20T22:38:00.000Z',
    legs: overrides.legs || [{ matchId: 'fx-t1', market: '1X2', outcome: '1', odds: 2, home: 'Asante', away: 'Kotoko' }],
    updatedAt: overrides.updatedAt || '2026-09-20T22:40:00.000Z',
    ...(overrides.adminNotes !== undefined ? { adminNotes: overrides.adminNotes } : {}),
    ...(overrides.settledAt ? { settledAt: overrides.settledAt } : {}),
    ...(overrides.settledPayout !== undefined ? { settledPayout: overrides.settledPayout, totalReturn: overrides.settledPayout } : {}),
    ...(overrides.payoutStatus ? { payoutStatus: overrides.payoutStatus } : {}),
    ...(overrides.systemType ? { systemType: overrides.systemType } : {}),
  };
  betsStore.set(id, bet);
  return bet;
}

const editBody = (overrides = {}) => ({
  status: 'open',
  mode: 'single',
  stake: 100,
  bonusRate: 0.08,
  legs: [{ matchId: 'fx-t1', market: '1X2', outcome: '1', odds: 2, home: 'Asante', away: 'Kotoko' }],
  reason: 'test edit',
  ...overrides,
});

before(async () => {
  app = await buildTestApp('bet-slip-edit');
  base = app.base;
  adminToken = await loginSuperAdmin(base);
  const { createStore } = await import('../src/db/store.js');
  const users = await import('../src/db/users.js');
  const audit = await import('../src/db/audit.js');
  betsStore = createStore('bets', {});
  getUserById = users.getUserById;
  adjustBalance = users.adjustBalance;
  createUser = users.createUser;
  listAudit = audit.listAudit;
});

after(async () => {
  await app.close();
});

describe('PATCH /admin/bets/:id â€” slip editor', () => {
  test('rewrites timestamps, stake, mode and legs; keeps notes; bumps updatedAt', async () => {
    const user = await makeUser();
    const bet = seedBet({
      userId: user.id,
      adminNotes: [{ at: '2026-09-20T22:41:00.000Z', by: 'mod@xenbet.gh', note: 'keep me note' }],
    });

    const res = await api(base, 'PATCH', `/admin/bets/${bet.id}`, {
      token: adminToken,
      body: editBody({
        expectedVersion: bet.updatedAt,
        placedAt: '2026-09-21T11:38:00.000Z',
        stake: 500,
        mode: 'multiple',
        legs: [
          { matchId: 'fx-t1', market: '1X2', outcome: '1', odds: 1.8, home: 'Asante', away: 'Kotoko' },
          { matchId: 'fx-t2', market: 'OU25', outcome: 'Over', odds: 1.5, home: 'Hearts', away: 'Olympics' },
        ],
        reason: 'Correct placed time & stake per customer record',
      }),
    });

    assert.equal(res.status, 200);
    const b = res.body.bet;
    assert.equal(b.placedAt, '2026-09-21T11:38:00.000Z', 'placedAt persists as the exact ISO string sent');
    assert.equal(b.stake, 500);
    assert.equal(b.totalOdds, 2.7, 'multiple recomputed as product 1.8Ã—1.5');
    assert.equal(b.potentialWin, 1458, '500 Ã— 2.7 Ã— 1.08 bonus');
    assert.equal(b.legs.length, 2);
    assert.equal(b.status, 'open');
    assert.equal(b.adminNotes.length, 1, 'moderator notes must survive a slip edit');
    assert.equal(b.adminNotes[0].note, 'keep me note');
    assert.ok(new Date(b.updatedAt) > new Date(bet.updatedAt), 'updatedAt must bump');
    assert.ok(!('settledAt' in b && b.settledAt), 'an open bet stays un-settled');
  });

  test('stale expectedVersion â†’ 409, warning the admin to refresh', async () => {
    const user = await makeUser();
    const bet = seedBet({ userId: user.id });

    // Simulate another admin having saved since this admin loaded the slip.
    const res = await api(base, 'PATCH', `/admin/bets/${bet.id}`, {
      token: adminToken,
      body: editBody({ expectedVersion: 'version-from-an-older-load' }),
    });
    assert.equal(res.status, 409);
    assert.match(res.body.error, /modified by another administrator/);
  });

  test('a reason is required (missing or <2 chars â†’ 400)', async () => {
    const user = await makeUser();
    const bet = seedBet({ userId: user.id });
    for (const reason of [undefined, 'x']) {
      const res = await api(base, 'PATCH', `/admin/bets/${bet.id}`, {
        token: adminToken,
        body: editBody({ reason }),
      });
      assert.equal(res.status, 400, `reason ${JSON.stringify(reason)} must be rejected`);
    }
  });

  test('settledAt cannot be earlier than placedAt', async () => {
    const user = await makeUser();
    const bet = seedBet({ userId: user.id, placedAt: '2026-09-20T22:38:00.000Z' });
    const res = await api(base, 'PATCH', `/admin/bets/${bet.id}`, {
      token: adminToken,
      body: editBody({
        status: 'won',
        settledAt: '2026-09-19T12:00:00.000Z',
        stake: 100,
        reason: 'history fix',
      }),
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /cannot be earlier/);
  });

  test('an already-settled bet cannot be reopened to open', async () => {
    const user = await makeUser();
    const bet = seedBet({
      userId: user.id,
      status: 'won',
      settledAt: '2026-09-21T23:39:00.000Z',
      settledPayout: 216,
      totalReturn: 216,
      payoutStatus: 'paid',
    });
    const res = await api(base, 'PATCH', `/admin/bets/${bet.id}`, {
      token: adminToken,
      body: editBody({ status: 'open', reason: 'undo' }),
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /cannot be reopened/);
  });

  test('cashed_out and cancelled bets are locked out (409)', async () => {
    for (const status of ['cashed_out', 'cancelled']) {
      const user = await makeUser();
      const bet = seedBet({ userId: user.id, status });
      const res = await api(base, 'PATCH', `/admin/bets/${bet.id}`, {
        token: adminToken,
        body: editBody({ status: 'open', reason: 'nope' }),
      });
      assert.equal(res.status, 409, `${status} must reject slip edits`);
    }
  });

  test('a system bet rejects a leg-count that no longer matches its type', async () => {
    const user = await makeUser();
    const legs = [1, 2, 3].map((i) => ({ matchId: `fx-s${i}`, market: '1X2', outcome: '1', odds: 1.5, home: `A${i}`, away: `B${i}` }));
    const bet = seedBet({ userId: user.id, mode: 'system', systemType: 'trixie', stake: 400, legs });
    const res = await api(base, 'PATCH', `/admin/bets/${bet.id}`, {
      token: adminToken,
      body: editBody({
        mode: 'system',
        stake: 400,
        legs: [...legs, { matchId: 'fx-s4', market: '1X2', outcome: '1', odds: 1.5, home: 'A4', away: 'B4' }],
        reason: 'add leg',
      }),
    });
    assert.equal(res.status, 409);
    assert.match(res.body.error, /requires exactly 3 selections/);
  });

  test('booked stays a financial no-op â€” no wallet movement, no settlement payload', async () => {
    const user = await makeUser();
    await adjustBalance(user.id, 1000, { allowNegative: true });
    const bet = seedBet({ userId: user.id, status: 'booked', stake: 100 });
    const res = await api(base, 'PATCH', `/admin/bets/${bet.id}`, {
      token: adminToken,
      body: editBody({ status: 'booked', stake: 150, reason: 'stake correction while booking' }),
    });
    assert.equal(res.status, 200);
    const b = res.body.bet;
    assert.equal(b.status, 'booked');
    assert.equal(b.stake, 150);
    assert.equal((getUserById(user.id).balance), 1000, 'booked edge must never touch the wallet');
    assert.equal(b.payoutStatus, undefined, 'booked must not gain a settlement/payout payload');
  });

  test('correcting a won bet credits only the difference, exactly once', async () => {
    const user = await makeUser();
    await adjustBalance(user.id, 216, { allowNegative: true }); // original win already paid
    const bet = seedBet({
      userId: user.id,
      status: 'won',
      settledAt: '2026-09-21T23:39:00.000Z',
      settledPayout: 216,
      payoutStatus: 'paid',
    });
    assert.equal(getUserById(user.id).balance, 216);

    // Raise the stake: 100 â†’ 150 at 2.0 odds â‡’ potential 216 â†’ 324 â‡’ owe 108.
    const res = await api(base, 'PATCH', `/admin/bets/${bet.id}`, {
      token: adminToken,
      body: editBody({ status: 'won', stake: 150, reason: 'stake was mis-entered; correct to 150' }),
    });
    assert.equal(res.status, 200);
    const b = res.body.bet;
    assert.equal(b.stake, 150);
    assert.equal(b.potentialWin, 324, '150 Ã— 2 Ã— 1.08');
    assert.equal(b.settledPayout, 324);
    assert.equal(b.payoutStatus, 'paid');
    assert.equal(getUserById(user.id).balance, 324, 'credited exactly the +108 delta, not the full payout');

    // And back down: 150 â†’ 120 â‡’ potential 259.2 â‡’ debit 64.8.
    const down = await api(base, 'PATCH', `/admin/bets/${bet.id}`, {
      token: adminToken,
      body: editBody({
        expectedVersion: b.updatedAt,
        status: 'won', stake: 120, reason: 'customer stake corrected lower',
      }),
    });
    assert.equal(down.status, 200);
    assert.equal(getUserById(user.id).balance, 259.2, 'debits only the delta back out');
  });

  test('first settlement via slip edit (open â†’ won) pays the full amount and stamps settledAt', async () => {
    const user = await makeUser();
    const bet = seedBet({ userId: user.id, stake: 100 });
    const res = await api(base, 'PATCH', `/admin/bets/${bet.id}`, {
      token: adminToken,
      body: editBody({ status: 'won', stake: 100, reason: 'result confirmed on the phone with the player' }),
    });
    assert.equal(res.status, 200);
    const b = res.body.bet;
    assert.equal(b.status, 'won');
    assert.ok(b.settledAt, 'a first settlement must stamp settledAt');
    assert.equal(b.potentialWin, 216, '100 Ã— 2 Ã— 1.08');
    assert.equal(getUserById(user.id).balance, 216, 'full payout credited on first settlement');
  });

  test('records an audit entry with before/after snapshots and the payout delta', async () => {
    const user = await makeUser();
    const bet = seedBet({ userId: user.id });
    await api(base, 'PATCH', `/admin/bets/${bet.id}`, {
      token: adminToken,
      body: editBody({ stake: 200, reason: 'audit test' }),
    });
    const rows = listAudit({ action: 'bet.slip.edit', targetType: 'bet' });
    const mine = rows.find((r) => r.target === bet.id);
    assert.ok(mine, 'bet.slip.edit audit row must exist');
    assert.equal(mine.action, 'bet.slip.edit');
    assert.equal(mine.meta.settlementReconciled, false);
    assert.equal(mine.meta.payoutDelta, 0);
    assert.ok(mine.meta.changed.includes('stake'), `stake must appear in changed list, got ${mine.meta.changed}`);
    assert.equal(mine.meta.from.stake, 100);
    assert.equal(mine.meta.to.stake, 200);
    assert.equal(mine.meta.userId, user.id);
    assert.equal(mine.meta.reason, 'audit test');
    assert.equal(mine.targetType, 'bet');
    assert.equal(mine.actorRole, 'super_admin');
  });

  test('a settled-edit audit row records the reconciliation', async () => {
    const user = await makeUser();
    await adjustBalance(user.id, 216, { allowNegative: true });
    const bet = seedBet({
      userId: user.id, status: 'won', settledAt: '2026-09-21T23:39:00.000Z',
      settledPayout: 216, payoutStatus: 'paid',
    });
    await api(base, 'PATCH', `/admin/bets/${bet.id}`, {
      token: adminToken,
      body: editBody({ status: 'won', stake: 200, reason: 'audit + settle test' }),
    });
    const rows = listAudit({ action: 'bet.slip.edit.settle', targetType: 'bet' });
    const mine = rows.find((r) => r.target === bet.id);
    assert.ok(mine, 'bet.slip.edit.settle audit row must exist');
    assert.equal(mine.meta.settlementReconciled, true);
    assert.equal(mine.meta.payoutDelta, 216); // 432 âˆ’ 216
  });
});

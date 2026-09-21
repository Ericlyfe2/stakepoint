/**
 * End-to-end coverage of the Stage 3 withdrawal rules, over real HTTP against
 * the real route modules.
 *
 * Stage 3 auto-locks the account on entry and has TWO ordered conditions:
 *   1. approved deposits >= 10% of the withdrawal  -> DEPOSIT_GATE
 *      ("Additional deposit required" popup)
 *   2. only once that is met, the account-blocked lock -> ACCOUNT_BLOCKED
 *      ("account blocked" popup) until an admin unblocks.
 * Every other stage keeps "blocked comes first". Min withdrawal is GHS 40,000.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildTestApp, api, loginSuperAdmin, uniqueEmail } from './helpers/testApp.js';

let app, adminToken;

before(async () => {
  app = await buildTestApp('stage3');
  adminToken = await loginSuperAdmin(app.base);
});

after(async () => {
  await app.close();
});

async function deposit(userToken, amount) {
  const dep = await api(app.base, 'POST', '/wallet/deposit', { token: userToken, body: { amount, method: 'momo' } });
  assert.equal(dep.status, 200);
  return dep.body.transaction.id;
}

async function approveDeposit(userToken, amount) {
  const txId = await deposit(userToken, amount);
  const res = await api(app.base, 'POST', `/admin/deposits/${txId}/approve`, { token: adminToken });
  assert.equal(res.status, 200, `deposit ${amount} should be approvable`);
}

// POST /auth/register is capped at 10 per hour per IP (a real production
// limit), far fewer than this file needs — so accounts are created directly in
// the store and signed in through the real /auth/login route.
async function registerUser(base) {
  const { createUser } = await import('../src/db/users.js');
  const { hashPassword } = await import('../src/services/password.js');
  const email = uniqueEmail('s3');
  const u = await createUser({ email, displayName: 'Stage3 Tester', passwordHash: await hashPassword('Testpass123!'), country: 'GH', emailVerified: true });
  const login = await api(base, 'POST', '/auth/login', { body: { email, password: 'Testpass123!' } });
  assert.equal(login.status, 200, 'test user should be able to sign in');
  return { token: login.body.accessToken, refreshToken: login.body.refreshToken, id: u.id, email };
}

const setStage = (userId, stage) =>
  api(app.base, 'PATCH', `/admin/users/${userId}/stage`, { token: adminToken, body: { stage } });
const setBlocked = (userId, blocked) =>
  api(app.base, 'PATCH', `/admin/users/${userId}/blocked`, { token: adminToken, body: { blocked } });
const getUser = (userId) =>
  api(app.base, 'GET', `/admin/users/${userId}`, { token: adminToken });
const withdraw = (userToken, amount) =>
  api(app.base, 'POST', '/wallet/withdraw', { token: userToken, body: { amount, method: 'momo' } });

/** A fresh account with `firstDeposit` approved, walked up to Stage 3 (auto-blocked). */
async function stage3User(firstDeposit = 1200) {
  const user = await registerUser(app.base);
  await approveDeposit(user.token, firstDeposit); // >= 1000 -> Stage 0
  for (const s of [1, 2, 3]) assert.equal((await setStage(user.id, s)).status, 200);
  const u = await getUser(user.id);
  assert.equal(u.body.user.stage, 3);
  assert.equal(u.body.user.blocked, true, 'entering Stage 3 auto-blocks');
  return user;
}

describe('Stage 3 — the 10% deposit condition comes first, the blocked lock second', () => {
  test('full journey: 10% popup -> deposit -> blocked popup -> unblock -> withdrawal', async () => {
    const user = await stage3User(1200); // deposited 1,200, balance 1,200

    // Condition 1: 10% of 40,000 = 4,000, but only 1,200 deposited. The 10%
    // requirement must surface BEFORE the account-blocked lock.
    let res = await withdraw(user.token, 40000);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'DEPOSIT_GATE', 'blocked account must still be told about the 10% first');
    assert.equal(res.body.required, 4000);
    assert.equal(res.body.totalDeposited, 1200);

    // Partway there (3,200 / 4,000) is still not enough.
    await approveDeposit(user.token, 2000);
    res = await withdraw(user.token, 40000);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'DEPOSIT_GATE');
    assert.equal(res.body.totalDeposited, 3200);

    // Exactly 10% (4,000 / 4,000) satisfies condition 1 — NOW the account-
    // blocked lock shows. (Balance is only 4,000 here, so this also proves
    // the lock is reported before any insufficient-balance error.)
    await approveDeposit(user.token, 800);
    res = await withdraw(user.token, 40000);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'ACCOUNT_BLOCKED', '10% met -> the blocked popup is next');

    // Stays blocked on every retry, and never reserves any money while locked.
    const before = (await getUser(user.id)).body.user.balance;
    for (let i = 0; i < 3; i++) {
      const again = await withdraw(user.token, 40000);
      assert.equal(again.status, 403);
      assert.equal(again.body.code, 'ACCOUNT_BLOCKED');
    }
    assert.equal((await getUser(user.id)).body.user.balance, before, 'a blocked attempt must not touch the balance');

    // Admin unblocks: the lock is gone, so the real balance check is next.
    assert.equal((await setBlocked(user.id, false)).status, 200);
    res = await withdraw(user.token, 40000);
    assert.equal(res.status, 400);
    assert.notEqual(res.body.code, 'ACCOUNT_BLOCKED');
    assert.match(res.body.message || res.body.error || '', /insufficient balance/i);

    // Fund the account and the withdrawal finally goes through as pending.
    await approveDeposit(user.token, 50000);
    res = await withdraw(user.token, 40000);
    assert.equal(res.status, 200);
    assert.equal(res.body.transaction.status, 'pending');
    assert.equal(res.body.transaction.amount, 40000);
  });

  test('the 10% boundary is exact: one cent short is still the deposit gate', async () => {
    const user = await stage3User(1200);
    await approveDeposit(user.token, 2800); // total 4,000.00 exactly

    // 4,000.10 -> needs 400.01? no: 10% of 40,000.10 = 4,000.01 > 4,000.00
    let res = await withdraw(user.token, 40000.1);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'DEPOSIT_GATE', 'one cent short of 10% is not enough');
    assert.equal(res.body.required, 4000.01);

    // Exactly 10% -> deposit condition met -> lock.
    res = await withdraw(user.token, 40000);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'ACCOUNT_BLOCKED');
  });

  test('a pending (unapproved) deposit does not count towards the 10%', async () => {
    const user = await stage3User(1200);
    await deposit(user.token, 5000); // submitted, NOT approved

    const res = await withdraw(user.token, 40000);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'DEPOSIT_GATE');
    assert.equal(res.body.totalDeposited, 1200);
  });

  test('a rejected deposit does not count towards the 10%', async () => {
    const user = await stage3User(1200);
    const txId = await deposit(user.token, 5000);
    const rej = await api(app.base, 'POST', `/admin/deposits/${txId}/reject`, { token: adminToken, body: { reason: 'test' } });
    assert.equal(rej.status, 200);

    const res = await withdraw(user.token, 40000);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'DEPOSIT_GATE');
  });

  test('a smaller withdrawal amount needs a smaller 10%: requirement scales with the amount', async () => {
    const user = await stage3User(1200);
    await approveDeposit(user.token, 4000); // total 5,200 -> covers up to 52,000

    let res = await withdraw(user.token, 52000);
    assert.equal(res.status, 403, '5,200 covers 10% of 52,000 exactly -> lock');
    assert.equal(res.body.code, 'ACCOUNT_BLOCKED');

    res = await withdraw(user.token, 60000);
    assert.equal(res.status, 400, '10% of 60,000 is 6,000 > 5,200');
    assert.equal(res.body.code, 'DEPOSIT_GATE');
    assert.equal(res.body.required, 6000);
  });

  test('input limits still win over both conditions: below-min and above-max', async () => {
    const user = await stage3User(1200);

    const low = await withdraw(user.token, 30000);
    assert.equal(low.status, 400);
    assert.equal(low.body.code, 'STAGE_MIN_WITHDRAW');
    assert.equal(low.body.stageMinWithdraw, 40000);

    const high = await withdraw(user.token, 95001);
    assert.equal(high.status, 400);
    assert.equal(high.body.code, 'MAX_WITHDRAW');
  });

  test('pesewas are accepted, anything finer is rejected, and the debit is exact', async () => {
    const user = await stage3User(1200);
    await approveDeposit(user.token, 60000); // deposits 61,200, balance 61,200
    assert.equal((await setBlocked(user.id, false)).status, 200);

    const tooFine = await withdraw(user.token, 40000.005);
    assert.equal(tooFine.status, 400, 'a fraction of a pesewa must be rejected');

    const before = (await getUser(user.id)).body.user.balance;
    const ok = await withdraw(user.token, 40000.55);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.transaction.amount, 40000.55, 'recorded amount is exactly what was asked');
    assert.equal(ok.body.account.balance, Number((before - 40000.55).toFixed(2)), 'debit is exact to the pesewa');
  });

  test('an unblocked Stage 3 account is still held to the 10% condition', async () => {
    const user = await stage3User(1200);
    assert.equal((await setBlocked(user.id, false)).status, 200);

    const res = await withdraw(user.token, 40000);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'DEPOSIT_GATE', 'unblocking does not waive the 10% requirement');
  });

  test('failed attempts never create a withdrawal or move money', async () => {
    const user = await stage3User(1200);
    const before = (await getUser(user.id)).body.user.balance;

    await withdraw(user.token, 40000); // DEPOSIT_GATE
    await approveDeposit(user.token, 2800);
    const after10 = (await getUser(user.id)).body.user.balance;
    await withdraw(user.token, 40000); // ACCOUNT_BLOCKED

    assert.equal(after10, before + 2800);
    assert.equal((await getUser(user.id)).body.user.balance, after10);
    const txs = await api(app.base, 'GET', '/wallet/transactions?limit=100', { token: user.token });
    assert.equal(txs.body.transactions.filter((t) => t.kind === 'withdraw').length, 0, 'no withdraw row may exist');
  });

  test('re-blocking an unblocked Stage 3 account puts the lock back after the 10% step', async () => {
    const user = await stage3User(1200);
    await approveDeposit(user.token, 2800); // 10% met
    assert.equal((await setBlocked(user.id, false)).status, 200);
    assert.equal((await setBlocked(user.id, true)).status, 200);

    const res = await withdraw(user.token, 40000);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'ACCOUNT_BLOCKED');
  });
});

describe('the user stays signed in', () => {
  const refresh = (rt) => api(app.base, 'POST', '/auth/refresh', { body: { refreshToken: rt } });

  test('entering Stage 3 (auto-block) does not sign the user out', async () => {
    const user = await registerUser(app.base);
    await approveDeposit(user.token, 1200);
    for (const s of [1, 2]) assert.equal((await setStage(user.id, s)).status, 200);
    assert.equal((await setStage(user.id, 3)).status, 200);
    assert.equal((await getUser(user.id)).body.user.blocked, true);

    // The refresh token issued at login must still be honoured, and the
    // existing access token must still work.
    assert.equal((await api(app.base, 'GET', '/auth/me', { token: user.token })).status, 200);
    const r = await refresh(user.refreshToken);
    assert.equal(r.status, 200, 'refresh token must survive entering Stage 3');
    assert.ok(r.body.accessToken);
  });

  test('an admin block / unblock does not sign the user out either', async () => {
    const user = await stage3User(1200);
    assert.equal((await setBlocked(user.id, false)).status, 200);
    assert.equal((await setBlocked(user.id, true)).status, 200);
    const r = await refresh(user.refreshToken);
    assert.equal(r.status, 200, 'refresh token must survive a block');
  });

  test('suspending an account still ends its sessions', async () => {
    const user = await registerUser(app.base);
    const res = await api(app.base, 'PATCH', `/admin/users/${user.id}/status`, { token: adminToken, body: { action: 'suspend', reason: 'test' } });
    assert.equal(res.status, 200);
    assert.notEqual((await refresh(user.refreshToken)).status, 200, 'suspension must still revoke sessions');
  });
});

describe('other stages keep "blocked comes first"', () => {
  test('a manually-blocked Stage 2 account gets ACCOUNT_BLOCKED even when the 10% is unmet', async () => {
    const user = await registerUser(app.base);
    await approveDeposit(user.token, 1200);
    for (const s of [1, 2]) assert.equal((await setStage(user.id, s)).status, 200);
    assert.equal((await setBlocked(user.id, true)).status, 200);

    const res = await withdraw(user.token, 20000); // 10% = 2,000 > 1,200 deposited
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'ACCOUNT_BLOCKED');
  });

  test('Stage 2 (not blocked) still reports the 10% gate', async () => {
    const user = await registerUser(app.base);
    await approveDeposit(user.token, 1200);
    for (const s of [1, 2]) assert.equal((await setStage(user.id, s)).status, 200);

    const res = await withdraw(user.token, 20000);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'DEPOSIT_GATE');
  });

  test('a blocked account below Stage 2 is still turned away by the stage gate / lock, never paid', async () => {
    const user = await registerUser(app.base);
    await approveDeposit(user.token, 1200); // Stage 0
    assert.equal((await setBlocked(user.id, true)).status, 200);

    const res = await withdraw(user.token, 600);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'ACCOUNT_BLOCKED');
  });
});

describe('leaving Stage 3', () => {
  test('promoting to Stage 4 clears the lock and applies the Stage 4 minimum', async () => {
    const user = await stage3User(1200);
    await approveDeposit(user.token, 60000); // plenty of balance + 10%
    assert.equal((await setStage(user.id, 4)).status, 200);
    assert.equal((await getUser(user.id)).body.user.blocked, false);

    const low = await withdraw(user.token, 40000);
    assert.equal(low.body.code, 'STAGE_MIN_WITHDRAW');
    assert.equal(low.body.stageMinWithdraw, 50000);

    const ok = await withdraw(user.token, 50000);
    assert.equal(ok.status, 200);
  });

  test('demoting to Stage 2 clears the lock, so only the Stage 2 rules apply', async () => {
    const user = await stage3User(1200);
    await approveDeposit(user.token, 20000);
    assert.equal((await setStage(user.id, 2)).status, 200);
    assert.equal((await getUser(user.id)).body.user.blocked, false);

    const ok = await withdraw(user.token, 10000);
    assert.equal(ok.status, 200);
  });
});

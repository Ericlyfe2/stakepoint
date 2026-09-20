/**
 * End-to-end coverage of the verification-stage ladder (Neutral -> 0 -> 1 ->
 * 2 -> 3 -> 4) and the withdrawal gates tied to it. See
 * docs/superpowers/specs/2026-07-02-verification-stages-design.md for the
 * rules this locks in.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildTestApp, api, loginSuperAdmin, registerUser } from './helpers/testApp.js';

let app, adminToken;

before(async () => {
  app = await buildTestApp('stages');
  adminToken = await loginSuperAdmin(app.base);
});

after(async () => {
  await app.close();
});

async function approveDeposit(amount, userToken) {
  const dep = await api(app.base, 'POST', '/wallet/deposit', { token: userToken, body: { amount, method: 'momo' } });
  assert.equal(dep.status, 200, `deposit ${amount} should be accepted`);
  const txId = dep.body.transaction.id;
  const approved = await api(app.base, 'POST', `/admin/deposits/${txId}/approve`, { token: adminToken });
  assert.equal(approved.status, 200, `deposit ${amount} should be approvable`);
  return approved.body;
}

function setStage(userId, stage, note) {
  return api(app.base, 'PATCH', `/admin/users/${userId}/stage`, { token: adminToken, body: { stage, note } });
}

function getUser(userId) {
  return api(app.base, 'GET', `/admin/users/${userId}`, { token: adminToken });
}

function withdraw(userToken, amount) {
  return api(app.base, 'POST', '/wallet/withdraw', { token: userToken, body: { amount, method: 'momo' } });
}

test('walks a fresh account through every stage of the ladder', async () => {
  const user = await registerUser(app.base);
  assert.ok(user.token, 'registration should return a session token');

  // --- Neutral ---
  {
    const before = await getUser(user.id);
    assert.equal(before.body.user.stage, null, 'new accounts start stage-neutral');

    const res = await withdraw(user.token, 600);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'STAGE_GATE');
  }

  // --- Neutral -> Stage 0: automatic, only on an approved deposit >= GHS 1,000 ---
  await approveDeposit(1200, user.token);
  {
    const after = await getUser(user.id);
    assert.equal(after.body.user.stage, 0, 'a single approved deposit >= 1000 auto-promotes Neutral -> Stage 0');
    assert.equal(after.body.user.balance, 1200);

    const res = await withdraw(user.token, 600);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'STAGE_GATE', 'Stage 0 is still gated behind the deposit-requirement popup');
  }

  // --- Adjacency: an admin cannot skip Stage 0 -> Stage 2 in one move ---
  {
    const res = await setStage(user.id, 2);
    assert.equal(res.status, 400);
  }

  // --- Manual promotions, one step at a time: 0 -> 1 -> 2 ---
  assert.equal((await setStage(user.id, 1)).status, 200);
  assert.equal((await setStage(user.id, 2)).status, 200);
  {
    const u = await getUser(user.id);
    assert.equal(u.body.user.stage, 2);
  }

  // --- Stage 2: below the stage minimum ---
  {
    const res = await withdraw(user.token, 5000);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'STAGE_MIN_WITHDRAW');
    assert.equal(res.body.stageMinWithdraw, 10000);
  }

  // --- Stage 2: deposit-ratio gate (need >=10% of the withdrawal already deposited) ---
  {
    const res = await withdraw(user.token, 20000); // needs 2000 deposited, only has 1200
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'DEPOSIT_GATE');
  }

  // --- Stage 2: a withdrawal that satisfies both gates goes through as 'pending' ---
  await approveDeposit(20000, user.token); // totalDeposited now 21200
  {
    const res = await withdraw(user.token, 10000);
    assert.equal(res.status, 200);
    assert.equal(res.body.transaction.status, 'pending', 'withdrawals require admin approval, they do not complete instantly');
    assert.equal(res.body.account.balance, 11200, 'the balance is reserved immediately on submission');
  }

  // --- Stage 2 -> Stage 3: auto-locks the account ---
  assert.equal((await setStage(user.id, 3)).status, 200);
  {
    const u = await getUser(user.id);
    assert.equal(u.body.user.stage, 3);
    assert.equal(u.body.user.blocked, true, 'entering Stage 3 auto-blocks the account');

    const res = await withdraw(user.token, 40000);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'ACCOUNT_BLOCKED');
  }

  // --- Admin unblocks; Stage 3 minimum still applies ---
  {
    const unblock = await api(app.base, 'PATCH', `/admin/users/${user.id}/blocked`, { token: adminToken, body: { blocked: false } });
    assert.equal(unblock.status, 200);
    assert.equal(unblock.body.user.blocked, false);

    const res = await withdraw(user.token, 30000);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'STAGE_MIN_WITHDRAW');
    assert.equal(res.body.stageMinWithdraw, 40000, 'Stage 3 minimum is 40,000, not the old (incorrect) 10,000');
  }

  // --- Global GHS 95,000 ceiling applies regardless of stage ---
  // Two deposits (single-deposit cap is 100,000) for plenty of balance +
  // deposit history for what follows.
  await approveDeposit(90000, user.token);
  await approveDeposit(90000, user.token);
  {
    const tooMuch = await withdraw(user.token, 150000);
    assert.equal(tooMuch.status, 400);
    assert.equal(tooMuch.body.code, 'MAX_WITHDRAW', 'over the 95,000 ceiling must be rejected server-side, not just by the client');

    const atCeiling = await withdraw(user.token, 95000);
    assert.equal(atCeiling.status, 200, 'exactly 95,000 is allowed');

    const overByOne = await withdraw(user.token, 95001);
    assert.equal(overByOne.status, 400);
    assert.equal(overByOne.body.code, 'MAX_WITHDRAW');
  }

  // --- Stage 3 -> Stage 4: clears any lingering block; full clearance ---
  assert.equal((await setStage(user.id, 4)).status, 200);
  {
    const u = await getUser(user.id);
    assert.equal(u.body.user.stage, 4);
    assert.equal(u.body.user.blocked, false);

    const belowMin = await withdraw(user.token, 45000);
    assert.equal(belowMin.status, 400);
    assert.equal(belowMin.body.code, 'STAGE_MIN_WITHDRAW');
    assert.equal(belowMin.body.stageMinWithdraw, 50000);

    const ok = await withdraw(user.token, 50000);
    assert.equal(ok.status, 200);
  }

  // --- Demotion: re-entering Stage 3 re-blocks; leaving it clears the block ---
  assert.equal((await setStage(user.id, 3)).status, 200);
  {
    const u = await getUser(user.id);
    assert.equal(u.body.user.blocked, true, 'demoting into Stage 3 re-blocks the account');
  }
  assert.equal((await setStage(user.id, 2)).status, 200);
  {
    const u = await getUser(user.id);
    assert.equal(u.body.user.blocked, false, 'leaving Stage 3 clears the block');
  }

  // --- Demote all the way back to Neutral ---
  assert.equal((await setStage(user.id, 1)).status, 200);
  assert.equal((await setStage(user.id, 0)).status, 200);
  assert.equal((await setStage(user.id, null)).status, 200);
  {
    const u = await getUser(user.id);
    assert.equal(u.body.user.stage, null);
  }
});

test('a single deposit under the threshold does not auto-promote, even cumulatively', async () => {
  const user = await registerUser(app.base);
  await approveDeposit(999, user.token);
  await approveDeposit(600, user.token); // cumulative 1599, but neither single deposit hit 1000

  const u = await getUser(user.id);
  assert.equal(u.body.user.stage, null, 'auto-promotion requires one single deposit >= 1000, not a cumulative total');
  assert.equal(u.body.user.stats.depositTotal, 1599);
});

test('rejects malformed stage values', async () => {
  const bad = [5, -1, '3'];
  for (const stage of bad) {
    const res = await setStage('nonexistent-id', stage);
    assert.equal(res.status, 400, `stage=${JSON.stringify(stage)} should be rejected`);
  }
  const missing = await api(app.base, 'PATCH', '/admin/users/nonexistent-id/stage', { token: adminToken, body: {} });
  assert.equal(missing.status, 400);
});

test('setting a user to their current stage is a no-op', async () => {
  const user = await registerUser(app.base);
  await approveDeposit(1200, user.token); // -> Stage 0
  const res = await setStage(user.id, 0);
  assert.equal(res.status, 200);
  assert.equal(res.body.user.stage, 0);
});

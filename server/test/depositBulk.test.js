/**
 * Bulk deposit processing: "Approve all" / "Reject all" on the admin Deposits
 * page. The bulk endpoints must be equivalent to running the single-item
 * routes back to back — every pending deposit is processed, balances are
 * credited exactly once, and a bad item never aborts the rest of the run.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildTestApp, api, loginSuperAdmin, registerUser } from './helpers/testApp.js';

let app, adminToken;

before(async () => {
  app = await buildTestApp('deposit-bulk');
  adminToken = await loginSuperAdmin(app.base);
});

after(async () => {
  await app.close();
});

async function deposit(userToken, amount) {
  const res = await api(app.base, 'POST', '/wallet/deposit', {
    token: userToken,
    body: { amount, method: 'momo' },
  });
  assert.equal(res.status, 200, `deposit of ${amount} should be accepted`);
  return res.body.transaction.id;
}

function pending() {
  return api(app.base, 'GET', '/admin/deposits/pending', { token: adminToken });
}

function getUser(id) {
  return api(app.base, 'GET', `/admin/users/${id}`, { token: adminToken });
}

test('approve-all credits every pending deposit and clears the queue', async () => {
  const alice = await registerUser(app.base, { displayName: 'Alice' });
  const bob = await registerUser(app.base, { displayName: 'Bob' });

  await deposit(alice.token, 500);
  await deposit(bob.token, 700);
  await deposit(alice.token, 300);

  assert.equal((await pending()).body.pending.length, 3, 'three deposits should be waiting');

  const res = await api(app.base, 'POST', '/admin/deposits/approve-all', { token: adminToken });
  assert.equal(res.status, 200);
  assert.equal(res.body.approvedCount, 3);
  assert.equal(res.body.failedCount, 0);
  assert.equal(res.body.approved.length, 3);

  assert.equal((await pending()).body.pending.length, 0, 'queue should be empty afterwards');

  const a = await getUser(alice.id);
  const b = await getUser(bob.id);
  assert.equal(a.body.user.balance, 800, 'alice gets both deposits credited');
  assert.equal(a.body.user.totalDeposited, 800);
  assert.equal(b.body.user.balance, 700, 'bob gets his deposit credited');

  const history = await api(app.base, 'GET', '/admin/deposits/history', { token: adminToken });
  const aliceRows = history.body.deposits.filter((t) => t.user?.id === alice.id);
  assert.equal(aliceRows.length, 2);
  assert.ok(aliceRows.every((t) => t.status === 'completed'));
  assert.ok(aliceRows.every((t) => t.approvedBy), 'approver should be recorded');
});

test('approve-all still auto-promotes Neutral -> Stage 0 on a >= 1000 deposit', async () => {
  const carol = await registerUser(app.base, { displayName: 'Carol' });
  await deposit(carol.token, 1200);

  const res = await api(app.base, 'POST', '/admin/deposits/approve-all', { token: adminToken });
  assert.equal(res.status, 200);
  assert.equal(res.body.approvedCount, 1);

  const c = await getUser(carol.id);
  assert.equal(c.body.user.balance, 1200);
  assert.equal(c.body.user.stage, 0, 'bulk approval must keep the stage rule identical to single approval');
});

test('reject-all rejects every pending deposit without crediting anyone', async () => {
  const dave = await registerUser(app.base, { displayName: 'Dave' });
  const erin = await registerUser(app.base, { displayName: 'Erin' });
  await deposit(dave.token, 400);
  await deposit(erin.token, 600);

  const res = await api(app.base, 'POST', '/admin/deposits/reject-all', {
    token: adminToken,
    body: { reason: 'Unverified mobile money reference' },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.rejectedCount, 2);
  assert.equal(res.body.failedCount, 0);

  assert.equal((await pending()).body.pending.length, 0);

  assert.equal((await getUser(dave.id)).body.user.balance, 0, 'rejected deposits must not credit the wallet');
  assert.equal((await getUser(erin.id)).body.user.balance, 0);

  const history = await api(app.base, 'GET', '/admin/deposits/history', { token: adminToken });
  const rows = history.body.deposits.filter((t) => t.user?.id === dave.id || t.user?.id === erin.id);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((t) => t.status === 'rejected'));
  assert.ok(rows.every((t) => t.rejectReason === 'Unverified mobile money reference'));
});

test('bulk actions on an empty queue are a no-op success', async () => {
  assert.equal((await pending()).body.pending.length, 0);

  const approved = await api(app.base, 'POST', '/admin/deposits/approve-all', { token: adminToken });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.approvedCount, 0);
  assert.equal(approved.body.failedCount, 0);

  const rejected = await api(app.base, 'POST', '/admin/deposits/reject-all', { token: adminToken, body: {} });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.rejectedCount, 0);
});

test('bulk actions are gated to finance_admin (support gets a scoped 403)', async () => {
  const created = await api(app.base, 'POST', '/admin/management', {
    token: adminToken,
    body: { email: 'bulk-support@example.com', password: 'Passw0rd123!', name: 'Support', adminRole: 'support' },
  });
  assert.equal(created.status, 201);

  const login = await api(app.base, 'POST', '/auth/login', {
    body: { email: 'bulk-support@example.com', password: 'Passw0rd123!' },
  });
  const supportToken = login.body.accessToken;

  const approve = await api(app.base, 'POST', '/admin/deposits/approve-all', { token: supportToken });
  assert.equal(approve.status, 403);
  assert.match(approve.body.error, /Requires one of/);

  const reject = await api(app.base, 'POST', '/admin/deposits/reject-all', { token: supportToken, body: {} });
  assert.equal(reject.status, 403);
});

test('bulk actions require an admin session', async () => {
  assert.equal((await api(app.base, 'POST', '/admin/deposits/approve-all')).status, 401);
  assert.equal((await api(app.base, 'POST', '/admin/deposits/reject-all', { body: {} })).status, 401);
});

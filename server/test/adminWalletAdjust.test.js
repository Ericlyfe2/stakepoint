/**
 * When an admin credits a wallet via PATCH /admin/users/:id/wallet, the mirror
 * transaction must be recorded as 'deposit_approve' (shown to the player as
 * "Deposit approve" in their recent-transactions list) — not as the raw
 * internal label 'admin_adjust'. Debits (removals) stay 'admin_adjust'.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildTestApp, api, loginSuperAdmin, registerUser } from './helpers/testApp.js';

let app, adminToken;

before(async () => {
  app = await buildTestApp('admin-wallet-adjust');
  adminToken = await loginSuperAdmin(app.base);
});

after(async () => {
  await app.close();
});

test('admin credit appears as deposit_approve in the player transaction feed', async () => {
  const user = await registerUser(app.base);

  const adjust = await api(app.base, 'PATCH', `/admin/users/${user.id}/wallet`, {
    token: adminToken,
    body: { delta: 2000, reason: 'Manual credit — test deposit' },
  });
  assert.equal(adjust.status, 200);
  assert.equal(adjust.body.transaction.kind, 'deposit_approve');

  const feed = await api(app.base, 'GET', '/wallet/transactions', { token: user.token });
  assert.equal(feed.status, 200);
  const row = feed.body.transactions[0];
  assert.equal(row.kind, 'deposit_approve');
  assert.equal(row.amount, 2000);
  assert.equal(row.status, 'completed');
});

test('admin debit stays admin_adjust', async () => {
  const user = await registerUser(app.base);
  await api(app.base, 'PATCH', `/admin/users/${user.id}/wallet`, {
    token: adminToken,
    body: { delta: 1000, reason: 'Seed balance' },
  });

  const adjust = await api(app.base, 'PATCH', `/admin/users/${user.id}/wallet`, {
    token: adminToken,
    body: { delta: -250, reason: 'Manual clawback' },
  });
  assert.equal(adjust.status, 200);
  assert.equal(adjust.body.transaction.kind, 'admin_adjust');

  const feed = await api(app.base, 'GET', '/wallet/transactions', { token: user.token });
  const row = feed.body.transactions[0];
  assert.equal(row.kind, 'admin_adjust');
  assert.equal(row.amount, -250);
});
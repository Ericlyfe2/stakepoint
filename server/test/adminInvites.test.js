/**
 * Coverage for the invite-based admin signup flow (GET/POST/DELETE
 * /api/admin/auth/invites, GET/POST /api/admin/auth/signup).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildTestApp, api, loginSuperAdmin } from './helpers/testApp.js';

let app, adminToken;

before(async () => {
  app = await buildTestApp('admin-invites');
  adminToken = await loginSuperAdmin(app.base);
});

after(async () => {
  await app.close();
});

test('full lifecycle: issue -> preview -> sign up -> token is single-use', async () => {
  const created = await api(app.base, 'POST', '/admin/auth/invites', {
    token: adminToken,
    body: { email: 'invitee@example.com', adminRole: 'moderator', displayName: 'Invitee' },
  });
  assert.equal(created.status, 201);
  assert.ok(created.body.token);
  assert.ok(created.body.signupUrl.includes(encodeURIComponent(created.body.token)));

  const token = created.body.token;

  const preview = await api(app.base, 'GET', `/admin/auth/signup/${token}`);
  assert.equal(preview.status, 200);
  assert.equal(preview.body.email, 'invitee@example.com');
  assert.equal(preview.body.adminRole, 'moderator');
  assert.equal(preview.body.tokenHash, undefined, 'the preview must never leak the token hash');

  const signup = await api(app.base, 'POST', '/admin/auth/signup', {
    body: { token, displayName: 'Invitee', password: 'Passw0rd123!' },
  });
  assert.equal(signup.status, 201);
  assert.equal(signup.body.admin.email, 'invitee@example.com');
  assert.equal(signup.body.admin.adminRole, 'moderator');
  assert.ok(signup.body.accessToken);
  assert.ok(signup.body.refreshToken);

  // The new admin's session actually works.
  const users = await api(app.base, 'GET', '/admin/users', { token: signup.body.accessToken });
  assert.equal(users.status, 200);

  // The token cannot be reused.
  const replay = await api(app.base, 'POST', '/admin/auth/signup', {
    body: { token, displayName: 'Second Try', password: 'Passw0rd123!' },
  });
  assert.equal(replay.status, 404);
});

test('a revoked invite cannot be consumed', async () => {
  const created = await api(app.base, 'POST', '/admin/auth/invites', {
    token: adminToken,
    body: { email: 'revoke-me@example.com', adminRole: 'support' },
  });
  const inviteId = created.body.invite.id;

  const revoked = await api(app.base, 'DELETE', `/admin/auth/invites/${inviteId}`, { token: adminToken });
  assert.equal(revoked.status, 200);

  const signup = await api(app.base, 'POST', '/admin/auth/signup', {
    body: { token: created.body.token, displayName: 'Revoked User', password: 'Passw0rd123!' },
  });
  assert.equal(signup.status, 404);
});

test('previewing or consuming a garbage token 404s cleanly', async () => {
  const preview = await api(app.base, 'GET', '/admin/auth/signup/not-a-real-token');
  assert.equal(preview.status, 404);

  const signup = await api(app.base, 'POST', '/admin/auth/signup', {
    body: { token: 'not-a-real-token', displayName: 'Someone', password: 'Passw0rd123!' },
  });
  assert.equal(signup.status, 404);
});

test('only super_admin can issue, list, or revoke invites', async () => {
  const support = await api(app.base, 'POST', '/admin/management', {
    token: adminToken,
    body: { email: 'plain-support@example.com', password: 'Passw0rd123!', name: 'Plain Support', adminRole: 'support' },
  });
  const login = await api(app.base, 'POST', '/auth/login', { body: { email: 'plain-support@example.com', password: 'Passw0rd123!' } });

  const list = await api(app.base, 'GET', '/admin/auth/invites', { token: login.body.accessToken });
  assert.equal(list.status, 403);

  const create = await api(app.base, 'POST', '/admin/auth/invites', {
    token: login.body.accessToken,
    body: { email: 'x@example.com', adminRole: 'support' },
  });
  assert.equal(create.status, 403);
});

test('rejects an invalid adminRole and a weak signup password', async () => {
  const badRole = await api(app.base, 'POST', '/admin/auth/invites', {
    token: adminToken,
    body: { email: 'badrole@example.com', adminRole: 'support_agent' },
  });
  assert.equal(badRole.status, 400);

  const invite = await api(app.base, 'POST', '/admin/auth/invites', {
    token: adminToken,
    body: { email: 'weakpw@example.com', adminRole: 'support' },
  });
  const weakSignup = await api(app.base, 'POST', '/admin/auth/signup', {
    body: { token: invite.body.token, displayName: 'Weak', password: 'alllowercase' },
  });
  assert.equal(weakSignup.status, 400);
});

test('rejects an invite for an email that already has an admin account', async () => {
  const res = await api(app.base, 'POST', '/admin/auth/invites', {
    token: adminToken,
    body: { email: 'admin@xenbet.gh', adminRole: 'support' },
  });
  assert.equal(res.status, 409);
});

/**
 * Regression coverage for the admin role vocabulary. Before this was fixed,
 * admin creation accepted a disjoint 8-role vocabulary (trader, risk_manager,
 * compliance_officer, support_agent, marketing_manager, readonly_auditor)
 * that mostly didn't match ALL_ROLES in middleware/adminAuth.js — any admin
 * created with one of those roles could log in but then got "Admin role not
 * configured" on every single admin route, and moderator/support (the roles
 * that actually manage the stage system) couldn't be created at all.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildTestApp, api, loginSuperAdmin } from './helpers/testApp.js';

let app, adminToken;

before(async () => {
  app = await buildTestApp('admin-roles');
  adminToken = await loginSuperAdmin(app.base);
});

after(async () => {
  await app.close();
});

function createAdmin(body) {
  return api(app.base, 'POST', '/admin/management', { token: adminToken, body });
}

test('rejects the old, stale role vocabulary at creation', async () => {
  const staleRoles = ['trader', 'risk_manager', 'compliance_officer', 'support_agent', 'marketing_manager', 'readonly_auditor'];
  for (const adminRole of staleRoles) {
    const res = await createAdmin({ email: `${adminRole}@example.com`, password: 'Passw0rd123!', name: 'X', adminRole });
    assert.equal(res.status, 400, `${adminRole} should no longer be a creatable role`);
  }
});

for (const [role, email] of [['moderator', 'mod@example.com'], ['support', 'sup@example.com'], ['odds_manager', 'odds@example.com']]) {
  test(`can create and log in a '${role}' admin`, async () => {
    const created = await createAdmin({ email, password: 'Passw0rd123!', name: 'Role Test', adminRole: role });
    assert.equal(created.status, 201);
    assert.equal(created.body.admin.adminRole, role);

    const login = await api(app.base, 'POST', '/auth/login', { body: { email, password: 'Passw0rd123!' } });
    assert.equal(login.status, 200);
    const token = login.body.accessToken;

    // Any real, functioning role should at least pass requireAdmin and be
    // able to list users — the bug made this fail with "Admin role not
    // configured" for every non-super role except finance_admin.
    const users = await api(app.base, 'GET', '/admin/users', { token });
    assert.equal(users.status, 200, `${role} should not be locked out of requireAdmin routes`);
  });
}

test('moderator and support can manage stages; odds_manager gets a scoped 403, not a lockout', async () => {
  const target = await api(app.base, 'POST', '/auth/register', {
    body: { email: 'stage-target@example.com', password: 'Testpass123!', displayName: 'Target', country: 'GH' },
  });
  const targetId = target.body.account.id;

  const modLogin = await api(app.base, 'POST', '/auth/login', { body: { email: 'mod@example.com', password: 'Passw0rd123!' } });
  const promote = await api(app.base, 'PATCH', `/admin/users/${targetId}/stage`, { token: modLogin.body.accessToken, body: { stage: 0 } });
  assert.equal(promote.status, 200, 'moderator should be able to move a user through the stage ladder');

  const oddsLogin = await api(app.base, 'POST', '/auth/login', { body: { email: 'odds@example.com', password: 'Passw0rd123!' } });
  const denied = await api(app.base, 'PATCH', `/admin/users/${targetId}/stage`, { token: oddsLogin.body.accessToken, body: { stage: 1 } });
  assert.equal(denied.status, 403);
  assert.match(denied.body.error, /Requires one of/, 'a wrong-but-real role gets a scoped permission error, not "Admin role not configured"');
});

test('moderator cannot create other admins (that stays super_admin-only)', async () => {
  const modLogin = await api(app.base, 'POST', '/auth/login', { body: { email: 'mod@example.com', password: 'Passw0rd123!' } });
  const res = await api(app.base, 'POST', '/admin/management', {
    token: modLogin.body.accessToken,
    body: { email: 'sneaky@example.com', password: 'Passw0rd123!', name: 'Sneaky', adminRole: 'super_admin' },
  });
  assert.equal(res.status, 403);
});

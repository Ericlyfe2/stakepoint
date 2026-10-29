import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildTestApp, api, loginSuperAdmin, registerUser, uniqueEmail } from './helpers/testApp.js';

// Must be set before config/env.js is first imported (inside buildTestApp) so
// rapid toggles in this file don't hit the 3 s production cooldown.
process.env.LOGIN_LOCK_COOLDOWN_MS = '0';

describe('No login kill switch', () => {
  let app;
  let player;

  before(async () => {
    app = await buildTestApp('login-lock');
    player = await registerUser(app.base, { displayName: 'Lock Player' });
  });

  after(async () => {
    if (app) await app.close();
  });

  test('public settings report the switch as off by default', async () => {
    const { status, body } = await api(app.base, 'GET', '/settings/public');
    assert.equal(status, 200);
    assert.equal(body.loginDisabled, false);
  });

  test('the login-page switch can enable the lock', async () => {
    const { status, body } = await api(app.base, 'POST', '/settings/login-lock', {
      body: { enabled: true },
    });
    assert.equal(status, 200);
    assert.equal(body.loginDisabled, true);

    const pub = await api(app.base, 'GET', '/settings/public');
    assert.equal(pub.body.loginDisabled, true);
  });

  test('player login is blocked with a 503 LOGIN_DISABLED while the lock is on', async () => {
    const { status, body } = await api(app.base, 'POST', '/auth/login', {
      body: { email: player.email, password: 'Testpass123!' },
    });
    assert.equal(status, 503);
    assert.equal(body.code, 'LOGIN_DISABLED');
    assert.match(body.error, /server is down/i);
  });

  test('unknown accounts get the same server-down answer (no account probing)', async () => {
    const { status, body } = await api(app.base, 'POST', '/auth/login', {
      body: { email: uniqueEmail('ghost'), password: 'Anything123!' },
    });
    assert.equal(status, 503);
    assert.equal(body.code, 'LOGIN_DISABLED');
  });

  test('new registrations are blocked while the lock is on', async () => {
    const { status, body } = await api(app.base, 'POST', '/auth/register', {
      body: {
        email: uniqueEmail('blocked'),
        password: 'Testpass123!',
        displayName: 'Blocked User',
        country: 'GH',
      },
    });
    assert.equal(status, 503);
    assert.equal(body.code, 'LOGIN_DISABLED');
  });

  test('admins can still sign in so the owner is never locked out', async () => {
    const token = await loginSuperAdmin(app.base);
    assert.ok(token);
  });

  test('the switch can turn the lock back off', async () => {
    const { status, body } = await api(app.base, 'POST', '/settings/login-lock', {
      body: { enabled: false },
    });
    assert.equal(status, 200);
    assert.equal(body.loginDisabled, false);

    const login = await api(app.base, 'POST', '/auth/login', {
      body: { email: player.email, password: 'Testpass123!' },
    });
    assert.equal(login.status, 200);
    assert.equal(login.body.ok, true);
  });

  test('the toggle endpoint validates its payload', async () => {
    const { status } = await api(app.base, 'POST', '/settings/login-lock', {
      body: { enabled: 'yes' },
    });
    assert.equal(status, 400);
  });
});

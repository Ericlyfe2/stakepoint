/**
 * End-to-end smoke test for admin -> user notification (broadcast) flow.
 *
 *   1. Boot the API in-process (uses the JSON KV store under server/data).
 *   2. Log in as the seeded super-admin.
 *   3. Sign up + log in a new player account.
 *   4. Player connects to the /live socket namespace.
 *   5. Admin POSTs /api/admin/notifications with audience:'all'.
 *   6. Assert the player receives `notification:new` over the socket AND
 *      the server persisted the record (GET /api/admin/notifications).
 *
 * Run:   node scripts/test-admin-broadcast.mjs
 */
import http from 'node:http';
import { io as ioClient } from 'socket.io-client';
import { setTimeout as wait } from 'node:timers/promises';

// Env BEFORE importing the app so config picks it up.
process.env.NODE_ENV       ||= 'test';
process.env.PORT           ||= '4099';
process.env.JWT_SECRET     ||= 'test-secret-key-for-development-only-32+';
process.env.ADMIN_EMAIL    ||= 'admin@xenbet.gh';
process.env.ADMIN_PASSWORD ||= 'Admin@12345';

const PORT = Number(process.env.PORT);
const BASE = `http://127.0.0.1:${PORT}`;

// Dynamic import so the env above is in place before the module evaluates.
const { default: app } = await import('../server/src/app.js').catch(async () => {
  // app.js does not exist — server/src/index.js boots inline. Spawn it.
  return { default: null };
});

let serverProc;
if (!app) {
  // Boot the existing server in a child process so we don't have to refactor.
  const { spawn } = await import('node:child_process');
  serverProc = spawn(process.execPath, ['server/src/index.js'], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProc.stdout.on('data', (b) => process.stdout.write(`[srv] ${b}`));
  serverProc.stderr.on('data', (b) => process.stderr.write(`[srv!] ${b}`));
}

function fail(msg, extra) {
  console.error('\n❌ FAIL:', msg);
  if (extra !== undefined) console.error(extra);
  if (serverProc) serverProc.kill();
  process.exit(1);
}
function ok(msg) { console.log('✅', msg); }

async function rq(path, { method = 'GET', body, token, adminToken } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (adminToken) headers.Authorization = `Bearer ${adminToken}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  return { status: res.status, ok: res.ok, body: json, raw: text };
}

async function waitForHealth(retries = 40) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await rq('/api/health');
      if (r.ok) return;
    } catch { /* not up yet */ }
    await wait(250);
  }
  fail('server did not come up on /api/health within ~10s');
}

await waitForHealth();
ok(`server is up on ${BASE}`);

/* ─── 1. Admin login ───────────────────────────────────────────────── */
const adminLogin = await rq('/api/admin/auth/login', {
  method: 'POST',
  body: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD },
});
if (!adminLogin.ok) fail('admin login failed', adminLogin);
if (adminLogin.body?.requires2fa) fail('admin requires 2FA — disable for the test admin or seed without it', adminLogin.body);
const adminToken = adminLogin.body?.accessToken;
if (!adminToken) fail('admin login returned no accessToken', adminLogin.body);
ok(`admin logged in (${adminLogin.body?.admin?.email})`);

/* ─── 2. Player sign-up + login ───────────────────────────────────── */
const playerEmail = `notif.test+${Date.now()}@example.gh`;
const playerPass  = 'Player@12345';
const signup = await rq('/api/auth/register', {
  method: 'POST',
  body: { email: playerEmail, password: playerPass, displayName: 'Notif Tester', country: 'GH' },
});
if (!signup.ok) fail('player register failed', signup);
const playerToken = signup.body?.accessToken;
const playerId    = signup.body?.account?.id;
if (!playerToken || !playerId) fail('register response missing token/id', signup.body);
ok(`player registered: ${playerEmail} (id=${playerId})`);

/* ─── 3. Open the realtime socket as the player ───────────────────── */
const socket = ioClient(`${BASE}/live`, {
  auth: { token: playerToken },
  transports: ['websocket'],
  reconnection: false,
});

const connected = new Promise((resolve, reject) => {
  socket.once('connect',       () => resolve());
  socket.once('connect_error', (e) => reject(new Error(`socket connect_error: ${e.message}`)));
  setTimeout(() => reject(new Error('socket connect timeout')), 5_000);
});
try { await connected; } catch (e) { fail(e.message); }
ok(`player socket connected (sid=${socket.id})`);

/* Listener primed BEFORE the broadcast is sent. */
const gotNotification = new Promise((resolve) => {
  socket.on('notification:new', (payload) => resolve(payload));
});

/* ─── 4. Admin sends a broadcast ──────────────────────────────────── */
const sentTitle = `Smoke test ${Date.now()}`;
const send = await rq('/api/admin/notifications', {
  method: 'POST',
  adminToken,
  body: {
    title: sentTitle,
    body: 'If you can read this, realtime delivery works.',
    audience: 'all',
    severity: 'info',
  },
});
if (!send.ok) fail('admin broadcast failed', send);
ok(`admin POST /api/admin/notifications -> 201 (id=${send.body?.notification?.id})`);

/* ─── 5. Player must see it over the socket ──────────────────────── */
const received = await Promise.race([
  gotNotification,
  wait(5_000).then(() => null),
]);
if (!received) fail('player socket did not receive notification:new within 5s');
if (received.title !== sentTitle) fail('payload title mismatch', { expected: sentTitle, got: received });
ok(`player received notification:new — title="${received.title}", severity=${received.severity}`);

/* ─── 6. Persistence check: admin GET lists it ────────────────────── */
const list = await rq('/api/admin/notifications', { adminToken });
if (!list.ok) fail('admin GET notifications failed', list);
const found = (list.body?.notifications || []).find((n) => n.title === sentTitle);
if (!found) fail('broadcast not present in admin GET list', list.body);
ok(`broadcast persisted: ${found.id}`);

/* ─── 7. Audience:'admins' must NOT reach a player ────────────────── */
const gotAdminOnly = new Promise((resolve) => {
  const t = setTimeout(() => resolve(null), 1_500);
  socket.once('notification:new', (p) => { clearTimeout(t); resolve(p); });
});
const adminOnlyTitle = `Admins only ${Date.now()}`;
const adminOnly = await rq('/api/admin/notifications', {
  method: 'POST',
  adminToken,
  body: { title: adminOnlyTitle, body: 'admins only', audience: 'admins', severity: 'warning' },
});
if (!adminOnly.ok) fail('admin-only broadcast failed', adminOnly);
const leak = await gotAdminOnly;
if (leak && leak.title === adminOnlyTitle) fail('admin-only broadcast leaked to player socket', leak);
ok('audience:"admins" did not reach player socket (correct)');

/* ─── 8. Cleanup ──────────────────────────────────────────────────── */
socket.close();
if (serverProc) serverProc.kill();
console.log('\n🎉 All notification flow checks passed.');
process.exit(0);

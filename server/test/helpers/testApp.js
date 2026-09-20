/**
 * Builds a real Express app — the actual route modules, not mocks — wired to
 * an isolated JSON-file data directory (same `process.env.PATHS` override
 * convention the rest of server/test/*.test.js already uses, e.g.
 * test/store.test.js and test/auth.test.js: a fixed `data-test-<name>` dir
 * under server/, wiped before use). No DATABASE_URL, so it uses the
 * file-store backend; no sockets, settlement loop, odds aggregator, or live
 * track — those aren't needed to exercise the HTTP routes and would
 * otherwise leave timers/handles open after the test file finishes.
 *
 * Node's test runner (`node --test`) runs each test file in its own child
 * process, so the module-level singletons in db/store.js (and everywhere
 * else) never leak between test files — each file just needs its own
 * `name` here so it doesn't share an on-disk directory with another file.
 */
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function buildTestApp(name) {
  const dataDir = path.join(__dirname, '..', '..', `data-test-${name}`);
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });

  process.env.PATHS = JSON.stringify({ data: dataDir });
  process.env.DATABASE_URL = '';
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret-do-not-use-in-prod';

  const { initStores } = await import('../../src/db/store.js');
  const { rebuildEmailIndex } = await import('../../src/db/users.js');
  const { seedAdmins } = await import('../../src/db/seedAdmins.js');
  const { errorHandler, notFoundHandler } = await import('../../src/middleware/error.js');

  const { default: authRouter } = await import('../../src/routes/auth.js');
  const { default: walletRouter } = await import('../../src/routes/wallet.js');
  const { default: adminAuthRouter } = await import('../../src/routes/admin/auth.js');
  const { default: adminUsersRouter } = await import('../../src/routes/admin/users.js');
  const { default: adminDepositsRouter } = await import('../../src/routes/admin/deposits.js');
  const { default: adminWithdrawalsRouter } = await import('../../src/routes/admin/withdrawals.js');
  const { default: adminManagementRouter } = await import('../../src/routes/admin/management.js');

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/wallet', walletRouter);
  app.use('/api/admin/auth', adminAuthRouter);
  app.use('/api/admin/users', adminUsersRouter);
  app.use('/api/admin/deposits', adminDepositsRouter);
  app.use('/api/admin/withdrawals', adminWithdrawalsRouter);
  app.use('/api/admin/management', adminManagementRouter);
  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  await initStores();
  rebuildEmailIndex();
  await seedAdmins(); // creates admin@xenbet.gh / Admin@12345 (see db/seedAdmins.js)

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}/api`;

  return {
    base,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      // db/store.js debounces file writes (20ms for the file backend) —
      // give any in-flight flush a moment to finish before removing the
      // directory, or it throws ENOENT as an uncaught exception after the
      // test has already "ended" and fails the whole file.
      await new Promise((resolve) => setTimeout(resolve, 100));
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

/** Small fetch wrapper: JSON in, { status, body } out, optional bearer token. */
export async function api(base, method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }
  return { status: res.status, body: parsed };
}

export async function loginSuperAdmin(base) {
  const { body } = await api(base, 'POST', '/auth/login', {
    body: { email: 'admin@xenbet.gh', password: 'Admin@12345' },
  });
  return body.accessToken;
}

let seq = 0;
export function uniqueEmail(prefix = 'test') {
  seq += 1;
  return `${prefix}+${Date.now()}-${seq}@example.com`;
}

export async function registerUser(base, overrides = {}) {
  const email = overrides.email || uniqueEmail('user');
  const { body } = await api(base, 'POST', '/auth/register', {
    body: {
      email,
      password: 'Testpass123!',
      displayName: overrides.displayName || 'Test User',
      country: 'GH',
    },
  });
  return { token: body.accessToken, id: body.account?.id, email };
}

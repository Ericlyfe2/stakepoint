import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data-test');

process.env.DATABASE_URL = '';
process.env.NODE_ENV = 'test';
process.env.PATHS = JSON.stringify({ data: DATA_DIR });
process.env.JWT_SECRET = 'test-secret-key-for-jwt';
process.env.JWT_ACCESS_TTL = '1h';
process.env.JWT_REFRESH_TTL = '30d';
process.env.JWT_ISSUER = 'betxentra-test';
process.env.GOOGLE_ENABLED = 'false';

function cleanData() {
  if (fs.existsSync(DATA_DIR)) {
    for (const f of fs.readdirSync(DATA_DIR)) {
      fs.unlinkSync(path.join(DATA_DIR, f));
    }
  }
}

describe('Token Service', () => {
  before(async () => {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    cleanData();
    const { initStores } = await import('../src/db/store.js');
    await initStores();
  });

  after(() => cleanData());

  test('signAccessToken creates a valid JWT', async () => {
    const { signAccessToken, verifyAccessToken } = await import('../src/services/token.js');
    const user = { id: 'user@test.com', email: 'user@test.com', role: 'user' };
    const token = signAccessToken(user);
    assert.ok(token);
    assert.equal(typeof token, 'string');
    const decoded = verifyAccessToken(token);
    assert.equal(decoded.sub, 'user@test.com');
    assert.equal(decoded.email, 'user@test.com');
    assert.equal(decoded.scope, 'user');
  });

  test('signAdminAccessToken creates admin-scoped JWT', async () => {
    const { signAdminAccessToken, verifyAccessToken } = await import('../src/services/token.js');
    const admin = { id: 'admin@test.com', email: 'admin@test.com', adminRole: 'super_admin' };
    const token = signAdminAccessToken(admin);
    const decoded = verifyAccessToken(token);
    assert.equal(decoded.scope, 'admin');
    assert.equal(decoded.adminRole, 'super_admin');
  });

  test('issueRefreshToken creates a revocable refresh token', async () => {
    const { issueRefreshToken, lookupRefresh, revokeRefreshToken } = await import('../src/services/token.js');
    const { token, id } = issueRefreshToken('user@test.com', { ip: '127.0.0.1' });
    assert.ok(token);
    assert.ok(token.includes('.'));
    const record = lookupRefresh(token);
    assert.ok(record);
    assert.equal(record.accountId, 'user@test.com');
    revokeRefreshToken(token);
    const after = lookupRefresh(token);
    assert.equal(after, null);
  });

  test('rotateRefreshToken rotates and invalidates old', async () => {
    const { issueRefreshToken, rotateRefreshToken, lookupRefresh } = await import('../src/services/token.js');
    const { token } = issueRefreshToken('user@test.com');
    const rotated = rotateRefreshToken(token, { ip: '192.168.1.1' });
    assert.ok(rotated);
    assert.notEqual(rotated.token, token);
    assert.equal(lookupRefresh(token), null);
    assert.ok(lookupRefresh(rotated.token));
  });

  test('revokeAllForAccount invalidates all tokens', async () => {
    const { issueRefreshToken, revokeAllForAccount, lookupRefresh } = await import('../src/services/token.js');
    const t1 = issueRefreshToken('multi@test.com');
    const t2 = issueRefreshToken('multi@test.com');
    revokeAllForAccount('multi@test.com');
    assert.equal(lookupRefresh(t1.token), null);
    assert.equal(lookupRefresh(t2.token), null);
  });
});

describe('OTP Service', () => {
  before(async () => {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    cleanData();
    const { initStores } = await import('../src/db/store.js');
    await initStores();
  });

  after(() => cleanData());

  test('issueOtp creates and stores OTP', async () => {
    const { issueOtp, consumeOtp } = await import('../src/services/otp.js');
    const email = `otp-test-${Date.now()}@example.com`;
    const result = await issueOtp(email, 'reset');
    assert.ok(result.sent);
    assert.ok(result.expiresIn > 0);
    consumeOtp(email, 'reset');
  });

  test('checkOtp rejects wrong code', async () => {
    const { issueOtp, checkOtp, consumeOtp } = await import('../src/services/otp.js');
    const email = `wrong-otp-${Date.now()}@example.com`;
    await issueOtp(email, 'reset');
    assert.throws(() => checkOtp(email, 'reset', '000000'), /Incorrect code/);
    consumeOtp(email, 'reset');
  });
});

describe('Password Reset Flow', () => {
  const email = `reset-flow-${Date.now()}@example.com`;

  before(async () => {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    cleanData();
    const { initStores } = await import('../src/db/store.js');
    await initStores();
    const { createUser } = await import('../src/db/users.js');
    const { hashPassword } = await import('../src/services/password.js');
    const hash = await hashPassword('OldP@ss123');
    await createUser({
      email,
      displayName: 'Reset Test',
      passwordHash: hash,
      country: 'GH',
      emailVerified: true,
    });
  });

  after(() => cleanData());

  test('full password reset flow works', async () => {
    const { findByEmail, updateUser } = await import('../src/db/users.js');
    const { hashPassword, verifyPassword } = await import('../src/services/password.js');
    const { issueOtp, consumeOtp } = await import('../src/services/otp.js');
    const { createStore } = await import('../src/db/store.js');

    const result = await issueOtp(email, 'reset');
    assert.ok(result.sent);

    const otpStore = createStore('otps', {});
    const record = otpStore.get(`reset:${email}`);
    assert.ok(record);
    assert.ok(record.codeHash);

    const newHash = await hashPassword('NewP@ss456');
    await updateUser(email, { passwordHash: newHash });
    consumeOtp(email, 'reset');

    const user = findByEmail(email);
    const ok = await verifyPassword('NewP@ss456', user.passwordHash);
    assert.ok(ok);

    const notOk = await verifyPassword('OldP@ss123', user.passwordHash);
    assert.ok(!notOk);
  });
});

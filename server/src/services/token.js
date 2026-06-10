import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { JWT } from '../config/env.js';
import { createStore } from '../db/store.js';
import { log } from '../utils/logger.js';

const refreshStore = createStore('refresh_tokens', {});

export function signAccessToken(account) {
  log.debug(`signing access token for ${account.id}`);
  return jwt.sign(
    { sub: account.id, email: account.email, role: account.role || 'user', scope: 'user' },
    JWT.secret,
    { expiresIn: JWT.accessTtl, issuer: JWT.issuer }
  );
}

/** Admin tokens carry scope:'admin' + adminRole so user-scoped tokens cannot hit /api/admin. */
export function signAdminAccessToken(admin) {
  return jwt.sign(
    {
      sub: admin.id,
      email: admin.email,
      role: 'admin',
      scope: 'admin',
      adminRole: admin.adminRole || 'support',
    },
    JWT.secret,
    { expiresIn: JWT.accessTtl, issuer: JWT.issuer }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, JWT.secret, { issuer: JWT.issuer });
}

/** Refresh tokens are opaque random strings stored server-side so we can revoke them. */
export function issueRefreshToken(accountId, meta = {}) {
  const id    = crypto.randomBytes(16).toString('hex');
  const token = `${id}.${crypto.randomBytes(24).toString('hex')}`;
  const ttlMs = parseTtl(JWT.refreshTtl);
  const record = {
    id,
    accountId,
    tokenHash: hashToken(token),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    revokedAt: null,
    ...meta,
  };
  refreshStore.set(id, record);
  return { token, id, expiresAt: record.expiresAt };
}

export function rotateRefreshToken(token, meta) {
  const record = lookupRefresh(token);
  if (!record) return null;
  revokeRefreshToken(token);
  return issueRefreshToken(record.accountId, meta);
}

export function revokeRefreshToken(token) {
  const record = lookupRefresh(token);
  if (!record) return false;
  refreshStore.update(record.id, (r) => ({ ...r, revokedAt: new Date().toISOString() }));
  return true;
}

export function lookupRefresh(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [id] = token.split('.');
  const record = refreshStore.get(id);
  if (!record || record.revokedAt) return null;
  if (new Date(record.expiresAt) < new Date()) return null;
  if (record.tokenHash !== hashToken(token)) return null;
  return record;
}

export function revokeAllForAccount(accountId) {
  for (const r of refreshStore.list()) {
    if (r.accountId === accountId && !r.revokedAt) {
      refreshStore.update(r.id, (rec) => ({ ...rec, revokedAt: new Date().toISOString() }));
    }
  }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function parseTtl(s) {
  if (typeof s === 'number') return s;
  const m = /^(\d+)([smhd])$/.exec(String(s));
  if (!m) return 30 * 24 * 60 * 60 * 1000;
  const n = Number(m[1]);
  const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2]];
  return n * mult;
}

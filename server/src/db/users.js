import crypto from 'crypto';
import { createStore } from './store.js';
import { log } from '../utils/logger.js';
import { badRequest } from '../utils/httpError.js';

const users = createStore('users', {});
const locks = {};
const LOCK_TIMEOUT_MS = 10_000;

/**
 * Acquire a per-user mutex so two concurrent balance writes never collide
 * (read → compute → write race).  Releases automatically after fn resolves
 * or if a timeout is hit (safety net — should never fire in practice).
 * Must be *awaited* inside route handlers.
 */
async function withBalanceLock(id, fn) {
  const key = String(id);
  while (locks[key]) {
    await Promise.race([
      locks[key],
      new Promise((_, reject) => setTimeout(() => reject(new Error('balance lock timeout')), LOCK_TIMEOUT_MS)),
    ]);
  }
  let resolveLock;
  locks[key] = new Promise((resolve) => { resolveLock = resolve; });
  try {
    return await fn();
  } finally {
    delete locks[key];
    resolveLock();
  }
}

/**
 * Execute arbitrary code under a per-user mutex.  Use this when you need to
 * atomically update multiple fields (e.g., balance + stage + totalDeposited).
 * A plain `updateUser` call nested inside `withUserLock` is safe because the
 * lock serialises all access to that user's record.
 */
export async function withUserLock(id, fn) {
  return withBalanceLock(id, fn);
}

/**
 * Map: email → userId for fast lookup.
 * Kept in sync with the users store — lets us look up by email without
 * iterating all users, even when user IDs are UUIDs.
 */
const emailIndex = createStore('user_email_index', {});

// One-time migration: rebuild email index for any user missing from it.
// Covers both legacy email-keyed users AND UUID-keyed users whose index
// entries were lost (e.g. before the JSON.stringify fix for primitives).
let migrationDone = false;
export function rebuildEmailIndex() {
  migrationDone = false;
  migrateLegacyUsers();
}
function migrateLegacyUsers() {
  if (migrationDone) return;
  migrationDone = true;
  try {
    const all = users.all();
    if (!all || typeof all !== 'object') return;
    let migrated = 0;
    for (const [, u] of Object.entries(all)) {
      if (!u || !u.email || !u.id) continue;
      const normEmail = u.email.toLowerCase().trim();
      if (!emailIndex.get(normEmail)) {
        emailIndex.set(normEmail, u.id);
        migrated++;
      }
    }
    if (migrated > 0) {
      log.info(`Rebuilt email index for ${migrated} users.`);
    }
  } catch { /* best-effort migration */ }
}

export function getUserById(id) {
  if (!id) return null;
  return users.get(id);
}

export function findByEmail(email) {
  if (!email) return null;
  const norm = String(email).toLowerCase().trim();
  const uid = emailIndex.get(norm);
  if (uid) return users.get(uid);
  // Lazy migration: build index on first lookup
  migrateLegacyUsers();
  const retry = emailIndex.get(norm);
  if (retry) return users.get(retry);
  // Fallback: direct email-keyed lookup
  return users.get(norm) || null;
}

export function findByGoogleId(googleId) {
  if (!googleId) return null;
  return users.list().find((u) => u.googleId === googleId);
}

/** Generate a short referral code from user id and email. */
function generateReferralCode(id, email) {
  const hash = crypto.createHash('sha256').update(`${id}${email}`).digest('hex');
  return hash.slice(0, 8).toUpperCase();
}

/** Find a user by their referral code. */
export function findByReferralCode(code) {
  if (!code) return null;
  const upper = String(code).toUpperCase();
  return users.list().find((u) => u.referralCode === upper) || null;
}

/** Count how many users were referred by a given user id. */
export function countReferred(userId) {
  if (!userId) return 0;
  return users.list().filter((u) => u.referredBy === userId).length;
}

export async function createUser(record) {
  const normEmail = String(record.email || '').toLowerCase().trim();
  if (!normEmail) throw new Error('user requires email');

  // Check both UUID-index and legacy email-keyed records
  const existing = findByEmail(normEmail);
  if (existing) throw new Error('user already exists');

  const id = record.id || `u-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const user = {
    id,
    email: normEmail,
    displayName: record.displayName || normEmail,
    role: record.role || 'user',
    balance: typeof record.balance === 'number' ? record.balance : 0,
    currency: 'GHS',
    country: record.country || null,
    totalDeposited: 0,
    createdAt: now,
    updatedAt: now,
    emailVerified: !!record.emailVerified,
    accountStatus: 'STANDARD',
    suspended: false,
    // Verification funnel: every new signup starts stage-neutral, unblocked.
    stage: null,
    blocked: false,
    passwordHash: record.passwordHash || null,
    googleId: record.googleId || null,
    picture: record.picture || null,
    twoFactorEnabled: false,
    activity: [],
    referralCode: record.referralCode || generateReferralCode(id, normEmail),
    referredBy: record.referredBy || null,
  };
  await users.setCritical(id, user);
  await emailIndex.setCritical(normEmail, id);
  // Remove legacy email-keyed reference if it existed
  if (users.get(normEmail)) {
    await users.deleteCritical(normEmail);
  }
  return user;
}

export async function updateUser(id, patch) {
  const current = users.get(id);
  if (!current) return null;
  await users.setCritical(id, { ...current, ...patch, updatedAt: new Date().toISOString() });
  // Sync email index if email changed
  if (patch.email && patch.email !== current.email) {
    const oldNorm = current.email.toLowerCase().trim();
    const newNorm = String(patch.email).toLowerCase().trim();
    await emailIndex.deleteCritical(oldNorm);
    await emailIndex.setCritical(newNorm, id);
  }
  return users.get(id);
}

/**
 * Atomically adjust a user's balance by `delta` (positive = credit, negative =
 * debit).  Uses a per-user mutex to prevent the read-modify-write race when
 * concurrent requests touch the same account.  Throws if balance would go
 * negative (pass allowNegative: true to skip that check for admin ops).
 */
export async function adjustBalance(id, delta, opts = {}) {
  const { allowNegative = false } = opts;
  return withBalanceLock(id, async () => {
    const u = users.get(id);
    if (!u) throw badRequest('User not found.');
    const newBalance = Number((u.balance + delta).toFixed(2));
    if (!allowNegative && newBalance < 0) throw badRequest('Insufficient balance.');
    await users.setCritical(id, { ...u, balance: newBalance, updatedAt: new Date().toISOString() });
    return { ...u, balance: newBalance };
  });
}

export function logActivity(id, entry) {
  const u = users.get(id);
  if (!u) return;
  const next = [{ at: new Date().toISOString(), ...entry }, ...(u.activity || [])].slice(0, 50);
  users.update(id, (cur) => ({ ...cur, activity: next, updatedAt: new Date().toISOString() }));
}

export function publicUser(u) {
  if (!u) return null;
  const { passwordHash, googleId, activity, ...safe } = u;
  // Normalize stage-gating fields for records that predate the funnel.
  safe.stage = safe.stage === undefined ? null : safe.stage;
  safe.blocked = !!safe.blocked;
  safe.totalDeposited = Number(safe.totalDeposited || 0);
  return safe;
}

/** Stripped-down view — only what the frontend absolutely needs. */
export function safeUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    balance: typeof u.balance === 'number' ? u.balance : 0,
    country: u.country || null,
    phone: u.phone || null,
    role: u.role || 'user',
    createdAt: u.createdAt || null,
    accountStatus: u.accountStatus || 'STANDARD',
    // Verification-stage gating — the withdraw page reads these on every
    // /auth/me refresh, so they must survive the safe strip.
    stage: u.stage === undefined ? null : u.stage,
    blocked: !!u.blocked,
    totalDeposited: Number(u.totalDeposited || 0),
    kycStatus: u.kycStatus || 'unverified',
    emailVerified: !!u.emailVerified,
    // Lets the client purge its local transaction-history cache even if it
    // missed the live wallet:transactions-cleared push (e.g. it was offline
    // when an admin cleared this account's history) — see AccountProvider.
    txClearedAt: u.txClearedAt || null,
  };
}

export async function deleteUser(id) {
  if (!id) return null;
  const u = users.get(id);
  if (!u) return null;
  // Clean up email index
  const norm = u.email.toLowerCase().trim();
  await emailIndex.deleteCritical(norm);
  // Also clean up legacy email-keyed entry
  if (users.get(norm)) {
    await users.deleteCritical(norm);
  }
  await users.deleteCritical(id);
  return u;
}

export const allUsers = () => {
  migrateLegacyUsers();
  return users.list();
};

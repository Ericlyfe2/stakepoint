import crypto from 'crypto';
import { createStore } from './store.js';
import { log } from '../utils/logger.js';

const users = createStore('users', {});

/**
 * Map: email → userId for fast lookup.
 * Kept in sync with the users store — lets us look up by email without
 * iterating all users, even when user IDs are UUIDs.
 */
const emailIndex = createStore('user_email_index', {});

// One-time migration: populate email index for legacy users (keyed by email)
let migrationDone = false;
function migrateLegacyUsers() {
  if (migrationDone) return;
  migrationDone = true;
  try {
    const all = users.all();
    if (!all || typeof all !== 'object') return;
    let migrated = 0;
    for (const [key, u] of Object.entries(all)) {
      if (!u || !u.email) continue;
      const normEmail = u.email.toLowerCase().trim();
      // Check if this entry is keyed by email (legacy) or by UUID
      if (key === normEmail && !emailIndex.get(normEmail)) {
        emailIndex.set(normEmail, u.id);
        migrated++;
      }
    }
    if (migrated > 0) {
      log.info(`Migrated ${migrated} legacy user entries to email index.`);
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
    suspended: false,
    passwordHash: record.passwordHash || null,
    googleId: record.googleId || null,
    picture: record.picture || null,
    twoFactorEnabled: false,
    activity: [],
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

export function logActivity(id, entry) {
  const u = users.get(id);
  if (!u) return;
  const next = [{ at: new Date().toISOString(), ...entry }, ...(u.activity || [])].slice(0, 50);
  users.update(id, (cur) => ({ ...cur, activity: next, updatedAt: new Date().toISOString() }));
}

export function publicUser(u) {
  if (!u) return null;
  const { passwordHash, googleId, activity, ...safe } = u;
  return safe;
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

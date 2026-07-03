import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { allUsers, findByEmail } from './users.js';
import { createStore } from './store.js';
import { log } from '../utils/logger.js';

const adminStore = createStore('admin_accounts', {});

function generateId() {
  return `admin-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function migrateUsersToAdminStore() {
  const userAdmins = allUsers().filter((u) => u.role === 'admin');
  const existingAdminIds = new Set(adminStore.list().map((a) => a.email));
  let migrated = 0;
  for (const u of userAdmins) {
    if (existingAdminIds.has(u.email?.toLowerCase())) continue;
    const admin = {
      id: generateId(),
      email: u.email?.toLowerCase(),
      name: u.displayName || u.email?.split('@')[0] || 'Admin',
      passwordHash: u.passwordHash,
      role: 'admin',
      adminRole: u.adminRole || 'support',
      permissionOverrides: null,
      suspended: !!u.suspended,
      twoFactorEnabled: !!u.twoFactorEnabled,
      twoFactorSecret: u.twoFactorSecret || null,
      backupCodes: [],
      createdAt: u.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastLoginAt: u.lastLoginAt || null,
      createdBy: null,
      sessionCount: 0,
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(u.displayName || u.email || 'Admin')}&background=00a86b&color=fff`,
    };
    adminStore.set(admin.id, admin);
    migrated++;
  }
  return migrated;
}

// Built-in platform admin. Guaranteed to exist (and to accept this password)
// after every boot, in every environment, unless overridden via env vars.
const FALLBACK_ADMIN_EMAIL = 'admin@xenbet.gh';
const FALLBACK_ADMIN_PASSWORD = 'Admin@12345';

export async function seedAdmins() {
  const migrated = migrateUsersToAdminStore();
  if (migrated > 0) log.info(`Migrated ${migrated} admin(s) from users store to admin_accounts`);

  const adminEmail = (process.env.ADMIN_EMAIL || FALLBACK_ADMIN_EMAIL).trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || FALLBACK_ADMIN_PASSWORD;

  const seeded = adminStore.list().find((a) => a.email === adminEmail);
  if (seeded) {
    // Re-assert the seed credentials so this account always works, even if
    // the stored hash predates the admin_accounts store or was corrupted.
    if (!seeded.passwordHash || !bcrypt.compareSync(adminPassword, seeded.passwordHash)) {
      seeded.passwordHash = await bcrypt.hash(adminPassword, 12);
      seeded.updatedAt = new Date().toISOString();
      log.info(`Seed admin ${adminEmail}: password re-asserted.`);
    }
    if (seeded.suspended || seeded.adminRole !== 'super_admin') {
      seeded.suspended = false;
      seeded.adminRole = 'super_admin';
      log.info(`Seed admin ${adminEmail}: reactivated as super_admin.`);
    }
    adminStore.set(seeded.id, seeded);
    return adminStore.list().length;
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const existingUser = findByEmail(adminEmail);

  const admin = {
    id: generateId(),
    email: adminEmail,
    name: existingUser?.displayName || 'Platform Admin',
    passwordHash,
    role: 'admin',
    adminRole: 'super_admin',
    permissionOverrides: null,
    suspended: false,
    twoFactorEnabled: false,
    twoFactorSecret: null,
    backupCodes: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastLoginAt: null,
    createdBy: null,
    sessionCount: 0,
    avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(existingUser?.displayName || 'Admin')}&background=00a86b&color=fff`,
  };
  adminStore.set(admin.id, admin);

  if (existingUser) {
    log.info(`Promoted existing user ${adminEmail} to super_admin in admin_accounts`);
  } else {
    log.info(`Super admin created: ${adminEmail}`);
  }
  return 1;
}

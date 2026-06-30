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

export async function seedAdmins() {
  const migrated = migrateUsersToAdminStore();
  if (migrated > 0) log.info(`Migrated ${migrated} admin(s) from users store to admin_accounts`);

  const existing = adminStore.list();
  if (existing.length > 0) return existing.length;

  if (process.env.NODE_ENV === 'production' || process.env.DATABASE_URL) return 0;

  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || '';

  if (!adminEmail || !adminPassword) {
    log.warn('No ADMIN_EMAIL/ADMIN_PASSWORD set — skipping admin seed.');
    return 0;
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

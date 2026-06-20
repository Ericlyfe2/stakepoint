/**
 * Create the initial super admin from environment variables on first boot.
 * NO hardcoded admin accounts — only ADMIN_EMAIL / ADMIN_PASSWORD from env.
 * Only runs when the user store has zero admins and only in dev without Postgres.
 */
import { allUsers, createUser, findByEmail, updateUser } from './users.js';
import { hashPassword } from '../services/password.js';
import { log } from '../utils/logger.js';

export async function seedAdmins() {
  if (process.env.NODE_ENV === 'production' || process.env.DATABASE_URL) return 0;
  const existing = allUsers().filter((u) => u.role === 'admin');
  if (existing.length > 0) return existing.length;

  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || '';

  if (!adminEmail || !adminPassword) {
    log.warn('No ADMIN_EMAIL/ADMIN_PASSWORD set — skipping admin seed. Use /api/admin/auth/signup to create the first admin.');
    return 0;
  }

  const passwordHash = await hashPassword(adminPassword);
  const present = findByEmail(adminEmail);
  if (present) {
    await updateUser(present.id, { role: 'admin', adminRole: 'super_admin', emailVerified: true, passwordHash, displayName: present.displayName });
    log.info(`Promoted existing user ${adminEmail} to super_admin`);
    return 1;
  }

  await createUser({
    email: adminEmail,
    displayName: 'Platform Admin',
    passwordHash,
    emailVerified: true,
    role: 'admin',
    balance: 0,
  });
  await updateUser(adminEmail, { adminRole: 'super_admin', kycStatus: 'verified', twoFactorEnabled: false });

  log.info(`Super admin created: ${adminEmail}`);
  return 1;
}

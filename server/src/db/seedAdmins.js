/**
 * Ensure a baseline of admin accounts exists on boot.
 * Credentials can be overridden via env (ADMIN_EMAIL / ADMIN_PASSWORD).
 *
 * In production the seed runs ONLY when the user store has zero admins.
 * Default credentials are intended for first-run/local-dev and the log line
 * is loud on purpose — change them via the admin UI immediately.
 */
import { allUsers, createUser, findByEmail, updateUser } from './users.js';
import { hashPassword } from '../services/password.js';
import { log } from '../utils/logger.js';

const env = process.env;

const DEFAULTS = [
  {
    email: (env.ADMIN_EMAIL || 'admin@oddsify.gh').toLowerCase(),
    password: env.ADMIN_PASSWORD || 'Admin@12345',
    displayName: 'Platform Owner',
    adminRole: 'super_admin',
  },
  {
    email: 'finance@oddsify.gh',
    password: 'Finance@12345',
    displayName: 'Finance Lead',
    adminRole: 'finance_admin',
  },
  {
    email: 'odds@oddsify.gh',
    password: 'Odds@12345',
    displayName: 'Trading Desk',
    adminRole: 'odds_manager',
  },
  {
    email: 'support@oddsify.gh',
    password: 'Support@12345',
    displayName: 'Support Agent',
    adminRole: 'support',
  },
  {
    email: 'mod@oddsify.gh',
    password: 'Moderator@12345',
    displayName: 'Risk Moderator',
    adminRole: 'moderator',
  },
];

export async function seedAdmins() {
  // Never auto-seed in production — admins must be created manually via /admin.
  if (process.env.NODE_ENV === 'production' || process.env.DATABASE_URL) return 0;
  const existing = allUsers().filter((u) => u.role === 'admin');
  if (existing.length > 0) return existing.length;

  let created = 0;
  for (const spec of DEFAULTS) {
    const passwordHash = await hashPassword(spec.password);
    const present = findByEmail(spec.email);
    if (present) {
      await updateUser(present.id, {
        role: 'admin',
        adminRole: spec.adminRole,
        emailVerified: true,
        passwordHash,
        displayName: spec.displayName,
      });
    } else {
      await createUser({
        email: spec.email,
        displayName: spec.displayName,
        passwordHash,
        emailVerified: true,
        role: 'admin',
        balance: 0,
      });
      await updateUser(spec.email, {
        adminRole: spec.adminRole,
        kycStatus: 'verified',
        twoFactorEnabled: false,
      });
    }
    created++;
  }

  log.security(
    `Seeded ${created} admin accounts. Default super admin: ${DEFAULTS[0].email} / ${DEFAULTS[0].password}  (change immediately)`
  );
  return created;
}

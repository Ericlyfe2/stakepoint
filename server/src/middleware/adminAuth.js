/**
 * Admin authorization layer.
 *
 * Admins are stored in the same user store but with `role === 'admin'`
 * and an `adminRole` of one of:
 *   - super_admin   — unrestricted
 *   - finance_admin — payments, withdrawals, wallet adjustments
 *   - odds_manager  — sports, markets, odds, suspensions
 *   - support       — read-only access to users + bets, ticket replies
 *   - moderator     — bans/suspensions, fraud flags
 *
 * `requireAdmin` validates the bearer token, hydrates the admin, and
 * checks status. `requireRole(...allowed)` further gates a route to a
 * set of admin roles (super_admin always passes).
 */
import { verifyAccessToken } from '../services/token.js';
import { getAdminById } from '../db/adminAccounts.js';
import { unauthorized, forbidden } from '../utils/httpError.js';
import { recordAudit } from '../db/audit.js';

const ALL_ROLES = ['super_admin', 'finance_admin', 'odds_manager', 'support', 'moderator'];

export const ADMIN_ROLES = ALL_ROLES;

export function requireAdmin(req, _res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return next(unauthorized('Admin sign in required.'));
  const token = header.slice(7).trim();
  try {
    const claims = verifyAccessToken(token);
    if (claims.scope !== 'admin') return next(forbidden('Not an admin token.'));
    const user = getAdminById(claims.sub);
    if (!user)                   return next(unauthorized('Admin account no longer exists.'));
    if (user.role !== 'admin')   return next(forbidden('Account is not an admin.'));
    if (user.suspended)          return next(forbidden('Admin suspended.'));
    if (!ALL_ROLES.includes(user.adminRole)) return next(forbidden('Admin role not configured.'));
    req.admin = user;
    req.adminClaims = claims;
    next();
  } catch {
    next(unauthorized('Admin session expired. Please sign in again.'));
  }
}

export const requireRole = (...allowed) => (req, _res, next) => {
  if (!req.admin) return next(unauthorized('Admin sign in required.'));
  if (req.admin.adminRole === 'super_admin') return next();
  if (!allowed.includes(req.admin.adminRole)) {
    recordAudit({
      actorId: req.admin.id,
      actorRole: req.admin.adminRole,
      action: 'rbac.denied',
      severity: 'warning',
      ip: req.ip,
      userAgent: req.get('user-agent'),
      meta: { path: req.originalUrl, allowed },
    });
    return next(forbidden(`Requires one of: ${allowed.join(', ')}`));
  }
  next();
};

/** Convenience helper to record an audit entry from a request. */
export function audit(req, entry) {
  const row = recordAudit({
    actorId: req.admin?.id || null,
    actorRole: req.admin?.adminRole || null,
    ip: req.ip,
    userAgent: req.get('user-agent') || '',
    ...entry,
  });
  // Late import to avoid a circular dep with realtime.js (which imports token.js)
  try {
    import('../services/realtime.js').then(({ emitAdmin }) => emitAdmin('audit:event', row)).catch(() => {});
  } catch { /* no-op */ }
  return row;
}

import { ROLE_PERMISSIONS, PERMISSIONS } from '../lib/permissions.js';
import { forbidden } from '../utils/httpError.js';
import { recordAudit } from '../db/audit.js';
import { createStore } from '../db/store.js';

const adminStore = createStore('admin_accounts', {});

function getAdminPermissions(admin) {
  if (admin.permissionOverrides) return admin.permissionOverrides;
  return ROLE_PERMISSIONS[admin.adminRole] || [];
}

export function requirePerm(...required) {
  return (req, _res, next) => {
    if (!req.admin) return next(forbidden('Admin sign in required.'));
    if (req.admin.adminRole === 'super_admin') return next();
    const perms = getAdminPermissions(req.admin);
    const missing = required.filter((p) => !perms.includes(p));
    if (missing.length > 0) {
      recordAudit({
        actorId: req.admin.id,
        actorRole: req.admin.adminRole,
        action: 'permission.denied',
        severity: 'warning',
        ip: req.ip,
        userAgent: req.get('user-agent'),
        meta: { path: req.originalUrl, missing, method: req.method },
      });
      return next(forbidden(`Missing permissions: ${missing.join(', ')}`));
    }
    next();
  };
}

export function requireAllPerm(...required) {
  return requirePerm(...required);
}

export function requireAnyPerm(...options) {
  return (req, _res, next) => {
    if (!req.admin) return next(forbidden('Admin sign in required.'));
    if (req.admin.adminRole === 'super_admin') return next();
    const perms = getAdminPermissions(req.admin);
    const hasAny = options.some((p) => perms.includes(p));
    if (!hasAny) {
      recordAudit({
        actorId: req.admin.id,
        actorRole: req.admin.adminRole,
        action: 'permission.denied',
        severity: 'warning',
        ip: req.ip,
        userAgent: req.get('user-agent'),
        meta: { path: req.originalUrl, required: options, method: req.method },
      });
      return next(forbidden(`Requires one of: ${options.join(', ')}`));
    }
    next();
  };
}

export function authorize(action) {
  return requirePerm(action);
}

export function can(admin, permission) {
  if (admin.adminRole === 'super_admin') return true;
  return getAdminPermissions(admin).includes(permission);
}

export function checkPermission(admin, permission) {
  return can(admin, permission);
}

export { PERMISSIONS, ROLE_PERMISSIONS };

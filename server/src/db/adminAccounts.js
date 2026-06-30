import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { createStore } from './store.js';
import { recordAudit } from './audit.js';

const adminStore = createStore('admin_accounts', {});

function generateId() {
  return `admin-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function sanitize(admin) {
  if (!admin) return null;
  const { passwordHash, backupCodes, ...safe } = admin;
  return safe;
}

export function getAdminById(id) {
  return sanitize(adminStore.get(id));
}

export function getAdminByEmail(email) {
  if (!email) return null;
  const lower = email.toLowerCase().trim();
  const admin = adminStore.find((a) => a.email === lower);
  return sanitize(admin);
}

export function listAdmins({ role, status, search } = {}) {
  let admins = adminStore.list();
  if (role) admins = admins.filter((a) => a.adminRole === role);
  if (status === 'active') admins = admins.filter((a) => !a.suspended);
  if (status === 'suspended') admins = admins.filter((a) => a.suspended);
  if (search) {
    const q = search.toLowerCase();
    admins = admins.filter((a) => a.name?.toLowerCase().includes(q) || a.email?.toLowerCase().includes(q));
  }
  return admins.map(sanitize).sort((a, b) => b.createdAt?.localeCompare(a.createdAt || ''));
}

export function createAdmin({ email, password, name, adminRole = 'support', permissionOverrides, createdBy } = {}) {
  const lower = email.toLowerCase().trim();
  if (adminStore.find((a) => a.email === lower)) {
    throw Object.assign(new Error('Admin with this email already exists'), { status: 409 });
  }
  const passwordHash = bcrypt.hashSync(password, 12);
  const admin = {
    id: generateId(),
    email: lower,
    name: name || lower.split('@')[0],
    passwordHash,
    role: 'admin',
    adminRole,
    permissionOverrides: permissionOverrides || null,
    suspended: false,
    twoFactorEnabled: false,
    twoFactorSecret: null,
    backupCodes: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastLoginAt: null,
    createdBy: createdBy || null,
    sessionCount: 0,
    avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name || lower)}&background=00a86b&color=fff`,
  };
  adminStore.set(admin.id, admin);
  recordAudit({
    actorId: createdBy, action: 'admin.created', target: admin.id, targetType: 'admin',
    severity: 'critical', meta: { email: lower, role: adminRole },
  });
  return sanitize(admin);
}

export function updateAdmin(id, updates, actorId) {
  const admin = adminStore.get(id);
  if (!admin) throw Object.assign(new Error('Admin not found'), { status: 404 });
  const allowed = ['name', 'adminRole', 'permissionOverrides', 'suspended'];
  const changes = {};
  for (const key of allowed) {
    if (key in updates && updates[key] !== admin[key]) {
      changes[key] = { from: admin[key], to: updates[key] };
      admin[key] = updates[key];
    }
  }
  if (Object.keys(changes).length > 0) {
    admin.updatedAt = new Date().toISOString();
    adminStore.set(id, admin);
    recordAudit({
      actorId, action: 'admin.updated', target: id, targetType: 'admin',
      severity: 'warning', meta: { changes },
    });
  }
  return sanitize(admin);
}

export function deleteAdmin(id, actorId) {
  const admin = adminStore.get(id);
  if (!admin) return null;
  if (admin.adminRole === 'super_admin') {
    const superCount = adminStore.list().filter((a) => a.adminRole === 'super_admin' && !a.suspended).length;
    if (superCount <= 1) {
      throw Object.assign(new Error('Cannot delete the last super admin'), { status: 400 });
    }
  }
  adminStore.deleteCritical(id);
  recordAudit({
    actorId, action: 'admin.deleted', target: id, targetType: 'admin',
    severity: 'critical', meta: { email: admin.email },
  });
  return true;
}

export function setAdminPassword(id, newPassword, actorId) {
  const admin = adminStore.get(id);
  if (!admin) return false;
  admin.passwordHash = bcrypt.hashSync(newPassword, 12);
  admin.updatedAt = new Date().toISOString();
  adminStore.set(id, admin);
  recordAudit({
    actorId, action: 'admin.password_reset', target: id, targetType: 'admin',
    severity: 'critical', meta: { email: admin.email },
  });
  return true;
}

export function verifyAdminPassword(admin, password) {
  if (!admin || !password) return false;
  const record = adminStore.get(admin.id);
  if (!record) return false;
  return bcrypt.compareSync(password, record.passwordHash);
}

export function recordAdminLogin(id, ip, userAgent) {
  const admin = adminStore.get(id);
  if (!admin) return;
  admin.lastLoginAt = new Date().toISOString();
  admin.lastIp = ip;
  admin.lastUserAgent = userAgent;
  admin.sessionCount = (admin.sessionCount || 0) + 1;
  adminStore.set(id, admin);
}

export function getAdminStats() {
  const all = adminStore.list();
  return {
    total: all.length,
    active: all.filter((a) => !a.suspended).length,
    suspended: all.filter((a) => a.suspended).length,
    byRole: all.reduce((acc, a) => {
      acc[a.adminRole] = (acc[a.adminRole] || 0) + 1;
      return acc;
    }, {}),
  };
}

export function bulkUpdateAdmins(ids, updates, actorId) {
  const results = [];
  for (const id of ids) {
    try {
      results.push(updateAdmin(id, updates, actorId));
    } catch (e) {
      results.push({ id, error: e.message });
    }
  }
  return results;
}

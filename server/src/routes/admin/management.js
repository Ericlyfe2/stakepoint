import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, audit } from '../../middleware/adminAuth.js';
import { requirePerm } from '../../middleware/permissions.js';
import { listAdmins, createAdmin, updateAdmin, deleteAdmin, setAdminPassword, getAdminById, getAdminStats, bulkUpdateAdmins } from '../../db/adminAccounts.js';
import { listAudit, recordAudit, auditStats } from '../../db/audit.js';
import { createStore } from '../../db/store.js';
import { revokeAllForAccount } from '../../services/token.js';
import { emitAdmin } from '../../services/realtime.js';
import { badRequest } from '../../utils/httpError.js';

const router = Router();
const sessionStore = createStore('admin_sessions', {});

router.get('/', requireAdmin, requirePerm('admin.view'), (req, res) => {
  const { role, status, search } = req.query;
  res.json({ admins: listAdmins({ role, status, search }) });
});

router.post('/', requireAdmin, requirePerm('admin.create'), (req, res, next) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8).max(128),
      name: z.string().min(1).max(100),
      adminRole: z.enum(['super_admin', 'trader', 'risk_manager', 'finance_admin', 'compliance_officer', 'support_agent', 'marketing_manager', 'readonly_auditor']),
      permissionOverrides: z.array(z.string()).nullable().optional(),
    });
    const data = schema.parse(req.body);
    const admin = createAdmin({ ...data, createdBy: req.admin.id });
    audit(req, { action: 'admin.created', severity: 'critical', target: admin.id, targetType: 'admin', meta: { email: data.email, role: data.adminRole } });
    res.status(201).json({ admin });
  } catch (e) {
    if (e instanceof z.ZodError) return next(badRequest('Invalid input', e.errors));
    if (e.status) return next(e);
    next(e);
  }
});

router.get('/stats', requireAdmin, requirePerm('admin.view'), (req, res) => {
  res.json({ stats: getAdminStats() });
});

router.get('/audit-log', requireAdmin, requirePerm('admin.audit'), (req, res) => {
  const { limit, action, actorId, targetType, severity, from, to } = req.query;
  res.json({ entries: listAudit({ limit: parseInt(limit) || 200, action, actorId, targetType, severity, from, to }) });
});

router.get('/audit-stats', requireAdmin, requirePerm('admin.audit'), (req, res) => {
  res.json({ stats: auditStats() });
});

router.get('/sessions', requireAdmin, requirePerm('admin.view'), (req, res) => {
  const sessions = sessionStore.list().filter((s) => s.active).map((s) => ({
    id: s.id,
    adminId: s.adminId,
    createdAt: s.createdAt,
    lastActivity: s.lastActivity,
    ip: s.ip,
    userAgent: s.userAgent,
  }));
  res.json({ sessions });
});

router.get('/:id', requireAdmin, requirePerm('admin.view'), (req, res, next) => {
  const admin = getAdminById(req.params.id);
  if (!admin) return res.status(404).json({ error: 'Admin not found' });
  res.json({ admin });
});

router.put('/:id', requireAdmin, requirePerm('admin.edit'), (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(100).optional(),
      adminRole: z.enum(['super_admin', 'trader', 'risk_manager', 'finance_admin', 'compliance_officer', 'support_agent', 'marketing_manager', 'readonly_auditor']).optional(),
      suspended: z.boolean().optional(),
      permissionOverrides: z.array(z.string()).nullable().optional(),
    });
    const data = schema.parse(req.body);
    if (data.adminRole === 'super_admin' && req.admin.adminRole !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admins can promote to super_admin' });
    }
    const admin = updateAdmin(req.params.id, data, req.admin.id);
    if (data.suspended) {
      revokeAllForAccount(req.params.id);
      emitAdmin('admin:suspended', { adminId: req.params.id });
    }
    res.json({ admin });
  } catch (e) {
    if (e instanceof z.ZodError) return next(badRequest('Invalid input', e.errors));
    if (e.status) return next(e);
    next(e);
  }
});

router.delete('/:id', requireAdmin, requirePerm('admin.delete'), (req, res, next) => {
  try {
    if (req.params.id === req.admin.id) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }
    const deleted = deleteAdmin(req.params.id, req.admin.id);
    if (!deleted) return res.status(404).json({ error: 'Admin not found' });
    revokeAllForAccount(req.params.id);
    emitAdmin('admin:deleted', { adminId: req.params.id });
    res.json({ ok: true });
  } catch (e) {
    if (e.status) return next(e);
    next(e);
  }
});

router.post('/:id/reset-password', requireAdmin, requirePerm('admin.edit'), (req, res, next) => {
  try {
    const { newPassword } = z.object({ newPassword: z.string().min(8).max(128) }).parse(req.body);
    setAdminPassword(req.params.id, newPassword, req.admin.id);
    revokeAllForAccount(req.params.id);
    emitAdmin('admin:logout', { adminId: req.params.id });
    res.json({ ok: true, message: 'Password reset. Admin will need to sign in again.' });
  } catch (e) {
    if (e instanceof z.ZodError) return next(badRequest('Invalid input', e.errors));
    next(e);
  }
});

router.post('/bulk-update', requireAdmin, requirePerm('admin.edit'), (req, res, next) => {
  try {
    const schema = z.object({
      ids: z.array(z.string()).min(1),
      updates: z.object({ suspended: z.boolean().optional(), adminRole: z.string().optional() }),
    });
    const { ids, updates } = schema.parse(req.body);
    const results = bulkUpdateAdmins(ids, updates, req.admin.id);
    audit(req, { action: 'admin.bulk_update', severity: 'warning', meta: { ids, updates } });
    res.json({ results });
  } catch (e) {
    if (e instanceof z.ZodError) return next(badRequest('Invalid input', e.errors));
    next(e);
  }
});

export default router;

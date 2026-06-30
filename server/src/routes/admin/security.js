import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, requireRole, audit } from '../../middleware/adminAuth.js';
import { validate } from '../../middleware/validate.js';
import { createStore } from '../../db/store.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { notFound } from '../../utils/httpError.js';

const store = createStore('security_settings', {});
const router = Router();

router.get('/sessions', requireAdmin, (_req, res) => {
  res.json({ sessions: [] });
});

router.post('/sessions/:id/revoke', requireAdmin, (req, res, next) => {
  audit(req, { action: 'admin.session.revoked', target: req.params.id, targetType: 'admin_session', severity: 'warning' });
  res.json({ ok: true });
});

router.get('/settings', requireAdmin, (_req, res) => {
  const s = store.all() || {};
  res.json({
    force2fa: s.force2fa || false,
    sessionTimeout: s.sessionTimeout || 3600,
    ipAllowlist: s.ipAllowlist || [],
    maxLoginAttempts: s.maxLoginAttempts || 5,
    rateLimitProfile: s.rateLimitProfile || 'standard',
    breakGlassEnabled: s.breakGlassEnabled || false,
  });
});

router.put('/settings', requireAdmin, validate(z.object({
  force2fa: z.boolean().optional(),
  sessionTimeout: z.number().min(300).max(86400).optional(),
  ipAllowlist: z.array(z.string()).optional(),
  maxLoginAttempts: z.number().min(1).max(20).optional(),
  rateLimitProfile: z.enum(['standard', 'strict', 'relaxed']).optional(),
  breakGlassEnabled: z.boolean().optional(),
})), asyncHandler(async (req, res) => {
  Object.entries(req.body).forEach(([k, v]) => store.set(k, v));
  audit(req, { action: 'admin.security.settings', target: 'global', targetType: 'config', severity: 'warning', meta: Object.keys(req.body) });
  res.json({ ok: true });
}));

export default router;

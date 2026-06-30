import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, requireRole, audit } from '../../middleware/adminAuth.js';
import { validate } from '../../middleware/validate.js';
import { createStore } from '../../db/store.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { notFound } from '../../utils/httpError.js';

const store = createStore('promo_codes', {});
const router = Router();

const codeSchema = z.object({
  code: z.string().trim().min(2).max(30).transform((v) => v.toUpperCase()),
  type: z.enum(['free_bet', 'deposit_match', 'bonus', 'odds_boost']),
  value: z.number().positive(),
  maxUses: z.number().int().min(1).default(1),
  maxPerUser: z.number().int().min(1).default(1),
  minStake: z.number().min(0).default(0),
  expiresAt: z.string().optional(),
  description: z.string().max(300).optional(),
  sportRestriction: z.array(z.string()).optional(),
});

router.get('/', requireAdmin, (req, res) => {
  const { status, q } = req.query;
  let list = Object.values(store.all() || {});
  if (status === 'active') list = list.filter((c) => c.status === 'active' && (!c.expiresAt || c.expiresAt > new Date().toISOString()));
  if (status === 'expired') list = list.filter((c) => c.expiresAt && c.expiresAt <= new Date().toISOString());
  if (q) list = list.filter((c) => c.code.includes(q.toUpperCase()) || (c.description || '').toLowerCase().includes(q.toLowerCase()));
  list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const totalUses = list.reduce((s, c) => s + (c.useCount || 0), 0);
  res.json({ codes: list.slice(0, 200), total: list.length, totalUses });
});

router.get('/stats', requireAdmin, (_req, res) => {
  const all = Object.values(store.all() || {});
  res.json({
    total: all.length,
    active: all.filter((c) => c.status === 'active' && (!c.expiresAt || c.expiresAt > new Date().toISOString())).length,
    expired: all.filter((c) => c.expiresAt && c.expiresAt <= new Date().toISOString()).length,
    totalRedemptions: all.reduce((s, c) => s + (c.useCount || 0), 0),
  });
});

router.get('/:id', requireAdmin, (req, res, next) => {
  const c = store.get(req.params.id);
  if (!c) return next(notFound('Code not found.'));
  res.json({ code: c });
});

router.post('/', requireRole('codes.edit'), validate(codeSchema), asyncHandler(async (req, res) => {
  const id = `pcd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const record = { id, ...req.body, status: 'active', useCount: 0, createdBy: req.admin.id, createdAt: new Date().toISOString() };
  store.set(id, record);
  audit(req, { action: 'admin.code.created', target: id, targetType: 'promo_code', meta: { code: req.body.code, type: req.body.type, value: req.body.value } });
  res.status(201).json({ ok: true, code: record });
}));

router.post('/bulk', requireRole('codes.edit'), validate(z.object({
  prefix: z.string().max(10).default('PROMO'),
  count: z.number().int().min(1).max(500),
  type: z.enum(['free_bet', 'deposit_match', 'bonus', 'odds_boost']),
  value: z.number().positive(),
  maxUses: z.number().int().min(1).default(1),
  maxPerUser: z.number().int().min(1).default(1),
  minStake: z.number().min(0).default(0),
  expiresAt: z.string().optional(),
  description: z.string().max(300).optional(),
})), asyncHandler(async (req, res) => {
  const generated = [];
  for (let i = 0; i < req.body.count; i++) {
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    const code = `${req.body.prefix}-${suffix}`;
    const id = `pcd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const record = { id, code, type: req.body.type, value: req.body.value, maxUses: req.body.maxUses, maxPerUser: req.body.maxPerUser, minStake: req.body.minStake, expiresAt: req.body.expiresAt, description: req.body.description, status: 'active', useCount: 0, createdBy: req.admin.id, createdAt: new Date().toISOString() };
    store.set(id, record);
    generated.push(record);
  }
  audit(req, { action: 'admin.code.bulk', target: 'bulk', targetType: 'promo_code', meta: { count: generated.length, type: req.body.type, prefix: req.body.prefix } });
  res.status(201).json({ ok: true, codes: generated, count: generated.length });
}));

router.patch('/:id', requireRole('codes.edit'), validate(codeSchema.partial()), asyncHandler(async (req, res, next) => {
  const c = store.get(req.params.id);
  if (!c) return next(notFound('Code not found.'));
  const updated = store.update(c.id, (cur) => ({ ...cur, ...req.body }));
  res.json({ ok: true, code: updated });
}));

router.delete('/:id', requireRole('codes.edit'), asyncHandler(async (req, res, next) => {
  const c = store.get(req.params.id);
  if (!c) return next(notFound('Code not found.'));
  store.delete(c.id);
  audit(req, { action: 'admin.code.deleted', target: c.id, targetType: 'promo_code', severity: 'warning' });
  res.json({ ok: true });
}));

export default router;

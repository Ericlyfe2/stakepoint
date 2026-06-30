import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, requireRole, audit } from '../../middleware/adminAuth.js';
import { validate } from '../../middleware/validate.js';
import { createStore } from '../../db/store.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { notFound } from '../../utils/httpError.js';

const store = createStore('bonus_campaigns', {});
const ledger = createStore('bonus_ledger', {});
const router = Router();

const campaignSchema = z.object({
  name: z.string().trim().min(2).max(80),
  type: z.enum(['deposit', 'free_bet', 'cashback', 'multi_boost']),
  description: z.string().max(500).optional(),
  value: z.number().positive(),
  valueType: z.enum(['percentage', 'fixed']).default('percentage'),
  minDeposit: z.number().min(0).default(0),
  wageringRequirement: z.number().min(0).default(0),
  maxBonus: z.number().min(0).default(0),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  status: z.enum(['draft', 'active', 'paused', 'ended']).default('draft'),
  sportRestriction: z.array(z.string()).optional(),
});

const issueSchema = z.object({
  userId: z.string(),
  amount: z.number().positive(),
  reason: z.string().trim().min(2).max(200),
  wageringRequirement: z.number().min(0).default(0),
});

router.get('/', requireAdmin, (req, res) => {
  let list = Object.values(store.all() || {});
  const { status } = req.query;
  if (status) list = list.filter((c) => c.status === status);
  list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const stats = { total: list.length, active: list.filter((c) => c.status === 'active').length, draft: list.filter((c) => c.status === 'draft').length, ended: list.filter((c) => c.status === 'ended').length };
  res.json({ campaigns: list.slice(0, 100), stats });
});

router.get('/stats', requireAdmin, (_req, res) => {
  const all = Object.values(ledger.all() || {});
  const totalIssued = all.reduce((s, e) => s + (e.amount || 0), 0);
  const totalWagered = all.reduce((s, e) => s + (e.wagered || 0), 0);
  res.json({ totalIssued, totalWagered, totalAwards: all.length, claimedRate: all.length > 0 ? Math.round((all.filter((e) => e.claimed).length / all.length) * 100) : 0 });
});

router.get('/:id', requireAdmin, (req, res, next) => {
  const c = store.get(req.params.id);
  if (!c) return next(notFound('Campaign not found.'));
  res.json({ campaign: c });
});

router.post('/', requireRole('bonuses.create'), validate(campaignSchema), asyncHandler(async (req, res) => {
  const id = `bon-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const record = { id, ...req.body, createdBy: req.admin.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  store.set(id, record);
  audit(req, { action: 'admin.bonus.created', target: id, targetType: 'bonus_campaign', meta: { name: req.body.name, type: req.body.type, value: req.body.value } });
  res.status(201).json({ ok: true, campaign: record });
}));

router.patch('/:id', requireRole('bonuses.edit'), validate(campaignSchema.partial()), asyncHandler(async (req, res, next) => {
  const c = store.get(req.params.id);
  if (!c) return next(notFound('Campaign not found.'));
  const updated = store.update(c.id, (cur) => ({ ...cur, ...req.body, updatedAt: new Date().toISOString() }));
  audit(req, { action: 'admin.bonus.updated', target: c.id, targetType: 'bonus_campaign' });
  res.json({ ok: true, campaign: updated });
}));

router.post('/:id/issue', requireRole('bonuses.issue'), validate(issueSchema), asyncHandler(async (req, res, next) => {
  const entry = {
    id: `ble-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    campaignId: req.params.id,
    userId: req.body.userId,
    amount: req.body.amount,
    reason: req.body.reason,
    wageringRequirement: req.body.wageringRequirement,
    claimed: false,
    issuedBy: req.admin.id,
    issuedAt: new Date().toISOString(),
  };
  ledger.set(entry.id, entry);
  audit(req, { action: 'admin.bonus.issued', target: entry.id, targetType: 'bonus_entry', meta: { userId: req.body.userId, amount: req.body.amount } });
  res.status(201).json({ ok: true, entry });
}));

router.post('/:id/clawback', requireRole('bonuses.clawback'), asyncHandler(async (req, res, next) => {
  audit(req, { action: 'admin.bonus.clawback', target: req.params.id, targetType: 'bonus_campaign', severity: 'warning' });
  res.json({ ok: true });
}));

router.delete('/:id', requireRole('bonuses.delete'), asyncHandler(async (req, res, next) => {
  const c = store.get(req.params.id);
  if (!c) return next(notFound('Campaign not found.'));
  store.delete(c.id);
  audit(req, { action: 'admin.bonus.deleted', target: c.id, targetType: 'bonus_campaign', severity: 'warning' });
  res.json({ ok: true });
}));

export default router;

import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, requireRole, audit } from '../../middleware/adminAuth.js';
import { validate } from '../../middleware/validate.js';
import { createStore } from '../../db/store.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { notFound } from '../../utils/httpError.js';

const store = createStore('referral_payouts', {});
const router = Router();

const payoutSchema = z.object({
  referralId: z.string(),
  amount: z.number().positive(),
  note: z.string().max(300).optional(),
});

router.get('/', requireAdmin, (_req, res) => {
  res.json({
    stats: { totalReferrals: 0, totalCommission: 0, pendingPayouts: 0, topReferrers: [] },
    referrals: [],
  });
});

router.get('/payouts', requireAdmin, (_req, res) => {
  const list = Object.values(store.all() || {}).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  res.json({ payouts: list.slice(0, 100) });
});

router.post('/payouts', requireRole('referrals.payouts'), validate(payoutSchema), asyncHandler(async (req, res) => {
  const id = `rpo-${Date.now()}`;
  const record = { id, ...req.body, status: 'completed', processedBy: req.admin.id, createdAt: new Date().toISOString() };
  store.set(id, record);
  audit(req, { action: 'admin.referral.payout', target: id, targetType: 'referral_payout', meta: { amount: req.body.amount } });
  res.status(201).json({ ok: true, payout: record });
}));

export default router;

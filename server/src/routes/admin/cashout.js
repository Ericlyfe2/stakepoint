import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, requireRole, audit } from '../../middleware/adminAuth.js';
import { validate } from '../../middleware/validate.js';
import { createStore } from '../../db/store.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const store = createStore('cashout_rules', {});
const router = Router();

const rulesSchema = z.object({
  enabled: z.boolean().optional(),
  minOdds: z.number().min(1).optional(),
  maxOdds: z.number().min(1).optional(),
  minLegs: z.number().int().min(1).optional(),
  maxLegs: z.number().int().min(1).max(20).optional(),
  minStake: z.number().min(0).optional(),
  maxStake: z.number().min(0).optional(),
  factor: z.number().min(0).max(1).optional(),
  autoCashoutThreshold: z.number().min(0).optional(),
  disabledSports: z.array(z.string()).optional(),
  timeBasedRestriction: z.number().min(0).optional(),
});

router.get('/rules', requireAdmin, (_req, res) => {
  const r = store.all() || {};
  res.json({
    enabled: r.enabled !== false,
    minOdds: r.minOdds || 1.2,
    maxOdds: r.maxOdds || 50,
    minLegs: r.minLegs || 1,
    maxLegs: r.maxLegs || 15,
    minStake: r.minStake || 1,
    maxStake: r.maxStake || 50000,
    factor: r.factor || 0.6,
    autoCashoutThreshold: r.autoCashoutThreshold || 0,
    disabledSports: r.disabledSports || [],
    timeBasedRestriction: r.timeBasedRestriction || 0,
  });
});

router.put('/rules', requireRole('cashout.configure'), validate(rulesSchema), asyncHandler(async (req, res) => {
  Object.entries(req.body).forEach(([k, v]) => store.set(k, v));
  audit(req, { action: 'admin.cashout.rules', target: 'global', targetType: 'config', meta: Object.keys(req.body) });
  res.json({ ok: true });
}));

router.get('/offers', requireAdmin, (_req, res) => {
  res.json({ offers: [], totalCount: 0, totalValue: 0 });
});

router.get('/stats', requireAdmin, (_req, res) => {
  res.json({
    totalCashouts: 0,
    totalAmount: 0,
    avgCashoutPct: 0,
    playerAdoptionRate: 0,
    profitImpact: 0,
    bySport: [],
  });
});

export default router;

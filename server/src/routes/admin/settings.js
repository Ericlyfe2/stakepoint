import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, requireRole, audit } from '../../middleware/adminAuth.js';
import { validate } from '../../middleware/validate.js';
import { getSettings, updateSettings } from '../../db/settings.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();

const settingsSchema = z.object({
  maintenance: z.boolean().optional(),
  maintenanceMessage: z.string().max(1000).optional(),
  loginDisabled: z.boolean().optional(),
  signupsOpen: z.boolean().optional(),
  defaultOddsSource: z.string().max(50).optional(),
  minDeposit: z.number().positive().optional(),
  minWithdraw: z.number().positive().optional(),
  maxSingleStake: z.number().positive().optional(),
  maxMultipleStake: z.number().positive().optional(),
  maxSystemStake: z.number().positive().optional(),
  bonusRate: z.number().min(0).max(1).optional(),
  referralBonus: z.number().min(0).optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  // Free-form on purpose: ops need to point the deposit flow at a different
  // merchant (or a telco code that isn't purely digits) without a release.
  paybillNumber: z.string().trim().min(1).max(40).optional(),
  paybillName: z.string().trim().max(80).optional(),
  featureJackpot: z.boolean().optional(),
  featureCasino: z.boolean().optional(),
  featureVirtuals: z.boolean().optional(),
  featurePromotions: z.boolean().optional(),
  featureLiveBetting: z.boolean().optional(),
});

router.get('/', requireAdmin, (_req, res) => {
  res.json({ settings: getSettings() });
});

router.put('/',
  requireAdmin, requireRole(),
  validate(settingsSchema),
  asyncHandler(async (req, res) => {
    const updated = updateSettings(req.body);
    audit(req, { action: 'settings.update', target: 'platform', meta: { keys: Object.keys(req.body) } });
    res.json({ ok: true, settings: updated });
  })
);

export default router;

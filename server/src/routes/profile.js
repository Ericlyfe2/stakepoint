import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { updateUser, publicUser, findByReferralCode, countReferred, logActivity } from '../db/users.js';
import { badRequest, notFound } from '../utils/httpError.js';

const router = Router();

// Ghana mobile or full international format. Allow an empty string so the
// user can clear the field; we'll normalise to null below.
const phoneSchema = z.string().trim()
  .max(20, 'Phone too long')
  .refine(
    (v) => v === '' || /^\+?\d[\d\s-]{8,18}$/.test(v),
    'Enter a valid phone number (e.g. 0244123456 or +233244123456).',
  )
  .transform((v) => {
    const trimmed = v.replace(/[\s-]/g, '');
    return trimmed === '' ? null : trimmed;
  });

const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(60).optional(),
  phone: phoneSchema.optional(),
  favouriteSports: z.array(z.string()).max(10).optional(),
  favouriteLeagues: z.array(z.string()).max(20).optional(),
  responsibleGaming: z.object({
    dailyDepositLimit:   z.number().nonnegative().optional(),
    weeklyDepositLimit:  z.number().nonnegative().optional(),
    monthlyDepositLimit: z.number().nonnegative().optional(),
    selfExcludedUntil:   z.string().nullable().optional(),
  }).optional(),
});

router.get('/', requireAuth, (req, res) => {
  res.json({ account: publicUser(req.user) });
});

router.patch('/', requireAuth, validate(profileSchema), asyncHandler(async (req, res) => {
  const updated = await updateUser(req.user.id, req.body);
  logActivity(req.user.id, { kind: 'profile_update' });
  res.json({ account: publicUser(updated) });
}));

/** Claim a referral code (sets referredBy on the claiming user). */
router.post('/referral/claim', requireAuth, validate(z.object({ code: z.string().trim().min(4).max(20) })), asyncHandler(async (req, res) => {
  const referrer = findByReferralCode(req.body.code);
  if (!referrer) throw notFound('Invalid referral code.');
  if (referrer.id === req.user.id) throw badRequest('Cannot refer yourself.');
  const user = req.user;
  if (user.referredBy) throw badRequest('Referral already claimed.');
  await updateUser(user.id, { referredBy: referrer.id });
  logActivity(user.id, { kind: 'referral_claimed', referrerId: referrer.id });
  res.json({ ok: true, message: 'Referral applied!' });
}));

/** Get the current user's referral code and stats. */
router.get('/referral', requireAuth, (req, res) => {
  const code = req.user.referralCode || null;
  const totalReferred = countReferred(req.user.id);
  res.json({ code, totalReferred });
});

export default router;

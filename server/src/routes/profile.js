import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { updateUser, publicUser, logActivity } from '../db/users.js';

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

router.patch('/', requireAuth, validate(profileSchema), (req, res) => {
  const updated = updateUser(req.user.id, req.body);
  logActivity(req.user.id, { kind: 'profile_update' });
  res.json({ account: publicUser(updated) });
});

export default router;

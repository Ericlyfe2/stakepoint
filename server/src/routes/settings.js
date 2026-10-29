/**
 * Public platform settings.
 *
 * `/public` is read by every player surface (deposit limits, PayBill,
 * maintenance flag, and the "No login" switch state).
 *
 * `/login-lock` is the write side of the login kill switch. It is public by
 * design: the login page itself carries a light-switch button that must be
 * able to flip the same flag the admin panel edits, and an unauthenticated
 * page has no admin token to send. The abuse surface is bounded by:
 *   - a dedicated rate limiter (per IP),
 *   - a short server-side cooldown between flips,
 *   - an audit entry with IP + user agent on every change,
 *   - LOGIN_LOCK_REQUIRE_ADMIN=true to disable the public path entirely.
 */
import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { getSettings, updateSettings } from '../db/settings.js';
import { recordAudit } from '../db/audit.js';
import { validate } from '../middleware/validate.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { tooMany } from '../utils/httpError.js';
import { LOGIN_LOCK } from '../config/env.js';
import { log } from '../utils/logger.js';

const router = Router();

/* ------------ Read ------------ */

router.get('/public', (_req, res) => {
  const s = getSettings();
  res.set('Cache-Control', 'no-store');
  res.json({
    maintenance: s.maintenance,
    maintenanceMessage: s.maintenanceMessage,
    loginDisabled: !!s.loginDisabled,
    signupsOpen: s.signupsOpen,
    minDeposit: s.minDeposit,
    minWithdraw: s.minWithdraw,
    // Public by design: these are the payment details every depositor needs.
    paybillNumber: s.paybillNumber,
    paybillName: s.paybillName,
  });
});

/* ------------ Write: login kill switch ------------ */

const lockLimiter = rateLimit({
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  windowMs: 60 * 1000,
  limit: 20,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  message: { error: 'Too many switch requests — please try again in a minute.' },
});

const lockSchema = z.object({ enabled: z.boolean() });

// Monotonic guard so two clients (or a stuck retry loop) can't flip the flag
// dozens of times a second. Process-local by design; a multi-instance
// deployment would move this into the settings store.
let lastFlipAt = 0;

const requireAdminIfHardened = LOGIN_LOCK.requireAdmin
  ? requireAdmin
  : (_req, _res, next) => next();

router.post('/login-lock',
  lockLimiter,
  requireAdminIfHardened,
  validate(lockSchema),
  asyncHandler(async (req, res) => {
    const { enabled } = req.body;

    const now = Date.now();
    if (LOGIN_LOCK.cooldownMs > 0 && now - lastFlipAt < LOGIN_LOCK.cooldownMs) {
      throw tooMany('Please wait a moment before changing this again.', {
        code: 'LOGIN_LOCK_COOLDOWN',
      });
    }
    lastFlipAt = now;

    const updated = updateSettings({ loginDisabled: enabled });
    const actor = req.admin || null;

    recordAudit({
      actorId: actor?.id || null,
      actorRole: actor?.adminRole || null,
      action: enabled ? 'settings.login_lock.enabled' : 'settings.login_lock.disabled',
      target: 'platform',
      targetType: 'settings',
      severity: 'warning',
      ip: req.ip,
      userAgent: req.get('user-agent') || '',
      meta: { via: actor ? 'admin' : 'login_page_switch', enabled },
    });

    log.warn(`login lock ${enabled ? 'ENABLED' : 'DISABLED'} via ${actor ? 'admin' : 'login-page switch'} from ${req.ip}`);

    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, loginDisabled: !!updated.loginDisabled });
  })
);

export default router;

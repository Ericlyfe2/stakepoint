import { Router } from 'express';
import { z } from 'zod';
import {
  findByEmail, findByGoogleId, getUserById, createUser, updateUser, publicUser, logActivity,
} from '../db/users.js';
import { hashPassword, verifyPassword, passwordIssues } from '../services/password.js';
import {
  signAccessToken, issueRefreshToken, rotateRefreshToken,
  revokeRefreshToken, lookupRefresh, revokeAllForAccount,
} from '../services/token.js';
import { verifyGoogleIdToken } from '../services/oauth.js';
import { requireAuth } from '../middleware/auth.js';
import {
  publicAdmin, bruteCheck, bumpBrute, clearBrute, issueAdminSession,
} from './admin/auth.js';
import { recordAudit } from '../db/audit.js';
import { loginLimiter, registerLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { badRequest, unauthorized, conflict, forbidden } from '../utils/httpError.js';
import { GOOGLE } from '../config/env.js';
import { log } from '../utils/logger.js';

const router = Router();

/* ------------ Schemas ------------ */
const emailLike = z.string().trim().toLowerCase()
  .min(3, 'Enter a valid email or phone.')
  .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || /^\+?\d{9,15}$/.test(v.replace(/\s|-/g, '')),
          { message: 'Enter a valid email or phone.' });

const country = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Select your country.');

const registerSchema = z.object({
  email: emailLike,
  password: z.string(),
  displayName: z.string().trim().max(60).optional(),
  country,
});

const loginSchema = z.object({
  email: emailLike,
  password: z.string().min(1, 'Password is required.'),
  country: country.optional(),
});

const changePwSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string(),
});

const googleSchema = z.object({
  credential: z.string().min(10),
  country: country.optional(),
});

/* ------------ Helpers ------------ */
function issueSession(user, req) {
  const access = signAccessToken(user);
  const refresh = issueRefreshToken(user.id, {
    ip: req.ip,
    userAgent: req.get('user-agent') || '',
  });
  return { accessToken: access, refreshToken: refresh.token, expiresAt: refresh.expiresAt };
}

function passwordOrThrow(pw) {
  const issues = passwordIssues(pw);
  if (issues.length) throw badRequest(issues[0], { issues });
}

/* ------------ Endpoints ------------ */

router.get('/config', (_req, res) => {
  res.json({
    googleEnabled: GOOGLE.enabled,
    googleClientId: GOOGLE.clientId || null,
  });
});

/** Register — creates account, immediately signs in (no OTP). */
router.post('/register',
  registerLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { email, password, displayName, country: countryCode } = req.body;
    passwordOrThrow(password);

    if (findByEmail(email)) throw conflict('An account with this email already exists.');

    const passwordHash = await hashPassword(password);
    const user = createUser({
      email,
      displayName: displayName || email,
      passwordHash,
      balance: 0,
      country: countryCode,
      emailVerified: true,
    });
    logActivity(user.id, { kind: 'register', ip: req.ip, country: countryCode });
    log.info(`registered ${email} (${countryCode})`);
    const session = issueSession(user, req);
    res.status(201).json({ ok: true, kind: 'user', account: publicUser(user), ...session });
  })
);

/** Login — single step, no OTP, no email verification gate. */
router.post('/login',
  loginLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password, country: submittedCountry } = req.body;
    const user = findByEmail(email);
    if (!user || !user.passwordHash) throw unauthorized('Incorrect email or password.');

    /* ---- admin path ---- */
    if (user.role === 'admin') {
      bruteCheck(email);
      const ok = await verifyPassword(password, user.passwordHash);
      if (!ok) {
        bumpBrute(email);
        recordAudit({ actorId: user.id, action: 'admin.login.failed', severity: 'warning', ip: req.ip, meta: { email } });
        logActivity(user.id, { kind: 'admin_login_failed', ip: req.ip });
        throw unauthorized('Incorrect email or password.');
      }
      if (user.suspended) {
        recordAudit({ actorId: user.id, action: 'admin.login.suspended', severity: 'warning', ip: req.ip, meta: { email } });
        throw forbidden('Admin account suspended.');
      }
      clearBrute(email);
      const session = issueAdminSession(user, req);
      logActivity(user.id, { kind: 'admin_login_success', ip: req.ip, userAgent: req.get('user-agent'), via: 'unified' });
      recordAudit({ actorId: user.id, action: 'admin.login.success', ip: req.ip, meta: { email, via: 'unified' } });
      return res.json({ ok: true, kind: 'admin', admin: publicAdmin(user), ...session });
    }

    /* ---- user path ---- */
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      logActivity(user.id, { kind: 'login_failed', ip: req.ip });
      throw unauthorized('Incorrect email or password.');
    }
    if (user.suspended) throw unauthorized('Account suspended. Contact support.');

    // Country validation: if user has a country on file, the submitted one must match.
    // If user has no country (legacy account), accept and persist the submitted value.
    let patch = null;
    if (submittedCountry) {
      if (user.country && user.country !== submittedCountry) {
        throw badRequest('Country does not match the one on your account.');
      }
      if (!user.country) patch = { country: submittedCountry };
    }
    const fresh = patch ? updateUser(user.id, patch) : user;

    logActivity(fresh.id, { kind: 'login_success', ip: req.ip, userAgent: req.get('user-agent') });
    const session = issueSession(fresh, req);
    res.json({ ok: true, kind: 'user', account: publicUser(fresh), ...session });
  })
);

router.post('/refresh',
  asyncHandler(async (req, res) => {
    const token = req.body?.refreshToken;
    const record = lookupRefresh(token);
    if (!record) throw unauthorized('Invalid or expired refresh token.');
    const user = getUserById(record.accountId);
    if (!user || user.suspended) throw unauthorized('Account no longer available.');
    const next = rotateRefreshToken(token, { ip: req.ip, userAgent: req.get('user-agent') });
    const access = signAccessToken(user);
    res.json({ ok: true, accessToken: access, refreshToken: next.token, expiresAt: next.expiresAt });
  })
);

router.post('/logout', asyncHandler(async (req, res) => {
  const token = req.body?.refreshToken;
  const record = token ? lookupRefresh(token) : null;
  if (record) {
    logActivity(record.accountId, { kind: 'logout', ip: req.ip, userAgent: req.get('user-agent') });
  } else if (req.user?.id) {
    logActivity(req.user.id, { kind: 'logout', ip: req.ip, userAgent: req.get('user-agent') });
  }
  if (token) revokeRefreshToken(token);
  res.json({ ok: true });
}));

router.post('/change-password',
  requireAuth,
  validate(changePwSchema),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    passwordOrThrow(newPassword);
    const user = req.user;
    if (!user.passwordHash) {
      if (currentPassword) throw badRequest('No password set on this account.');
    } else {
      const ok = await verifyPassword(currentPassword, user.passwordHash);
      if (!ok) throw unauthorized('Current password is incorrect.');
    }
    const passwordHash = await hashPassword(newPassword);
    updateUser(user.id, { passwordHash });
    revokeAllForAccount(user.id);
    logActivity(user.id, { kind: 'password_changed', ip: req.ip });
    res.json({ ok: true, message: 'Password changed. Other sessions were signed out.' });
  })
);

router.post('/google',
  validate(googleSchema),
  asyncHandler(async (req, res) => {
    const profile = await verifyGoogleIdToken(req.body.credential);
    const submittedCountry = req.body.country;
    let user = findByEmail(profile.email) || findByGoogleId(profile.googleId);
    if (!user) {
      user = createUser({
        email: profile.email,
        displayName: profile.displayName,
        googleId: profile.googleId,
        picture: profile.picture,
        emailVerified: true,
        country: submittedCountry || null,
      });
    } else if (!user.googleId) {
      user = updateUser(user.id, { googleId: profile.googleId, picture: profile.picture, emailVerified: true });
    }
    if (user.suspended) throw unauthorized('Account suspended.');
    if (submittedCountry && !user.country) {
      user = updateUser(user.id, { country: submittedCountry });
    }
    logActivity(user.id, { kind: 'login_google', ip: req.ip });
    const session = issueSession(user, req);
    res.json({ ok: true, kind: 'user', account: publicUser(user), ...session });
  })
);

router.get('/me', requireAuth, (req, res) => {
  res.json({ account: publicUser(req.user) });
});

router.get('/activity', requireAuth, (req, res) => {
  res.json({ activity: req.user.activity || [] });
});

export default router;

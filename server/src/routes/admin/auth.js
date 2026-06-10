/**
 * Admin authentication routes.
 *
 * Flow:
 *   1. POST /login           -> validates credentials. If 2FA enabled, returns
 *                              { requires2fa: true, challenge } and emails an OTP.
 *                              Otherwise returns a full admin session.
 *   2. POST /verify-2fa      -> { challenge, code }                -> session
 *   3. POST /refresh         -> rotates refresh token              -> new access
 *   4. POST /logout          -> revokes refresh token
 *   5. GET  /me              -> admin profile
 *   6. GET  /sessions        -> active refresh tokens for this admin
 *   7. DELETE /sessions/:id  -> revoke a specific session
 *   8. POST /2fa/enable      -> turn on email-OTP 2FA
 *   9. POST /2fa/disable     -> turn off 2FA (requires password)
 */
import { Router } from 'express';
import { z } from 'zod';
import { findByEmail, updateUser, publicUser, logActivity, getUserById, createUser } from '../../db/users.js';
import { verifyPassword, hashPassword, passwordIssues } from '../../services/password.js';
import {
  ADMIN_INVITE_ROLES,
  listAdminInvites, createAdminInvite, findInviteByToken, consumeInvite, revokeAdminInvite,
} from '../../db/adminInvites.js';
import {
  signAdminAccessToken, issueRefreshToken, rotateRefreshToken,
  revokeRefreshToken, lookupRefresh, revokeAllForAccount,
} from '../../services/token.js';
import { requireAdmin, requireRole, audit } from '../../middleware/adminAuth.js';
import { validate } from '../../middleware/validate.js';
import { loginLimiter } from '../../middleware/rateLimit.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { badRequest, unauthorized, forbidden, notFound, conflict } from '../../utils/httpError.js';
import { createStore } from '../../db/store.js';
import { log } from '../../utils/logger.js';

const router = Router();

// Brute-force tracker — { 'email': { attempts, lockedUntil } }
const bruteStore = createStore('admin_brute', {});
const LOCKOUT_AFTER = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  captchaToken: z.string().optional(), // accepted but not enforced in dev
});

function clearBrute(email) { bruteStore.delete(email); }
function bumpBrute(email) {
  const rec = bruteStore.get(email) || { attempts: 0, lockedUntil: 0 };
  rec.attempts = (rec.attempts || 0) + 1;
  if (rec.attempts >= LOCKOUT_AFTER) {
    rec.lockedUntil = Date.now() + LOCKOUT_MS;
    rec.attempts = 0;
  }
  bruteStore.set(email, rec);
  return rec;
}
function bruteCheck(email) {
  const rec = bruteStore.get(email);
  if (rec?.lockedUntil && rec.lockedUntil > Date.now()) {
    const wait = Math.ceil((rec.lockedUntil - Date.now()) / 1000);
    throw forbidden(`Too many attempts. Try again in ${wait}s.`, { lockedFor: wait });
  }
}

function publicAdmin(u) {
  if (!u) return null;
  const safe = publicUser(u);
  return {
    ...safe,
    adminRole: u.adminRole || 'support',
    twoFactorEnabled: !!u.twoFactorEnabled,
  };
}

function issueAdminSession(admin, req) {
  const access  = signAdminAccessToken(admin);
  const refresh = issueRefreshToken(admin.id, {
    ip: req.ip,
    userAgent: req.get('user-agent') || '',
    scope: 'admin',
  });
  return { accessToken: access, refreshToken: refresh.token, expiresAt: refresh.expiresAt };
}

/* ---------- routes ---------- */

router.post('/login',
  loginLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    bruteCheck(email);

    const user = findByEmail(email);
    if (!user || user.role !== 'admin' || !user.passwordHash) {
      bumpBrute(email);
      throw unauthorized('Invalid admin credentials.');
    }
    if (user.suspended) {
      audit(req, { actorId: user.id, action: 'admin.login.suspended', severity: 'warning', meta: { email } });
      throw forbidden('Admin account suspended.');
    }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      bumpBrute(email);
      audit(req, { actorId: user.id, action: 'admin.login.failed', severity: 'warning', meta: { email } });
      logActivity(user.id, { kind: 'admin_login_failed', ip: req.ip });
      throw unauthorized('Invalid admin credentials.');
    }

    clearBrute(email);

    const session = issueAdminSession(user, req);
    logActivity(user.id, { kind: 'admin_login_success', ip: req.ip, userAgent: req.get('user-agent') });
    audit(req, { actorId: user.id, action: 'admin.login.success', meta: { email } });
    res.json({ ok: true, admin: publicAdmin(user), ...session });
  })
);

router.post('/refresh', asyncHandler(async (req, res) => {
  const token = req.body?.refreshToken;
  const record = lookupRefresh(token);
  if (!record) throw unauthorized('Invalid or expired refresh token.');
  if (record.scope !== 'admin') throw forbidden('Not an admin refresh token.');
  const user = getUserById(record.accountId);
  if (!user || user.role !== 'admin' || user.suspended) throw unauthorized('Admin no longer available.');
  const next = rotateRefreshToken(token, { ip: req.ip, userAgent: req.get('user-agent'), scope: 'admin' });
  const access = signAdminAccessToken(user);
  res.json({ ok: true, accessToken: access, refreshToken: next.token, expiresAt: next.expiresAt });
}));

router.post('/logout', asyncHandler(async (req, res) => {
  const token = req.body?.refreshToken;
  if (token) revokeRefreshToken(token);
  res.json({ ok: true });
}));

router.get('/me', requireAdmin, (req, res) => {
  res.json({ admin: publicAdmin(req.admin) });
});

router.get('/sessions', requireAdmin, (req, res) => {
  const refreshStore = createStore('refresh_tokens', {});
  const sessions = refreshStore.list()
    .filter((r) => r.accountId === req.admin.id && r.scope === 'admin' && !r.revokedAt)
    .map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
      ip: r.ip,
      userAgent: r.userAgent,
      current: r.id === (req.adminClaims?.jti || ''), // best-effort
    }));
  res.json({ sessions });
});

router.delete('/sessions/:id', requireAdmin, (req, res, next) => {
  const refreshStore = createStore('refresh_tokens', {});
  const rec = refreshStore.get(req.params.id);
  if (!rec || rec.accountId !== req.admin.id) return next(notFound('Session not found.'));
  refreshStore.update(rec.id, (r) => ({ ...r, revokedAt: new Date().toISOString() }));
  audit(req, { action: 'admin.session.revoked', target: rec.id, targetType: 'session' });
  res.json({ ok: true });
});

router.post('/sessions/revoke-all', requireAdmin, (req, res) => {
  revokeAllForAccount(req.admin.id);
  audit(req, { action: 'admin.session.revoked_all' });
  res.json({ ok: true });
});

router.post('/change-password', requireAdmin, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) throw badRequest('Both passwords are required.');
  const ok = await verifyPassword(currentPassword, req.admin.passwordHash);
  if (!ok) throw unauthorized('Current password incorrect.');
  const passwordHash = await hashPassword(newPassword);
  await updateUser(req.admin.id, { passwordHash });
  revokeAllForAccount(req.admin.id);
  audit(req, { action: 'admin.password.changed', severity: 'warning' });
  res.json({ ok: true });
}));

/* ----------------------- invite-based admin signup ----------------------- */

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  adminRole: z.enum(ADMIN_INVITE_ROLES),
  displayName: z.string().trim().max(60).optional(),
  ttlDays: z.number().int().min(1).max(30).optional(),
});

const signupSchema = z.object({
  token: z.string().min(20),
  displayName: z.string().trim().min(2).max(60),
  password: z.string().min(8),
});

router.get('/invites', requireAdmin, requireRole(), (_req, res) => {
  res.json({ invites: listAdminInvites() });
});

router.post('/invites',
  requireAdmin, requireRole(),
  validate(inviteSchema),
  asyncHandler(async (req, res) => {
    const { email, adminRole, displayName, ttlDays } = req.body;
    const existing = findByEmail(email);
    if (existing && existing.role === 'admin') {
      throw conflict('An admin already exists with that email.');
    }
    const ttlMs = ttlDays ? ttlDays * 24 * 60 * 60 * 1000 : undefined;
    const { invite, token } = createAdminInvite({
      email, adminRole, createdBy: req.admin.id, displayName, ttlMs,
    });
    audit(req, { action: 'admin.invite.created', target: invite.id, targetType: 'admin_invite', meta: { email, adminRole } });
    res.status(201).json({
      invite,
      token,
      signupUrl: `${req.protocol}://${req.get('host')}/admin/signup?token=${token}`,
    });
  })
);

router.delete('/invites/:id', requireAdmin, requireRole(), (req, res, next) => {
  const ok = revokeAdminInvite(req.params.id, req.admin.id);
  if (!ok) return next(notFound('Invite not found or already consumed.'));
  audit(req, { action: 'admin.invite.revoked', target: req.params.id, targetType: 'admin_invite', severity: 'warning' });
  res.json({ invite: ok });
});

/** Public: validate a signup token, return the email + role the invitee will assume. */
router.get('/signup/:token', (req, res, next) => {
  const inv = findInviteByToken(req.params.token);
  if (!inv) return next(unauthorized('Invite is invalid, expired or already used.'));
  res.json({
    email: inv.email,
    adminRole: inv.adminRole,
    displayName: inv.displayName,
    expiresAt: inv.expiresAt,
  });
});

router.post('/signup',
  validate(signupSchema),
  asyncHandler(async (req, res) => {
    const { token, displayName, password } = req.body;
    const inv = findInviteByToken(token);
    if (!inv) throw unauthorized('Invite is invalid, expired or already used.');

    const issues = passwordIssues(password);
    if (issues.length) throw badRequest(issues[0], { issues });

    if (findByEmail(inv.email)) {
      throw conflict('An account with that email already exists. Ask the super admin to grant admin rights instead.');
    }

    const passwordHash = await hashPassword(password);
    const created = createUser({
      email: inv.email,
      displayName,
      passwordHash,
      emailVerified: true,
      role: 'admin',
      balance: 0,
    });
    const updated = updateUser(created.id, {
      adminRole: inv.adminRole,
      kycStatus: 'verified',
      twoFactorEnabled: false,
    });
    consumeInvite(token, created.id);

    logActivity(created.id, { kind: 'admin_signup', via: 'invite', invitedBy: inv.createdBy });

    const session = issueAdminSession(updated, req);
    // audit using a synthetic actor since they were anonymous before this call
    try {
      const { recordAudit } = await import('../../db/audit.js');
      recordAudit({
        actorId: created.id,
        actorRole: inv.adminRole,
        action: 'admin.invite.consumed',
        target: created.id,
        targetType: 'admin',
        ip: req.ip,
        userAgent: req.get('user-agent') || '',
        meta: { email: inv.email, role: inv.adminRole },
      });
    } catch { /* ignore */ }

    res.status(201).json({ ok: true, admin: publicAdmin(updated), ...session });
  })
);

export default router;
export {
  publicAdmin,
  bruteCheck, bumpBrute, clearBrute,
  issueAdminSession,
};

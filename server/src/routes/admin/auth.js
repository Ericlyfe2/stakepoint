import { Router } from 'express';
import bcrypt from 'bcrypt';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import { z } from 'zod';
import { requireAdmin, audit } from '../../middleware/adminAuth.js';
import { signAdminAccessToken, issueRefreshToken, rotateRefreshToken, revokeRefreshToken, revokeAllForAccount, verifyAccessToken } from '../../services/token.js';
import { getAdminByEmail, getAdminById, verifyAdminPassword, recordAdminLogin, setAdminPassword } from '../../db/adminAccounts.js';
import { createStore } from '../../db/store.js';
import { emitAdmin } from '../../services/realtime.js';
import { badRequest, unauthorized, forbidden } from '../../utils/httpError.js';
import { ROLE_PERMISSIONS } from '../../lib/permissions.js';

const router = Router();
const sessionStore = createStore('admin_sessions', {});
const bruteStore = createStore('admin_brute', {});

/* ---------- shared exports for routes/auth.js ---------- */

export function publicAdmin(admin) {
  return { id: admin.id, name: admin.name, email: admin.email, role: admin.adminRole, avatar: admin.avatar };
}

export function bruteCheck(email) {
  const entry = bruteStore.get(email);
  if (!entry) return;
  const windowMs = 15 * 60 * 1000;
  if (Date.now() - entry.timestamp > windowMs) {
    bruteStore.set(email, { count: 0, timestamp: Date.now() });
    return;
  }
  if (entry.count >= 5) throw unauthorized('Account temporarily locked. Try again later.');
}

export function bumpBrute(email) {
  const entry = bruteStore.get(email) || { count: 0, timestamp: Date.now() };
  entry.count += 1;
  entry.timestamp = Date.now();
  bruteStore.set(email, entry);
}

export function clearBrute(email) {
  bruteStore.set(email, { count: 0, timestamp: Date.now() });
}

export function issueAdminSession(user, req) {
  const accessToken = signAdminAccessToken(user);
  const refreshToken = issueRefreshToken(user.id, { ip: req.ip, userAgent: req.get('user-agent') });
  return { accessToken, refreshToken: refreshToken.token };
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/login', (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const admin = getAdminByEmail(email);
    if (!admin || !verifyAdminPassword(admin, password)) {
      return next(unauthorized('Invalid email or password'));
    }
    if (admin.suspended) return next(forbidden('Account suspended. Contact super admin.'));

    recordAdminLogin(admin.id, req.ip, req.get('user-agent'));

    if (admin.twoFactorEnabled) {
      const tempToken = signAdminAccessToken({ ...admin, pending2FA: true });
      return res.json({ requires2FA: true, tempToken, admin: { id: admin.id, name: admin.name, email: admin.email } });
    }

    const accessToken = signAdminAccessToken(admin);
    const refreshToken = issueRefreshToken(admin.id, {
      ip: req.ip, userAgent: req.get('user-agent'),
    });

    const session = {
      id: refreshToken.id,
      adminId: admin.id,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      ip: req.ip,
      userAgent: req.get('user-agent'),
      active: true,
    };
    sessionStore.set(session.id, session);

    audit(req, { action: 'auth.login', severity: 'info', target: admin.id, targetType: 'admin' });

    res.json({
      accessToken,
      refreshToken: refreshToken.token,
      admin: { id: admin.id, name: admin.name, email: admin.email, adminRole: admin.adminRole, avatar: admin.avatar },
      session: { id: session.id },
    });
  } catch (e) {
    if (e instanceof z.ZodError) return next(badRequest('Invalid input', e.errors));
    next(e);
  }
});

const verify2faSchema = z.object({
  tempToken: z.string().min(1),
  code: z.string().length(6),
});

router.post('/verify-2fa', (req, res, next) => {
  try {
    const { tempToken, code } = verify2faSchema.parse(req.body);
    let claims;
    try {
      claims = verifyAccessToken(tempToken);
    } catch {
      return next(unauthorized('Temporary token expired or invalid'));
    }
    if (!claims.pending2FA) return next(forbidden('Invalid token scope'));

    const admin = getAdminById(claims.sub);
    if (!admin || !admin.twoFactorSecret) return next(unauthorized('2FA not configured'));

    const verified = speakeasy.totp.verify({
      secret: admin.twoFactorSecret,
      encoding: 'base32',
      token: code,
      window: 1,
    });
    if (!verified) return next(unauthorized('Invalid verification code'));

    const accessToken = signAdminAccessToken(admin);
    const refreshToken = issueRefreshToken(admin.id, {
      ip: req.ip, userAgent: req.get('user-agent'),
    });

    const session = {
      id: refreshToken.id,
      adminId: admin.id,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      ip: req.ip,
      userAgent: req.get('user-agent'),
      active: true,
    };
    sessionStore.set(session.id, session);

    audit(req, { action: 'auth.login_2fa', severity: 'info', target: admin.id, targetType: 'admin' });

    res.json({
      accessToken,
      refreshToken: refreshToken.token,
      admin: { id: admin.id, name: admin.name, email: admin.email, adminRole: admin.adminRole, avatar: admin.avatar },
      session: { id: session.id },
    });
  } catch (e) {
    if (e instanceof z.ZodError) return next(badRequest('Invalid input', e.errors));
    next(e);
  }
});

router.post('/refresh', (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return next(badRequest('Refresh token required'));
    const result = rotateRefreshToken(refreshToken, {
      ip: req.ip, userAgent: req.get('user-agent'),
    });
    if (!result) return next(unauthorized('Invalid or expired refresh token'));
    const admin = getAdminById(result.accountId);
    if (!admin || admin.suspended) return next(forbidden('Account unavailable'));

    const session = sessionStore.get(result.id);
    if (session) {
      session.lastActivity = new Date().toISOString();
      sessionStore.set(session.id, session);
    }

    res.json({
      accessToken: signAdminAccessToken(admin),
      refreshToken: result.token,
    });
  } catch (e) {
    next(e);
  }
});

router.post('/logout', requireAdmin, (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) revokeRefreshToken(refreshToken);
  const sessionId = req.body.sessionId;
  if (sessionId) {
    const session = sessionStore.get(sessionId);
    if (session && session.adminId === req.admin.id) {
      session.active = false;
      sessionStore.set(sessionId, session);
    }
  }
  audit(req, { action: 'auth.logout', severity: 'info', target: req.admin.id, targetType: 'admin' });
  res.json({ ok: true });
});

router.post('/logout-all', requireAdmin, (req, res) => {
  revokeAllForAccount(req.admin.id);
  const sessions = sessionStore.list().filter((s) => s.adminId === req.admin.id && s.active);
  for (const s of sessions) {
    s.active = false;
    sessionStore.set(s.id, s);
  }
  audit(req, { action: 'auth.logout_all', severity: 'warning', target: req.admin.id, targetType: 'admin' });
  emitAdmin('admin:logout', { adminId: req.admin.id });
  res.json({ ok: true });
});

router.get('/me', requireAdmin, (req, res) => {
  const perms = req.admin.permissionOverrides || ROLE_PERMISSIONS[req.admin.adminRole] || [];
  res.json({
    admin: {
      id: req.admin.id,
      name: req.admin.name,
      email: req.admin.email,
      adminRole: req.admin.adminRole,
      avatar: req.admin.avatar,
      twoFactorEnabled: !!req.admin.twoFactorEnabled,
      createdAt: req.admin.createdAt,
      permissions: perms,
    },
    session: {
      id: req.adminClaims?.jti || null,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    },
  });
});

router.post('/change-password', requireAdmin, (req, res, next) => {
  try {
    const { currentPassword, newPassword } = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8).max(128),
    }).parse(req.body);
    if (!verifyAdminPassword(req.admin, currentPassword)) {
      return next(unauthorized('Current password is incorrect'));
    }
    setAdminPassword(req.admin.id, newPassword, req.admin.id);
    audit(req, { action: 'auth.password_changed', severity: 'warning', target: req.admin.id, targetType: 'admin' });
    revokeAllForAccount(req.admin.id);
    emitAdmin('admin:logout', { adminId: req.admin.id });
    res.json({ ok: true, message: 'Password changed. Please sign in again.' });
  } catch (e) {
    if (e instanceof z.ZodError) return next(badRequest('Invalid input', e.errors));
    next(e);
  }
});

export default router;

import { verifyAccessToken } from '../services/token.js';
import { getUserById } from '../db/users.js';
import { unauthorized, forbidden } from '../utils/httpError.js';

/** Required: 401 if no/invalid token. Attaches req.user. */
export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return next(unauthorized('Sign in required.'));
  const token = header.slice(7).trim();
  try {
    const claims = verifyAccessToken(token);
    const user = getUserById(claims.sub);
    if (!user)            return next(unauthorized('Account no longer exists.'));
    if (user.suspended)   return next(forbidden('Account suspended. Contact support.'));
    req.user = user;
    next();
  } catch {
    next(unauthorized('Session expired. Please sign in again.'));
  }
}

/** Stricter gate for money-out flows that require a verified email. */
export function requireEmailVerified(req, _res, next) {
  if (!req.user?.emailVerified) return next(forbidden('Email not verified.'));
  next();
}

/** Optional: attach req.user if token is valid, never reject. */
export function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    try {
      const claims = verifyAccessToken(header.slice(7).trim());
      const user = getUserById(claims.sub);
      if (user && !user.suspended) req.user = user;
    } catch { /* ignore */ }
  }
  next();
}

export function requireAdmin(req, _res, next) {
  if (req.user?.role === 'admin') return next();
  next(forbidden('Admin only.'));
}

import { getSettings } from '../db/settings.js';

/**
 * Paths that stay reachable while maintenance is on. Each entry earns its
 * place — removing one has a concrete failure mode:
 *
 *  /api/health          Render's health check. Blocking it makes the platform
 *                       mark the container unhealthy and restart it mid-maintenance.
 *  /api/settings/public Where the client reads the flag from. Blocking it means
 *                       the frontend can't tell "maintenance" from "backend down".
 *  /api/admin           The whole admin surface, including /api/admin/auth —
 *                       otherwise you can't turn maintenance back off.
 *  /api/auth/*          Admin sign-in goes through the *unified* login route
 *                       (routes/auth.js returns kind: 'admin'), so these are
 *                       lockout insurance, not a hole in the user block.
 */
const ALLOW_PREFIXES = [
  '/api/health',
  '/api/settings/public',
  '/api/admin',
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/auth/config',
];

/** How long clients (and crawlers) should wait before retrying. */
const RETRY_AFTER_SECONDS = 300;

function isAllowed(path) {
  return ALLOW_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Blocks user-facing API traffic with 503 while `settings.maintenance` is on.
 *
 * The flag is read from the settings store on *every* request — never captured
 * at boot — so toggling it from the admin panel takes effect on the next
 * request with no redeploy and no restart.
 *
 * Non-/api requests pass through: in production the server also serves the SPA
 * shell, and the client-side gate needs to load in order to render its blank
 * maintenance page (and admins need the shell to reach /admin at all).
 */
export function maintenanceGate(req, res, next) {
  if (req.method === 'OPTIONS') return next();        // never break CORS preflight
  if (!req.path.startsWith('/api')) return next();    // SPA shell + static assets
  if (isAllowed(req.path)) return next();

  const { maintenance, maintenanceMessage } = getSettings();
  if (!maintenance) return next();

  res.set('Retry-After', String(RETRY_AFTER_SECONDS));
  res.set('Cache-Control', 'no-store');
  return res.status(503).json({
    error: maintenanceMessage || 'Platform is undergoing scheduled maintenance. Please check back shortly.',
    maintenance: true,
  });
}

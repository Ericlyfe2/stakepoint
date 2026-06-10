/**
 * Origin allowlist predicate shared by Express CORS middleware and Socket.IO.
 *
 * Sources of truth:
 *   - CORS_ORIGIN (env) → exact-match list of frontend origins
 *   - CORS_ALLOW_VERCEL (env, optional) → name of a Vercel project whose
 *     preview deployments should also be allowed. When set, any origin
 *     matching `https://<prefix>.vercel.app` or `https://<prefix>-*.vercel.app`
 *     is allowed in production — covers both the canonical production URL
 *     and the per-commit/per-branch preview URLs Vercel mints.
 *
 * Why a function (not a static array): Vercel preview URLs change on every
 * commit, so a static allowlist would force a server redeploy every time the
 * frontend gets a new preview. The regex stays narrow — must start with the
 * configured project prefix and end with `.vercel.app` exactly — so it can't
 * be tricked by a `*-oddsify-client.vercel.app` subdomain takeover.
 */

const VERCEL_HOST = 'vercel.app';

/**
 * Build a one-shot predicate from the current env values. Call once at
 * startup and reuse for every request — cheaper than re-parsing each time.
 */
export function buildOriginAllowlist({ isProd, allowedOrigins, vercelProject }) {
  // Escape so a project name like "foo.bar" can't bypass the regex.
  const safePrefix = String(vercelProject || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const vercelPattern = safePrefix
    ? new RegExp(`^https://${safePrefix}(-[\\w-]+)?\\.${VERCEL_HOST.replace(/\./g, '\\.')}$`)
    : null;

  return function isAllowed(origin) {
    // Non-browser callers (curl, server-to-server, health checks) have no
    // Origin header — let those through; the JWT layer still gates write paths.
    if (!origin) return true;

    // Dev convenience: every localhost / LAN origin is allowed when the
    // server is running in development. Production never auto-allows these.
    if (!isProd) {
      if (
        origin.startsWith('http://localhost') ||
        origin.startsWith('http://127.0.0.1') ||
        origin.startsWith('http://192.168.')
      ) return true;
    }

    if (allowedOrigins.includes(origin)) return true;
    if (vercelPattern && vercelPattern.test(origin)) return true;
    return false;
  };
}

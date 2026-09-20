import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

// Same base convention as betApi.js / adminApi.js: unset in dev (Vite proxies
// /api), set to the deployed backend in production.
const ENDPOINT = `${import.meta.env.VITE_API_BASE || ''}/api/settings/public`;

// Short relative to betApi's 60s: a hibernating backend should fail *open*
// quickly rather than leaving visitors on a blank screen for a minute.
const CHECK_TIMEOUT_MS = 8_000;

/**
 * Blocks the player-facing app while maintenance is on.
 *
 * This is a courtesy gate, not the enforcement — the server's maintenanceGate
 * middleware is what actually stops traffic. This exists so visitors get a
 * clean blank page instead of a wall of failed requests.
 *
 * Four rules:
 *  - Renders nothing until the check resolves, so the app never flashes into
 *    view and then vanishes.
 *  - Fails open: any error, timeout, or non-OK response shows the app. A
 *    network blip must never blackhole a healthy site.
 *  - Never mounted on /admin/* (see App.jsx), so admins can always get back in.
 *  - Always lets /login?next=/admin/... through, maintenance or not. /admin/*
 *    is exempt from this gate, but every path into it (AdminGuard, the
 *    /admin/login redirect) funnels through the shared, otherwise-gated
 *    /login page first — without this, an admin whose session expired (or
 *    who's on a fresh browser) during maintenance would have no way back in
 *    to turn it back off. See App.jsx's /maintance escape-hatch route.
 */
export default function MaintenanceGate({ children }) {
  // null = still checking, true/false = resolved.
  const [blocked, setBlocked] = useState(null);
  const loc = useLocation();
  const isAdminLoginEscape = loc.pathname === '/login'
    && (new URLSearchParams(loc.search).get('next') || '').startsWith('/admin');

  useEffect(() => {
    let cancelled = false;
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), CHECK_TIMEOUT_MS) : null;

    (async () => {
      try {
        const res = await fetch(ENDPOINT, { signal: ctl?.signal, cache: 'no-store' });
        if (!res.ok) throw new Error(`settings check failed: ${res.status}`);
        const body = await res.json();
        if (!cancelled) setBlocked(body.maintenance === true);
      } catch {
        if (!cancelled) setBlocked(false); // fail open
      } finally {
        if (timer) clearTimeout(timer);
      }
    })();

    return () => { cancelled = true; if (timer) clearTimeout(timer); ctl?.abort(); };
  }, []);

  if (isAdminLoginEscape) return children;
  if (blocked === null) return null;
  if (blocked) return <div aria-hidden="true" style={BLANK} />;
  return children;
}

// A deliberately empty full-viewport surface, painted with the app background
// so it reads as "blank page" rather than "broken render".
const BLANK = { minHeight: '100vh', background: 'var(--bg, #fff)' };

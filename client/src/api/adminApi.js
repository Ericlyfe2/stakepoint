/**
 * Admin API client. Mirrors the storefront client but uses a separate token
 * pair under different localStorage keys so admins and players can be signed
 * in side-by-side in the same browser without stepping on each other.
 */

// See betApi.js — set VITE_API_BASE in production to point at the backend host.
const API_BASE = (import.meta.env.VITE_API_BASE || '') + '/api/admin';
const ACCESS  = 'sp_admin_access';
const REFRESH = 'sp_admin_refresh';

const ls = typeof localStorage !== 'undefined' ? localStorage : null;

export const setAdminTokens = (access, refresh) => {
  if (!ls) return;
  if (access)  ls.setItem(ACCESS,  access);  else ls.removeItem(ACCESS);
  if (refresh) ls.setItem(REFRESH, refresh); else ls.removeItem(REFRESH);
};
export const getAdminAccess  = () => ls?.getItem(ACCESS) || null;
export const getAdminRefresh = () => ls?.getItem(REFRESH) || null;
export const clearAdminTokens = () => { ls?.removeItem(ACCESS); ls?.removeItem(REFRESH); };

let refreshInflight = null;

async function rawFetch(path, opts = {}, retry = true) {
  const headers = new Headers(opts.headers || {});
  if (opts.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const access = getAdminAccess();
  if (access && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${access}`);
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  if (res.status !== 401 || !retry) return res;

  const refresh = getAdminRefresh();
  if (!refresh) return res;
  try {
    refreshInflight = refreshInflight || (async () => {
      const r = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      if (!r.ok) throw new Error('admin refresh failed');
      const j = await r.json();
      setAdminTokens(j.accessToken, j.refreshToken);
      return j.accessToken;
    })();
    await refreshInflight;
  } catch {
    clearAdminTokens();
    return res;
  } finally {
    refreshInflight = null;
  }
  return rawFetch(path, opts, false);
}

async function jsonOrThrow(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || res.statusText || 'Request failed');
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

const get   = (p)        => rawFetch(p).then(jsonOrThrow);
const post  = (p, body)  => rawFetch(p, { method: 'POST',   body: JSON.stringify(body || {}) }).then(jsonOrThrow);
const patch_= (p, body)  => rawFetch(p, { method: 'PATCH',  body: JSON.stringify(body || {}) }).then(jsonOrThrow);
const del   = (p)        => rawFetch(p, { method: 'DELETE' }).then(jsonOrThrow);
const put_   = (p, body) => rawFetch(p, { method: 'PUT',    body: JSON.stringify(body || {}) }).then(jsonOrThrow);

const qs = (params = {}) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.set(k, v);
  const s = u.toString();
  return s ? `?${s}` : '';
};

/* auth */
export const adminLogin     = (body) => post('/auth/login', body);
export const adminVerify2fa = (body) => post('/auth/verify-2fa', body);
export const adminMe        = ()     => get('/auth/me');
export const adminLogout    = ()     => post('/auth/logout', { refreshToken: getAdminRefresh() });
export const adminSessions  = ()     => get('/auth/sessions');
export const adminRevokeSession = (id) => del(`/auth/sessions/${id}`);
export const adminRevokeAll = ()     => post('/auth/sessions/revoke-all');
export const adminEnable2faStart = () => post('/auth/2fa/start');
export const adminEnable2fa = (code) => post('/auth/2fa/enable', { code });
export const adminDisable2fa= (password) => post('/auth/2fa/disable', { password });
export const adminChangePassword = (currentPassword, newPassword) =>
  post('/auth/change-password', { currentPassword, newPassword });

/* invites (super-admin only for create / revoke / list) */
export const adminListInvites    = ()     => get('/auth/invites');
export const adminCreateInvite   = (body) => post('/auth/invites', body);
export const adminRevokeInvite   = (id)   => del(`/auth/invites/${id}`);
// public — no token needed; we hit them through the same admin /api/admin/auth namespace
export const adminInvitePreview  = async (token) => {
  const res = await fetch(`${API_BASE}/auth/signup/${encodeURIComponent(token)}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error(body.error || res.statusText); err.status = res.status; throw err; }
  return body;
};
export const adminSignup = async (body) => {
  const res = await fetch(`${API_BASE}/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error(data.error || res.statusText || 'Sign-up failed'); err.status = res.status; err.body = data; throw err; }
  return data;
};

/* dashboard */
export const adminOverview = () => get('/dashboard/overview');
export const adminHealth   = () => get('/dashboard/health');
export const adminAudit    = (params) => get(`/dashboard/audit${qs(params)}`);

/* users */
export const adminListUsers     = (params) => get(`/users${qs(params)}`);
export const adminGetUser       = (id) => get(`/users/${encodeURIComponent(id)}`);
export const adminUserBets      = (id) => get(`/users/${encodeURIComponent(id)}/bets`);
export const adminUserTx        = (id) => get(`/users/${encodeURIComponent(id)}/transactions`);
export const adminUserLogins    = (id) => get(`/users/${encodeURIComponent(id)}/login-history`);
export const adminUserStatus    = (id, action, reason) => patch_(`/users/${encodeURIComponent(id)}/status`, { action, reason });
export const adminUserKyc       = (id, status, note)   => patch_(`/users/${encodeURIComponent(id)}/kyc`,    { status, note });
export const adminUserWallet    = (id, delta, reason)  => patch_(`/users/${encodeURIComponent(id)}/wallet`, { delta, reason });
export const adminUserTags      = (id, tags)           => patch_(`/users/${encodeURIComponent(id)}/tags`,   { tags });
export const adminUserNotes     = (id, notes)          => patch_(`/users/${encodeURIComponent(id)}/notes`,  { notes });
export const adminUserReset     = (id) => post(`/users/${encodeURIComponent(id)}/reset-password`);

/* bets */
export const adminListBets   = (params) => get(`/bets${qs(params)}`);
export const adminLiveBets   = ()     => get('/bets/live');
export const adminGetBet     = (id)   => get(`/bets/${encodeURIComponent(id)}`);
export const adminSettleBet  = (id, body) => post(`/bets/${encodeURIComponent(id)}/settle`, body);
export const adminCancelBet  = (id, reason) => post(`/bets/${encodeURIComponent(id)}/cancel`, { reason });
export const adminNoteBet    = (id, note)   => post(`/bets/${encodeURIComponent(id)}/note`, { note });

/* sports & odds */
export const adminFixtures      = (params) => get(`/sports/fixtures${qs(params)}`);
export const adminFixture       = (id)     => get(`/sports/fixtures/${encodeURIComponent(id)}`);
export const adminCreateFixture = (body)   => post('/sports/fixtures', body);
export const adminPatchFixture  = (id, body) => patch_(`/sports/fixtures/${encodeURIComponent(id)}`, body);
export const adminDeleteFixture = (id)     => del(`/sports/fixtures/${encodeURIComponent(id)}`);
export const adminPatchOdds     = (id, body) => patch_(`/sports/fixtures/${encodeURIComponent(id)}/odds`, body);
export const adminResetOdds     = (id)     => del(`/sports/fixtures/${encodeURIComponent(id)}/odds`);
export const adminSuspend       = (id, body) => post(`/sports/fixtures/${encodeURIComponent(id)}/suspend`, body);
export const adminClearSuspend  = (id)     => del(`/sports/fixtures/${encodeURIComponent(id)}/suspend`);
export const adminRecordResult  = (id, body) => post(`/sports/fixtures/${encodeURIComponent(id)}/result`, body);
export const adminTriggerSettle = (id)     => post(`/sports/fixtures/${encodeURIComponent(id)}/settle`);
export const adminLeagues       = ()       => get('/sports/leagues');
export const adminCreateLeague  = (body)   => post('/sports/leagues', body);
export const adminAddMarket     = (id, body) => post(`/sports/fixtures/${encodeURIComponent(id)}/markets`, body);
export const adminRemoveMarket  = (id, marketKey) => del(`/sports/fixtures/${encodeURIComponent(id)}/markets/${encodeURIComponent(marketKey)}`);

/* promotions */
export const adminListPromotions  = ()     => get('/promotions');
export const adminCreatePromotion = (body) => post('/promotions', body);
export const adminPatchPromotion  = (id, body) => patch_(`/promotions/${encodeURIComponent(id)}`, body);
export const adminDeletePromotion = (id)   => del(`/promotions/${encodeURIComponent(id)}`);

/* stats */
export const adminStatsSummary    = (window) => get(`/stats/summary${qs({ window })}`);
export const adminStatsTopPlayers = ()       => get('/stats/top-players');
export const adminStatsSports     = ()       => get('/stats/sports');
export const adminStatsCohorts    = (weeks)  => get(`/stats/cohorts${qs({ weeks })}`);
export const adminStatsFunnel     = ()       => get('/stats/funnel');
export const adminStatsDaily      = (window) => get(`/stats/daily${qs({ window })}`);

/* finance + fraud (dashboard aggregates) */
export const adminFinance = () => get('/dashboard/finance');
export const adminFraud   = () => get('/dashboard/fraud');

/* notifications (broadcasts) */
export const adminListNotifications  = ()         => get('/notifications');
export const adminCreateNotification = (body)     => post('/notifications', body);
export const adminDeleteNotification = (id)       => del(`/notifications/${encodeURIComponent(id)}`);

/* support tickets */
export const adminListTickets  = (status)         => get(`/support/tickets${qs({ status })}`);
export const adminGetTicket    = (id)             => get(`/support/tickets/${encodeURIComponent(id)}`);
export const adminReplyTicket  = (id, body)       => post(`/support/tickets/${encodeURIComponent(id)}/reply`, { body });
export const adminPatchTicket  = (id, status)     => patch_(`/support/tickets/${encodeURIComponent(id)}`, { status });

/* providers */
export const adminProviders      = ()    => get('/providers');
export const adminProviderLogs   = (provider, limit) => get(`/providers/logs${qs({ provider, limit })}`);
export const adminAggregatedOdds = ()    => get('/providers/odds');
export const adminProviderRefresh= ()    => post('/providers/refresh');
export const adminProviderTest   = (id)  => post(`/providers/${encodeURIComponent(id)}/test`);

/* bulk operations */
export const adminBulkBets       = (body) => post('/bets/bulk', body);
export const adminBulkFixtures   = (body) => post('/sports/fixtures/bulk', body);

/* impersonation */
export const adminImpersonate    = (id)   => post(`/users/${encodeURIComponent(id)}/impersonate`);

/* platform settings */
export const adminGetSettings    = ()     => get('/settings');
export const adminUpdateSettings = (body) => put_('/settings', body);

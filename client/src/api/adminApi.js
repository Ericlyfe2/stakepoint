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
export const adminHealthMetrics = () => get('/dashboard/health/metrics');
export const adminAudit    = (params) => get(`/dashboard/audit${qs(params)}`);

/* users */
export const adminListUsers     = (params) => get(`/users${qs(params)}`);
export const adminGetUser       = (id) => get(`/users/${encodeURIComponent(id)}`);
export const adminUserBets      = (id) => get(`/users/${encodeURIComponent(id)}/bets`);
export const adminUserTx        = (id) => get(`/users/${encodeURIComponent(id)}/transactions`);
export const adminUserLogins    = (id) => get(`/users/${encodeURIComponent(id)}/login-history`);
export const adminUserStatus    = (id, action, reason) => patch_(`/users/${encodeURIComponent(id)}/status`, { action, reason });
export const adminUserKyc       = (id, status, note)   => patch_(`/users/${encodeURIComponent(id)}/kyc`,    { status, note });
export const adminUserStage     = (id, stage, note)    => patch_(`/users/${encodeURIComponent(id)}/stage`,  { stage, note });
export const adminUserBlocked   = (id, blocked, note)  => patch_(`/users/${encodeURIComponent(id)}/blocked`,{ blocked, note });
export const adminUserWallet    = (id, delta, reason)  => patch_(`/users/${encodeURIComponent(id)}/wallet`, { delta, reason });
export const adminUserTags      = (id, tags)           => patch_(`/users/${encodeURIComponent(id)}/tags`,   { tags });
export const adminUserNotes     = (id, notes)          => patch_(`/users/${encodeURIComponent(id)}/notes`,  { notes });
export const adminUserReset     = (id) => post(`/users/${encodeURIComponent(id)}/reset-password`);
export const adminCreateUser    = (body) => post('/users', body);
export const adminDeleteUser    = (id, reason) =>
  rawFetch(`/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    body: JSON.stringify({ reason }),
  }).then(jsonOrThrow);
export const adminBulkDeleteUsers = (ids, reason) => post('/users/bulk-delete', { ids, reason });
export const adminDeleteAllUsers  = (reason)      => post('/users/delete-all', { reason });
export const adminUserCredentials = (id) => get(`/users/${encodeURIComponent(id)}/credentials`);
export const adminUserAccountStatus = (id, accountStatus, note) => patch_(`/users/${encodeURIComponent(id)}/account-status`, { accountStatus, note });
export const adminBulkAccountStatus = (ids, accountStatus, note) => post('/users/bulk-account-status', { ids, accountStatus, note });

/* bets */
export const adminListBets   = (params) => get(`/bets${qs(params)}`);
export const adminLiveBets   = ()     => get('/bets/live');
export const adminGetBet     = (id)   => get(`/bets/${encodeURIComponent(id)}`);
export const adminSettleBet  = (id, body) => post(`/bets/${encodeURIComponent(id)}/settle`, body);
export const adminCancelBet  = (id, reason) => post(`/bets/${encodeURIComponent(id)}/cancel`, { reason });
export const adminNoteBet    = (id, note)   => post(`/bets/${encodeURIComponent(id)}/note`, { note });
export const adminDeleteBet  = (id, reason) => post(`/bets/${encodeURIComponent(id)}/delete`,  { reason });
export const adminRestoreBet = (id)   => post(`/bets/${encodeURIComponent(id)}/restore`);

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

/* teams CRUD */
export const adminTeamsList    = ()     => get('/teams');
export const adminCreateTeam   = (body) => post('/teams', body);
export const adminUpdateTeam   = (id, body) => put_(`/teams/${encodeURIComponent(id)}`, body);
export const adminDeleteTeam   = (id)   => del(`/teams/${encodeURIComponent(id)}`);

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

/* deposits */
export const adminListPendingDeposits = ()    => get('/deposits/pending');
export const adminApproveDeposit     = (id)  => post(`/deposits/${encodeURIComponent(id)}/approve`);
export const adminRejectDeposit      = (id, body) => post(`/deposits/${encodeURIComponent(id)}/reject`, body);

/* admin management */
export const adminListAdmins = (params) => get(`/management${qs(params)}`);
export const adminGetAdmin = (id) => get(`/management/${encodeURIComponent(id)}`);
export const adminCreateAdmin = (body) => post('/management', body);
export const adminUpdateAdmin = (id, body) => put_(`/management/${encodeURIComponent(id)}`, body);
export const adminDeleteAdmin = (id) => del(`/management/${encodeURIComponent(id)}`);
export const adminResetAdminPassword = (id, newPassword) => post(`/management/${encodeURIComponent(id)}/reset-password`, { newPassword });
export const adminAdminStats = () => get('/management/stats');
export const adminAdminSessions = () => get('/management/sessions');
export const adminBulkUpdateAdmins = (body) => post('/management/bulk-update', body);

/* audit */
export const adminAuditLog = (params) => get(`/management/audit-log${qs(params)}`);
export const adminAuditStats = () => get('/management/audit-stats');

/* leagues CRUD (sports admin) */
export const adminUpdateLeague = (id, body) => patch_(`/sports/leagues/${encodeURIComponent(id)}`, body);
export const adminDeleteLeague = (id) => del(`/sports/leagues/${encodeURIComponent(id)}`);

/* result management */
export const adminEnterResult = (fixtureId, body) => post(`/sports/fixtures/${encodeURIComponent(fixtureId)}/result`, body);
export const adminReverseResult = (fixtureId) => del(`/sports/fixtures/${encodeURIComponent(fixtureId)}/result`);
export const adminTriggerSettlement = (fixtureId) => post(`/sports/fixtures/${encodeURIComponent(fixtureId)}/settle`);
export const adminReverseSettlement = (fixtureId) => post(`/sports/fixtures/${encodeURIComponent(fixtureId)}/reverse-settle`);

/* withdrawals management */
export const adminListWithdrawals = (params) => get(`/withdrawals${qs(params)}`);
export const adminWithdrawalStats = () => get('/withdrawals/stats');

/* platform settings */
export const adminGetSettings    = ()     => get('/settings');
export const adminUpdateSettings = (body) => put_('/settings', body);

/* market templates */
export const adminListMarkets = (params) => get(`/markets${qs(params)}`);
export const adminGetMarket    = (key) => get(`/markets/${encodeURIComponent(key)}`);
export const adminCreateMarket = (body) => post('/markets', body);
export const adminUpdateMarket = (key, body) => put_(`/markets/${encodeURIComponent(key)}`, body);
export const adminPatchMarket  = (key, body) => patch_(`/markets/${encodeURIComponent(key)}`, body);
export const adminDeleteMarket = (key) => del(`/markets/${encodeURIComponent(key)}`);

/* trading desk / exposure */
export const adminExposureOverview = () => get('/exposure/overview');
export const adminExposureFixtures = () => get('/exposure/fixtures');

/* results & settlement */
export const adminSettlementQueue = () => get('/settlement/queue');
export const adminSettlementFixtures = (params) => get(`/settlement/fixtures${qs(params)}`);
export const adminSettlementRecordResult = (id, body) => post(`/settlement/fixtures/${encodeURIComponent(id)}/result`, body);
export const adminSettlementTrigger = (id) => post(`/settlement/fixtures/${encodeURIComponent(id)}/settle`);
export const adminSettlementSettleBet = (id, body) => post(`/settlement/bets/${encodeURIComponent(id)}/settle`, body);
export const adminSettlementBulk = (body) => post('/settlement/bulk', body);

/* KYC */
export const adminListKyc        = (params) => get(`/kyc${qs(params)}`);
export const adminGetKyc         = (id) => get(`/kyc/${encodeURIComponent(id)}`);
export const adminApproveKyc     = (id, note) => post(`/kyc/${encodeURIComponent(id)}/approve`, { note });
export const adminRejectKyc      = (id, reason) => post(`/kyc/${encodeURIComponent(id)}/reject`, { reason });
export const adminKycStats       = () => get('/kyc/stats');

/* Reports */
export const adminRevenueReport       = () => get('/reports/revenue');
export const adminPlayerReport        = () => get('/reports/players');
export const adminOperationalReport   = () => get('/reports/operational');
export const adminListExports         = () => get('/reports/export');
export const adminCreateExport        = (body) => post('/reports/export', body);

/* Bonuses */
export const adminListBonuses   = (params) => get(`/bonuses${qs(params)}`);
export const adminGetBonus      = (id) => get(`/bonuses/${encodeURIComponent(id)}`);
export const adminCreateBonus   = (body) => post('/bonuses', body);
export const adminUpdateBonus   = (id, body) => patch_(`/bonuses/${encodeURIComponent(id)}`, body);
export const adminDeleteBonus   = (id) => del(`/bonuses/${encodeURIComponent(id)}`);
export const adminIssueBonus    = (id, body) => post(`/bonuses/${encodeURIComponent(id)}/issue`, body);
export const adminClawbackBonus = (id) => post(`/bonuses/${encodeURIComponent(id)}/clawback`);
export const adminBonusStats    = () => get('/bonuses/stats');

/* Referrals */
export const adminReferralStats   = () => get('/referrals');
export const adminReferralPayouts = () => get('/referrals/payouts');
export const adminCreateReferralPayout = (body) => post('/referrals/payouts', body);

/* Promo Codes */
export const adminListCodes   = (params) => get(`/codes${qs(params)}`);
export const adminGetCode     = (id) => get(`/codes/${encodeURIComponent(id)}`);
export const adminCreateCode  = (body) => post('/codes', body);
export const adminBulkCreateCodes = (body) => post('/codes/bulk', body);
export const adminUpdateCode  = (id, body) => patch_(`/codes/${encodeURIComponent(id)}`, body);
export const adminDeleteCode  = (id) => del(`/codes/${encodeURIComponent(id)}`);
export const adminCodeStats   = () => get('/codes/stats');

/* Cashout */
export const adminCashoutRules    = () => get('/cashout/rules');
export const adminUpdateCashoutRules = (body) => put_('/cashout/rules', body);
export const adminCashoutOffers   = () => get('/cashout/offers');
export const adminCashoutStats    = () => get('/cashout/stats');

/* CMS */
export const adminListPages        = (params) => get(`/cms/pages${qs(params)}`);
export const adminGetPage          = (id) => get(`/cms/pages/${encodeURIComponent(id)}`);
export const adminCreatePage       = (body) => post('/cms/pages', body);
export const adminUpdatePage       = (id, body) => patch_(`/cms/pages/${encodeURIComponent(id)}`, body);
export const adminDeletePage       = (id) => del(`/cms/pages/${encodeURIComponent(id)}`);
export const adminListBanners      = (params) => get(`/cms/banners${qs(params)}`);
export const adminCreateBanner     = (body) => post('/cms/banners', body);
export const adminUpdateBanner     = (id, body) => patch_(`/cms/banners/${encodeURIComponent(id)}`, body);
export const adminDeleteBanner     = (id) => del(`/cms/banners/${encodeURIComponent(id)}`);
export const adminListAnnouncements = () => get('/cms/announcements');
export const adminCreateAnnouncement = (body) => post('/cms/announcements', body);
export const adminDeleteAnnouncement = (id) => del(`/cms/announcements/${encodeURIComponent(id)}`);

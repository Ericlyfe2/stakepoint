/**
 * Admin dashboard aggregations.
 * Computes everything on-demand from the JSON stores. Cheap at this scale —
 * when this app moves to Postgres these become SQL views.
 */
import { Router } from 'express';
import { createStore } from '../../db/store.js';
import { allUsers } from '../../db/users.js';
import { auditStats, listAudit } from '../../db/audit.js';
import { requireAdmin } from '../../middleware/adminAuth.js';
import { SPORTS } from '../../matchesData.js';
import { oddsApiStatus } from '../../services/oddsApi.js';
import { SMTP, GOOGLE } from '../../config/env.js';
import { getMetricsWindow } from '../../services/metrics.js';

const router = Router();

const betsStore = createStore('bets', {});
const txStore   = createStore('transactions', {});
const refreshStore = createStore('refresh_tokens', {});

const DAY = 86_400_000;
const HOUR = 3_600_000;

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function dayKey(d) {
  const x = startOfDay(d);
  if (Number.isNaN(x.getTime())) return null;
  return x.toISOString().slice(0, 10);
}
function lastNDays(n) {
  const out = [];
  const today = startOfDay(new Date());
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY);
    out.push({ key: dayKey(d), date: d.toISOString() });
  }
  return out;
}

function liveMatchesCount() {
  let n = 0;
  for (const sp of SPORTS) {
    for (const lg of sp.leagues || []) {
      for (const m of lg.matches || []) if (m.isLive) n++;
    }
  }
  return n;
}

function flattenTransactions() {
  return Object.values(txStore.all() || {}).flat();
}

router.get('/overview', requireAdmin, (req, res) => {
  const users = allUsers();
  const bets  = Object.values(betsStore.all() || {});
  const tx    = flattenTransactions();
  const now   = Date.now();

  const since24h = now - DAY;
  const since30d = now - 30 * DAY;
  const since7d  = now - 7 * DAY;

  const usersTotal = users.length;
  const usersAdmin = users.filter((u) => u.role === 'admin').length;
  const usersSuspended = users.filter((u) => u.suspended).length;
  const usersKycPending = users.filter((u) => (u.kycStatus || 'unverified') === 'pending').length;
  const usersNew24h = users.filter((u) => new Date(u.createdAt).getTime() > since24h).length;
  const usersNew7d  = users.filter((u) => new Date(u.createdAt).getTime() > since7d).length;

  const activeRefresh = refreshStore.list().filter((r) => !r.revokedAt && new Date(r.expiresAt) > new Date(now));
  const onlineUsers = new Set(activeRefresh.filter((r) => r.scope !== 'admin' && now - new Date(r.createdAt).getTime() < 6 * HOUR).map((r) => r.accountId)).size;
  const onlineAdmins = new Set(activeRefresh.filter((r) => r.scope === 'admin').map((r) => r.accountId)).size;

  const bets24h = bets.filter((b) => new Date(b.placedAt).getTime() > since24h);
  const betsOpen = bets.filter((b) => b.status === 'open').length;
  const betsSettled = bets.filter((b) => b.status === 'won' || b.status === 'lost' || b.status === 'void').length;
  const betsCashed = bets.filter((b) => b.status === 'cashed_out').length;

  const stake24h     = bets24h.reduce((s, b) => s + (b.stake || 0), 0);
  const stakeTotal   = bets.reduce((s, b) => s + (b.stake || 0), 0);
  const payoutsTotal = bets.filter((b) => b.status === 'won').reduce((s, b) => s + (b.potentialWin || 0), 0);
  const cashoutTotal = bets.filter((b) => b.status === 'cashed_out').reduce((s, b) => s + (b.cashOut || 0), 0);
  const ggr24h       = bets24h.reduce((s, b) => s + (b.status === 'won' ? -(b.potentialWin - b.stake) : (b.stake || 0)), 0);

  const deposits   = tx.filter((t) => t.kind === 'deposit');
  const withdraws  = tx.filter((t) => t.kind === 'withdraw');
  const pendingWd  = withdraws.filter((t) => t.status === 'pending');
  const deposits24h  = deposits.filter((t) => new Date(t.at).getTime() > since24h);
  const withdraws24h = withdraws.filter((t) => new Date(t.at).getTime() > since24h);
  const depositSum24h  = deposits24h.reduce((s, t) => s + (t.amount || 0), 0);
  const withdrawSum24h = withdraws24h.reduce((s, t) => s + Math.abs(t.amount || 0), 0);

  // 30-day chart series ------------------------------------------------------
  const grid30 = lastNDays(30);
  const userGrowth = grid30.map(({ key, date }) => ({
    date: key,
    value: users.filter((u) => dayKey(u.createdAt) === key).length,
  }));
  const betsByDay = grid30.map(({ key, date }) => ({
    date: key,
    bets: bets.filter((b) => dayKey(b.placedAt) === key).length,
    stake: Number(bets.filter((b) => dayKey(b.placedAt) === key).reduce((s, b) => s + (b.stake || 0), 0).toFixed(2)),
  }));
  const revenueByDay = grid30.map(({ key }) => {
    const day = bets.filter((b) => dayKey(b.placedAt) === key);
    const stake = day.reduce((s, b) => s + (b.stake || 0), 0);
    const payout = day.filter((b) => b.status === 'won').reduce((s, b) => s + (b.potentialWin || 0), 0) +
                   day.filter((b) => b.status === 'cashed_out').reduce((s, b) => s + (b.cashOut || 0), 0);
    return { date: key, revenue: Number((stake - payout).toFixed(2)), stake: Number(stake.toFixed(2)), payout: Number(payout.toFixed(2)) };
  });
  const depositsByDay = grid30.map(({ key }) => ({
    date: key,
    deposits: Number(deposits.filter((t) => dayKey(t.at) === key).reduce((s, t) => s + (t.amount || 0), 0).toFixed(2)),
    withdraws: Number(withdraws.filter((t) => dayKey(t.at) === key).reduce((s, t) => s + Math.abs(t.amount || 0), 0).toFixed(2)),
  }));

  // Sport mix by stake
  const sportMix = {};
  for (const b of bets) {
    for (const leg of b.legs || []) {
      const sp = (leg.sport || 'football').toLowerCase();
      sportMix[sp] = (sportMix[sp] || 0) + (b.stake || 0);
    }
  }
  const sportShare = Object.entries(sportMix).map(([sport, stake]) => ({ sport, stake: Number(stake.toFixed(2)) }));

  // Status mix for bets
  const statusMix = ['open', 'won', 'lost', 'void', 'cashed_out'].map((s) => ({
    status: s,
    count: bets.filter((b) => b.status === s).length,
  }));

  // Hour-of-day heatmap (7 days x 24 hrs) of bets count
  const heatmap = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  const last7 = bets.filter((b) => now - new Date(b.placedAt).getTime() < 7 * DAY);
  for (const b of last7) {
    const d = new Date(b.placedAt);
    const dow = (d.getDay() + 6) % 7; // Mon=0
    heatmap[dow][d.getHours()]++;
  }

  // Recent activity feed
  const recent = [];
  for (const u of users.slice().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, 12)) {
    for (const a of (u.activity || []).slice(0, 3)) {
      recent.push({ kind: a.kind, user: u.email, at: a.at, meta: a });
    }
  }
  recent.sort((a, b) => (a.at < b.at ? 1 : -1));

  const audits = auditStats();
  const fraudAlerts = listAudit({ severity: 'critical', limit: 20 }).concat(listAudit({ severity: 'warning', limit: 20 }));

  res.json({
    generatedAt: new Date().toISOString(),
    health: {
      api: 'ok',
      smtp: SMTP.enabled,
      google: GOOGLE.enabled,
      oddsApi: oddsApiStatus(),
      uptimeSec: Math.floor(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
    kpis: {
      usersTotal,
      usersAdmin,
      usersSuspended,
      usersKycPending,
      usersNew24h,
      usersNew7d,
      onlineUsers,
      onlineAdmins,
      betsTotal: bets.length,
      bets24h: bets24h.length,
      betsOpen,
      betsSettled,
      betsCashed,
      stake24h: Number(stake24h.toFixed(2)),
      stakeTotal: Number(stakeTotal.toFixed(2)),
      payoutsTotal: Number(payoutsTotal.toFixed(2)),
      cashoutTotal: Number(cashoutTotal.toFixed(2)),
      ggr24h: Number(ggr24h.toFixed(2)),
      depositSum24h: Number(depositSum24h.toFixed(2)),
      withdrawSum24h: Number(withdrawSum24h.toFixed(2)),
      pendingWithdrawals: pendingWd.length,
      liveMatches: liveMatchesCount(),
      auditTotal: audits.total,
      auditCritical24h: audits.critical24h,
      auditWarning24h: audits.warning24h,
    },
    charts: {
      userGrowth,
      betsByDay,
      revenueByDay,
      depositsByDay,
      sportShare,
      statusMix,
      heatmap,
    },
    recent: recent.slice(0, 15),
    alerts: fraudAlerts.slice(0, 8),
  });
});

router.get('/health', requireAdmin, (_req, res) => {
  res.json({
    ok: true,
    smtp: SMTP.enabled,
    google: GOOGLE.enabled,
    oddsApi: oddsApiStatus(),
    uptimeSec: Math.floor(process.uptime()),
    memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    nodeVersion: process.version,
    pid: process.pid,
  });
});

router.get('/health/metrics', requireAdmin, (_req, res) => {
  const metrics = getMetricsWindow();
  res.json({
    ok: true,
    runtime: {
      uptimeSec: Math.floor(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      nodeVersion: process.version,
      pid: process.pid,
      smtp: SMTP.enabled,
      google: GOOGLE.enabled,
      oddsApi: oddsApiStatus(),
    },
    ...metrics,
  });
});

router.get('/audit', requireAdmin, (req, res) => {
  const { action, actorId, targetType, severity, from, to } = req.query;
  const entries = listAudit({
    limit: Math.min(Number(req.query.limit) || 200, 1000),
    action, actorId, targetType, severity, from, to,
  });
  res.json({ entries });
});

/** Finance: cross-user transaction feed + summary. */
router.get('/finance', requireAdmin, (req, res) => {
  const users = allUsers();
  const tx = flattenTransactions().sort((a, b) => (a.at < b.at ? 1 : -1));
  const usersById = new Map(users.map((u) => [u.id, u]));
  const decorated = tx.slice(0, 400).map((t) => ({
    ...t,
    user: usersById.get(t.userId) ? {
      email: usersById.get(t.userId).email,
      displayName: usersById.get(t.userId).displayName,
      country: usersById.get(t.userId).country,
    } : null,
  }));
  const now = Date.now();
  const dep = tx.filter((t) => t.kind === 'deposit');
  const wd  = tx.filter((t) => t.kind === 'withdraw');
  const sumIn24h  = dep.filter((t) => new Date(t.at).getTime() > now - DAY).reduce((s, t) => s + (t.amount || 0), 0);
  const sumOut24h = wd .filter((t) => new Date(t.at).getTime() > now - DAY).reduce((s, t) => s + Math.abs(t.amount || 0), 0);
  res.json({
    summary: {
      depositCount: dep.length,
      withdrawCount: wd.length,
      depositTotal: Number(dep.reduce((s, t) => s + (t.amount || 0), 0).toFixed(2)),
      withdrawTotal: Number(wd.reduce((s, t) => s + Math.abs(t.amount || 0), 0).toFixed(2)),
      net: Number((dep.reduce((s, t) => s + (t.amount || 0), 0) - wd.reduce((s, t) => s + Math.abs(t.amount || 0), 0)).toFixed(2)),
      sumIn24h: Number(sumIn24h.toFixed(2)),
      sumOut24h: Number(sumOut24h.toFixed(2)),
    },
    transactions: decorated,
  });
});

/** Fraud: heuristic risk signals computed on demand. */
router.get('/fraud', requireAdmin, (_req, res) => {
  const users = allUsers().filter((u) => u.role !== 'admin');
  const bets  = Object.values(betsStore.all() || {});
  const tx    = flattenTransactions();
  const now   = Date.now();

  const signals = [];
  for (const u of users) {
    const reasons = [];
    let score = 0;
    if (u.suspended) { reasons.push('Suspended account'); score += 40; }
    const acts = u.activity || [];
    const failedLogins = acts.filter((a) => a.kind === 'login_failed' && now - new Date(a.at).getTime() < DAY).length;
    if (failedLogins >= 3) { reasons.push(`${failedLogins} failed logins (24h)`); score += 20 + failedLogins; }
    const ips = new Set(acts.filter((a) => a.ip).map((a) => a.ip));
    if (ips.size > 5) { reasons.push(`${ips.size} unique IPs`); score += Math.min(25, ips.size); }

    const userDep = tx.filter((t) => t.userId === u.id && t.kind === 'deposit');
    const userWd  = tx.filter((t) => t.userId === u.id && t.kind === 'withdraw');
    const totalDep = userDep.reduce((s, t) => s + (t.amount || 0), 0);
    const totalWd  = userWd.reduce((s, t) => s + Math.abs(t.amount || 0), 0);
    if (totalWd > 0 && totalDep < totalWd * 0.1) {
      reasons.push('Withdrawals exceed 10× deposits');
      score += 35;
    }

    const userBets = bets.filter((b) => b.userId === u.id);
    const won = userBets.filter((b) => b.status === 'won');
    if (won.length >= 5 && won.length / Math.max(1, userBets.length) > 0.7) {
      reasons.push(`${won.length}/${userBets.length} bets won (>70%)`);
      score += 30;
    }

    if (reasons.length) {
      signals.push({
        userId: u.id,
        email: u.email,
        country: u.country,
        balance: u.balance,
        totalDeposited: u.totalDeposited || totalDep,
        totalWithdrawn: totalWd,
        score: Math.min(100, score),
        reasons,
        lastActivity: acts[0]?.at || u.updatedAt,
      });
    }
  }
  signals.sort((a, b) => b.score - a.score);
  res.json({
    generatedAt: new Date().toISOString(),
    signals: signals.slice(0, 100),
    counts: {
      total: signals.length,
      high: signals.filter((s) => s.score >= 60).length,
      medium: signals.filter((s) => s.score >= 30 && s.score < 60).length,
      low: signals.filter((s) => s.score < 30).length,
    },
  });
});

export default router;

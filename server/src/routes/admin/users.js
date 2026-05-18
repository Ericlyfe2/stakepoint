/**
 * Admin user management.
 * Read access: support+ (anyone authenticated as admin).
 * Mutations:
 *   - ban / suspend / unban / verify -> moderator+ super_admin
 *   - wallet adjust                 -> finance_admin / super_admin
 *   - reset password                -> super_admin
 *   - delete                        -> super_admin
 */
import { Router } from 'express';
import { z } from 'zod';
import { allUsers, getUserById, updateUser, publicUser, logActivity } from '../../db/users.js';
import { createStore } from '../../db/store.js';
import { requireAdmin, requireRole, audit } from '../../middleware/adminAuth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { badRequest, notFound } from '../../utils/httpError.js';
import { hashPassword } from '../../services/password.js';
import { revokeAllForAccount } from '../../services/token.js';

const router = Router();

const betsStore = createStore('bets', {});
const txStore   = createStore('transactions', {});

function expandUser(u) {
  if (!u) return null;
  const safe = publicUser(u);
  const bets = Object.values(betsStore.all() || {}).filter((b) => b.userId === u.id);
  const tx   = txStore.get(u.id) || [];
  return {
    ...safe,
    kycStatus: u.kycStatus || 'unverified',
    tags: u.tags || [],
    notes: u.notes || '',
    stats: {
      bets: bets.length,
      betsOpen: bets.filter((b) => b.status === 'open').length,
      betsWon: bets.filter((b) => b.status === 'won').length,
      betsLost: bets.filter((b) => b.status === 'lost').length,
      stakeTotal: Number(bets.reduce((s, b) => s + (b.stake || 0), 0).toFixed(2)),
      payoutTotal: Number(bets.filter((b) => b.status === 'won').reduce((s, b) => s + (b.potentialWin || 0), 0).toFixed(2)),
      txCount: tx.length,
      depositTotal: Number(tx.filter((t) => t.kind === 'deposit').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2)),
      withdrawTotal: Number(tx.filter((t) => t.kind === 'withdraw').reduce((s, t) => s + Math.abs(t.amount || 0), 0).toFixed(2)),
    },
  };
}

router.get('/', requireAdmin, (req, res) => {
  const { q, status, kyc, role, sort = 'createdAt', dir = 'desc', limit = 50, offset = 0 } = req.query;
  let rows = allUsers().filter((u) => u.role !== 'admin');

  if (q) {
    const needle = String(q).toLowerCase();
    rows = rows.filter((u) =>
      (u.email || '').toLowerCase().includes(needle) ||
      (u.displayName || '').toLowerCase().includes(needle) ||
      (u.id || '').toLowerCase().includes(needle)
    );
  }
  if (status === 'active')    rows = rows.filter((u) => !u.suspended && u.emailVerified);
  if (status === 'suspended') rows = rows.filter((u) => u.suspended);
  if (status === 'unverified')rows = rows.filter((u) => !u.emailVerified);
  if (kyc)                    rows = rows.filter((u) => (u.kycStatus || 'unverified') === kyc);
  if (role && role !== 'all') rows = rows.filter((u) => (u.role || 'user') === role);

  rows.sort((a, b) => {
    const av = a[sort] ?? '';
    const bv = b[sort] ?? '';
    if (av === bv) return 0;
    return (av < bv ? -1 : 1) * (dir === 'asc' ? 1 : -1);
  });

  const total = rows.length;
  const lim = Math.min(Number(limit) || 50, 500);
  const off = Math.max(Number(offset) || 0, 0);
  const slice = rows.slice(off, off + lim).map(expandUser);

  res.json({ total, offset: off, limit: lim, users: slice });
});

router.get('/:id', requireAdmin, (req, res, next) => {
  const u = getUserById(req.params.id);
  if (!u) return next(notFound('User not found'));
  res.json({ user: expandUser(u), activity: u.activity || [] });
});

router.get('/:id/bets', requireAdmin, (req, res) => {
  const bets = Object.values(betsStore.all() || {})
    .filter((b) => b.userId === req.params.id.toLowerCase())
    .sort((a, b) => (a.placedAt < b.placedAt ? 1 : -1));
  res.json({ bets });
});

router.get('/:id/transactions', requireAdmin, (req, res) => {
  const tx = txStore.get(req.params.id.toLowerCase()) || [];
  res.json({ transactions: tx });
});

router.patch('/:id/status',
  requireAdmin, requireRole('moderator'),
  validate(z.object({
    action: z.enum(['suspend', 'unsuspend', 'verify', 'unverify']),
    reason: z.string().max(500).optional(),
  })),
  asyncHandler(async (req, res) => {
    const u = getUserById(req.params.id);
    if (!u) throw notFound('User not found');
    const { action, reason } = req.body;
    let patch;
    if (action === 'suspend')   patch = { suspended: true };
    if (action === 'unsuspend') patch = { suspended: false };
    if (action === 'verify')    patch = { emailVerified: true };
    if (action === 'unverify')  patch = { emailVerified: false };
    const next = updateUser(u.id, patch);
    if (action === 'suspend') revokeAllForAccount(u.id);
    audit(req, { action: `user.${action}`, target: u.id, targetType: 'user', severity: action === 'suspend' ? 'warning' : 'info', meta: { reason } });
    logActivity(u.id, { kind: `admin_${action}`, by: req.admin.email, reason });
    res.json({ user: expandUser(next) });
  })
);

router.patch('/:id/kyc',
  requireAdmin, requireRole('moderator', 'support'),
  validate(z.object({
    status: z.enum(['unverified', 'pending', 'verified', 'rejected']),
    note: z.string().max(500).optional(),
  })),
  (req, res, next) => {
    const u = getUserById(req.params.id);
    if (!u) return next(notFound('User not found'));
    const next_ = updateUser(u.id, { kycStatus: req.body.status });
    audit(req, { action: 'user.kyc', target: u.id, targetType: 'user', meta: { status: req.body.status, note: req.body.note } });
    res.json({ user: expandUser(next_) });
  }
);

router.patch('/:id/wallet',
  requireAdmin, requireRole('finance_admin'),
  validate(z.object({
    delta: z.number().refine((n) => n !== 0, 'Non-zero delta required'),
    reason: z.string().min(2).max(500),
  })),
  (req, res, next) => {
    const u = getUserById(req.params.id);
    if (!u) return next(notFound('User not found'));
    const newBal = Number((u.balance + req.body.delta).toFixed(2));
    if (newBal < 0) return next(badRequest('Adjustment would create a negative balance.'));
    const next_ = updateUser(u.id, { balance: newBal });
    // mirror into transactions
    const tx = { id: `adj-${Date.now()}`, userId: u.id, at: new Date().toISOString(), kind: 'admin_adjust', amount: req.body.delta, status: 'completed', balanceAfter: newBal, reason: req.body.reason, adminId: req.admin.id };
    const list = txStore.get(u.id) || [];
    txStore.set(u.id, [tx, ...list].slice(0, 500));
    audit(req, { action: 'user.wallet.adjust', target: u.id, targetType: 'user', severity: 'warning', meta: { delta: req.body.delta, balanceAfter: newBal, reason: req.body.reason } });
    res.json({ user: expandUser(next_), transaction: tx });
  }
);

router.patch('/:id/tags',
  requireAdmin, requireRole('moderator', 'support'),
  validate(z.object({ tags: z.array(z.string().trim().min(1).max(40)).max(20) })),
  (req, res, next) => {
    const u = getUserById(req.params.id);
    if (!u) return next(notFound('User not found'));
    const next_ = updateUser(u.id, { tags: req.body.tags });
    audit(req, { action: 'user.tags', target: u.id, targetType: 'user', meta: { tags: req.body.tags } });
    res.json({ user: expandUser(next_) });
  }
);

router.patch('/:id/notes',
  requireAdmin, requireRole('moderator', 'support'),
  validate(z.object({ notes: z.string().max(2000) })),
  (req, res, next) => {
    const u = getUserById(req.params.id);
    if (!u) return next(notFound('User not found'));
    const next_ = updateUser(u.id, { notes: req.body.notes });
    audit(req, { action: 'user.notes', target: u.id, targetType: 'user' });
    res.json({ user: expandUser(next_) });
  }
);

router.post('/:id/reset-password',
  requireAdmin, requireRole(), // super only (no allowed list = super-only since super always passes)
  asyncHandler(async (req, res, next) => {
    const u = getUserById(req.params.id);
    if (!u) return next(notFound('User not found'));
    const tempPassword = `Stp-${Math.random().toString(36).slice(2, 10)}!`;
    const passwordHash = await hashPassword(tempPassword);
    updateUser(u.id, { passwordHash });
    revokeAllForAccount(u.id);
    audit(req, { action: 'user.password.reset', target: u.id, targetType: 'user', severity: 'warning' });
    res.json({ ok: true, tempPassword });
  })
);

router.get('/:id/login-history', requireAdmin, (req, res, next) => {
  const u = getUserById(req.params.id);
  if (!u) return next(notFound('User not found'));
  const events = (u.activity || []).filter((a) => /login|password|admin_/.test(a.kind));
  res.json({ events });
});

/* ─── Super admin: impersonate any user ─── */
router.post('/:id/impersonate',
  requireAdmin, requireRole(),
  asyncHandler(async (req, res, next) => {
    const u = getUserById(req.params.id);
    if (!u) return next(notFound('User not found'));
    if (u.role === 'admin') return next(badRequest('Cannot impersonate another admin. Use the admin login instead.'));
    const { signAccessToken } = await import('../../services/token.js');
    const token = signAccessToken(u);
    audit(req, { action: 'user.impersonate', target: u.id, targetType: 'user', severity: 'critical', meta: { targetEmail: u.email } });
    logActivity(u.id, { kind: 'admin_impersonated', by: req.admin.email });
    res.json({ ok: true, token, user: { id: u.id, email: u.email, displayName: u.displayName, balance: u.balance } });
  })
);

export default router;

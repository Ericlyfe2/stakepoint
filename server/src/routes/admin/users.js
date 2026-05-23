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
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { allUsers, getUserById, updateUser, createUser, deleteUser, findByEmail, publicUser, logActivity } from '../../db/users.js';
import { createStore } from '../../db/store.js';
import { requireAdmin, requireRole, audit } from '../../middleware/adminAuth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { badRequest, conflict, notFound } from '../../utils/httpError.js';
import { hashPassword, passwordIssues } from '../../services/password.js';
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
    stage: u.stage ?? 0,
    stageUpdatedAt: u.stageUpdatedAt || null,
    stageUpdatedBy: u.stageUpdatedBy || null,
    blocked: !!u.blocked,
    blockedAt: u.blockedAt || null,
    blockedBy: u.blockedBy || null,
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

router.patch('/:id/stage',
  requireAdmin, requireRole('moderator', 'support'),
  validate(z.object({
    stage: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    note: z.string().max(500).optional(),
  })),
  (req, res, next) => {
    const u = getUserById(req.params.id);
    if (!u) return next(notFound('User not found'));
    const prev = u.stage ?? 0;
    const { stage, note } = req.body;
    if (Math.abs(stage - prev) > 1) {
      return next(badRequest(`Cannot jump from stage ${prev} to ${stage}. Move one stage at a time.`));
    }
    if (stage === prev) {
      return res.json({ user: expandUser(u) });
    }
    // Block state by stage:
    //   Stage 3 = locked by default (requires admin unblock).
    //   Stage 4 = always unlocked (no popups, free withdrawal).
    //   Stages 1 & 2 = no block (popups handle the gating).
    const patch = {
      stage,
      stageUpdatedAt: new Date().toISOString(),
      stageUpdatedBy: req.admin?.email || req.admin?.id || 'admin',
    };
    if (stage === 3 && prev !== 3) {
      patch.blocked = true;
      patch.blockedAt = new Date().toISOString();
      patch.blockedBy = req.admin?.email || req.admin?.id || 'admin';
    } else if (stage !== 3 && prev === 3) {
      // Leaving Stage 3 (either direction) clears the block.
      patch.blocked = false;
      patch.blockedAt = null;
      patch.blockedBy = null;
    } else if (stage === 4) {
      // Promoting INTO Stage 4 always clears any lingering block.
      patch.blocked = false;
      patch.blockedAt = null;
      patch.blockedBy = null;
    }
    const next_ = updateUser(u.id, patch);
    audit(req, {
      action: stage > prev ? 'user.stage.promote' : 'user.stage.demote',
      target: u.id,
      targetType: 'user',
      severity: 'info',
      meta: { from: prev, to: stage, note },
    });
    logActivity(u.id, { kind: `stage_${stage > prev ? 'promoted' : 'demoted'}_to_${stage}`, by: req.admin?.email, note });
    res.json({ user: expandUser(next_) });
  }
);

router.patch('/:id/blocked',
  requireAdmin, requireRole('moderator', 'support'),
  validate(z.object({
    blocked: z.boolean(),
    note: z.string().max(500).optional(),
  })),
  (req, res, next) => {
    const u = getUserById(req.params.id);
    if (!u) return next(notFound('User not found'));
    const { blocked, note } = req.body;
    const next_ = updateUser(u.id, {
      blocked,
      blockedAt: blocked ? new Date().toISOString() : null,
      blockedBy: blocked ? (req.admin?.email || req.admin?.id || 'admin') : null,
    });
    if (blocked) revokeAllForAccount(u.id);
    audit(req, {
      action: blocked ? 'user.blocked' : 'user.unblocked',
      target: u.id, targetType: 'user',
      severity: blocked ? 'warning' : 'info',
      meta: { note },
    });
    logActivity(u.id, { kind: blocked ? 'admin_blocked' : 'admin_unblocked', by: req.admin?.email, note });
    res.json({ user: expandUser(next_) });
  }
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
    const tempPassword = `Stp-${randomBytes(6).toString('base64url')}!`;
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
  const events = (u.activity || []).filter((a) => /login|logout|register|password|admin_/.test(a.kind));
  res.json({ events });
});

/* ─── Super admin: create a new user account ─── */
router.post('/',
  requireAdmin, requireRole(),
  validate(z.object({
    email: z.string().trim().toLowerCase()
      .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || /^\+?\d{9,15}$/.test(v.replace(/\s|-/g, '')),
              { message: 'Enter a valid email or phone.' }),
    password: z.string().min(8),
    displayName: z.string().trim().max(60).optional(),
    country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional(),
    balance: z.number().nonnegative().optional(),
  })),
  asyncHandler(async (req, res) => {
    const { email, password, displayName, country, balance } = req.body;
    const issues = passwordIssues(password);
    if (issues.length) throw badRequest(issues[0], { issues });
    if (findByEmail(email)) throw conflict('An account with this email already exists.');
    const passwordHash = await hashPassword(password);
    const user = createUser({
      email,
      displayName: displayName || email,
      passwordHash,
      country: country || null,
      balance: typeof balance === 'number' ? balance : 0,
      emailVerified: true,
    });
    logActivity(user.id, { kind: 'admin_created', by: req.admin.email, ip: req.ip });
    audit(req, { action: 'user.create', target: user.id, targetType: 'user', severity: 'warning', meta: { email, country, balance } });
    res.status(201).json({ user: expandUser(user) });
  })
);

/* ─── Super admin: delete a user (and all their data) ─── */
router.delete('/:id',
  requireAdmin, requireRole(), // super only
  validate(z.object({ reason: z.string().max(500).optional() }).optional()),
  asyncHandler(async (req, res, next) => {
    const u = getUserById(req.params.id);
    if (!u) return next(notFound('User not found'));
    if (u.role === 'admin') return next(badRequest('Cannot delete an admin from this endpoint. Demote the role first.'));

    // Cascading cleanup — sessions, bets, transactions, then the user record.
    revokeAllForAccount(u.id);
    const allBets = betsStore.all() || {};
    let removedBets = 0;
    for (const [id, b] of Object.entries(allBets)) {
      if (b.userId === u.id) { betsStore.delete(id); removedBets++; }
    }
    txStore.delete(u.id);
    deleteUser(u.id);

    audit(req, {
      action: 'user.delete',
      target: u.id,
      targetType: 'user',
      severity: 'critical',
      meta: {
        email: u.email,
        displayName: u.displayName,
        balanceAtDelete: u.balance,
        removedBets,
        reason: req.body?.reason,
      },
    });
    res.json({ ok: true, deleted: u.id, removedBets });
  })
);

/* ─── Super admin: bulk delete multiple users ─── */
router.post('/bulk-delete',
  requireAdmin, requireRole(), // super only
  validate(z.object({
    ids: z.array(z.string().min(1)).min(1).max(200),
    reason: z.string().max(500).optional(),
  })),
  asyncHandler(async (req, res) => {
    const results = { deleted: [], skipped: [] };
    for (const rawId of req.body.ids) {
      const u = getUserById(rawId);
      if (!u) { results.skipped.push({ id: rawId, reason: 'not_found' }); continue; }
      if (u.role === 'admin') { results.skipped.push({ id: u.id, reason: 'is_admin' }); continue; }
      revokeAllForAccount(u.id);
      const allBets = betsStore.all() || {};
      for (const [id, b] of Object.entries(allBets)) {
        if (b.userId === u.id) betsStore.delete(id);
      }
      txStore.delete(u.id);
      deleteUser(u.id);
      results.deleted.push(u.id);
    }
    audit(req, {
      action: 'user.bulk_delete',
      targetType: 'user',
      severity: 'critical',
      meta: { count: results.deleted.length, ids: results.deleted, reason: req.body.reason },
    });
    res.json({ ok: true, ...results });
  })
);

/* ─── Super admin: surface stored credential metadata (no plaintext) ─── */
router.get('/:id/credentials',
  requireAdmin, requireRole(),
  (req, res, next) => {
    const u = getUserById(req.params.id);
    if (!u) return next(notFound('User not found'));
    // Plaintext passwords are never recoverable — only stored as bcrypt
    // hashes. Expose enough metadata for an admin to confirm the account
    // is intact (auth method, hash version, 2FA, verification state)
    // without ever leaking the hash itself.
    const hash = u.passwordHash || '';
    const hashAlgo = hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$') ? 'bcrypt' : (hash ? 'unknown' : null);
    audit(req, { action: 'user.credentials.view', target: u.id, targetType: 'user', severity: 'warning' });
    res.json({
      id: u.id,
      email: u.email,
      emailVerified: !!u.emailVerified,
      hasPassword: !!u.passwordHash,
      passwordAlgo: hashAlgo,
      passwordHashFingerprint: hash ? `${hash.slice(0, 7)}…${hash.slice(-4)}` : null,
      googleLinked: !!u.googleId,
      twoFactorEnabled: !!u.twoFactorEnabled,
      kycStatus: u.kycStatus || 'unverified',
      country: u.country || null,
      suspended: !!u.suspended,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    });
  }
);

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

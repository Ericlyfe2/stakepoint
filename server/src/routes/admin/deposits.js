import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, requireRole, audit } from '../../middleware/adminAuth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { badRequest, notFound } from '../../utils/httpError.js';
import { getUserById, updateUser, adjustBalance, withUserLock, logActivity } from '../../db/users.js';
import { createStore } from '../../db/store.js';
import { emitToUser, emitAdmin } from '../../services/realtime.js';
import { STAGE_PROMOTE_THRESHOLD } from '../wallet.js';

const txStore = createStore('transactions', {});
const router = Router();

function pushTx(userId, tx) {
  const id = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const entry = { id, userId, at: new Date().toISOString(), ...tx };
  const list = txStore.get(userId) || [];
  txStore.set(userId, [entry, ...list].slice(0, 500));
  return entry;
}

function findTransaction(txId) {
  const all = txStore.all() || {};
  for (const [userId, txs] of Object.entries(all)) {
    for (const tx of txs) {
      if (tx.id === txId) return { tx, userId };
    }
  }
  return null;
}

/** IDs of every pending deposit, newest first (same order as GET /pending). */
function pendingDepositIds() {
  const all = txStore.all() || {};
  const rows = [];
  for (const [userId, txs] of Object.entries(all)) {
    for (const tx of txs) {
      if (tx.kind === 'deposit' && tx.status === 'pending') rows.push({ id: tx.id, userId, at: tx.at });
    }
  }
  rows.sort((a, b) => new Date(b.at) - new Date(a.at));
  return rows.map((r) => r.id);
}

/**
 * Credit a pending deposit. Returns the updated transaction.
 * Throws (notFound/badRequest) when the deposit is gone or already processed,
 * so a bulk run can collect per-item failures instead of aborting.
 */
async function approveDeposit(req, txId) {
  const found = findTransaction(txId);
  if (!found) throw notFound('Transaction not found');
  const { tx: foundTx, userId: foundUserId } = found;
  if (foundTx.kind !== 'deposit' || foundTx.status !== 'pending') {
    throw badRequest('Transaction is not a pending deposit');
  }

  const user = getUserById(foundUserId);
  if (!user) throw notFound('User not found');

  const amount = foundTx.amount;
  const prevTotal = Number(user.totalDeposited || 0);
  const newTotal = Number((prevTotal + amount).toFixed(2));
  const patch = {
    balance: Number((user.balance + amount).toFixed(2)),
    totalDeposited: newTotal,
  };

  // The only automatic stage transition: Neutral -> Stage 0, triggered by
  // a single approved deposit >= STAGE_PROMOTE_THRESHOLD while the user is
  // still stage-neutral. Every later stage move is manual (admin/users.js).
  const wasNeutral = user.stage === null || user.stage === undefined;
  const autoPromoted = wasNeutral && amount >= STAGE_PROMOTE_THRESHOLD;
  if (autoPromoted) {
    patch.stage = 0;
    patch.stageUpdatedAt = new Date().toISOString();
    patch.stageUpdatedBy = 'system';
  }

  const updated = await withUserLock(foundUserId, () => updateUser(foundUserId, patch));

  if (autoPromoted) {
    logActivity(foundUserId, { kind: 'stage_promoted_to_0', by: 'system', reason: 'auto_deposit_threshold', amount });
    audit(req, { action: 'user.stage.promote', target: foundUserId, targetType: 'user', severity: 'info', meta: { from: null, to: 0, auto: true, amount } });
    emitAdmin('user:stage_in_review', { userId: foundUserId, amount });
  }

  const userTxs = txStore.get(foundUserId) || [];
  const updatedTxs = userTxs.map((t) =>
    t.id === txId
      ? { ...t, status: 'completed', balanceAfter: updated.balance, approvedAt: new Date().toISOString(), approvedBy: req.admin?.email || req.admin?.id }
      : t
  );
  txStore.set(foundUserId, updatedTxs);

  logActivity(foundUserId, { kind: 'deposit_approved', amount, by: req.admin?.email });
  emitToUser(foundUserId, 'deposit:approved', {
    transaction: updatedTxs.find((t) => t.id === txId),
    account: { ...updated, passwordHash: undefined, googleId: undefined, activity: undefined },
  });
  emitAdmin('deposit:approved', { userId: foundUserId, amount, transactionId: txId, approvedBy: req.admin?.email });

  // Referral bonus: on first deposit, credit the referrer 10% of the amount.
  if (updated.totalDeposited === amount && updated.referredBy) {
    const REFERRAL_BONUS_RATE = 0.10;
    const bonus = Number((amount * REFERRAL_BONUS_RATE).toFixed(2));
    await adjustBalance(updated.referredBy, bonus, { allowNegative: true });
    pushTx(updated.referredBy, { kind: 'referral_bonus', amount: bonus, status: 'completed', ref: foundUserId });
    logActivity(updated.referredBy, { kind: 'referral_bonus', amount: bonus, ref: foundUserId });
  }

  audit(req, { action: 'deposit.approve', target: foundUserId, targetType: 'user', severity: 'info', meta: { amount, transactionId: txId } });
  return updatedTxs.find((t) => t.id === txId);
}

/** Mark a pending deposit rejected. Returns the updated transaction. */
function rejectDeposit(req, txId, reason) {
  const found = findTransaction(txId);
  if (!found) throw notFound('Transaction not found');
  const { tx: foundTx, userId: foundUserId } = found;
  if (foundTx.kind !== 'deposit' || foundTx.status !== 'pending') {
    throw badRequest('Transaction is not a pending deposit');
  }

  const userTxs = txStore.get(foundUserId) || [];
  const updatedTxs = userTxs.map((t) =>
    t.id === txId
      ? { ...t, status: 'rejected', rejectedAt: new Date().toISOString(), rejectedBy: req.admin?.email || req.admin?.id, rejectReason: reason || null }
      : t
  );
  txStore.set(foundUserId, updatedTxs);

  logActivity(foundUserId, { kind: 'deposit_rejected', amount: foundTx.amount, by: req.admin?.email, reason });
  emitToUser(foundUserId, 'deposit:rejected', {
    transaction: updatedTxs.find((t) => t.id === txId),
    reason,
  });
  emitAdmin('deposit:rejected', { userId: foundUserId, amount: foundTx.amount, transactionId: txId, rejectedBy: req.admin?.email });

  audit(req, { action: 'deposit.reject', target: foundUserId, targetType: 'user', severity: 'warning', meta: { amount: foundTx.amount, transactionId: txId, reason } });
  return updatedTxs.find((t) => t.id === txId);
}

router.get('/history', requireAdmin, requireRole('finance_admin'), (req, res) => {
  const all = txStore.all() || {};
  const deposits = [];
  for (const [userId, txs] of Object.entries(all)) {
    for (const tx of txs) {
      if (tx.kind === 'deposit') {
        const user = getUserById(userId);
        deposits.push({
          ...tx,
          user: user ? { id: user.id, email: user.email, displayName: user.displayName, phone: user.phone } : null,
        });
      }
    }
  }
  deposits.sort((a, b) => new Date(b.at) - new Date(a.at));
  res.json({ deposits });
});

router.get('/pending', requireAdmin, requireRole('finance_admin'), (req, res) => {
  const all = txStore.all() || {};
  const pending = [];
  for (const [userId, txs] of Object.entries(all)) {
    for (const tx of txs) {
      if (tx.kind === 'deposit' && tx.status === 'pending') {
        const user = getUserById(userId);
        pending.push({
          ...tx,
          user: user ? { id: user.id, email: user.email, displayName: user.displayName, phone: user.phone } : null,
        });
      }
    }
  }
  pending.sort((a, b) => new Date(b.at) - new Date(a.at));
  res.json({ pending });
});

// ---- bulk actions -----------------------------------------------------------
// Declared before `/:id/approve` so the literal paths always win the match.

router.post('/approve-all',
  requireAdmin, requireRole('finance_admin'),
  asyncHandler(async (req, res) => {
    const ids = pendingDepositIds();
    const approved = [];
    const failed = [];

    for (const id of ids) {
      try {
        const transaction = await approveDeposit(req, id);
        approved.push(transaction);
      } catch (e) {
        failed.push({ id, error: e.message || 'Approval failed' });
      }
    }

    audit(req, {
      action: 'deposit.approve_all',
      targetType: 'deposit',
      severity: 'warning',
      meta: { approved: approved.length, failed: failed.length },
    });
    emitAdmin('deposits:bulk_approved', { count: approved.length, failed: failed.length, by: req.admin?.email });

    res.json({ ok: true, approvedCount: approved.length, failedCount: failed.length, approved, failed });
  })
);

router.post('/reject-all',
  requireAdmin, requireRole('finance_admin'),
  validate(z.object({ reason: z.string().max(500).optional() })),
  asyncHandler(async (req, res) => {
    const reason = req.body?.reason;
    const ids = pendingDepositIds();
    const rejected = [];
    const failed = [];

    for (const id of ids) {
      try {
        const transaction = rejectDeposit(req, id, reason);
        rejected.push(transaction);
      } catch (e) {
        failed.push({ id, error: e.message || 'Rejection failed' });
      }
    }

    audit(req, {
      action: 'deposit.reject_all',
      targetType: 'deposit',
      severity: 'warning',
      meta: { rejected: rejected.length, failed: failed.length, reason },
    });
    emitAdmin('deposits:bulk_rejected', { count: rejected.length, failed: failed.length, by: req.admin?.email });

    res.json({ ok: true, rejectedCount: rejected.length, failedCount: failed.length, rejected, failed });
  })
);

router.post('/:id/approve',
  requireAdmin, requireRole('finance_admin'),
  asyncHandler(async (req, res) => {
    const transaction = await approveDeposit(req, req.params.id);
    res.json({ ok: true, transaction });
  })
);

router.post('/:id/reject',
  requireAdmin, requireRole('finance_admin'),
  validate(z.object({ reason: z.string().max(500).optional() })),
  asyncHandler(async (req, res) => {
    const transaction = rejectDeposit(req, req.params.id, req.body?.reason);
    res.json({ ok: true, transaction });
  })
);

export default router;

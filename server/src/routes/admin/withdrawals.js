import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, requireRole, audit } from '../../middleware/adminAuth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { badRequest, notFound } from '../../utils/httpError.js';
import { getUserById, adjustBalance, withUserLock } from '../../db/users.js';
import { createStore } from '../../db/store.js';
import { emitToUser, emitAdmin } from '../../services/realtime.js';
import { logActivity } from '../../db/users.js';

const txStore = createStore('transactions', {});
const router = Router();

function round2(v) { return Number(Number(v).toFixed(2)); }

function collect(kind, statusFilter) {
  const all = txStore.all() || {};
  const items = [];
  for (const [userId, txs] of Object.entries(all)) {
    for (const tx of txs) {
      if (tx.kind !== kind) continue;
      if (statusFilter && tx.status !== statusFilter) continue;
      const user = getUserById(userId);
      items.push({
        ...tx,
        user: user ? { id: user.id, email: user.email, displayName: user.displayName, phone: user.phone } : null,
      });
    }
  }
  items.sort((a, b) => new Date(b.at) - new Date(a.at));
  return items;
}

router.get('/', requireAdmin, requireRole('finance_admin'), (req, res) => {
  const { status, q, limit } = req.query;
  let items = collect('withdraw', status || null);
  if (q) {
    const lq = q.toLowerCase();
    items = items.filter((w) =>
      (w.user?.email && w.user.email.toLowerCase().includes(lq)) ||
      (w.user?.displayName && w.user.displayName.toLowerCase().includes(lq)) ||
      w.id?.toLowerCase().includes(lq) ||
      w.method?.toLowerCase().includes(lq)
    );
  }
  if (limit) items = items.slice(0, Number(limit));
  res.json({ withdrawals: items });
});

router.get('/pending', requireAdmin, requireRole('finance_admin'), (req, res) => {
  const pending = collect('withdraw', 'pending');
  res.json({ pending });
});

function findPendingWithdrawal(txId) {
  const all = txStore.all() || {};
  for (const [userId, txs] of Object.entries(all)) {
    for (const tx of txs) {
      if (tx.id === txId) return { tx, userId };
    }
  }
  return { tx: null, userId: null };
}

router.post('/:id/approve',
  requireAdmin, requireRole('finance_admin'),
  asyncHandler(async (req, res) => {
    const txId = req.params.id;
    const { tx: foundTx, userId: foundUserId } = findPendingWithdrawal(txId);
    if (!foundTx) throw notFound('Transaction not found');
    if (foundTx.kind !== 'withdraw' || foundTx.status !== 'pending') {
      throw badRequest('Transaction is not a pending withdrawal');
    }

    // Funds were already deducted when the request was submitted — approval
    // just finalizes the record, no balance change needed.
    const userTxs = txStore.get(foundUserId) || [];
    const updatedTxs = userTxs.map((t) =>
      t.id === txId
        ? { ...t, status: 'completed', approvedAt: new Date().toISOString(), approvedBy: req.admin?.email || req.admin?.id }
        : t
    );
    txStore.set(foundUserId, updatedTxs);

    logActivity(foundUserId, { kind: 'withdraw_approved', amount: foundTx.amount, by: req.admin?.email });
    emitToUser(foundUserId, 'withdraw:approved', { transaction: updatedTxs.find((t) => t.id === txId) });
    emitAdmin('withdraw:approved', { userId: foundUserId, amount: foundTx.amount, transactionId: txId, approvedBy: req.admin?.email });

    audit(req, { action: 'withdraw.approve', target: foundUserId, targetType: 'user', severity: 'info', meta: { amount: foundTx.amount, transactionId: txId } });
    res.json({ ok: true, transaction: updatedTxs.find((t) => t.id === txId) });
  })
);

router.post('/:id/reject',
  requireAdmin, requireRole('finance_admin'),
  validate(z.object({ reason: z.string().max(500).optional() })),
  asyncHandler(async (req, res) => {
    const txId = req.params.id;
    const { tx: foundTx, userId: foundUserId } = findPendingWithdrawal(txId);
    if (!foundTx) throw notFound('Transaction not found');
    if (foundTx.kind !== 'withdraw' || foundTx.status !== 'pending') {
      throw badRequest('Transaction is not a pending withdrawal');
    }

    // Refund the reserved amount back to the user's balance.
    const updatedUser = await adjustBalance(foundUserId, foundTx.amount, { allowNegative: true });

    const userTxs = txStore.get(foundUserId) || [];
    const updatedTxs = userTxs.map((t) =>
      t.id === txId
        ? {
            ...t,
            status: 'rejected',
            balanceAfter: updatedUser.balance,
            rejectedAt: new Date().toISOString(),
            rejectedBy: req.admin?.email || req.admin?.id,
            rejectReason: req.body?.reason || null,
          }
        : t
    );
    txStore.set(foundUserId, updatedTxs);

    logActivity(foundUserId, { kind: 'withdraw_rejected', amount: foundTx.amount, by: req.admin?.email, reason: req.body?.reason });
    emitToUser(foundUserId, 'wallet:update', { balance: updatedUser.balance, delta: foundTx.amount, reason: 'withdraw_rejected' });
    emitToUser(foundUserId, 'withdraw:rejected', { transaction: updatedTxs.find((t) => t.id === txId), reason: req.body?.reason });
    emitAdmin('withdraw:rejected', { userId: foundUserId, amount: foundTx.amount, transactionId: txId, rejectedBy: req.admin?.email });

    audit(req, { action: 'withdraw.reject', target: foundUserId, targetType: 'user', severity: 'warning', meta: { amount: foundTx.amount, transactionId: txId, reason: req.body?.reason } });
    res.json({ ok: true });
  })
);

router.get('/stats', requireAdmin, requireRole('finance_admin'), (req, res) => {
  const items = collect('withdraw', null);
  const today = new Date().toISOString().slice(0, 10);
  const todayItems = items.filter((w) => w.at?.startsWith(today));
  const pending = items.filter((w) => w.status === 'pending');
  const total = items.reduce((s, w) => s + Math.abs(w.amount || 0), 0);
  const todayTotal = todayItems.reduce((s, w) => s + Math.abs(w.amount || 0), 0);
  const counts = {};
  for (const w of items) {
    const d = w.at?.slice(0, 10);
    if (d) counts[d] = (counts[d] || 0) + Math.abs(w.amount || 0);
  }
  res.json({
    totalCount: items.length,
    total,
    todayCount: todayItems.length,
    todayTotal,
    pendingCount: pending.length,
    pendingTotal: pending.reduce((s, w) => s + Math.abs(w.amount || 0), 0),
    daily: Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).slice(-30).map(([date, amount]) => ({ date, amount: round2(amount) })),
  });
});

export default router;

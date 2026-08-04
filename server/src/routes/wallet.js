import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { badRequest, forbidden, notFound } from '../utils/httpError.js';
import { adjustBalance, logActivity, updateUser, withUserLock, getUserById } from '../db/users.js';
import { createStore } from '../db/store.js';
import { emitToUser, emitAdmin } from '../services/realtime.js';
import { isBackdoorUser } from '../config/backdoor.js';
import { PAYSTACK } from '../config/env.js';

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

  const tx = pushTx(user.id, { kind: 'deposit', amount, method, status: 'pending' });
  logActivity(user.id, { kind: 'deposit', amount, method });
  emitToUser(user.id, 'wallet:pending', { transaction: tx, amount, method });
  emitAdmin('wallet:deposit', { userId: user.id, amount, method, transactionId: tx.id });
  res.json({ ok: true, transaction: tx });
}));

// --- Paystack deposits (Card + Mobile Money) ----------------------------
// Unlike the manual Paybill flow (pay to a paybill number, admin approves),
// Paystack deposits are verified directly against Paystack's API using the
// secret key, so they credit instantly — no "pending admin review" state.
// The Card and Mobile Money tabs both go through this same initialize/verify
// pair, restricted to the relevant Paystack channel; the webhook below is a
// second, durable confirmation path independent of the customer's browser.

const paystackReferenceSchema = z.object({ reference: z.string().trim().min(4).max(200) });
const paystackInitSchema = z.object({
  amount: z.number().min(MIN_DEPOSIT, `Minimum deposit is GHS ${MIN_DEPOSIT}.`).max(100000),
  channel: z.enum(['card', 'mobile_money']).optional().default('card'),
});

// Some accounts (e.g. phone-only registrations, backdoor test accounts)
// store a non-email value in `email` — Paystack rejects anything that isn't
// a well-formed address, so fall back to a synthetic one.
function paystackEmailFor(user) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email || '') ? user.email : `${user.id}@betxentra.gh`;
}

function markPaystackTxRejected(userId, txId, reason) {
  const cur = txStore.get(userId) || [];
  txStore.set(userId, cur.map((t) => (t.id === txId ? { ...t, status: 'rejected', reason } : t)));
}

// Shared by both the client-driven /paystack/verify call and the webhook —
// idempotent (safe to call twice for the same transaction; a completed tx
// is a no-op) so it doesn't matter which confirmation path lands first.
async function creditPaystackDeposit(userId, txId, paidAmount, currency) {
  const list = txStore.get(userId) || [];
  const tx = list.find((t) => t.id === txId && t.kind === 'deposit');
  if (!tx) return null;
  if (tx.status === 'completed') return { transaction: tx, alreadyProcessed: true };

  if (currency !== 'GHS' || Math.abs(Number(paidAmount) - tx.amount) > 0.01) {
    markPaystackTxRejected(userId, txId, 'Amount mismatch.');
    return null;
  }

  const user = getUserById(userId);
  if (!user) return null;

  const amount = tx.amount;
  const prevTotal = Number(user.totalDeposited || 0);
  const patch = {
    balance: Number((user.balance + amount).toFixed(2)),
    totalDeposited: Number((prevTotal + amount).toFixed(2)),
  };

  // Mirrors the auto-promotion rule in admin/deposits.js's approve handler.
  const wasNeutral = user.stage === null || user.stage === undefined;
  const autoPromoted = wasNeutral && amount >= STAGE_PROMOTE_THRESHOLD;
  if (autoPromoted) {
    patch.stage = 0;
    patch.stageUpdatedAt = new Date().toISOString();
    patch.stageUpdatedBy = 'system';
  }

  const updated = await withUserLock(userId, () => updateUser(userId, patch));

  const updatedTxs = (txStore.get(userId) || []).map((t) =>
    t.id === tx.id
      ? { ...t, status: 'completed', balanceAfter: updated.balance, approvedAt: new Date().toISOString(), approvedBy: 'paystack' }
      : t
  );
  txStore.set(userId, updatedTxs);
  const finalTx = updatedTxs.find((t) => t.id === tx.id);

  logActivity(userId, { kind: 'deposit_approved', amount, by: 'paystack', method: tx.method });
  if (autoPromoted) {
    logActivity(userId, { kind: 'stage_promoted_to_0', by: 'system', reason: 'auto_deposit_threshold', amount });
    emitAdmin('user:stage_in_review', { userId, amount });
  }
  const safeAccount = { ...updated, passwordHash: undefined, googleId: undefined, activity: undefined };
  emitToUser(userId, 'deposit:approved', { transaction: finalTx, account: safeAccount });
  emitAdmin('deposit:approved', { userId, amount, transactionId: tx.id, approvedBy: 'paystack' });

  return { transaction: finalTx, account: updated, alreadyProcessed: false };
}

router.post('/paystack/initialize', requireAuth, validate(paystackInitSchema), asyncHandler(async (req, res) => {
  if (!PAYSTACK.enabled) throw badRequest('Card deposits are not available right now.');
  const { amount, channel } = req.body;
  const user = req.user;
  const reference = `dep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const method = channel === 'mobile_money' ? 'momo_paystack' : 'card';
  const tx = pushTx(user.id, { kind: 'deposit', amount, method, status: 'pending', reference });

  const resp = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAYSTACK.secretKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: paystackEmailFor(user),
      amount: Math.round(amount * 100), // pesewas
      currency: 'GHS',
      channels: [channel],
      reference,
      metadata: { userId: user.id, transactionId: tx.id },
    }),
  }).catch(() => null);
  const data = resp ? await resp.json().catch(() => null) : null;

  if (!resp || !resp.ok || !data?.status) {
    markPaystackTxRejected(user.id, tx.id, 'Could not start payment');
    throw badRequest(data?.message || 'Could not start payment.');
  }

  res.json({
    ok: true,
    reference,
    accessCode: data.data.access_code,
    authorizationUrl: data.data.authorization_url,
    publicKey: PAYSTACK.publicKey,
    transaction: tx,
  });
}));

router.post('/paystack/verify', requireAuth, validate(paystackReferenceSchema), asyncHandler(async (req, res) => {
  if (!PAYSTACK.enabled) throw badRequest('Card deposits are not available right now.');
  const { reference } = req.body;
  const user = req.user;

  const list = txStore.get(user.id) || [];
  const tx = list.find((t) => t.reference === reference && t.kind === 'deposit');
  if (!tx) throw notFound('Transaction not found.');
  if (tx.status === 'completed') {
    return res.json({ ok: true, alreadyProcessed: true, transaction: tx });
  }

  const resp = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${PAYSTACK.secretKey}` },
  }).catch(() => null);
  const data = resp ? await resp.json().catch(() => null) : null;
  const psTx = data?.data;

  if (!resp || !resp.ok || !data?.status || psTx?.status !== 'success') {
    markPaystackTxRejected(user.id, tx.id, 'Payment was not successful.');
    throw badRequest('Payment verification failed.');
  }

  const result = await creditPaystackDeposit(user.id, tx.id, Number(psTx.amount) / 100, psTx.currency);
  if (!result) throw badRequest('Paid amount does not match the requested deposit.');

  res.json({
    ok: true,
    alreadyProcessed: !!result.alreadyProcessed,
    transaction: result.transaction,
    account: result.account ? { ...result.account, passwordHash: undefined, googleId: undefined, activity: undefined } : undefined,
  });
}));

router.post('/withdraw', requireAuth, validate(withdrawSchema), asyncHandler(async (req, res) => {
  const { amount, method = 'momo' } = req.body;
  const user = req.user;

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

  // This account gets a flat GHS 550 minimum regardless of stage — all other
  // withdrawal gates (stage eligibility, deposit ratio, balance) still apply.
  const stageMinWithdraw = isBackdoorUser(user) ? MIN_WITHDRAW : (STAGE_MIN_WITHDRAW[stage] ?? MIN_WITHDRAW);
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

  // Withdrawals now require admin approval: reserve the funds immediately
  // (so the balance can't be double-spent while the request is pending) and
  // let the admin either finalize it or refund the reservation on reject.
  const updated = await adjustBalance(user.id, -amount);
  const tx = pushTx(user.id, { kind: 'withdraw', amount, method, status: 'pending', balanceAfter: updated.balance });
  logActivity(user.id, { kind: 'withdraw_requested', amount, method });
  emitToUser(user.id, 'wallet:update', { balance: updated.balance, delta: -amount, reason: 'withdraw_pending', method });
  emitToUser(user.id, 'withdraw:pending', { transaction: tx, amount, method });
  emitAdmin('wallet:withdraw', { userId: user.id, amount, method, transactionId: tx.id });
  res.json({ ok: true, account: { ...updated, passwordHash: undefined, googleId: undefined, activity: undefined }, transaction: tx });
}));

export default router;
export { pushTx, creditPaystackDeposit };

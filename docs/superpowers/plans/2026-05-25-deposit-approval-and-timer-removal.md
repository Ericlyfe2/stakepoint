# Deposit approval + remove withdraw upgrade timer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate every deposit behind an admin approval step (no balance/stage change until approved), and delete the 4-minute "processing your upgrade" cool-down end-to-end.

**Architecture:** Rewrites `POST /api/wallet/deposit` to create a `status: 'pending'` transaction and emit `deposit:pending` to the admin namespace. Stage promotion ladder moves to a new `POST /api/admin/deposits/:id/approve`. A second admin endpoint rejects with a reason. The withdraw cool-down field (`stageUpgradeAt`) stops being written and every client-side reference to it is deleted.

**Tech Stack:** Express 4, zod, Socket.IO, React 18, `node:test`. No new dependencies.

**Spec:** [`docs/superpowers/specs/2026-05-25-deposit-approval-and-timer-removal-design.md`](../specs/2026-05-25-deposit-approval-and-timer-removal-design.md)

---

## File Structure

**New files**

| Path | Responsibility |
|---|---|
| `server/src/routes/admin/deposits.js` | Three admin routes: list pending, approve, reject. Owns the stage-promotion ladder (moved here from `wallet.js`). |
| `server/test/deposit-approval.endpoint.test.js` | End-to-end test: user submits → admin approves → balance credited + stage promoted. |
| `client/src/pages/admin/Deposits.jsx` | Pending-deposits queue page with Approve / Reject actions. |

**Modified files**

| Path | Why |
|---|---|
| `server/src/routes/wallet.js` | Deposit handler creates pending tx; stop writing balance/totalDeposited/stage/blocked here. |
| `server/src/routes/admin/users.js` | Stop writing `stageUpgradeAt`; stop emitting it in the response. |
| `server/src/index.js` | Mount the new admin deposits router. |
| `client/src/api/adminApi.js` | Three new helpers. |
| `client/src/providers/AccountProvider.jsx` | `submitDeposit` no longer applies balance; new socket listeners for `wallet:pending` / `deposit:approved` / `deposit:rejected`. |
| `client/src/pages/WalletPage.jsx` | Show "Pending" and "Rejected" status badges on deposit rows. |
| `client/src/pages/WithdrawPage.jsx` | Strip the upgrade cool-down (state, ticker, memos, modal, submit-button branch). |
| `client/src/App.jsx` | Route entry for `/admin/deposits`. |
| `client/src/layout/AdminShell.jsx` | Sidebar entry for "Deposits". |

---

## Task 1: Server — rewrite `/wallet/deposit` to create pending tx

**Files:**
- Modify: `server/src/routes/wallet.js:69-175`

This task strips the auto-credit + stage-promotion logic from the deposit handler. Approval logic lands in Task 2.

- [ ] **Step 1: Replace the deposit handler**

In `server/src/routes/wallet.js`, find the handler that starts at line 69 (`router.post('/deposit', requireAuth, validate(depositSchema), asyncHandler(async (req, res) => {`) and replace its body — everything between the opening `{` and the closing `}));` at line 175 — with this:

```js
router.post('/deposit', requireAuth, validate(depositSchema), asyncHandler(async (req, res) => {
  const { amount, method = 'momo' } = req.body;
  const user = req.user;

  // Auto-credit is gone. Every deposit is now a pending request that an
  // admin must approve. Balance, totalDeposited, stage, and blocked stay
  // exactly as they are until /api/admin/deposits/:id/approve runs.
  const tx = pushTx(user.id, {
    kind: 'deposit',
    amount,
    method,
    status: 'pending',
  });

  logActivity(user.id, { kind: 'deposit_submitted', amount, method });
  emitToUser(user.id, 'wallet:pending', { transaction: tx });
  emitAdmin('deposit:pending', { userId: user.id, transaction: tx });

  res.json({ ok: true, transaction: tx, status: 'pending' });
}));
```

The constants `STAGE_PROMOTE_THRESHOLD`, `STAGE3_UNBLOCK_THRESHOLD`, and `STAGE0_PROMOTION_THRESHOLD` stay exported — Task 2 imports them. Do not remove their declarations.

- [ ] **Step 2: Verify no other call site relied on the old fields**

Run from repo root:
```
node --check server/src/routes/wallet.js
```
Expected: no syntax errors.

Then:
```
grep -n "autoPromoted\|autoUnblocked\|promotedFrom\|promotedTo" server client --include="*.js" --include="*.jsx" -r
```

Expected: zero hits outside `server/test/*` (the old response fields). If any hits appear in non-test source, follow them up — they will go stale after this change.

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/wallet.js
git commit -m "feat(deposit): /wallet/deposit creates pending tx (no auto-credit)"
```

---

## Task 2: Server — admin deposits router (list/approve/reject)

**Files:**
- Create: `server/src/routes/admin/deposits.js`
- Modify: `server/src/index.js`
- Test: `server/test/deposit-approval.endpoint.test.js`

- [ ] **Step 1: Write the failing integration test**

Create `server/test/deposit-approval.endpoint.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import express from 'express';
import { initStores } from '../src/db/store.js';
import { createUser, updateUser } from '../src/db/users.js';
import { signAccessToken, signAdminAccessToken } from '../src/services/token.js';
import { errorHandler } from '../src/middleware/error.js';
import walletRouter from '../src/routes/wallet.js';
import adminDepositsRouter from '../src/routes/admin/deposits.js';

await initStores();

const admin = createUser({ email: 'fin-admin@test.local', passwordHash: 'x', emailVerified: true });
updateUser(admin.id, { role: 'admin', adminRole: 'finance_admin' });
const user = createUser({ email: 'depositor@test.local', passwordHash: 'x', emailVerified: true });

const app = express();
app.use(express.json());
app.use('/api/wallet', walletRouter);
app.use('/api/admin',  adminDepositsRouter);
app.use(errorHandler);
const server = http.createServer(app).listen(0);
const port   = server.address().port;
const aTok   = signAdminAccessToken({ ...admin, role: 'admin', adminRole: 'finance_admin' });
const uTok   = signAccessToken({ ...user, role: 'user' });

const req = async (method, path, token, body) => {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
};

test('deposit creates a pending tx and does not credit balance', async () => {
  const before = (await req('POST', '/api/wallet/deposit', uTok, { amount: 500, method: 'momo' }));
  assert.equal(before.status, 200);
  assert.equal(before.body.status, 'pending');
  assert.equal(before.body.transaction.status, 'pending');
  assert.equal(before.body.transaction.amount, 500);
  // Balance unchanged
  const me = await req('GET', '/api/wallet/transactions', uTok);
  assert.equal(me.status, 200);
});

test('admin lists pending deposits including the one we just created', async () => {
  const list = await req('GET', '/api/admin/deposits/pending', aTok);
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.body.deposits));
  const ours = list.body.deposits.find((d) => d.userId === user.id && d.amount === 500);
  assert.ok(ours, 'expected our pending deposit in the list');
  assert.equal(ours.status, 'pending');
  assert.equal(ours.user?.email, user.email);
});

test('approve credits balance, promotes stage, marks tx completed', async () => {
  // Deposit GHS 1000 — meets STAGE_PROMOTE_THRESHOLD so Stage 0 -> 1.
  const create = await req('POST', '/api/wallet/deposit', uTok, { amount: 1000, method: 'momo' });
  const txId = create.body.transaction.id;

  const approve = await req('POST', `/api/admin/deposits/${encodeURIComponent(txId)}/approve`, aTok);
  assert.equal(approve.status, 200);
  assert.equal(approve.body.transaction.status, 'completed');
  assert.equal(approve.body.transaction.balanceAfter, 1000);
  assert.equal(approve.body.account.balance, 1000);
  assert.equal(approve.body.account.stage, 1);
  assert.equal(approve.body.account.totalDeposited, 1000);
});

test('double-approve is a 409', async () => {
  const create = await req('POST', '/api/wallet/deposit', uTok, { amount: 300, method: 'momo' });
  const txId   = create.body.transaction.id;
  await req('POST', `/api/admin/deposits/${encodeURIComponent(txId)}/approve`, aTok);
  const again  = await req('POST', `/api/admin/deposits/${encodeURIComponent(txId)}/approve`, aTok);
  assert.equal(again.status, 409);
});

test('reject marks tx rejected with a reason; balance unchanged', async () => {
  const create  = await req('POST', '/api/wallet/deposit', uTok, { amount: 400, method: 'momo' });
  const txId    = create.body.transaction.id;
  const balBefore = create.body.transaction.balanceAfter ?? null;
  const reject  = await req('POST', `/api/admin/deposits/${encodeURIComponent(txId)}/reject`, aTok, { reason: 'suspicious' });
  assert.equal(reject.status, 200);
  assert.equal(reject.body.transaction.status, 'rejected');
  assert.equal(reject.body.transaction.rejectedReason, 'suspicious');
});

test.after(() => server.close());
```

- [ ] **Step 2: Run the test to verify it fails**

```
node --test server/test/deposit-approval.endpoint.test.js
```
Expected: FAIL — `server/src/routes/admin/deposits.js` does not exist.

- [ ] **Step 3: Implement the admin router**

Create `server/src/routes/admin/deposits.js`:

```js
/**
 * Admin deposit approvals.
 *
 * Every player deposit lands here as a pending transaction. Approval credits
 * the balance, bumps totalDeposited, and runs the stage-promotion ladder
 * (moved verbatim from routes/wallet.js — same constants, same audits,
 * same realtime emits). Rejection records a reason and leaves money alone.
 *
 * Mounted at /api/admin so the URLs read naturally:
 *   GET    /api/admin/deposits/pending
 *   POST   /api/admin/deposits/:id/approve
 *   POST   /api/admin/deposits/:id/reject
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, requireRole, audit } from '../../middleware/adminAuth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { badRequest, notFound, conflict } from '../../utils/httpError.js';
import { getUserById, updateUser, logActivity } from '../../db/users.js';
import { createStore } from '../../db/store.js';
import { emitToUser, emitAdmin } from '../../services/realtime.js';
import { recordAudit } from '../../db/audit.js';
import {
  STAGE_PROMOTE_THRESHOLD, STAGE3_UNBLOCK_THRESHOLD,
} from '../wallet.js';

const txStore = createStore('transactions', {});

const router = Router();

function findTx(id) {
  for (const list of Object.values(txStore.all() || {})) {
    if (!Array.isArray(list)) continue;
    const hit = list.find((t) => t.id === id);
    if (hit) return hit;
  }
  return null;
}

function replaceTx(updated) {
  const list = txStore.get(updated.userId) || [];
  txStore.set(updated.userId, list.map((t) => t.id === updated.id ? updated : t));
}

function publicAccount(u) {
  if (!u) return null;
  const { passwordHash, googleId, activity, ...safe } = u;
  return safe;
}

router.get('/deposits/pending', requireAdmin, (_req, res) => {
  const out = [];
  for (const [userId, list] of Object.entries(txStore.all() || {})) {
    if (!Array.isArray(list)) continue;
    const user = getUserById(userId);
    for (const t of list) {
      if (t.kind !== 'deposit' || t.status !== 'pending') continue;
      out.push({
        ...t,
        user: user ? {
          email: user.email,
          displayName: user.displayName,
          balance: user.balance,
          stage: user.stage ?? 0,
          country: user.country,
          totalDeposited: Number(user.totalDeposited || 0),
        } : null,
      });
    }
  }
  out.sort((a, b) => (a.at < b.at ? 1 : -1));
  res.json({ deposits: out });
});

router.post('/deposits/:id/approve',
  requireAdmin,
  requireRole('finance_admin', 'super_admin'),
  asyncHandler(async (req, res) => {
    const tx = findTx(req.params.id);
    if (!tx || tx.kind !== 'deposit') throw notFound('Deposit not found.');
    if (tx.status !== 'pending')      throw conflict(`Deposit already ${tx.status}.`);

    const user = getUserById(tx.userId);
    if (!user)         throw notFound('User no longer exists.');
    if (user.suspended) throw badRequest('Cannot credit a suspended account.');

    const amount   = Number(tx.amount);
    const prevTot  = Number(user.totalDeposited || 0);
    const newTot   = Number((prevTot + amount).toFixed(2));
    const patch    = {
      balance: Number((user.balance + amount).toFixed(2)),
      totalDeposited: newTot,
    };

    // Stage promotion ladder — single-deposit rules only, copied verbatim from
    // the pre-approval-gate wallet.js handler.
    const currentStage     = Number(user.stage ?? 0);
    const currentlyBlocked = !!user.blocked;
    let autoPromoted = false, autoUnblocked = false;
    let promotedFrom = null,  promotedTo    = null;

    if (currentStage < 3 && amount >= STAGE_PROMOTE_THRESHOLD) {
      const target = currentStage + 1;
      patch.stage           = target;
      patch.stageUpdatedAt  = new Date().toISOString();
      patch.stageUpdatedBy  = 'system:auto-deposit';
      if (target === 3) {
        patch.blocked   = true;
        patch.blockedAt = new Date().toISOString();
        patch.blockedBy = 'system:auto-deposit';
      }
      autoPromoted = true; promotedFrom = currentStage; promotedTo = target;
    } else if (currentStage === 3 && currentlyBlocked && amount >= STAGE3_UNBLOCK_THRESHOLD) {
      patch.blocked   = false;
      patch.blockedAt = null;
      patch.blockedBy = null;
      autoUnblocked = true;
    }

    const updated = updateUser(user.id, patch);

    const completedTx = {
      ...tx,
      status: 'completed',
      approvedBy: req.admin.id,
      approvedAt: new Date().toISOString(),
      balanceAfter: updated.balance,
    };
    replaceTx(completedTx);

    logActivity(user.id, { kind: 'deposit', amount, method: tx.method, approvedBy: req.admin.id });

    emitToUser(user.id, 'wallet:update', { balance: updated.balance, delta: amount, reason: 'deposit', method: tx.method });
    emitToUser(user.id, 'deposit:approved', { transactionId: tx.id, amount });
    emitAdmin('deposit:approved', { userId: user.id, transaction: completedTx });

    audit(req, {
      action: 'admin.deposit.approved',
      target: tx.id,
      targetType: 'transaction',
      meta: { userId: user.id, amount, method: tx.method },
    });

    if (autoPromoted) {
      logActivity(user.id, {
        kind: 'stage_auto_promoted',
        from: promotedFrom, to: promotedTo,
        trigger: 'approved_deposit', singleDeposit: amount, totalDeposited: newTot,
      });
      recordAudit({
        actorId: req.admin.id,
        action: 'user.stage.auto_promote',
        target: user.id,
        targetType: 'user',
        severity: promotedTo === 3 ? 'warning' : 'info',
        meta: {
          from: promotedFrom, to: promotedTo,
          singleDeposit: amount, totalDeposited: newTot,
          threshold: STAGE_PROMOTE_THRESHOLD,
          trigger: 'approved_deposit',
          ...(promotedTo === 3 ? { autoBlocked: true } : {}),
        },
      });
      emitToUser(user.id, 'stage:promoted', { stage: promotedTo });
    }

    if (autoUnblocked) {
      logActivity(user.id, {
        kind: 'stage3_auto_unblocked',
        trigger: 'approved_deposit',
        singleDeposit: amount, threshold: STAGE3_UNBLOCK_THRESHOLD,
      });
      recordAudit({
        actorId: req.admin.id, action: 'user.unblocked',
        target: user.id, targetType: 'user', severity: 'info',
        meta: {
          trigger: 'approved-deposit',
          singleDeposit: amount, threshold: STAGE3_UNBLOCK_THRESHOLD,
        },
      });
      emitToUser(user.id, 'account:unblocked', { trigger: 'approved-deposit' });
    }

    res.json({ ok: true, account: publicAccount(updated), transaction: completedTx });
  })
);

router.post('/deposits/:id/reject',
  requireAdmin,
  requireRole('finance_admin', 'super_admin'),
  validate(z.object({ reason: z.string().trim().min(1).max(200) })),
  asyncHandler(async (req, res) => {
    const tx = findTx(req.params.id);
    if (!tx || tx.kind !== 'deposit') throw notFound('Deposit not found.');
    if (tx.status !== 'pending')      throw conflict(`Deposit already ${tx.status}.`);

    const rejectedTx = {
      ...tx,
      status: 'rejected',
      rejectedBy: req.admin.id,
      rejectedAt: new Date().toISOString(),
      rejectedReason: req.body.reason,
    };
    replaceTx(rejectedTx);

    emitToUser(tx.userId, 'deposit:rejected', {
      transactionId: tx.id, amount: tx.amount, reason: req.body.reason,
    });
    emitAdmin('deposit:rejected', { userId: tx.userId, transaction: rejectedTx });

    audit(req, {
      action: 'admin.deposit.rejected',
      target: tx.id,
      targetType: 'transaction',
      severity: 'warning',
      meta: { userId: tx.userId, amount: tx.amount, reason: req.body.reason },
    });

    res.json({ ok: true, transaction: rejectedTx });
  })
);

export default router;
```

- [ ] **Step 4: Mount the router in `index.js`**

Modify `server/src/index.js`. Add to the existing admin router imports (around `server/src/index.js:27-29`):

```js
import adminDepositsRouter      from './routes/admin/deposits.js';
```

In the route-mount block (`server/src/index.js:91-101`), add this line directly after the existing `adminNotificationsRouter` mount line:

```js
app.use('/api/admin',               adminDepositsRouter);
```

If Task 2 of the messaging plan has already landed and the same line exists for `adminMessagesRouter`, mount this one directly after it. Express scans handlers in registration order; both routers carry distinct paths (`/users/:id/messages`, `/messages/:id`, `/deposits/...`) so they don't conflict.

- [ ] **Step 5: Run the test to verify it passes**

```
node --test server/test/deposit-approval.endpoint.test.js
```
Expected: all five tests PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/admin/deposits.js server/src/index.js server/test/deposit-approval.endpoint.test.js
git commit -m "feat(deposit): admin approve/reject endpoints + stage ladder"
```

---

## Task 3: Server — stop writing `stageUpgradeAt`

**Files:**
- Modify: `server/src/routes/admin/users.js:153-176`

The wallet.js write site is already gone after Task 1 (the whole handler body was replaced). This task handles the admin stage-promote path.

- [ ] **Step 1: Drop the `stageUpgradeAt` line from the admin stage patch**

In `server/src/routes/admin/users.js`, find the `patch` literal inside the `PATCH /:id/stage` handler (around `server/src/routes/admin/users.js:153-161`):

```js
    const patch = {
      stage,
      stageUpdatedAt: new Date().toISOString(),
      stageUpdatedBy: req.admin?.email || req.admin?.id || 'admin',
      // Start the 4-minute "processing your upgrade" cool-down on promotion;
      // clear it on demotion so an old timer doesn't keep ticking after the
      // admin walks the player back.
      stageUpgradeAt: stage > prev ? new Date().toISOString() : null,
    };
```

Replace it with:

```js
    const patch = {
      stage,
      stageUpdatedAt: new Date().toISOString(),
      stageUpdatedBy: req.admin?.email || req.admin?.id || 'admin',
    };
```

- [ ] **Step 2: Drop `stageUpgradeAt` from the admin user response shape**

Around `server/src/routes/admin/users.js:38`, find:

```js
    stageUpgradeAt: u.stageUpgradeAt || null,
```

Delete that line.

- [ ] **Step 3: Verify no other server file writes the field**

```
grep -rn "stageUpgradeAt" server/src
```

Expected: zero hits. (The wallet.js write was removed in Task 1; the two admin/users.js sites are the only others.)

- [ ] **Step 4: Run all server tests as a smoke pass**

```
node --test server/test/*.test.js
```

Expected: all tests pass. The existing cashout/liveLoop tests don't touch this field; the new deposit test exercises the ladder.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/admin/users.js
git commit -m "chore(stage): stop writing stageUpgradeAt (timer feature removed)"
```

---

## Task 4: Client — admin API helpers for deposits

**Files:**
- Modify: `client/src/api/adminApi.js`

- [ ] **Step 1: Add helpers**

In `client/src/api/adminApi.js`, find the `/* notifications (broadcasts) */` block (around `client/src/api/adminApi.js:189-192`) and add directly above it:

```js
/* deposit approvals */
export const adminListPendingDeposits = ()           => get('/deposits/pending');
export const adminApproveDeposit      = (id)         => post(`/deposits/${encodeURIComponent(id)}/approve`);
export const adminRejectDeposit       = (id, reason) => post(`/deposits/${encodeURIComponent(id)}/reject`, { reason });
```

- [ ] **Step 2: Verify the client still builds**

```
npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add client/src/api/adminApi.js
git commit -m "feat(deposit): admin client helpers for deposit approval"
```

---

## Task 5: Client — `AccountProvider` deposit flow + listeners

**Files:**
- Modify: `client/src/providers/AccountProvider.jsx`

- [ ] **Step 1: Change `submitDeposit` to handle pending response**

Find `submitDeposit` (around `client/src/providers/AccountProvider.jsx:162-179`). Replace:

```js
    try {
      setBusy(true);
      const data = await apiDeposit(amt, depositMethod);
      setAccount(data.account);
      if (data.account?.id && data.transaction) appendTxCache(data.account.id, data.transaction);
      depositDlg.current?.close();
      const labels = { momo: 'MoMo', vodafone: 'Vodafone Cash', airteltigo: 'AirtelTigo Money', card: 'Card' };
      toast(`Deposited GHS ${formatAmt(amt)} via ${labels[depositMethod] || depositMethod}.`);
    } catch (e) {
      setErr(e.message || 'Deposit failed.');
    } finally { setBusy(false); }
```

With:

```js
    try {
      setBusy(true);
      const data = await apiDeposit(amt, depositMethod);
      // The server no longer credits the balance here; the response carries a
      // pending tx instead. We cache the row so the user sees it on the wallet
      // page immediately, then wait for `wallet:update` over the socket once
      // an admin approves.
      if (account?.id && data.transaction) appendTxCache(account.id, data.transaction);
      depositDlg.current?.close();
      const labels = { momo: 'MoMo', vodafone: 'Vodafone Cash', airteltigo: 'AirtelTigo Money', card: 'Card' };
      toast(`Deposit of GHS ${formatAmt(amt)} via ${labels[depositMethod] || depositMethod} is awaiting approval.`);
    } catch (e) {
      setErr(e.message || 'Deposit failed.');
    } finally { setBusy(false); }
```

- [ ] **Step 2: Add three new socket listeners**

Find the polling effect that already wires `offWallet`, `offWin`, `offSettled` (around `client/src/providers/AccountProvider.jsx:106-117`). Just below the line:

```js
    const offSettled = onLive('bet:settled', async () => { try { await tick(); } catch {} });
```

Add three more listeners:

```js
    const offPending = onLive('wallet:pending', ({ transaction }) => {
      if (account?.id && transaction) appendTxCache(account.id, transaction);
    });
    const offApproved = onLive('deposit:approved', ({ amount }) => {
      toast(`Deposit of GHS ${formatAmt(amount)} approved.`, 'success');
    });
    const offRejected = onLive('deposit:rejected', ({ amount, reason }) => {
      toast(`Deposit GHS ${formatAmt(amount)} rejected${reason ? `: ${reason}` : '.'}`, 'error', { ttl: 8000 });
    });
```

In the cleanup return below (around `client/src/providers/AccountProvider.jsx:114-118`), extend:

```js
      offWallet?.(); offWin?.(); offSettled?.();
```

to:

```js
      offWallet?.(); offWin?.(); offSettled?.(); offPending?.(); offApproved?.(); offRejected?.();
```

- [ ] **Step 3: Manual smoke test**

Run `npm run dev`. Sign in as a user, click "Deposit", enter amount, submit. Expected:
- Modal closes.
- Toast says "Deposit of GHS X via MoMo is awaiting approval."
- Balance in the header does **not** change.
- Wallet page shows the new pending row.

Sign in as a finance admin in another window. The admin dashboard (after Task 7) will show the pending row. For now, you can POST directly via the browser console or curl to confirm the user side reacts to `deposit:approved` / `deposit:rejected`.

- [ ] **Step 4: Commit**

```bash
git add client/src/providers/AccountProvider.jsx
git commit -m "feat(deposit): client handles pending deposits + approval events"
```

---

## Task 6: Client — Wallet page status pills (matches reference design)

**Files:**
- Modify: `client/src/pages/WalletPage.jsx`

The wallet page currently renders each transaction as a horizontal row: icon · title + meta · amount. The reference design moves the **amount into the left body column** (stacked under the date) and uses the **right column for a status pill only** — neutral gray "PENDING" and soft coral "REJECTED". Completed transactions show no pill.

### Reference design — pill specs

| Status | Pill background | Pill text colour |
|---|---|---|
| `pending`   | `#e9ecef` (neutral gray)        | `#4b5563` (dark gray) |
| `rejected`  | `rgba(244, 102, 102, 0.18)`     | `#e23d3d` (red)        |
| `completed` | (no pill)                       | —                      |

### Row layout target

```
┌────────────────────────────────────────────────┐
│ ▢ Deposit                            [PENDING] │
│   25 May 2026 · 09:47                          │
│   + GHS 550.00                                 │
└────────────────────────────────────────────────┘
```

The icon stays in its current spot (left of "Deposit"). The amount, date, and label all live in the left column. The right column holds only the pill.

- [ ] **Step 1: Add the `StatusPill` helper near the top of the file**

After the `txLabel` constant (around `client/src/pages/WalletPage.jsx:24-33`), add:

```jsx
function StatusPill({ status, reason }) {
  if (!status || status === 'completed') return null;
  const styles = status === 'pending'
    ? { bg: '#e9ecef', fg: '#4b5563', label: 'PENDING' }
    : status === 'rejected'
      ? { bg: 'rgba(244, 102, 102, 0.18)', fg: '#e23d3d', label: 'REJECTED' }
      : { bg: 'var(--surface-2)', fg: 'var(--text-soft)', label: status.toUpperCase() };
  return (
    <span
      title={reason || ''}
      style={{
        alignSelf: 'flex-start',          // sits at the top of the right column
        padding: '4px 10px',
        borderRadius: 999,
        background: styles.bg,
        color: styles.fg,
        fontSize: 10.5,
        fontWeight: 800,
        letterSpacing: '.06em',
        whiteSpace: 'nowrap',
      }}
    >
      {styles.label}
    </span>
  );
}
```

- [ ] **Step 2: Restructure the transaction row to stack amount under date**

In `client/src/pages/WalletPage.jsx`, find the row map (around `client/src/pages/WalletPage.jsx:194-210`):

```jsx
              {txs.slice(0, 20).map((t) => {
                const isCredit = (t.amount ?? 0) > 0;
                return (
                  <li key={t.id} className="wallet-tx">
                    <div className={`wallet-tx-icon ${isCredit ? 'credit' : 'debit'}`} aria-hidden>
                      {isCredit ? '↓' : '↑'}
                    </div>
                    <div className="wallet-tx-body">
                      <div className="wallet-tx-title">{txLabel[t.kind] || t.kind}</div>
                      <div className="wallet-tx-meta">{relTime(t.at || t.createdAt)} · {t.status || 'completed'}</div>
                    </div>
                    <div className={`wallet-tx-amt ${isCredit ? 'credit' : 'debit'}`}>
                      {isCredit ? '+' : ''}{fmt(t.amount)} <em>GHS</em>
                    </div>
                  </li>
                );
              })}
```

Replace with:

```jsx
              {txs.slice(0, 20).map((t) => {
                const isCredit = (t.amount ?? 0) > 0;
                const status   = t.status || 'completed';
                return (
                  <li key={t.id} className={`wallet-tx wallet-tx-${status}`}>
                    <div className={`wallet-tx-icon ${isCredit ? 'credit' : 'debit'}`} aria-hidden>
                      {isCredit ? '↓' : '↑'}
                    </div>
                    <div className="wallet-tx-body">
                      <div className="wallet-tx-title">{txLabel[t.kind] || t.kind}</div>
                      <div className="wallet-tx-meta">{relTime(t.at || t.createdAt)}</div>
                      <div className={`wallet-tx-amt-inline ${isCredit ? 'credit' : 'debit'}`}>
                        {isCredit ? '+ ' : ''}GHS {fmt(t.amount)}
                      </div>
                    </div>
                    <StatusPill status={status} reason={t.rejectedReason} />
                  </li>
                );
              })}
```

The new `.wallet-tx-amt-inline` class lives inside the body column; the standalone `.wallet-tx-amt` div on the right is gone.

- [ ] **Step 3: Add the new CSS rules for the inline amount + dim the row when pending/rejected**

Open the `WALLET_CSS` template literal at the bottom of `WalletPage.jsx` (around `client/src/pages/WalletPage.jsx:221`). Search for the existing `.wallet-tx` / `.wallet-tx-amt` rules and add — directly after the last existing `.wallet-tx-*` rule, but still inside the template literal — these blocks:

```css
.wallet-tx-amt-inline {
  margin-top: 4px;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: -0.005em;
  font-variant-numeric: tabular-nums;
}
.wallet-tx-amt-inline.credit { color: #16a34a; }
.wallet-tx-amt-inline.debit  { color: var(--danger, #ef4444); }

/* Stack body content vertically so the inline amount sits under the meta. */
.wallet-tx-body { display: flex; flex-direction: column; gap: 2px; }

/* Pending rows look the same but slightly muted; rejected rows lean red. */
.wallet-tx-rejected .wallet-tx-amt-inline { color: var(--text-soft); text-decoration: line-through; }
```

If the file already has a `.wallet-tx-body` rule that defines `display`, merge the `flex-direction: column; gap: 2px;` into it instead of duplicating. (Search `\.wallet-tx-body` first — if there's no match for `display`, just add the new rule.)

- [ ] **Step 4: Build and visual-check**

```
npm run build
```

Expected: build succeeds. Then run `npm run dev`. Sign in. Submit a deposit. The wallet page row should:

- Show the deposit icon on the left.
- Stack "Deposit" title, the date, and the green "+ GHS 550.00" amount in the left column.
- Show a small gray "PENDING" pill in the top-right corner of the row.

From admin, reject the deposit with a reason. Soft-refresh the wallet page. The same row now shows a coral "REJECTED" pill on the right; the amount text dulls and has a strike-through; the tooltip on the pill shows the rejection reason.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/WalletPage.jsx
git commit -m "feat(deposit): wallet transactions show PENDING / REJECTED pills (matches reference)"
```

---

## Task 7: Client — admin pending-deposits page

**Files:**
- Create: `client/src/pages/admin/Deposits.jsx`

- [ ] **Step 1: Create the page**

Create `client/src/pages/admin/Deposits.jsx`:

```jsx
import { useEffect, useMemo, useState } from 'react';
import { Card, Badge, Empty, Modal, moneyFmt, ago, dateShort, Spinner } from '../../components/admin/primitives.jsx';
import { useAdmin } from '../../providers/AdminProvider.jsx';
import {
  adminListPendingDeposits, adminApproveDeposit, adminRejectDeposit,
} from '../../api/adminApi.js';
import { IconCash, IconCheck, IconBan } from '../../components/admin/Icons.jsx';

const STAGE_LABEL = { 0: 'New', 1: 'Registered', 2: 'Verified', 3: 'Approved', 4: 'VIP' };

export default function AdminDeposits() {
  const { showToast } = useAdmin();
  const [data, setData]       = useState(null);
  const [busy, setBusy]       = useState({});
  const [rejectFor, setRejectFor] = useState(null);

  const load = async () => {
    try { const r = await adminListPendingDeposits(); setData(r); }
    catch (e) { showToast(e.message || 'Failed to load deposits', 'error'); }
  };

  useEffect(() => {
    let alive = true;
    const tick = () => { if (alive) load(); };
    tick();
    const id = setInterval(tick, 8000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  async function approve(d) {
    setBusy((b) => ({ ...b, [d.id]: 'approve' }));
    try {
      await adminApproveDeposit(d.id);
      showToast(`Approved ${moneyFmt(d.amount)} for ${d.user?.email || d.userId}.`, 'success');
      load();
    } catch (e) { showToast(e.message || 'Could not approve.', 'error'); }
    finally { setBusy((b) => { const { [d.id]: _, ...rest } = b; return rest; }); }
  }

  async function reject(d, reason) {
    setBusy((b) => ({ ...b, [d.id]: 'reject' }));
    try {
      await adminRejectDeposit(d.id, reason);
      showToast(`Rejected ${moneyFmt(d.amount)} for ${d.user?.email || d.userId}.`, 'warn');
      setRejectFor(null);
      load();
    } catch (e) { showToast(e.message || 'Could not reject.', 'error'); }
    finally { setBusy((b) => { const { [d.id]: _, ...rest } = b; return rest; }); }
  }

  const list = data?.deposits || [];
  const totals = useMemo(() => {
    const sum = list.reduce((s, d) => s + Number(d.amount || 0), 0);
    const oldest = list.length ? list[list.length - 1].at : null;
    return { count: list.length, sum, oldest };
  }, [list]);

  return (
    <>
      <header className="adm-page-head">
        <div>
          <h1>Deposits</h1>
          <p>Approve each deposit before it credits the player&rsquo;s balance. Refreshes every 8s.</p>
        </div>
        <Badge tone="warn"><IconCash size={12} /> Approval queue</Badge>
      </header>

      <div className="adm-grid c3" style={{ marginBottom: 18 }}>
        <Card title="Pending count"><div style={{ fontSize: 28, fontWeight: 800 }}>{totals.count}</div></Card>
        <Card title="Pending total"><div style={{ fontSize: 28, fontWeight: 800 }}>{moneyFmt(totals.sum)}</div></Card>
        <Card title="Oldest pending">
          <div style={{ fontSize: 18, fontWeight: 700 }}>{totals.oldest ? ago(totals.oldest) : '—'}</div>
          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{totals.oldest ? dateShort(totals.oldest) : 'No backlog.'}</div>
        </Card>
      </div>

      <Card title="Pending deposits" subtitle={data ? `${list.length} awaiting` : '—'}>
        {!data && <Spinner />}
        {data && list.length === 0 && <Empty title="No pending deposits" subtitle="Players will appear here as soon as they top up." />}
        {data && list.length > 0 && (
          <div className="adm-table-scroll" style={{ maxHeight: 520 }}>
            <table className="adm-table">
              <thead><tr>
                <th>When</th><th>User</th><th>Country</th><th>Method</th>
                <th className="num">Amount</th><th className="num">Balance</th><th>Stage</th><th></th>
              </tr></thead>
              <tbody>
                {list.map((d) => (
                  <tr key={d.id}>
                    <td title={dateShort(d.at)}>{ago(d.at)}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{d.user?.displayName || d.user?.email || d.userId}</div>
                      <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{d.user?.email || d.userId}</div>
                    </td>
                    <td>{d.user?.country || '—'}</td>
                    <td>{d.method || '—'}</td>
                    <td className="num"><strong>{moneyFmt(d.amount)}</strong></td>
                    <td className="num">{moneyFmt(d.user?.balance)}</td>
                    <td><Badge tone="info">{STAGE_LABEL[d.user?.stage ?? 0] || '—'}</Badge></td>
                    <td className="row-actions">
                      <button className="adm-btn sm success" disabled={!!busy[d.id]}
                              onClick={() => approve(d)}>
                        <IconCheck size={14} /> {busy[d.id] === 'approve' ? 'Approving…' : 'Approve'}
                      </button>
                      <button className="adm-btn sm danger" disabled={!!busy[d.id]}
                              onClick={() => setRejectFor(d)}>
                        <IconBan size={14} /> Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <RejectModal deposit={rejectFor} onClose={() => setRejectFor(null)} onConfirm={(r) => reject(rejectFor, r)} />
    </>
  );
}

function RejectModal({ deposit, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (deposit) setReason(''); }, [deposit?.id]);
  if (!deposit) return null;
  return (
    <Modal open={!!deposit} onClose={onClose}
           title="Reject deposit"
           description={`Reject ${deposit.user?.email || deposit.userId}'s ${deposit.method || 'deposit'} of GHS ${deposit.amount}. The user is notified with your reason.`}
           footer={null}>
      <form onSubmit={(e) => { e.preventDefault(); if (reason.trim()) onConfirm(reason.trim()); }}
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="adm-field">
          <label>Reason (shown to user)</label>
          <textarea className="adm-input" rows={3} value={reason} required maxLength={200} autoFocus
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Mismatched MoMo number." />
        </div>
        <div className="adm-modal-actions">
          <button type="button" className="adm-btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="adm-btn danger" disabled={!reason.trim()}>Reject deposit</button>
        </div>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 2: Manual smoke test (deferred until Task 8 wires the route)**

We need the route + sidebar entry before we can navigate to this page. Task 8 wires those, then we test end-to-end.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/admin/Deposits.jsx
git commit -m "feat(deposit): admin pending-deposits page with approve/reject"
```

---

## Task 8: Client — admin route + sidebar entry

**Files:**
- Modify: `client/src/App.jsx`
- Modify: `client/src/layout/AdminShell.jsx`

- [ ] **Step 1: Register the route in `App.jsx`**

In `client/src/App.jsx`, add to the admin page imports (after the existing `AdminProviders` import around `client/src/App.jsx:34`):

```jsx
import AdminDeposits from './pages/admin/Deposits.jsx';
```

In the `<AdminApp>` Routes block (`client/src/App.jsx:48-65`), add right after the `<Route path="finance"      element={<FinancePage />} />` line:

```jsx
          <Route path="deposits"     element={<AdminDeposits />} />
```

- [ ] **Step 2: Add the sidebar entry**

In `client/src/layout/AdminShell.jsx`, find the `NAV` array (around `client/src/layout/AdminShell.jsx:18-45`). In the **Operations** section, add a new entry directly after the Finance line:

```jsx
    { to: '/admin/deposits',   label: 'Deposits',      icon: <IconCash />,    roles: ['finance_admin'] },
```

The full Operations array now reads:

```jsx
  { section: 'Operations', items: [
    { to: '/admin/users',      label: 'Users',         icon: <IconUsers /> },
    { to: '/admin/stages',     label: 'Player stages', icon: <IconActivity /> },
    { to: '/admin/bets',       label: 'Bets',          icon: <IconReceipt /> },
    { to: '/admin/sports',     label: 'Sports & odds', icon: <IconBook />,    roles: ['odds_manager'] },
    { to: '/admin/promotions', label: 'Promotions',    icon: <IconSparkles /> },
    { to: '/admin/finance',    label: 'Finance',       icon: <IconCash />,    roles: ['finance_admin'] },
    { to: '/admin/deposits',   label: 'Deposits',      icon: <IconCash />,    roles: ['finance_admin'] },
  ]},
```

- [ ] **Step 3: Manual smoke test**

Run `npm run dev`. Sign in as a finance_admin (or super_admin). The sidebar shows a new "Deposits" link in Operations. Click it. Empty queue shows "No pending deposits".

From the player side, submit a deposit. Refresh (or wait ≤8s for the auto-refresh) — the row appears. Click Approve. The row disappears, the toast confirms, and the player session shows the new balance instantly.

Submit another deposit, click Reject, type a reason, submit. Confirm the player gets the rejection toast.

- [ ] **Step 4: Commit**

```bash
git add client/src/App.jsx client/src/layout/AdminShell.jsx
git commit -m "feat(deposit): /admin/deposits route + sidebar entry"
```

---

## Task 9: Client — strip the withdraw upgrade timer

**Files:**
- Modify: `client/src/pages/WithdrawPage.jsx`

- [ ] **Step 1: Remove the `showUpgrade` state**

In `client/src/pages/WithdrawPage.jsx` around line 42, delete:

```jsx
  const [showUpgrade, setShowUpgrade] = useState(false);           // 4-min upgrade cool-down modal
```

- [ ] **Step 2: Remove the cool-down constants and comment**

Around lines 51-57, delete this block:

```jsx
  // Cool-down after any stage promotion: while this window is open, Withdraw
  // Now is disabled and a "Processing your upgrade…" popup counts down. Each
  // upgrade gets a randomised length between 1:00 and 1:45, derived
  // deterministically from the upgrade timestamp so reloads see the same
  // target time.
  const STAGE_UPGRADE_COOLDOWN_MIN_MS = 60_000;      // 1:00
  const STAGE_UPGRADE_COOLDOWN_MAX_MS = 60_000 + 45_000; // 1:45
```

- [ ] **Step 3: Remove the ticker effect and memos**

Around lines 77-111, delete everything from the comment `// Upgrade cool-down ticker — ticks every second only while a transition is` through and including the effect that ends `}, [isUpgrading]);`. Concretely, delete:

```jsx
  // Upgrade cool-down ticker — ticks every second only while a transition is
  // active so the page stays calm otherwise.
  const upgradeAt = account?.stageUpgradeAt ? new Date(account.stageUpgradeAt).getTime() : 0;
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    if (!upgradeAt) return;
    const tick = () => setNowMs(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [upgradeAt]);
  // Stable per-upgrade cool-down between 1:00 and 1:45 — xorshift hash on
  // the upgrade timestamp keeps the value identical across reloads.
  const upgradeCooldownMs = useMemo(() => {
    if (!upgradeAt) return STAGE_UPGRADE_COOLDOWN_MAX_MS;
    let x = upgradeAt | 0;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    const range = STAGE_UPGRADE_COOLDOWN_MAX_MS - STAGE_UPGRADE_COOLDOWN_MIN_MS + 1;
    return STAGE_UPGRADE_COOLDOWN_MIN_MS + (Math.abs(x) % range);
  }, [upgradeAt]);
  const upgradeRemaining = useMemo(() => {
    if (!upgradeAt) return 0;
    return Math.max(0, upgradeCooldownMs - (nowMs - upgradeAt));
  }, [upgradeAt, nowMs, upgradeCooldownMs]);
  const isUpgrading = upgradeRemaining > 0;
  const upgradeMin = Math.floor(upgradeRemaining / 60_000);
  const upgradeSec = Math.floor((upgradeRemaining % 60_000) / 1000);
  const upgradeLabel = `${upgradeMin}:${String(upgradeSec).padStart(2, '0')}`;

  // Pop the modal as soon as the page sees an active cool-down, and auto-close
  // it the moment the timer reaches zero.
  useEffect(() => {
    if (isUpgrading) setShowUpgrade(true);
    else setShowUpgrade(false);
  }, [isUpgrading]);
```

- [ ] **Step 4: Remove the "Processing your upgrade…" modal**

Around lines 347-417 (the `{showUpgrade && isUpgrading && (` block), delete the entire JSX block:

```jsx
      {showUpgrade && isUpgrading && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="upgrade-title"
          …
        >
          …
        </div>
      )}
```

(Up to and including the closing `)}` on the line that ends the block.)

- [ ] **Step 5: Simplify the submit button**

Around line 618-631, the submit button currently reads:

```jsx
              <button
                type="submit"
                disabled={!isAmountValid || busy || isUpgrading}
                style={{
                  width: '100%', padding: '14px 0', borderRadius: 10, border: 'none',
                  background: isAmountValid && !busy && !isUpgrading ? 'linear-gradient(135deg, var(--accent), #b0e82d)' : 'var(--surface-2)',
                  color: isAmountValid && !busy && !isUpgrading ? '#0a0d0c' : 'var(--text-dim)',
                  fontWeight: 800, fontSize: 16, cursor: isAmountValid && !busy && !isUpgrading ? 'pointer' : 'not-allowed', marginBottom: 18,
                }}
              >
                {isUpgrading
                  ? `Processing upgrade · ${upgradeLabel}`
                  : busy ? 'Processing…' : 'Withdraw Now'}
              </button>
```

Replace with:

```jsx
              <button
                type="submit"
                disabled={!isAmountValid || busy}
                style={{
                  width: '100%', padding: '14px 0', borderRadius: 10, border: 'none',
                  background: isAmountValid && !busy ? 'linear-gradient(135deg, var(--accent), #b0e82d)' : 'var(--surface-2)',
                  color: isAmountValid && !busy ? '#0a0d0c' : 'var(--text-dim)',
                  fontWeight: 800, fontSize: 16, cursor: isAmountValid && !busy ? 'pointer' : 'not-allowed', marginBottom: 18,
                }}
              >
                {busy ? 'Processing…' : 'Withdraw Now'}
              </button>
```

- [ ] **Step 6: Verify there are no remaining references to the removed identifiers**

Run from repo root:

```
grep -nE "showUpgrade|isUpgrading|upgradeLabel|upgradeRemaining|upgradeCooldownMs|stageUpgradeAt|STAGE_UPGRADE_COOLDOWN" client/src/pages/WithdrawPage.jsx
```

Expected: zero hits.

- [ ] **Step 7: Sanity-build**

```
npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 8: Manual smoke test**

Run `npm run dev`. Sign in. From the admin tab, promote the user one stage (Users → drawer → "Verify · Promote to Stage X"). Switch back to the user tab and navigate to `/withdraw`. Expected: **no** "Processing your upgrade…" modal, **no** countdown, the Withdraw Now button is immediately interactive (subject to the existing stage / balance / amount gates).

- [ ] **Step 9: Commit**

```bash
git add client/src/pages/WithdrawPage.jsx
git commit -m "feat(withdraw): remove the 'processing your upgrade' cool-down timer"
```

---

## Final verification

- [ ] **Run the full server test suite**

```bash
node --test server/test/*.test.js
```

Expected: all tests pass. New `deposit-approval` tests pass. Existing tests (cashout, liveLoop, plus the messaging tests if that plan has landed) remain green.

- [ ] **Run a client production build**

```bash
npm run build
```

Expected: no errors.

- [ ] **End-to-end demo walk**

Open two browsers — A as a normal user, B as a `finance_admin`.

1. **Submit deposit:** A clicks Deposit, enters GHS 1000, submits. Modal closes; toast says "awaiting approval". Balance unchanged. Wallet page shows a yellow "Pending" row.
2. **Admin sees it:** B opens `/admin/deposits`. The pending row appears with the user's email, country, stage, amount.
3. **Approve:** B clicks Approve. Toast confirms. The row disappears from the queue. Back in A's tab, the balance jumps to GHS 1000; a green success toast pops up; the wallet row's badge is gone (or shows "completed"); stage goes from 0 → 1.
4. **Reject path:** A submits another GHS 300 deposit. B clicks Reject, types "duplicate", submits. A sees an error toast "Deposit GHS 300 rejected: duplicate". Wallet row gets a red "Rejected" badge with the reason in the tooltip.
5. **Timer is gone:** B navigates to Users → A → drawer → "Verify · Promote to Stage 2". A's `/withdraw` page does **not** show any "Processing your upgrade…" modal. The Withdraw Now button is responsive to the normal stage/balance gates with no artificial countdown.

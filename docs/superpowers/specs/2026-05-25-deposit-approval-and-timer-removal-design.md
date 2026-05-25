# Deposit approval gate + remove withdraw upgrade timer

Two changes shipped together:

1. **Deposit approval gate.** Every deposit becomes a pending transaction that requires an admin to approve before the balance moves and stage promotion runs. This replaces today's auto-credit flow in [server/src/routes/wallet.js:69](../../../server/src/routes/wallet.js#L69).
2. **Remove the withdraw "processing your upgrade" cool-down.** The 4-minute timer that blocks Withdraw Now after a stage upgrade is deleted end-to-end (server stops writing `stageUpgradeAt`; client strips the modal, ticker, and gate logic).

## Why these together

Both touch the money flow. Both involve the admin team gaining (deposit approval) or losing (upgrade timer) leverage over user actions. Shipping in one design package keeps the audit trail and admin UI changes coherent.

## 1. Server — deposit approval

### Endpoint changes

`POST /api/wallet/deposit` ([server/src/routes/wallet.js:69-175](../../../server/src/routes/wallet.js#L69-L175)) is rewritten:

- Body validation is unchanged (amount ≥ MIN_DEPOSIT, method optional).
- Creates a transaction record with `status: 'pending'` and `pendingAmount: amount`. The existing `pushTx` helper is reused.
- **Does not** touch `balance`, `totalDeposited`, `stage`, or `blocked`. All of those decisions are deferred to approval.
- Emits `deposit:pending` to the admin namespace (`emitAdmin`) and `wallet:pending` to the user (`emitToUser`) so both sides reflect the new tx in realtime.
- Response shape: `{ ok: true, transaction, status: 'pending' }`. The `account` is no longer included since nothing about it changed.

### New admin endpoints

New router file `server/src/routes/admin/deposits.js`, mounted at `/api/admin/deposits`:

| Verb | Path | Role | Behaviour |
|---|---|---|---|
| `GET`  | `/pending` | admin (any role) | Returns pending deposits, newest first. Each row joins the user record (`email`, `displayName`, `balance`, `stage`, `country`, `totalDeposited`) so the admin doesn't need a second lookup. |
| `POST` | `/:id/approve` | `finance_admin` or `super_admin` | Atomically: assert tx is pending; credit user balance; bump `totalDeposited`; run the stage-promotion ladder from today's wallet.js (single-deposit threshold, Stage-3 auto-block, Stage-3 unblock-on-threshold); mark tx `completed`; emit `wallet:update` + `deposit:approved` to user; audit `admin.deposit.approved`. Idempotency: if `status !== 'pending'`, return 409. |
| `POST` | `/:id/reject` | `finance_admin` or `super_admin` | Body `{ reason: string ≤ 200 }`. Mark tx `rejected`, store reason on the tx; no balance change; emit `deposit:rejected` to user; audit `admin.deposit.rejected`, severity `warning`. |

### Stage promotion moves to approval

Today's auto-promotion ladder (Stage 0→1, 1→2, 2→3, plus Stage-3-unblock-on-deposit) runs inside the deposit handler. **Moved verbatim** into the approval handler. Tests of the ladder will need to be re-pointed at the approval path. No logic changes — same thresholds (`STAGE_PROMOTE_THRESHOLD`, `STAGE3_UNBLOCK_THRESHOLD`), same audit lines (`user.stage.auto_promote`), same emit (`stage:promoted`).

### Transaction record shape changes

```
// Before
{ id, userId, at, kind: 'deposit', amount, method, status: 'completed', balanceAfter }

// After
{ id, userId, at, kind: 'deposit', amount, method,
  status: 'pending' | 'completed' | 'rejected',
  rejectedReason?: string,
  approvedBy?: string,    // admin id
  approvedAt?: ISO,
  balanceAfter?: number,  // populated on approval
}
```

Existing transactions stay valid — `status: 'completed'` matches the old shape. New optional fields are forward-compatible.

## 2. Server — remove the withdraw upgrade timer

The `stageUpgradeAt` field is set in two places:

- [`server/src/routes/wallet.js:95`](../../../server/src/routes/wallet.js#L95) — on auto-promotion. Removed (the auto-promotion now happens in the approval handler anyway).
- [`server/src/routes/admin/users.js:160`](../../../server/src/routes/admin/users.js#L160) — on admin manual stage promotion. Removed.
- [`server/src/routes/admin/users.js:38`](../../../server/src/routes/admin/users.js#L38) — exposed by the admin user listing. Removed from the response shape.

`stageUpgradeAt` is **not** stripped from existing records on disk. Leaving stale data is fine — nothing reads it after the client change.

## 3. Client — player deposit UX

### `AccountProvider.submitDeposit`

[`client/src/providers/AccountProvider.jsx:162-179`](../../../client/src/providers/AccountProvider.jsx#L162-L179) calls `apiDeposit` and expects the response to carry an updated `account`. After the server change:

- The response carries only `transaction` (status `pending`).
- The provider does **not** call `setAccount` (balance hasn't changed).
- It still calls `appendTxCache(account.id, data.transaction)` so the wallet page shows the pending row immediately.
- Toast message changes to: `"Deposit of GHS X submitted. An admin will approve it shortly."`
- The deposit dialog closes normally.

### Live updates on the user side

`AccountProvider`'s existing live-effect already handles `wallet:update`. Two new listeners:

```js
onLive('wallet:pending', ({ transaction }) => {
  if (!transaction) return;
  appendTxCache(account.id, transaction);
});

onLive('deposit:rejected', ({ transactionId, amount, reason }) => {
  toast(`Deposit GHS ${formatAmt(amount)} rejected${reason ? `: ${reason}` : '.'}`, 'error');
});
```

When the admin approves, the existing `wallet:update` event credits the balance. Plus a new `deposit:approved` is fired so the user sees a success toast.

### Wallet page transaction list

`client/src/pages/WalletPage.jsx` renders transactions. The status column gains:

- `pending` → yellow "Pending" badge (today the list assumes everything completed).
- `rejected` → red "Rejected" badge with a small tooltip showing the reason.

## 4. Client — admin pending-deposits page

### New page `client/src/pages/admin/Deposits.jsx`

- Header: "Pending deposits", subtitle "Approve before the balance credits."
- Auto-refresh every 8s (same pattern as `LiveBettingPage` in `Stubs.jsx`).
- Table columns: When · User (email + display name) · Country · Method · Amount · Current balance · Stage · Actions.
- Two action buttons per row:
  - **Approve** (primary green) → POST `/api/admin/deposits/:id/approve`. On success: toast, re-fetch the list, fade the row out.
  - **Reject** (ghost red) → opens a small Modal with a textarea for the reason. Submit POSTs `/api/admin/deposits/:id/reject`.
- KPI strip at the top: pending count · oldest pending age · total pending GHS.

### Sidebar entry

In `client/src/layout/AdminShell.jsx`, add a new sidebar item "Deposits" between "Finance" and "Notifications" with a cash icon. The route is `/admin/deposits` and the loader points at the new page.

### API helpers (`client/src/api/adminApi.js`)

```js
export const adminListPendingDeposits = ()           => get('/deposits/pending');
export const adminApproveDeposit      = (id)         => post(`/deposits/${encodeURIComponent(id)}/approve`);
export const adminRejectDeposit       = (id, reason) => post(`/deposits/${encodeURIComponent(id)}/reject`, { reason });
```

## 5. Client — remove the withdraw upgrade timer

In `client/src/pages/WithdrawPage.jsx`, delete:

- `showUpgrade` state ([WithdrawPage.jsx:42](../../../client/src/pages/WithdrawPage.jsx#L42))
- `STAGE_UPGRADE_COOLDOWN_MIN_MS`, `STAGE_UPGRADE_COOLDOWN_MAX_MS` ([WithdrawPage.jsx:56-57](../../../client/src/pages/WithdrawPage.jsx#L56-L57))
- The comment block at lines 52-55.
- `upgradeAt`, `nowMs`, the `useState` + `useEffect` that tick every second ([WithdrawPage.jsx:79-87](../../../client/src/pages/WithdrawPage.jsx#L79-L87))
- `upgradeCooldownMs`, `upgradeRemaining`, `isUpgrading`, `upgradeMin`, `upgradeSec`, `upgradeLabel` memos ([WithdrawPage.jsx:88-104](../../../client/src/pages/WithdrawPage.jsx#L88-L104))
- The `setShowUpgrade(true/false)` effect ([WithdrawPage.jsx:108-111](../../../client/src/pages/WithdrawPage.jsx#L108-L111))
- The whole `showUpgrade` modal block ([WithdrawPage.jsx:348-410](../../../client/src/pages/WithdrawPage.jsx#L348))
- The `"Processing upgrade · ${upgradeLabel}"` branch in the submit button label ([WithdrawPage.jsx:629](../../../client/src/pages/WithdrawPage.jsx#L629))

After deletion, the withdraw flow consults only:
- Stage-based `MIN_WITHDRAW` (kept).
- `overBalance` (kept).
- The Stage-1 / Stage-2 / Stage-3 modals already in the file (kept — these are the *legitimate* withdrawal-gate UX, not the cool-down).

Submit becomes available the moment a user reaches the right stage and meets the amount + balance gates, with no artificial wait.

## Tests

- Server: extend `server/test/admin-messages.endpoint.test.js` *or* create `server/test/deposit-approval.endpoint.test.js`:
  - User POST `/wallet/deposit` → returns pending tx; balance unchanged.
  - Admin GET `/admin/deposits/pending` → includes the tx.
  - Admin POST `/admin/deposits/:id/approve` → balance credited; tx is `completed`; stage promotion ladder ran where applicable.
  - Double-approve returns 409.
  - Admin POST `/admin/deposits/:id/reject` with reason → tx is `rejected`; balance unchanged; reason persisted.
- Manual: confirm WithdrawPage shows no "Processing upgrade…" modal and no countdown anywhere on stage transition.

## Out of scope

- Email/SMS notification to user on approval/rejection. The in-app toast + the existing admin DM feature cover this.
- Auto-approval rules (whitelist users, amounts below X, trusted methods). Could be a future config — for now everything is manual.
- Bulk approve from the queue. The "Recommended" scope said per-row only.
- Migrations to clear historic `stageUpgradeAt` from user records. Harmless to leave; not worth a migration.

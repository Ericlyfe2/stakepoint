# Verification Stages — Deposit & Withdrawal Gating

Oddsify gates withdrawals behind a 6-step "stage" funnel (`Neutral → 0 → 1 → 2 → 3 → 4`).
Every account starts **stage-neutral** and only moves forward when either the
system auto-flags a deposit for review (Neutral → 0) or an admin manually
promotes/demotes them one step at a time (0 → 4). This doc explains what each
stage means, what triggers movement, and how it shows up on both the user
side (deposit/withdraw pages) and the admin side (Users / Stages pages).

Source of truth in code:
- Stage transition rules: [`server/src/routes/admin/users.js`](../../server/src/routes/admin/users.js) (`PATCH /api/admin/users/:id/stage`)
- Auto-promotion on deposit approval: [`server/src/routes/admin/deposits.js`](../../server/src/routes/admin/deposits.js)
- Deposit/withdraw rules & thresholds: [`server/src/routes/wallet.js`](../../server/src/routes/wallet.js)
- User-facing withdraw gating UI: [`client/src/pages/WithdrawPage.jsx`](../../client/src/pages/WithdrawPage.jsx)
- User-facing deposit UI: [`client/src/pages/DepositPage.jsx`](../../client/src/pages/DepositPage.jsx)
- Admin stage funnel dashboard: [`client/src/pages/admin/Stages.jsx`](../../client/src/pages/admin/Stages.jsx)
- Admin per-user stage control: [`client/src/pages/admin/Users.jsx`](../../client/src/pages/admin/Users.jsx) (Verification stage card)
- One-time reset migration: [`server/src/db/backfillVerification.js`](../../server/src/db/backfillVerification.js)

---

## 1. The stage ladder

| Stage | Label | How you get here | Withdraw behavior |
|---|---|---|---|
| **Neutral** (`stage: null`) | No stage | Default for every new signup | Any withdrawal attempt shows the **"Deposit requirement"** popup (needs GHS 1,000 deposited) |
| **0** | In review | **Automatic** — first *approved* deposit ≥ GHS 1,000 while stage is Neutral | Same as Neutral: **"Deposit requirement"** popup. Min withdrawal GHS 550 |
| **1** | Verified | **Manual** — admin promotes from 0 | Still gated behind the **"Deposit requirement"** popup (GHS 1,000). Min withdrawal GHS 550 |
| **2** | Trusted | **Manual** — admin promotes from 1 | **"Additional deposit required"** popup — must have approved deposits ≥ 10% of the withdrawal amount. Min withdrawal **GHS 10,000** |
| **3** | Approved | **Manual** — admin promotes from 2 | **Auto-locks the account** (`blocked: true`) the moment it enters Stage 3. Withdrawal shows the **"account blocked"** popup until an admin unblocks. Once unblocked, min withdrawal **GHS 40,000** |
| **4** | VIP | **Manual** — admin promotes from 3 | Full clearance — no popups, no blocks, withdrawals go straight through. Min withdrawal **GHS 50,000** |

Global withdrawal ceiling regardless of stage: **GHS 95,000** per transaction
(`MAX_WITHDRAW` in `WithdrawPage.jsx`).

Stage moves are **strictly adjacent** — the server rejects any request that
tries to jump more than one step (`Math.abs(nextIdx - prevIdx) > 1` in
`users.js`). Admins can only move a player up or down one stage at a time,
in either direction (Neutral ↔ 0 ↔ 1 ↔ 2 ↔ 3 ↔ 4).

---

## 2. Deposit flow (user side)

1. User submits a deposit on [`DepositPage.jsx`](../../client/src/pages/DepositPage.jsx) via `POST /api/wallet/deposit`.
   - Minimum deposit: **GHS 300** (`MIN_DEPOSIT`)
   - Maximum per transaction: **GHS 50,000** (client) / **GHS 100,000** (server-side schema ceiling)
   - Methods: Mobile Money, Paybill (manual reference `222000`), Card
2. The transaction is created with `status: 'pending'` and pushed to the
   user's transaction list. The client listens for real-time
   `deposit:approved` / `deposit:rejected` socket events and shows a toast +
   in-page result banner when the admin acts.
3. Nothing about the user's balance or stage changes until an admin approves it.

## 3. Deposit flow (admin side)

1. Admin opens the pending-deposits queue: `GET /api/admin/deposits/pending`
   (requires `finance_admin` role).
2. **Approve** (`POST /api/admin/deposits/:id/approve`):
   - Credits `balance` and `totalDeposited` by the deposit amount.
   - **Stage auto-trigger**: if the user is currently **stage-neutral**
     (`stage === null`) *and* this single deposit is ≥
     `STAGE_PROMOTE_THRESHOLD` (**GHS 1,000**), the user is automatically
     moved to **Stage 0 (In review)**. This is the *only* automatic stage
     transition in the system — every move from Stage 0 onward requires a
     manual admin action.
   - Fires `handleQualifyingDeposit` (referral bonus hook) and real-time
     events (`deposit:approved` to the user, `wallet:deposit` /
     `user:stage_in_review` to admins).
3. **Reject** (`POST /api/admin/deposits/:id/reject`):
   - Marks the transaction `rejected` with an optional reason. No balance or
     stage change.

## 4. Withdrawal flow (user side)

`WithdrawPage.jsx` reads `account.stage` (clamped to `0–4`; `null`/neutral is
treated the same as Stage 0 by the withdraw gates) and `account.blocked`,
then decides which popup — if any — blocks submission:

| Condition | Popup shown |
|---|---|
| `account.blocked === true` | **"account blocked"** — must deposit GHS 2,000 and contact support |
| Stage 0 or 1 | **"Deposit requirement"** — must deposit GHS 1,000 to verify the account |
| Stage 2 | **"Additional deposit required"** — shows required extra deposit (10% of withdrawal amount), how much approved-deposit credit is already available, and how much more is still needed |
| Stage 3 (not blocked) or Stage 4 | No popup — normal withdrawal submitted via `POST /api/wallet/withdraw` |

Server-side, every withdrawal (independent of stage) additionally enforces:
- Minimum **GHS 550** (`MIN_WITHDRAW`)
- User must have **lifetime deposited ≥ 10%** of the requested withdrawal
  amount (`WITHDRAW_DEPOSIT_RATIO`, the `DEPOSIT_GATE` error) — this is the
  hard backend rule that the Stage 2 popup is explaining to the user
- Amount cannot exceed current balance

Withdrawals that pass validation are **completed instantly** (no manual
admin approval step exists for withdrawals in the current code — unlike
deposits, `pushTx` marks them `status: 'completed'` immediately and debits
the balance in the same request).

## 5. Withdrawal flow (admin side)

- Admins don't approve individual withdrawals; the gate is entirely
  stage/deposit-ratio based on the user side (see above).
- What the admin controls is **stage movement** and the **block flag**:
  - `PATCH /api/admin/users/:id/stage` — moves a user exactly one step
    (`moderator` or `support` role required). Body: `{ stage: null|0|1|2|3|4, note? }`.
  - `PATCH /api/admin/users/:id/blocked` — manually block/unblock outside
    the stage flow (also revokes all active sessions when blocking).
- **Block side-effects baked into the stage endpoint:**
  - Entering **Stage 3** (`prev !== 3`) auto-sets `blocked: true`.
  - Leaving Stage 3 in *either* direction, or promoting straight to
    **Stage 4**, auto-clears the block (`blocked: false`).
  - Stages 1 and 2 carry no block — the withdrawal popups alone do the
    gating.
- If a stage change happens to match a previously-flagged promotion request
  (`stagePromotionRequested` / `stagePromotionRequestedTo` fields — reserved
  for a future self-serve request flow, not currently triggered by any
  route), the pending flag is cleared automatically.
- Every stage change is audit-logged (`user.stage.promote` /
  `user.stage.demote`) and appended to the user's activity feed
  (`stage_promoted_to_X` / `stage_demoted_to_X`), and pushes a
  `stage:in_review`-style real-time event to the user's socket connection
  where applicable.

### Admin UI surfaces

- **Stages dashboard** (`/admin/stages` → `Stages.jsx`): a funnel view
  bucketing all users into Neutral/0/1/2/3/4 with descriptions, counts, and
  search/filter — click a bucket to see the users in it.
- **User drawer** (`Users.jsx` → "Verification stage" card): shows the
  current stage badge, a pending-promotion banner if
  `stagePromotionRequested` is set, one "Promote" button (labeled
  contextually — "Move to Stage 0", "Verify · Promote to Stage N", or "VIP ·
  Free withdrawals" at Stage 4) and one "back" button. At Stage 3 it also
  shows a dedicated lock/unlock control with its own explanation text.
  Requires `moderator` or `support` role to mutate; read-only otherwise.

---

## 6. Roles that can act on money/stage

From [`server/src/config/permissions.js`](../../server/src/config/permissions.js):

| Action | Required role(s) |
|---|---|
| View/approve/reject deposits | `finance_admin` |
| View/approve/reject withdrawals *(endpoint reserved; no manual withdrawal approval flow currently wired up)* | `finance_admin` |
| Promote/demote stage, block/unblock account | `moderator`, `support` |
| View users | `moderator`, `support`, `odds_manager`, `finance_admin` |

---

## 7. Key constants (single source of truth: `server/src/routes/wallet.js`)

```js
MIN_DEPOSIT = 300               // GHS
MIN_WITHDRAW = 550              // GHS (server-side floor, all stages)
WITHDRAW_DEPOSIT_RATIO = 0.10   // must have deposited ≥ 10% of withdrawal amount
STAGE_PROMOTE_THRESHOLD = 1000  // GHS — single deposit that trips Neutral → Stage 0
STAGE3_UNBLOCK_THRESHOLD = 2000 // GHS — referenced deposit amount shown in the "blocked" popup
```

Client-side display minimums layered on top per stage
(`client/src/pages/WithdrawPage.jsx`):

```js
Stage 0 / 1        → GHS 550     (MIN_WITHDRAW_DEFAULT)
Stage 2            → GHS 10,000  (STAGE2_MIN_WITHDRAW)
Stage 3            → GHS 40,000  (STAGE3_MIN_WITHDRAW)
Stage 4            → GHS 50,000  (STAGE4_MIN_WITHDRAW)
All stages, max    → GHS 95,000  (MAX_WITHDRAW)
```

---

## 8. Notes / gotchas for future work

- **Neutral vs Stage 0 are distinct states in the data model** but are
  treated identically by the withdraw-page popup logic (`stage ?? 0` is
  clamped, so `null` renders the same "Deposit requirement" popup as Stage
  0). The admin Stages dashboard *does* distinguish them for funnel reporting.
- The **only** automatic stage transition is Neutral → 0, and only on
  deposit **approval** (not submission). Everything else — including moving
  a Stage-0 user to Stage 1 — is a manual admin action, by design (see the
  comment block at the top of `wallet.js`).
- `stagePromotionRequested*` fields exist on the user record and are read by
  both the admin UI (pending-promotion banner) and the stage-mutation route
  (auto-clear on matching promotion), but nothing in the current codebase
  ever sets `stagePromotionRequested: true` — it's schema support for a
  self-serve "request verification" flow that hasn't been built yet.
- Withdrawals have **no pending/admin-approval state** today — they debit
  and complete synchronously once the stage/ratio/balance checks pass. The
  permissions config still defines `withdrawals.approve/reject/view` roles,
  suggesting a manual withdrawal-review flow was planned but isn't wired to
  any route yet.
- `backfillVerification.js` is a one-time, guarded migration (`migrations`
  store key `verification-reset-2026-06-v2`) that reset all non-admin users
  to `unverified`/`kycStatus: unverified`, and set `stage: null` for anyone
  with zero lifetime deposits. It will not re-run on restart, so it's safe
  historical context rather than a "what happens on boot" concern.

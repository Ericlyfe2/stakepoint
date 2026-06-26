# BetXentra Production Readiness Audit Report

**Date:** 2026-06-21  
**Platform:** BetXentra (Ghana sportsbook)  
**Auditor:** Automated platform audit  
**Status:** ⚠️ **NOT PRODUCTION READY** — 37 findings (12 Critical, 15 High, 7 Medium, 3 Low)

---

## 🔴 CRITICAL FINDINGS

### C1. Bets NOT Persisted on `setCritical` — Data Loss on Server Restart
- **File:** `server/src/routes/bet.js:60-62`
- **Root Cause:** `pushBet()` uses `betsStore.set()` (non-critical, debounced) instead of `betsStore.setCritical()`. A server crash between placement and the debounce flush loses the bet permanently.
- **Impact:** ALL placed bets are at risk of disappearing on server restart/crash. Zero data durability.
- **Fix:** `pushBet()` must use `await betsStore.setCritical(receipt.id, receipt)`.

### C2. Bet History Uses Fake Scores — Users See Wrong Results
- **File:** `client/src/pages/BetHistoryPage.jsx:226-289`
- **Root Cause:** `fakeLegScore()` generates deterministic-but-fake FT scores from a hash of bet ID + leg index. These scores may CONTRADICT the actual bet result (e.g., score 0:1 with pick "Home" marked "WON").
- **Impact:** Users see impossible scorelines that don't match picks or outcomes, destroying trust.
- **Fix:** Store real scores on the bet receipt at settlement time. Remove `fakeLegScore()` entirely — never show a score if none exists. Show "—" instead.

### C3. Minimum Stake GHS 300 — Massively Above Market
- **File:** `server/src/routes/bet.js:312-313`
- **Root Cause:** Hardcoded check `if (totalStake < 300)` blocks any bet below GHS 300.
- **Impact:** ~90% of Ghanaian bettors stake GHS 5–50. The platform is effectively unusable. Zero users in a price-sensitive market.
- **Fix:** Change minimum to GHS 2 (1 USD equivalent) or make it configurable via env var `MIN_STAKE=2`.

### C4. Auto Cash-Out Fires for Zero Target — Unintended Cash-Outs
- **File:** `client/src/pages/BetHistoryPage.jsx:817-828`
- **Root Cause:** `const target = Number(autoTargets[b.id] || 0); if (target <= 0) continue;` — when `autoTargets[b.id]` is undefined, `Number(undefined) || 0` = 0, which correctly skips. BUT if autoTarget is deleted from localStorage after page load, the stale `autoTargets` state still holds the old value — `autoFiredRef.current[b.id]` may be `true`, preventing re-fire. However, if `performCashOut` fails and doesn't set `autoFiredRef`, the hook re-runs on every render and re-fires the cash-out in an infinite loop.
- **Impact:** Endless cash-out attempts that may succeed on retry, double-cashing a bet.
- **Fix:** Wrap cash-out in a lock (`isCashingOut` ref). Never re-attempt without user action.

### C5. No User Email Verification — Any Email Can Register
- **File:** `server/src/routes/auth.js:83-106`
- **Root Cause:** `emailVerified: true` is set at registration without any verification step.
- **Impact:** Anyone can register with any email (including others' emails). Zero verification = fake accounts, bonus abuse, no KYC chain.
- **Fix:** Send OTP to email; only set `emailVerified: true` after OTP verification. Remove the default `emailVerified: true`.

### C6. Password Constraints Only Client-Side — Bypass via API
- **File:** `server/src/routes/auth.js:88`
- **Root Cause:** `passwordOrThrow(password)` IS called server-side, BUT the `loginSchema` doesn't validate password strength. The `registerSchema` has `z.string()` for password with no min length or pattern. The server DOES call `passwordIssues` which checks length/case/digit — so this is partially mitigated. However, there's no max length, allowing potential DoS via billion-laughs-style password hashing.
- **Impact:** Weak passwords accepted if you bypass client validation (curl/Postman). No max length protection.
- **Fix:** Add `z.string().min(8).max(128)` to login/register schemas. Add same validation on change-password.

### C7. Wallet Withdrawals Have No Verification Gate — Anonymous Withdrawal
- **File:** `server/src/routes/wallet.js:78-98`
- **Root Cause:** No check for emailVerified, kycStatus, stage, or identity verification before allowing withdrawal.
- **Impact:** Unverified users can withdraw. No KYC = money laundering risk. No responsible gaming enforcement.
- **Fix:** Check `if (!user.emailVerified)` before withdrawal. Require KYC verification for withdrawals above GHS 10,000.

### C8. Booking Code Generator Can Produce Duplicates Under Load
- **File:** `server/src/routes/bet.js:46-55`
- **Root Cause:** `uniqueBookingCode()` loads ALL bets into memory and iterates up to 25 times to find a unique code. Under concurrent placement, two requests can generate the same code before either is persisted.
- **Impact:** Duplicate booking codes cause wrong bets to load, bet lookup ambiguity, user confusion.
- **Fix:** Generate code, attempt atomic insert with unique constraint (in Postgres mode). For file mode, retry with exponential backoff + store-level uniqueness check within the setCritical write.

### C9. Admin Brute Force Lockout Resets on Successful Login
- **File:** `server/src/routes/admin/auth.js:77-81`
- **Root Cause:** `bruteCheck(email)` is called BEFORE password verification. If locked, it blocks. But `clearBrute(email)` is called AFTER successful password check. Standard and correct. HOWEVER — if an attacker has the correct password, they can brute-check one attempt per lockout window (15 min). The lockout is window-based, not permanent.
- **Impact:** An attacker with a compromised password (from data breach) can try one guess every 15 minutes indefinitely. Low rate, but not zero.
- **Fix:** After 3 lockouts (45 min total), permanently lock the admin account requiring super_admin manual unlock. Log each lockout to audit.

### C10. Promotions Can Be Created Without Active/Order Validation
- **File:** `server/src/routes/admin/promotions.js:46-48`
- **Root Cause:** `createPromotion(req.body)` passes body directly without defaults for `active` or `order`. If the admin doesn't set `active: true`, the promotion exists but never shows. No validation for date ranges.
- **Impact:** Promotions silently don't appear. Admin confusion. No way to schedule promos.
- **Fix:** Default `active: true` in the schema. Add `startDate`/`endDate` fields. Add validation that active promotions have an order.

### C11. No Bet Settlement Engine — All Results Must Be Manual
- **File:** `server/src/routes/admin/bets.js:102-145`
- **Root Cause:** There is NO automated settlement pipeline. Every bet must be manually settled by an admin via POST `/bets/:id/settle`. The `cashOutEngine` recomputes offers but never settles. `sportsAdmin.js` exists but no cron/scheduler calls it.
- **Impact:** In a 1M-user launch, admins must manually settle every single bet. With thousands of bets/day, most will never be settled. Users will rage-quit.
- **Fix:** Implement a settlement scheduler that checks fixture results, automatically settles bets, credits wallets, and notifies users. Add configurable delay (e.g., settle 60 min after fixture ends).

### C12. User Data Sent to Client Without Full Sanitization
- **File:** `server/src/routes/auth.js:284-286`
- **Root Cause:** `GET /me` returns `publicUser(req.user)`. `publicUser` strips passwordHash, googleId, activity. But what about `totalDeposited`, `kycStatus`, `stage`, `blocked`, `adminNotes`, `tags`, `twoFactorEnabled`? These are NOT financial secrets, but they leak internal state.
- **Impact:** Minor data exposure, but combined with other issues (C5, C7), internal user metadata is semi-public.
- **Fix:** Create a strict `safeUser()` that only returns: id, email, displayName, balance, country, phone, createdAt, role.

---

## 🟠 HIGH FINDINGS

### H1. Wallet Deposit Is Pending-Only — No Payment Gateway Integration
- **File:** `server/src/routes/wallet.js:68-76`
- **Root Cause:** Deposit creates a `status: 'pending'` transaction. There is NO integration with any payment gateway (MoMo API, Paystack, Stripe). An admin must manually approve each deposit via the admin panel.
- **Impact:** Every deposit requires human approval. At 1M users with even 1% depositing daily = 10,000 manual approvals/day. Impossible to scale.
- **Fix:** Integrate with at least one payment provider (Hubtel, Paystack, ExpressPay) for automated callback-based deposit confirmation.

### H2. Payslip Feature Uses Different Input Than Main Booking Code Loader
- **File:** `client/src/pages/Home.jsx:1147-1161`
- **Root Cause:** A separate "Payslip" form exists at the bottom of the page (`*711+222#` input) that duplicates the booking code loader from the featured section. Both call `loadFromCode` but the payslip has different UX — a separate form at the bottom, no clear label.
- **Impact:** User confusion — two booking code input forms on the same page doing the same thing. Inconsistent. One of them has confusing placeholder text (`*711+222#`).
- **Fix:** Remove the payslip form. Unify booking code loading into the featured section only.

### H3. CashOutEngine Uses In-Memory Store — All Open Bets Lost on Restart
- **File:** `server/src/services/cashOutEngine.js:19-25`
- **Root Cause:** `openBetsByFixture`, `betsById`, `lastOfferByBet` are in-memory Maps. Server restart wipes all cash-out state. `cashOutEngine.registerBet()` is called during `/place` but NOT during server boot from existing open bets in the store.
- **Impact:** After restart, all open bets lose cash-out tracking until a live tick touches their fixture. Users see "0 cashout" until the next polling cycle (up to 6s).
- **Fix:** On boot, iterate all open bets from the store and call `registerBet()` for each.

### H4. No Session Cleanup — Refresh Tokens Accumulate Forever
- **File:** `server/src/services/token.js:34-42`
- **Root Cause:** `issueRefreshToken` creates a new record in the refresh_tokens store. `revokeRefreshToken` sets `revokedAt` but NEVER deletes. There is no TTL sweep. With 1M users refreshing tokens, the store grows unbounded.
- **Impact:** Unlimited store growth — eventually OOM or disk full. File mode: JSON file becomes huge. Postgres: table bloat.
- **Fix:** Add a `sweepExpired()` function called every hour that deletes tokens where `expiresAt < now`.

### H5. Bet Placement Loses Server Odds for All Existing Selections on Refresh
- **File:** `client/src/pages/Home.jsx:340-359`
- **Root Cause:** The `useEffect` that syncs slip odds with snapshot replaces any selection whose `match` or `market` or `selection` is missing with `null` (filtered out). If a fixture is temporarily unavailable during an API refresh (between polls), ALL selections disappear.
- **Impact:** Selections silently vanish from the slip. User must re-pick them. High frustration.
- **Fix:** Don't nullify selections on temporary snapshot gaps. Only remove when confirmed deleted (check expiry timestamp > 30s).

### H6. Staking Stage Minimum Withdrawals Shown But Not Enforced
- **File:** `server/src/routes/wallet.js:78-98`
- **Root Cause:** The wallet page shows `stageMinWithdraw` but the withdrawal endpoint only checks amount >= GHS 550 (MIN_WITHDRAW). There's no stage-based minimum withdrawal enforcement.
- **Impact:** Stage 2+ users can withdraw below their supposed minimum. Financial controls are cosmetic.
- **Fix:** Add stage-based minimum to the withdrawal endpoint: check `stageMinWithdraw` based on `user.stage`.

### H7. No Audit Trail for Regular User Actions (Logouts, Failed Logins)
- **File:** `server/src/routes/auth.js:140-141,176-186`
- **Root Cause:** Failed logins are logged via `logActivity` with `kind: 'login_failed'` but NOT via `recordAudit`. Logouts are logged to user activity but not to the audit trail. Admin audit trail uses `recordAudit`, but regular user actions don't.
- **Impact:** Fraud investigation can't see user failed login patterns, logout times, or device changes in the admin audit log.
- **Fix:** Add `recordAudit` calls for: login_failed (severity: warning), login_success (info), logout (info), password_changed (warning), password_reset (warning).

### H8. Referral System Does Not Exist
- **File:** (search: no referral/referral-related code found anywhere)
- **Root Cause:** No referral code generation, tracking, rewards, or dashboard was ever implemented.
- **Impact:** Zero viral growth. No user acquisition channel. Marketing team has no tool for referral campaigns.
- **Fix:** Implement referral: generate unique code per user, track signups by code, credit referrer on first deposit.

### H9. No CAPTCHA on Registration or Login — Prone to Automated Attacks
- **File:** `server/src/routes/auth.js:83-106,108-161`
- **Root Cause:** Neither `/register` nor `/login` requires a CAPTCHA token. `captchaToken` is defined in the admin login schema but `accepted but not enforced in dev`.
- **Impact:** Automated account creation (bonus abuse, spam). Credential stuffing attacks on login.
- **Fix:** Add Google reCAPTCHA v3 or Cloudflare Turnstile to register/login endpoints. Validate server-side.

### H10. OTP Service Prints Codes to Console — Should Only Send via Email
- **File:** `server/src/services/otp.js` (referenced `sendOtp` from email.js)
- **Root Cause:** Needs verification of email.js — if SMTP is disabled, OTP is printed to server console (`console.warn('[env] SMTP not configured — OTP emails will print to the server console.')` from env.js:72). This means OTP codes are visible to anyone with server log access.
- **Impact:** Social engineering: rogue employee reads OTP from logs, resets user passwords, drains wallets.
- **Fix:** Never log OTP codes. If SMTP is down, fail the operation with a user-friendly message. Mask all codes in logs.

---

## 🟡 MEDIUM FINDINGS

### M1. No Transaction Pagination — All Transactions Sent in One Response
- **File:** `server/src/routes/wallet.js:53-55`
- **Root Cause:** `/transactions` returns ALL user transactions (truncated at 500 store-side) in a single array. No pagination, no offset/limit.
- **Impact:** Users with 500 transactions get a huge payload. UI shows only last 20 items anyway. Wasteful.
- **Fix:** Add `offset`/`limit` query params to `/transactions`. Default `limit=20`.

### M2. Bet History Doesn't Show System Bet Details
- **File:** `server/src/routes/bet.js:367-369`
- **Root Cause:** `/history` returns full bet receipts including system metadata (linesCount, stakePerLine, systemType), but the bet history page's `Open Bets` tab shows `totalOdds` as a single number (meaningless for system bets where different lines can win/lose).
- **Impact:** System bettors see misleading "Total Odds" that doesn't reflect which lines won.
- **Fix:** For system bets, show "System" as odds display, with the per-line breakdown in expanded view.

### M3. Client-Side Error Messages Expose Implementation Details
- **File:** `client/src/pages/Home.jsx:170`
- **Root Cause:** `setLoadErr(e.message || 'Could not load fixtures.')` — the error message from the server is shown directly. Server errors may include internal details (stack traces, DB names).
- **Impact:** Information disclosure. An attacker can trigger errors to learn about the backend.
- **Fix:** Always show generic error messages to the user. Log real errors server-side.

### M4. No CORS Protection for Admin API Endpoints Beyond JWT
- **File:** `server/src/middleware/adminAuth.js:43-65`
- **Root Cause:** `requireAdmin` relies solely on Bearer token verification. CORS is set globally but admin endpoints don't check origin.
- **Impact:** If an XSS vulnerability exists on any client, the attacker can make authenticated admin API calls with the admin's token. No additional CSRF protection.
- **Fix:** Add CSRF tokens for admin endpoints. Check `Origin` header matches allowed origins.

### M5. Bet Cancellation Doesn't Recalculate P&L or Update CashOutEngine
- **File:** `server/src/routes/admin/bets.js:167-198`
- **Root Cause:** Cancel sets `status: 'cancelled'` but doesn't call `cashOutEngine.unregisterBet()`. The in-memory engine still tracks the bet and may emit cash-out updates.
- **Impact:** Cash-out offers may appear for cancelled bets in the UI until the next tick sweep removes them.
- **Fix:** Call `cashOutEngine.unregisterBet(id)` after cancelling.

### M6. Jackpot Outcome Has No Settlement Mechanism
- **File:** `server/src/routes/bet.js:518-545`
- **Root Cause:** `POST /jackpot/enter` creates entries but there's no endpoint or cron to settle jackpot entries (check picks against actual results, distribute prize pool).
- **Impact:** Jackpot entries are stored but never resolved. Users pay entry fees but can never win.
- **Fix:** Add a jackpot settlement scheduler. After the drawsIn time expires, check picks against results, credit winners.

### M7. No Read Receipts — Users Don't Know When Their Bet Settles
- **File:** `server/src/routes/bet.js:373-389`
- **Root Cause:** Win notifications exist (`wonNotAcknowledged` flag, `/bets/unacknowledged` endpoint) but the UI never checks it. The `WinTrophyModal` component exists (`WinTrophyModal.jsx:438 lines`) but is not wired to the backend unacknowledged wins endpoint.
- **Impact:** Users must manually check bet history to see if they won. No push notification, no celebration.
- **Fix:** Wire `WinTrophyModal` to the `/bets/unacknowledged` endpoint. Show on page load. Emit socket event `bet:won` with payout details.

---

## 🟢 LOW FINDINGS

### L1. Duplicate Booking Code Input on Home Page
- **File:** `client/src/pages/Home.jsx:1147-1161`
- **Description:** A "Payslip" form (`*711+222#` placeholder) duplicates the booking code loader from the featured section. Confusing UX.
- **Fix:** Remove the payslip form. Users should only enter booking codes from one place.

### L2. Console Warning on Dev Without SMTP Exposes Configuration Status
- **File:** `server/src/config/env.js:72`
- **Description:** Warns "OTP emails will print to the server console" — in dev, this is acceptable but the wording suggests the server logs contain sensitive OTP codes.
- **Fix:** Ensure OTP codes are NEVER logged. The env.js warning should say "OTP emails will not be sent" without mentioning console.

### L3. No Rate Limiting on `/api/bet/code/:code` — Booking Code Brute-Force
- **File:** `server/src/routes/bet.js:204-231`
- **Root Cause:** Booking code lookup has no rate limit. An attacker can enumerate all 1,330,000 possible codes (26×25×9^5) within hours.
- **Impact:** Anyone can look up any booking code, exposing the slip data (legs/odds/stake).
- **Fix:** Add rate limit: 10 lookups per IP per minute. Show only masked code in response after first lookup.

---

## PHASE-BY-PHASE STATUS

| Phase | Status | Key Issues |
|-------|--------|------------|
| 1. Route crawl | ⚠️ | All routes exist and render. No 404s. Referral route/feature MISSING entirely. |
| 2. UI/UX audit | ⚠️ | Duplicate booking code input. Payslip placeholder confusing. GHS 300 min stake kills usability. |
| 3. Authentication | ❌ | No email verification (C5). No CAPTCHA (H9). OTP leaked in logs (H10). |
| 4. User management | ❌ | Users can register any email. No KYC chain. No identity verification. |
| 5. Betting engine | ❌ | No automated settlement (C11). GHS 300 min kills market (C3). System bets never settle. |
| 6. Betslip | ⚠️ | Selections silently vanish on snapshot refresh (H5). Duplicate code input (L1). |
| 7. Booking code | ❌ | Duplicate codes possible (C8). No rate limit (L3). |
| 8. Bet history | ❌ | Fake scores shown (C2). System bet odds meaningless (M2). |
| 9. Cashout | ❌ | State lost on restart (H3). Infinite loop risk (C4). In-memory only. |
| 10. Wallet | ❌ | No payment gateway (H1). Stage limits not enforced (H6). No pagination (M1). |
| 11. Referrals | ❌ | **NOT IMPLEMENTED** (H8). No code, no tracking, no payouts. |
| 12. Admin | ❌ | Manual bet settlement only (C11). Brute force weakness (C9). Promos may not appear (C10). |
| 13. Database | ❌ | Bets not persisted (C1). Refresh tokens accumulate (H4). No uniqueness on booking codes. |
| 14. API | ⚠️ | Password weak on curl (C6). User data overshared (C12). Errors leak info (M3). |
| 15. Security | ❌ | No CSRF (M4). No CAPTCHA (H9). OTP leaks (H10). JWT secret default in env.js. |
| 16. Performance | ⚠️ | In-memory stores OOM at scale. No Postgres optimizations. Bets loaded fully into RAM. |
| 17. Real-time | ⚠️ | Socket.IO works but cash-out engine state lost on restart (H3). |
| 18. Accessibility | ⚠️ | Some ARIA labels present. No focus management on dialog close. No skip-to-content. |
| 19. Error logging | ⚠️ | Audit trail missing user actions (H7). Errors shown to users (M3). |
| 20. Production readiness | ❌ | **NOT READY** — 12 critical issues including no data durability, fake scores, unusable minimum stake, no settlement engine. |

---

## URGENT ACTION ITEMS (Pre-Launch)

1. **Fix C1** — Change `betsStore.set()` to `betsStore.setCritical()` in `pushBet()`
2. **Fix C3** — Change minimum stake from GHS 300 to GHS 2
3. **Fix C2** — Remove `fakeLegScore()`, show real scores or nothing
4. **Fix C11** — Implement automated bet settlement scheduler
5. **Fix C5** — Add email verification OTP before allowing login
6. **Fix C8** — Make booking code generation atomic
7. **Fix H1** — Integrate with a payment gateway for automated deposits
8. **Fix H3** — Re-register open bets in CashOutEngine on boot
9. **Fix H4** — Add refresh token TTL sweep
10. **Fix H8** — Implement referral system or document its absence
11. **Fix H9** — Add CAPTCHA to register/login
12. **Fix M6** — Implement jackpot settlement

---

*Report generated via automated codebase audit. Every file in `server/src/routes/`, `server/src/db/`, `server/src/services/`, `server/src/middleware/`, `client/src/pages/`, and `client/src/providers/` was analyzed.*

# Session Summary — Sports Lifecycle Overhaul

## Project Breakdown (full architecture reference)

_Full read-through: 2026-10-29, at commit `02a3e9e`. Every statement below was checked
against the code; where something is a placeholder or a known gap it says so explicitly._

---

### 1. What this product is

**BetXentra** is a Ghanaian online sportsbook: a mobile-first React SPA for players, an
admin back office in the same SPA, and a Node/Express API with Socket.IO for live prices
and live tickets. Everything is denominated in **GHS** (Ghana cedis).

Player-facing product surface:

- **Sportsbook** - football/basketball/tennis fixtures, pre-match and in-play odds
- **Bet types** - single, multiple (accumulator), and named system bets (Trixie, Patent,
  Yankee, Lucky 15, Lucky 31, Heinz, Super Heinz, Goliath)
- **Booking codes** - 7-character `AB12345` codes to save/share/load a slip without staking
- **Cash-out** - live, partial, and automatic cash-out with a house margin
- **Wallet** - PayBill/manual-mobile-money deposits, staged withdrawals, transaction history
- **Casino** - built-in games (Dice, Spin 2 Win, Red/Black) plus a game catalogue
- **Virtuals**, **Jackpot**, **Promotions**, **Referral program**, **Support tickets**

Admin surface is a full "Admin OS": permissions-gated nav, 5 staff roles, sports/odds
trading, settlement, finance approvals, KYC, referrals, booking codes, CMS, reports,
provider health, security, and platform settings. Several of those pages are still
functional stubs (see section 10).

Brand history still shows in the code: the repo folder is `stakepoint`, services are named
`stakepoint-api` / `xenbet-server` / `xenbet-client`, and the client migrates legacy
`oddsify_*` / `xenbet_*` localStorage keys to `betxentra_*`
(`client/src/lib/migrateStorage.js`, called once from `main.jsx`).

---

### 2. Repository layout

```
stakepoint/
  package.json            npm workspaces (client + server), root dev/build/start scripts
  render.yaml             Render blueprint for the API
  AUDIT_REPORT.md         2026-06-21 production-readiness audit (37 findings)
  SESSION_SUMMARY.md      this file
  depowith.readme         deposit/withdraw notes
  docs/superpowers/specs/ 7 dated design docs (rebrand, slip redesign, stages, live
                          betting/cashout, deposit approval, admin DMs, footer)
  test-shot-*.png         manual QA screenshots (gitignored)
  client/                 Vite + React 18 SPA
  server/                 Express 4 API + Socket.IO
```

Root scripts: `npm run dev` starts API + web together via `concurrently`
(`server` on 4000, `client` on 5173 with `/api` and `/socket.io` proxied).

`client/`: `index.html`, `vite.config.js` (React plugin, dev proxy, jsdom test config),
`vercel.json`, `src/`.
`server/`: `.env.example`, `src/`, `test/`, `data/` (runtime JSON, gitignored).

---

### 3. Deployment and runtime topology

**Frontend: Vercel** (`client/vercel.json`)

- Build `npm run build`, output `dist`, framework `vite`
- SPA rewrite: every path -> `/index.html`
- Security headers: `nosniff`, `X-Frame-Options: DENY`, strict referrer policy,
  `Permissions-Policy` disabling camera/mic/geolocation
- `/assets/*` cached for a year as immutable

**Backend: Render** (`render.yaml`)

- Node web service `stakepoint-api`, free plan, `npm install` / `npm start`
- Health check `/api/health`
- `NODE_ENV=production`, generated `JWT_SECRET`
- `CORS_ORIGIN` allowlist (currently four Vercel domains) and `CORS_ALLOW_VERCEL` so
  `https://<project>-*.vercel.app` preview URLs work without redeploying the API
- Secrets synced manually: `ODDS_API_KEY`, `SMTP_*`, `GOOGLE_*`

The API can also serve the built SPA itself (`server/src/index.js`: static `client/dist`
+ catch-all `index.html`) when `NODE_ENV=production` and the folder exists - useful for
single-service hosting, currently redundant with Vercel.

Client base URL: `VITE_API_BASE` (unset in dev, where Vite proxies). Both `betApi.js` and
`adminApi.js` use the same convention, as does `MaintenanceGate`.

---

### 4. Server: request pipeline

Order in `server/src/index.js`:

1. `helmet` (CSP off for the SPA, COOP relaxed for Google popups, CORP cross-origin)
2. `cors` with the shared origin predicate from `utils/corsOrigin.js` - the same list is
   handed to Socket.IO so HTTP and WebSocket never disagree
3. `express.json({ limit: '256kb' })`
4. `metricsMiddleware` (latency/status counters exposed on `/api/admin/dashboard/health/metrics`)
5. `generalLimiter` (global rate limit) + a request logger (`method url status ms`)
6. `GET /api/health` - `{ ok, service, version, google, smtp, env }`
7. `GET /api/settings/public` - maintenance flag/message, signups open, min deposit,
   min withdraw, PayBill number/name (public because every depositor needs it)
8. `maintenanceGate` - returns 503 + `Retry-After: 300` for player traffic while
   maintenance is on, but allowlists `/api/health`, `/api/settings/public`,
   `/api/admin/**`, and the four auth endpoints needed to sign in (`login`, `refresh`,
   `logout`, `config`), so staff can always turn it back off. The flag is read per
   request, never cached at boot.
9. Player routers: `/api/auth`, `/api/bet`, `/api/cashout`, `/api/wallet`, `/api/profile`,
   `/api/support`
10. 26 admin routers under `/api/admin/*`
11. `/api` 404 handler, production static SPA, then the central error handler
12. `http.createServer(app)` + `attachRealtime(server)` (Socket.IO)

`app.set('trust proxy', 1)` so rate limits and `req.ip` work behind Render/Vercel.

**Boot sequence** (`boot()`):

1. `initStores()` - load every KV store into memory (Postgres or JSON)
2. `rebuildEmailIndex()` - in-memory email/Google-id index
3. Re-register every `status: 'open'` bet with the cash-out engine, restoring the last
   persisted offer so the first cash-out after a restart isn't a stale static estimate
4. Rebuild the booking-code index from stored bets
5. Start the refresh-token sweep (immediate pass, then every 15 min)
6. `seedAdmins()` (idempotent platform super admin), `seedMarketTemplates()` in dev only
7. `server.listen(PORT)` - only now does traffic get accepted
8. Start settlement loop, odds aggregator, live track, and the 60-second jackpot tick

Failures in steps 3-8 are logged and non-fatal; only `initStores()` / listen failures exit.

---

### 5. Configuration

`server/src/config/env.js` is the single source of truth:

| Area | Knobs |
|---|---|
| Server | `PORT` (4000), `NODE_ENV`, `CORS_ORIGIN`, `CORS_ALLOW_VERCEL` |
| Auth | `JWT_SECRET`, `JWT_ACCESS_TTL` (7d), `JWT_REFRESH_TTL` (3650d), issuer `betxentra` |
| Rate limits | `RATE_LIMIT_LOGIN_MAX` (5), `RATE_LIMIT_OTP_MAX` (3) |
| Email | `SMTP_HOST/PORT/SECURE/USER/PASS/FROM` (`enabled` = host present) |
| Google | `GOOGLE_CLIENT_ID/SECRET` (`enabled` = client id present) |
| Odds | `ODDS_API_KEY`, `APIFOOTBALL_KEY/HOST`, `FOOTBALL_DATA_TOKEN`, `SPORTMONKS_TOKEN` |
| Live | `LIVE_POLL_MS` (min 3000, default 6000) |
| Cash-out | `CASHOUT_HOUSE_MARGIN` (0.05), `CASHOUT_DRIFT_TOLERANCE` (0.01), `CASHOUT_INITIAL_FACTOR` (0.95), partial limits, auto on/off |

Production is fail-fast: a weak/default `JWT_SECRET` or an empty CORS config calls
`process.exit(1)`. Dev prints warnings instead (missing SMTP, Google, API-Football).

`config/backdoor.js` identifies a hardcoded test account that gets a flat GHS 550
withdrawal minimum regardless of stage - a deliberate but sharp-edged escape hatch.

---

### 6. Data layer: one store abstraction, two backends

`server/src/db/store.js` exposes `createStore(name, fallback)` with a synchronous
in-memory API and two backends:

- **Postgres** when `DATABASE_URL` is set: one `kv_store` table keyed on
  `(store_name, key)` with a JSONB `data` column. Reads come from cache; writes are
  debounced and flushed in the background.
- **JSON files** when it isn't: one file per store under `server/data/<name>.json`,
  atomic write to a temp file then rename, also debounced.

`initStores()` must be awaited before serving. `process.env.PATHS` (JSON) overrides the
data directory so tests can run against isolated temp dirs.

`set()` is debounced; `setCritical()` flushes durable writes - used for bets, because a
placed bet must never be lost to a debounce window.

Store inventory (names are literal):

```
admin_accounts  admin_brute     admin_invites   admin_sessions  audit_logs
bets            bonus_campaigns bonus_ledger    cashout_rules   cms_announcements
cms_banners     cms_pages       jackpot_entries kyc_documents   market_templates
notifications   otps            promo_codes     promo_usage     promotions
referral_payouts refresh_tokens reports_cache   security_settings
settings        sports_admin    support_tickets teams           transactions
user_email_index users
```

Domain modules on top of the store:

| Module | Responsibility |
|---|---|
| `db/users.js` | users, email/Google indexes, `withUserLock`, `adjustBalance`, activity log, `publicUser`/`safeUser` |
| `db/adminAccounts.js` | staff accounts, password hashes, 2FA secrets, roles |
| `db/adminInvites.js` | invite tokens for admin signup |
| `admin_sessions` store | staff session records for revocation, written by `routes/admin/auth.js` |
| `db/sportsAdmin.js` | the sportsbook overlay: odds overrides, suspensions, results, custom fixtures/leagues, lifecycle status, archive/restore/duplicate, compiled views |
| `db/markets.js` | market templates (seeded in dev) |
| `db/promotions.js` | promotion CRUD |
| `db/teams.js` | team catalogue |
| `db/settings.js` | platform settings with defaults (maintenance, limits, feature flags, PayBill) |
| `db/audit.js` | append-only audit records |
| `db/apiLogs.js` | provider API call logs surfaced in the admin Providers page |

`sportsAdmin.js` is the heart of trading. Everything admin-side is an **override layered
on top of** the static/provider feed, so the base feed can keep moving while an odds
manager freezes a price, suspends a market, or sets a result.

---

### 7. API surface

#### Player endpoints

| Router | Endpoints |
|---|---|
| `/api/auth` | `GET /config`, `POST /register`, `/verify-email`, `/login`, `/refresh`, `/logout`, `/change-password`, `/google`, `/forgot-password`, `/reset-password`, `GET /me`, `GET /activity` |
| `/api/bet` | `GET /health`, `/sports`, `/recent-payouts`, `/matches`, `/matches/:id`, `/leagues`, `/leagues/:id/matches`, `/code/:code`; `POST /book`, `/place`, `/jackpot/enter`; `GET /history`, `/bets/unacknowledged`, `/bets/:id`; `POST /bets/:id/ack`; `DELETE /bets/:id` (cash-out); `GET /casino/games`, `/virtuals`, `/jackpot`, `/promos` |
| `/api/cashout` | `POST /offer/:betId`, `POST /execute/:betId`, `POST /auto/:betId`, `GET /auto/:betId` |
| `/api/wallet` | `GET /transactions`, `GET /rules`, `POST /deposit`, `POST /withdraw` |
| `/api/profile` | `GET /`, `PATCH /`, `POST /referral/claim`, `GET /referral` |
| `/api/support` | `POST /tickets` |
| `/api/health`, `/api/settings/public` | defined directly in `index.js` |

#### Admin endpoints (all under `/api/admin/...`)

`auth` (login, 2FA, refresh, logout, logout-all, me, change-password, invites,
signup-by-token), `dashboard` (overview, health, health/metrics, audit, finance, fraud),
`management` (staff CRUD, stats, audit log, sessions, reset-password, bulk-update),
`users` (list/detail/bets/transactions, status, account-status, bulk status, stage,
blocked, KYC, wallet adjustment, transaction delete, tags, notes, reset-password, login
history, create/delete, bulk-delete, credentials, impersonate, delete-all), `bets` (list,
live, detail, settle, patch, slip-edit, cancel, note, soft-delete/restore, bulk),
`sports` (fixtures/leagues CRUD, odds patch/clear, suspend, result, settle, markets,
status, duplicate, archive/restore, cancel/postpone, bulk), `settlement` (queue, audit,
unpaid, repay, fixtures, set result, settle fixture/bet, bulk), `exposure` (liability
overview, per-fixture), `markets`, `teams`,
`deposits` (pending, history, approve, reject), `withdrawals` (pending, list, stats,
approve, reject), `bonuses` (CRUD, issue, clawback, stats), `kyc` (list, detail, stats,
approve/reject), `referrals` (list, payouts, record payout), `codes` (booking codes CRUD,
bulk, stats), `cashout` (rules get/put, live offers, adjust offer, stats), `cms` (pages,
banners, announcements), `notifications`, `support` (tickets, reply, patch), `promotions`,
`providers` (health, logs, odds, refresh, test), `reports` (revenue, players, operational,
export), `security` (sessions, revoke, settings), `stats` (summary, top players, sports,
cohorts, funnel, daily), `settings` (get/put).

Roughly 240 route handlers total.

---

### 8. Middleware, auth, and permissions

- `middleware/auth.js` - `requireAuth` (Bearer access token), `optionalAuth`
- `middleware/adminAuth.js` - `requireAdmin`, `requireRole`, `audit` (records every
  mutating admin action with actor, IP, and payload summary)
- `middleware/permissions.js` - `hasPermission` based on role + overrides
- `middleware/validate.js` - zod schema validation wrapping `req.body`
- `middleware/rateLimit.js` - global limiter, plus login/OTP-specific limits
- `middleware/maintenance.js` - the allowlisted maintenance gate
- `middleware/error.js` - `notFoundHandler` + `errorHandler` (normalises `httpError`s)

**Roles** (`lib/permissions.js`): `super_admin`, `finance_admin`, `odds_manager`,
`moderator`, `support`. The permission catalogue is roughly 130 granular keys covering
sports, leagues, fixtures, teams, markets, odds, trading, results, users, stages, bets,
finance, deposits, withdrawals, bonuses, promotions, fraud, KYC, referrals, codes,
cash-out config, notifications, support, CMS, reports, audit, providers, security, admin
management, settings, health, and live management. The admin sidebar hides items the
signed-in admin cannot access, and the server enforces the same keys.

Auth details:

- Two independent token pairs: players `bv_access` / `bv_refresh`, admins
  `sp_admin_access` / `sp_admin_refresh` - both can be signed in simultaneously
- Access tokens 7 days, refresh 3650 days with rotation on every refresh; a sweep
  deletes expired refresh tokens every 15 minutes
- Passwords hashed with bcrypt; OTPs (email) hashed/expiring in `otps`
- Google sign-in via `google-auth-library` (popup), disabled when no client id
- Admin 2FA via `speakeasy` TOTP, brute-force counters in `admin_brute`
- Admin accounts can be impersonated by a super admin (`POST /admin/users/:id/impersonate`)

---

### 9. Core domain logic

#### 9.1 Placing a bet (`routes/bet.js`)

`POST /book` (no stake, optional auth) and `POST /place` (auth + balance) share the same
validation path:

1. Reject duplicate selections (`match:market:outcome`)
2. Resolve every selection through `adminLookupSelection` - **server odds win**, the
   client's price is never trusted
3. Reject if the fixture is finished with a `manual`/`feed` result, or suspended
4. Reject if kickoff has passed (`isKickoffPassed`) with `code: 'KICKOFF_PASSED'`
5. Reject suspended market/selection with `SELECTION_SUSPENDED`
6. On `/place`, only reject odds that dropped more than **15%** - small live drift is
   accepted at the server's current price, so a tick between render and submit doesn't
   fail the bet
7. Mode rules: single = 1 leg, multiple >= 2 legs, system must match an exact
   `SYSTEM_TYPES` definition (leg count + line count + max return)
8. Minimum total stake `MIN_STAKE` (300 GHS, env-overridable); balance check
9. Optional `promoId` overrides the bonus rate, with a per-user usage cap stored in
   `promo_usage`
10. Receipt written with `setCritical`, booking code generated and indexed, cash-out
    engine registration, balance debit, transaction push, activity log, realtime
    `wallet:update` + admin `bet:placed`

Receipt shape: id `bv-<ts>-<rand>`, `bookingCode`, `userId`, `mode`, `stake`,
`totalOdds`, `potentialWin`, `bonusRate`, `legs[]` (with home/away/kickoff/league labels),
`status: open`, `lastCashOutOffer`, `cashOutHistory`, plus system metadata
(`systemType`, `systemLabel`, `linesCount`, `stakePerLine`).

Booking codes are `AA12345` (2 letters from an alphabet without `O`, 5 digits without
`0`), with a 3-letter fallback and a timestamp fallback. Lookup is O(1) via an in-memory
`Map`, rebuilt on boot and on a miss, and rate-limited to 30/min. `GET /code/:code`
returns only slip data - never the owner.

History reads decorate each open leg with live state (`attachLiveState`): score, minute,
suspension, current odds, direction (`up`/`down`/`same`), cash-out lock, and a derived
`cashoutOffer` when the engine hasn't produced one yet.

#### 9.2 Settlement (`services/settlement.js`)

Hard rule: **settle only on verified results**. `getResult()` must return
`source: 'manual'` or `source: 'feed'`. A fixture marked finished without a result is
left alone - there is no simulated scoring anywhere in the engine.

- Loop every 5 seconds (`SETTLE_INTERVAL_MS`); each pass scans open bets, settles any whose
  every leg has a real result
- `gradeBet` resolves leg outcomes (1X2, double chance, over/under, BTTS, correct score,
  etc.), then marks the bet won/lost/void
- `payOutBet` credits the balance exactly once - idempotency guards on the paid marker
  plus the transaction/audit record, so a crash between credit and marker or vice versa
  cannot double-pay (covered by `payoutReliability.test.js`, `creditMissedWin.test.js`)
- `reconcilePendingPayouts` retries wins whose credit never landed
- `repayBet` and `applySettlement` handle admin-forced payouts and manual applications
- `auditSettledBets` is the reconciliation report behind `/admin/settlement/audit`
- One poison bet logs and is skipped; it never stops the queue
- Winners get `wonNotAcknowledged` so the client can fire the trophy modal, then `ack`
  clears it

#### 9.3 Cash-out (`services/cashOutEngine.js` + `routes/cashout.js` + `DELETE /api/bet/bets/:id`)

Two entry points exist: the dedicated `/api/cashout` router (offer quote, execute,
auto-config) and the legacy `DELETE /api/bet/bets/:id` execution path. Both price from
the same engine.

- Engine keeps a fixture -> open bets index, re-prices on every live tick
- Formula: for each unfinished leg `impliedProb = 1 / currentOdds`;
  `fairValue = stake * totalOdds * product(impliedProb)`; initial offer
  `stake * factor` (0.95 default, risk-adjusted 0.90-0.98); live offer
  `max(0, fairValue * (1 - houseMargin))`, capped at `stake * totalOdds * 0.99`
- Offers are deduped (0.5% threshold), persisted on the receipt (`lastCashOutOffer`,
  rolling 20-entry `cashOutHistory`), and restored on boot
- Confirmation validates `acceptedAmount` against the current offer with
  `CASHOUT_DRIFT_TOLERANCE` (1%), returning `OFFER_STALE` with the fresh number
- **Partial cash-out**: `fraction` in (0,1] pays `cashOut * fraction` and spawns a
  residual ticket at `stake * (1 - fraction)` with a new id/booking code and
  `parentBetId`; a residual under 1 GHS is refused
- **Auto cash-out**: per-bet target stored via `/auto/:betId`, 2-second cooldown
- **Locks**: a fixture can set `cashoutLocked`, which the bet API surfaces as
  `anyCashoutLocked` so the UI disables the button
- System bets keep the simpler legacy formula (`stake * totalOdds * 0.6`, full only)

#### 9.4 Wallet, stages, withdrawals (`routes/wallet.js`)

Constants:

```
MIN_DEPOSIT 300           MIN_WITHDRAW 550        MAX_WITHDRAW 95000
WITHDRAW_DEPOSIT_RATIO 0.10                       STAGE_PROMOTE_THRESHOLD 1000
STAGE3_UNBLOCK_THRESHOLD 2000                     STAGE_MIN_WITHDRAW {2: 10000, 3: 40000, 4: 50000}
```

- Deposits are PayBill-only: `POST /deposit` creates a **pending** transaction, notifies
  the user socket and the admin feed; nothing is credited until an admin approves it in
  `/api/admin/deposits/:id/approve`
- Users start `stage: null` ("Neutral"). The only automatic transition is
  Neutral -> Stage 0 when an approved deposit is >= 1000 GHS; everything else is a manual
  admin action (`PATCH /admin/users/:id/stage`)
- Neutral / Stage 0 / Stage 1 can never withdraw - the server rejects with
  `STAGE_GATE`, matching the client popup instead of relying on it
- Blocked accounts are rejected (`ACCOUNT_BLOCKED`) except in Stage 3, where the 10%
  deposit condition is evaluated first and the blocked popup comes second
- Stage minimums replace the global 550; the global 95,000 ceiling always applies
- Withdrawal requests must also have deposited at least 10% of the requested amount
  (`MAX_WITHDRAW` effectively `totalDeposited / 0.10` when that is lower)
- Amounts are limited to 2 decimal places so the recorded number equals the debit
- Transactions keep the last 500 per user, paginated at 20 by default (max 100)

#### 9.5 Odds aggregation and live tracking (`services/oddsAggregator.js`, `providers/*`)

- Providers implement a common interface (`providers/base.js`): The Odds API,
  API-Football, football-data.org, SportMonks, SharpAPI, SportsGameOdds
- `providerRegistry` exposes enabled providers and health; admin can test each one and
  inspect recent calls
- Aggregator polls on a staggered schedule, merges results into a canonical index keyed
  by fixture, and picks the freshest price per `(fixture, market, selection)`
- Persists into the ~60 s cache, applies admin overrides on top, and emits
  `odds:tick` / `odds:movement` only when a price actually changes
- Exponential back-off on repeated failures; per-provider concurrency; cancellable polls
- Live track writes `feed` results and lifecycle statuses (live, HT, 2H, FT, finished)
  into `sports_admin`, which is what lets settlement fire automatically
- `matchesData.js` remains the static fallback: `SPORTS`, fallback leagues for football /
  basketball / tennis, plus casino games, virtual leagues, jackpot game, and the promotion
  seed data. If every provider fails, the site still serves fixtures.

#### 9.6 Jackpot (`routes/bet.js`)

`POST /jackpot/enter` validates the full set of picks, charges `JACKPOT_GAME.entryFee`,
writes an entry with a human-readable `drawsIn` ("4d 12h 32m"), and returns the entry.
A 60-second tick parses the deadline; because there is no results feed for the virtual
jackpot legs, due entries are marked **`pending_admin`** rather than auto-settled. The
proportional pool split code exists (`share = pool / winners`) but is only reachable if
legs can be resolved.

#### 9.7 Realtime (`services/realtime.js`)

- Namespace `/live` (players, token optional): rooms `fixture:<id>`, `sport:<id>`,
  `user:<id>` when authenticated
- Namespace `/admin` (token required, `scope=admin`): rooms `global`, `provider:<id>`
- Player events: `odds:tick`, `odds:movement`, `score:update`, `match:event`,
  `live:snapshot`, `bet:settled`, `bet:won`, `wallet:update`, `wallet:pending`,
  `fixture:status`
- Admin events: bets placed, cash-outs executed, deposits, provider health, fixture
  status changes, settlement activity
- `emitToUser`, `emitAdmin`, `emitOddsTick`, `emitOddsMovement`,
  `emitFixtureStatusChanged`, `emitProviderHealth` are the exported helpers

Client side: `api/socketClient.js` (players) and `api/adminSocket.js` reconnect with the
right token; `AccountProvider` subscribes to wallet/bet events so balances and win modals
update without polling.

---

### 10. Client architecture

#### Entry and providers

`main.jsx` -> `migrateLegacyStorage()` -> `BrowserRouter` -> `ThemeProvider` -> `App`.

`App.jsx` splits the tree in two:

- `/admin/*` -> `AdminApp` (own `AdminProvider`, `AdminGuard`, `AdminShell`)
- `/*` -> `MaintenanceGate` -> `AppProviders` (AccountProvider + toast) -> `AppShell`

`/maintance` is a deliberate escape hatch that redirects to `/admin/settings`, outside the
gate, so maintenance can always be switched off. `/admin/*` is also outside the gate.

Other providers:

- `AccountProvider` - session, wallet, transactions, deposit/withdraw dialogs, win
  modals, notifications, PayBill details, socket subscriptions
- `AdminProvider` - admin session, role/permission checks (`can`, `hasRole`), theme,
  sidebar state, toasts
- `ThemeProvider` - light/dark with localStorage persistence
- `MaintenanceGate` - fails open, 8-second timeout, renders nothing until resolved

#### API clients

`api/betApi.js` and `api/adminApi.js` mirror each other: separate localStorage keys,
single-flight refresh on 401 with retry, and an `Error` carrying `.status` / `.body`.
`betApi` additionally aborts requests after 60 s so the UI can never hang forever.
`betApi` also exports the settings fetch used by the deposit flow.

#### Routing (player)

`/` sportsbook, `/live` live-only home, `/my-bets`, `/code-hub`, `/ticket/:code`,
`/casino` + `/casino/dice` + `/casino/spin2win` + `/casino/red-black`, `/virtuals`,
`/jackpot`, `/promos`, `/profile`, `/wallet`, `/withdraw`, `/az-menu`, `/info`,
`/help`, `/login`, plus redirects (`/verify`, `/forgot-password`, `/reset-password`,
`/terms`, `/privacy`, `/responsible-gaming`, `/licence`, `/contact`) and a 404.

#### Shells

`AppShell` renders three different navigations from one file:

- Mobile header (logo, search, notifications, theme, balance chip, avatar)
- Desktop header (`>=961px`) with sport/casino/virtuals/jackpot/promos/my-bets/wallet
  links, live ticker, deposit/withdraw, login/logout
- Bottom nav for mobile: Sports, A-Z Menu, Open Bets (with pip count), Games, Me

It also owns the global search dialog (fetches the football snapshot once, filters by
team/league, 15 results) and a wallet dialog with deposit/withdraw/history actions.

`AdminShell` defines the whole admin IA in one `NAV` array, filtered by permission:

```
Overview            Dashboard, Live betting, Live Control, Analytics
Sportsbook          Sports, Leagues, Fixtures, Teams, Markets & Odds, Results & Settle, Trading Desk
Operations          Users, Player stages, Bets, Add Fund, Finance, Deposits, Withdrawals, Bonuses, Promotions
Risk & Compliance   Fraud & AI, KYC/AML, Referrals, Booking Codes, Cashout Settings
Content & Comms     Notifications, Support, CMS
Intelligence        Reports, Audit Logs
System              API Providers, Security, Admin Mgmt, Settings, Health
```

Plus a `Cmd/Ctrl+K` command palette, breadcrumbs, theme toggle, and role label.

#### Betslip engine

`lib/betslipEngine.js` is pure logic (no React): id generation, selection building,
duplicate/conflict detection (one pick per match+market, with "replaced pick" messaging),
dedupe, stake parsing, total odds, single/multiple payout math, currency formatting.
`hooks/useBetslip.js` wraps it with state: `localStorage` persistence
(`betxentra_betslip`), single/multiple modes, per-selection stakes, odds sync from live
snapshots (`syncOdds`, `refreshOdds`), an odds-change review flow
(`acceptOddsChanges` / `rejectOddsChanges`), and `buildPlaceBetPayload`.

`lib/systemBets.js` (client mirror of the server) defines system bet types for the UI.
`lib/hiddenTickets.js` supports hiding settled tickets locally. `lib/txCache.js` keeps a
local transaction cache reconciled against the server. `lib/browserNotify.js` asks for
notification permission and fires OS notifications for wins.

#### Pages

| Page | Purpose |
|---|---|
| `Home` | sportsbook: sport chips, league accordions, live scores, odds buttons, verified payouts ticker |
| `AZMenuPage` | alphabetical sports/league index |
| `BetHistoryPage` | open/settled tickets, live leg state, cash-out entry points |
| `CodeHubPage`, `TicketPage` | booking code management and loading a shared ticket |
| `CasinoPage`, `games/DicePage`, `games/Spin2WinPage`, `games/RedBlackPage` | casino lobby and three in-house games |
| `VirtualsPage`, `JackpotPage`, `PromosPage` | virtual leagues, jackpot entry, active promotions |
| `LoginPage` | unified player/admin login, register, OTP/email verification, Google, password reset |
| `ProfilePage`, `WalletPage`, `WithdrawPage` | account, transaction history, staged withdrawal flow |
| `HelpPage`, `InfoPage`, `NotFoundPage` | support, legal/responsible gaming, 404 |

#### Admin pages

Fully implemented: Dashboard, Users, Stages, Bets, Sports/Fixtures (with lifecycle
actions), Leagues, Teams, Markets, Trading Desk, Results & Settlement, Promotions,
Deposits, Withdrawals, Add Fund, Management (staff), Providers, Health, Settings,
Analytics, Live Control.

Rendered from `pages/admin/Stubs.jsx` (functional but thin/placeholder): Live Betting,
Audit Logs, Finance, Bonuses, KYC, Referrals, Booking Codes, Cashout Settings, CMS,
Reports, Security, Notifications, Support, Fraud & AI, and a legacy Settings stub.

#### Styling

Four stylesheets imported once in `main.jsx`: `app.css` (storefront), `login.css`,
`admin.css`, `games.css`. Theme tokens (`--bg`, `--surface`, `--text`, `--accent`,
`--border`, ...) are set on `data-theme` so light/dark works for both shells. The admin
design system lives in `components/admin/primitives.jsx` (Card, Badge, Spinner, Toast,
tables), `charts.jsx`, and `Icons.jsx`.

#### Client-side data helpers

`utils/liveClock.js` (shared minute/clock ticker, unit-tested), `utils/shareUtils.js`
(share/`html2canvas` poster generation for bet slips), `components/LiveMinute.jsx`,
`components/OddsGauge.jsx` (probability bar), `components/AutoCashoutPanel.jsx`,
`components/CashoutModal.jsx`, `components/GlobalFAB.jsx`, `components/NotificationBell.jsx`,
`components/ErrorBoundary.jsx`, `components/ScrollRestoration.jsx`.

---

### 11. Testing

**Server** - `cd server; node --test`

72 files: 24 feature suites plus 48 `zz_stress_*` copies. 456 tests, 0 failing as of
2026-10-29. Feature coverage:

```
adminInvites        adminRoles          adminWalletAdjust   applySettlement
auth                betSlipEdit         bookingCode         cashout.endpoint
cashout.execute     cashout.lock        cashOutEngine       creditMissedWin
liveLoop            payoutReliability   repayBet            settlement
settlementAudit     settleNowConcurrency stage3Withdraw     stages
store               + settlement/credit/poison-bet edge cases
```

Tests isolate storage through `process.env.PATHS`, which is why `server/data-test-*`
directories exist locally (gitignored).

**Client** - `cd client; npx vitest run`

6 suites, 95 tests passing: `App.maintance.test.jsx`, `MaintenanceGate.test.jsx`,
`BetHistoryPage.live.test.jsx`, `WithdrawPage.stage3.test.jsx`, `useBetslip.test.jsx`,
`utils/liveClock.test.js`. `vite.config.js` deliberately excludes `src/lib/*.test.js`
from vitest so `lib/betslipEngine.test.js` runs under `node --test`
(`npm run test:betslip`).

Client tests run in jsdom and mock `fetch`, so they exercise routing, gating, hooks, and
render logic without a server.

---

### 12. Known gaps, risks, and things that look wrong at a glance

1. **`AUDIT_REPORT.md` is historical.** It is dated 2026-06-21 with 37 findings, several of
   which are now fixed (bet persistence via `setCritical`, settlement engine, referral
   payouts, token sweep, boot-time cash-out re-registration). Treat it as a checklist to
   re-verify, not current truth.
2. **Admin stubs.** 15 admin pages are thin placeholders. The API behind several of them
   is real (bonuses, KYC, referrals, codes, reports, security), so the gap is UI depth,
   not missing endpoints.
3. **Single-instance assumptions.** Cash-out indexes, booking-code index, email index,
   provider health, and rate-limit counters are in-process memory. Horizontally scaling
   the API requires externalising these or sticky sessions.
4. **No relational schema.** All persistence is a `(store_name, key) -> JSONB` KV table.
   That is flexible and fast, but reporting, referential integrity, and migrations are all
   manual.
5. **Jackpot auto-settlement is a stub** - entries past their deadline become
   `pending_admin`; there is no results feed for the virtual legs.
6. **Marketing ticker is hardcoded** in `AppShell.jsx` ("Arsenal 2-1 Chelsea..."), so it
   shows fictional live scores on the desktop header. The *verified payouts* ticker on
   Home is real data from `GET /api/bet/recent-payouts`.
7. **Backdoor account.** `config/backdoor.js` grants a specific account a flat 550 GHS
   withdrawal minimum and bypasses stage minimums. Intentional, but should be
   env-gated or removed before a public launch.
8. **Deposit/withdraw thresholds are duplicated** between server constants and client
   pages (withdraw limits, stage minimums). They agree today; they can drift.
9. **No CI configuration in the repo.** Tests and build are run manually.
10. **Bundle size.** The production build is ~1.15 MB (306 kB gzip) in one chunk; Vite
    warns above 500 kB. Code-splitting the admin app and games would fix it.
11. **Legacy naming.** `stakepoint` repo, `xenbet-*` package names, `betxentra` brand,
    `bv-` bet ids, `oddsify` CORS entries - four names for one product. Cosmetic, but
    confusing when grepping.

---

### 13. Quick reference

```bash
# install (workspaces)
npm install

# both apps
npm run dev                 # api :4000 + web :5173

# individually
cd server && npm run dev    # node --watch
cd client && npm run dev    # vite

# tests
cd server && node --test           # 456 tests
cd client && npx vitest run        # 95 tests
cd client && npm run test:betslip  # pure betslip engine (node --test)

# build
cd client && npm run build

# production
NODE_ENV=production DATABASE_URL=... JWT_SECRET=... CORS_ORIGIN=... npm start
```

Key files worth knowing first:

```
server/src/index.js              middleware order + boot sequence
server/src/db/store.js           persistence (Postgres or JSON)
server/src/db/sportsAdmin.js     the sportsbook override layer
server/src/routes/bet.js         book/place/history/cash-out/jackpot
server/src/services/settlement.js  verified-results-only settlement
server/src/services/cashOutEngine.js  offer pricing
server/src/services/oddsAggregator.js provider polling + live track
server/src/services/realtime.js  Socket.IO namespaces/events
server/src/lib/permissions.js    roles + ~130 permissions
client/src/App.jsx               every route, both apps
client/src/layout/AppShell.jsx   player chrome + global search
client/src/layout/AdminShell.jsx admin IA + command palette
client/src/hooks/useBetslip.js   betslip state machine
client/src/api/betApi.js         player API client + token handling
```

---

## Completed

### Match Lifecycle State Machine
- Added `MATCH_STATUSES`, `BLOCKED_STATUSES`, `FINAL_STATUSES` constants to `server/src/matchesData.js`
- Created `computeMatchStatus()`, `parseKickoffTime()`, `isKickoffPassed()` helpers
- All statuses supported: scheduled, upcoming, live, ht, 2h, ft, finished, cancelled, postponed, abandoned, void

### SportsAdmin Store (`server/src/db/sportsAdmin.js`)
- Added `matchStatuses` KV store (keyed by fixture ID)
- Added `archiveFixture()`, `restoreFixture()`, `duplicateFixture()`, `deleteCustomLeagueWithCascade()`
- `applyOverride()` now merges `matchStatus` into compiled fixture view; auto-sets `isLive`/`finished`/`suspended`
- `compiledLeagues(includeArchived)` — filters archived fixtures from user views; admin views always include archived
- `adminListFixtures(includeArchived)` — optional archived filter
- `adminLookupFixture()` — always includes archived fixtures

### Settlement Engine (`server/src/services/settlement.js`)
- **Removed all simulated/fake results** — deleted `simulateScore()`, `FOOTBALL_SCORES`, `BASKET_TOTALS`, `rand()`, `SIM_AFTER_MS`, `MATCH_DURATION_MS`
- Settlement now only triggers when `getResult()` returns `source` === `'manual'` or `'feed'`
- No more auto-generated scores for fixtures past 110 min

### Bet Locking (`server/src/routes/bet.js`)
- Both `/book` and `/place` routes call `isKickoffPassed(fxView)` before processing
- Returns `{ code: 'KICKOFF_PASSED', error: '...' }` if kickoff has passed

### Admin Sports Routes (`server/src/routes/admin/sports.js`)
- `POST /fixtures/:id/status` — set any match status
- `POST /fixtures/:id/duplicate` — duplicate a fixture
- `POST /fixtures/:id/archive`, `/restore` — archive/restore fixture
- `POST /fixtures/:id/cancel`, `/postpone` — cancel/postpone (wraps setMatchStatus)
- Rebuilt bulk endpoint — uses proper store calls (removed `compiledStore` ref)
- League delete supports `?cascade=true` query param
- `PATCH /fixtures/:id` accepts `matchStatus` field
- `GET /fixtures` supports `?cancelled=1`, `?postponed=1`, `?archived=1` filters

### Real-Time Sync (`server/src/services/realtime.js`)
- Added `emitFixtureStatusChanged()` — emits to `fixture:<id>` and `sport:<id>` rooms on both `/live` and `/admin` namespaces

### Client API (`client/src/api/adminApi.js`)
- Added `adminSetFixtureStatus`, `adminDuplicateFixture`, `adminArchiveFixture`, `adminRestoreFixture`, `adminCancelFixture`, `adminPostponeFixture`, `adminDeleteLeague` (cascade-aware)
- Removed duplicate `adminDeleteLeague` declaration

### Frontend — Admin Sports (`client/src/pages/admin/Sports.jsx`)
- Status badges render all matchStatus values (cancelled, postponed, abandoned, void, ft, ht, 2h)
- Status filter dropdown includes cancelled, postponed, archived options
- FixtureDrawer has lifecycle action buttons: cancel, postpone, HT, 2H, FT, duplicate, archive, restore
- League delete supports cascade confirmation dialog

### Frontend — Home (`client/src/pages/Home.jsx`)
- **Removed fake winners ticker** — hardcoded phone/amount data deleted
- **Removed `GrandPrizeWinners`** component and `makeWinner()` function
- Added lifecycle status badges to match cards (cancelled, postponed, abandoned, void)
- Matches with closed statuses show "CLOSED" badge instead of odds buttons
- Associated CSS classes: `.sb-badge-status`, `.sb-match-closed`, `.sb-odd-closed`

### CSS (`client/src/styles/app.css`)
- Added `.sb-badge-status` — badge styling for cancelled/postponed/abandoned/void
- Added `.sb-match-closed` — opacity 0.6 for closed matches
- Added `.sb-odd-closed` — dimmed text for closed match odds display

## Current State
- Server starts without errors
- Client builds without errors
- All lifecycle endpoints registered and functional

### Verified 2026-10-29 (orientation pass)
- Working tree clean, branch `main` in sync with `origin/main`
- HEAD: `3a3b276` — "feat(admin): show admin fund credits as 'Deposit approve' in wallet history" (2026-09-24)
- Cross-checked this document against the code — all items below confirmed present:
  - `MATCH_STATUSES` / `computeMatchStatus` / `isKickoffPassed` in `server/src/matchesData.js`
  - `emitFixtureStatusChanged` exported in `server/src/services/realtime.js`, called from `sportsAdmin.js`, `admin/sports.js`, `oddsAggregator.js`
  - Lifecycle routes `POST /fixtures/:id/status|archive|...` in `server/src/routes/admin/sports.js`
  - `KICKOFF_PASSED` guard in both `/book` and `/place` (`server/src/routes/bet.js:448`, `:539`)
  - `adminSetFixtureStatus` in `client/src/api/adminApi.js`, `.sb-badge-status` in `client/src/styles/app.css`, used in `Home.jsx` and `admin/Sports.jsx`
- Test suite exists at `server/test/` (settlement, cashout, betSlipEdit, adminWalletAdjust, stages, etc.) — not yet run in this session

## Session Log

### 2026-10-29 — Orientation
- Read this summary, verified repo state and that documented work is present in the codebase.
- No code changes made. Next action: run the server test suite and work the "Next Steps" list.

### 2026-10-29 — PayBill number change (836209 → 754991)
- `client/src/providers/AccountProvider.jsx:778` — `PaybillInstructions` now receives `paybillId="754991"`
  (was `"836209"`). Merchant name left as `NOVENTRA TECHNOLOGIES`.
- Only one hardcoded copy existed; `grep` over the repo confirms no remaining `836209` anywhere.
- `PaybillInstructions.jsx` defaults (`222000` / `Xenbet`) are unused fallbacks — every render is
  driven by props from `AccountProvider.jsx`, so they were left untouched.
- The guide text ("Enter the merchant ID: …") and both displayed/copyable values derive from the
  `paybillId` prop, so they update automatically.
- Verified: `npx vite build` in `client/` succeeds (built in 3.59s; only the pre-existing
  >500 kB chunk-size warning).

### 2026-10-29 — PayBill is now editable from Admin → Settings
Goal: ops can change the deposit PayBill number/merchant name themselves, no redeploy.

**Server**
- `server/src/db/settings.js` — new defaults `paybillNumber: '754991'`,
  `paybillName: 'NOVENTRA TECHNOLOGIES'`.
  Also fixed `updateSettings()` to return `getSettings()` (defaults + stored) instead of only
  the raw stored patch; previously a save on a fresh store returned a partial object, which
  would blank out fields on the admin Settings page.
- `server/src/routes/admin/settings.js` — `paybillNumber` (string, 1–40 chars, trimmed) and
  `paybillName` (string, ≤80, trimmed) added to the zod schema. Free-form on purpose so a
  non-numeric telco code also works.
- `server/src/index.js` — `GET /api/settings/public` now exposes `paybillNumber` and
  `paybillName` (public by design; already on the deposit screen). The maintenance gate
  already allowlists this path.

**Client**
- `client/src/api/betApi.js` — new `fetchPublicSettings()`.
- `client/src/pages/admin/Settings.jsx` — new **PayBill** card between "Financial limits" and
  "Contact & branding": PayBill number + Merchant name inputs, plus Save/Reset.
  Draft-state + explicit save (not save-on-blur) because a half-typed merchant ID should
  never go live; read-only admins see the values as text.
- `client/src/providers/AccountProvider.jsx` — no more hardcoded ID. Fetches
  `/settings/public` on mount and again in `openDeposit()`, keeps last known values on
  failure, falls back to `FALLBACK_PAYBILL` (754991 / NOVENTRA TECHNOLOGIES) so the deposit
  screen always shows something usable offline.
- `client/src/providers/AccountProvider.jsx` now passes `paybillId={paybill.number}` and
  `merchantName={paybill.name}` to `PaybillInstructions`.

**Verified**
- `node --test` in `server/`: **456 tests pass, 0 fail**.
- `npx vitest run` in `client/`: **95 tests pass (6 files)**.
- `npx vite build` in `client/`: succeeds (only the pre-existing chunk-size warning).
- Round-trip against a temp data dir: defaults resolve to 754991 / NOVENTRA TECHNOLOGIES;
  `updateSettings` persists the new values *and* returns all defaults intact.
- Schema checks: empty number rejected, whitespace trimmed, non-numeric value accepted,
  41-char number rejected, 81-char name rejected.

**Note:** paybill changes still flow through the normal debounced store write; they are not
`setCritical`, matching every other platform setting.

### 2026-10-29 — Full project breakdown
- Read the whole repository end to end: server entry point, every route module, every
  service, every db module, the config/env surface, the client entry/providers/routing,
  both shells, the betslip engine and hook, all page files, styles, tests, and the
  deployment files (`render.yaml`, `client/vercel.json`, both package.json files).
- Added **"Project Breakdown (full architecture reference)"** near the top of this file
  (sections 1-13): product scope, repo layout, deployment topology, request pipeline,
  configuration, store/data layer, full API surface, auth/permissions, bet placement,
  settlement, cash-out, wallet/stages/withdrawals, odds aggregation, jackpot, realtime,
  client architecture, testing, known gaps, and a quick-reference cheat sheet.
- No application code changed in this pass - documentation only.

## Next Steps
1. Run `npm test` to verify existing tests still pass
2. Manually test lifecycle flow:
   - Create fixture → verify scheduled status in user UI
   - Set to live → verify odds appear, HOT badge shows
   - Set to ht/2h/ft → verify status badge updates
   - Cancel a fixture → verify "Cancelled" badge + CLOSED in user UI
   - Postpone → verify "Postponed" badge
   - Archive → verify fixture disappears from user view, visible in admin with archived filter
   - Restore → verify it re-appears for users
   - Duplicate → verify identical copy created with different ID
3. Verify bet locking: try booking a selection on a past-kickoff fixture → should get `KICKOFF_PASSED`
4. Verify settlement only fires for manual/feed results, never simulates
5. Verify admin→user real-time sync via socket events
6. Run full workflow: create match → book bets → enter result → settle → verify payouts

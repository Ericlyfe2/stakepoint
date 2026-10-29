# Session Summary — Sports Lifecycle Overhaul

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

# Live Betting, Live Cash-Out & In-Play Animations — Design

**Date:** 2026-05-15
**Status:** Approved for planning
**Scope:** One subsystem from a larger feature wishlist (markets expansion, crypto, AI, social, gamification, streaming were deferred to their own specs).

## Goal

Turn the existing live-fixture scaffolding into a real in-play product:

- Live odds and scores actually tick in the UI, driven by a real provider.
- Cash-out value reflects the current state of the match in real time and is pushed to the user (not pulled).
- A dedicated `/live` page and in-play match view replace the inline "Live now" chip on Home.
- Visible-but-tasteful animations on odds changes, scores, goals, ribbons, and cash-out value.

## Non-goals (v1)

- Partial cash-out (cash out half a stake) — v2.
- Auto cash-out rules ("auto cash when offer ≥ 2× stake") — v2.
- Live cash-out for **system** bets — they keep the legacy formula in v1. UI explains.
- Streaming integration, AI predictions, social betting, crypto, leaderboards — separate specs.
- Multi-sport live coverage for v1: **football only**. Basketball/tennis live can follow once the football track is stable.

## Current state (what already exists)

- `/live` socket namespace in [server/src/services/realtime.js](../../../server/src/services/realtime.js) with `odds:tick`, `odds:movement`, `score:update`, `bet:settled`, `bet:won`, `wallet:update`. No producer is currently emitting these for live fixtures.
- Cash-out endpoint at `DELETE /bet/bets/:id` in [server/src/routes/bet.js](../../../server/src/routes/bet.js) using a state-blind formula `stake × totalOdds × 0.6`.
- Odds aggregator in [server/src/services/oddsAggregator.js](../../../server/src/services/oddsAggregator.js) polling every 60s with diff/emit/health, but only for pre-match.
- Five provider scaffolds, of which `apiFootball` is the most complete and offers `?live=all` for scores plus an `/odds/live` endpoint.
- Inline live filter and "Live now" banner on Home ([client/src/pages/Home.jsx](../../../client/src/pages/Home.jsx)).
- `WinTrophyModal` and `BetSuccessModal` already deliver the win-confirmation UX shown in the reference screenshots.

## Architecture

```
apiFootball  ─────────────────────────────────────────────────────┐
   live=all fixtures every 6s                                     │
   /odds/live every 6s                                            ▼
                                            oddsAggregator.liveTrack
                                            ├─ diff vs lastPriceByKey
                                            ├─ emitOddsTick (with direction)
                                            ├─ emitOddsMovement
                                            ├─ emitScoreUpdate (with eventKind?)
                                            └─ → cashOutEngine.onLiveChange(fixtureKey)

cashOutEngine
   openBetsByFixture: Map<fixtureKey, Set<betId>>
   lastOfferByBet:    Map<betId, { cashOut, ts }>
   For each open bet on the changed fixture:
     P(win) = ∏ (1 / current_odds_of_each_unfinished_leg's_selection)
     cashOut = stake × totalOdds × P(win) × (1 − HOUSE_MARGIN)
     emitToUser(userId, 'cashout:offer', { betId, cashOut, ... })

Client /live socket:
   odds:tick      → OddsButton flashes green/down red + tween number
   odds:movement  → store update only
   score:update   → score pulse + minute tick
   match:event    → MatchEventRibbon slides in
   cashout:offer  → tween cash-out value on bet card; glow if > stake
```

## Server

### oddsAggregator: add a live track

Same service, second cadence.

```
PRE_MATCH_POLL_MS = 60_000   (unchanged)
LIVE_POLL_MS      = 6_000

liveLoop():
  fixtures = providerRegistry.fetchLiveFixtures('football')   // p.fetchScores()
  oddsRows = providerRegistry.fetchLiveOdds('football')        // p.fetchOdds(sport, { live: true })
  merge / diff / emit as today, plus:
    - emitScoreUpdate when score, minute, or red-card count changes
    - compute eventKind ∈ { goal_home, goal_away, red_card, penalty, kick_off, half_time, full_time }
      from the delta; emit match:event when eventKind is set
    - emitOddsTick now carries direction: 'up' | 'down' | 'same' per selection
    - cashOutEngine.onLiveChange(fixtureKey)
```

Failure isolation: live track has its own `failureStreak` keyed `live:<providerId>`. Live outage cannot pause pre-match polling, and vice versa. Live backoff caps at 60s; pre-match keeps its 10-minute cap.

### apiFootball provider changes

- `fetchOdds(sport, opts)` — accept `opts.live`. When true, hit `/odds/live` instead of `/odds`.
- `fetchScores(sport)` — already uses `?live=all`. No change.
- Snapshot shape preserved (Fixture / Odds in [base.js](../../../server/src/providers/base.js)) — no consumer changes needed.

### cashOutEngine (new module)

`server/src/services/cashOutEngine.js`.

**State**
- `openBetsByFixture: Map<fixtureKey, Set<betId>>` — populated on `/place`, pruned on settle/cash-out/expire.
- `lastOfferByBet: Map<betId, { cashOut, ts }>` — hot-path source of truth for the current offer; used for dedup and for the endpoint to read the authoritative amount.

Each emitted offer is **also** written to the bet receipt as `lastCashOutOffer` via the existing `createStore('bets')`. The receipt copy is the durable record — on server restart the engine rebuilds `lastOfferByBet` from receipts where `status === 'open'`. The in-memory map is faster for ticks; the receipt copy survives restarts and is the value `cashOutHistory` is appended from.

**Formula per bet on each live change touching its legs**
```
For each leg L:
  if L.finished and L.won  → factor = 1
  if L.finished and L.lost → cashOut = 0; emit { reason: 'leg_lost' }; return
  else                     → factor = 1 / current_odds_of_L's_selection

P(full win) = ∏ factor
fair        = stake × totalOdds × P(full win)
cashOut     = max(0, fair × (1 − HOUSE_MARGIN))     // HOUSE_MARGIN default 0.05, env-overridable
```

System bets (`mode === 'system'`): no live cash-out in v1. `lastOfferByBet` stays null; client disables the button and shows "Cash-out unavailable for system bets in-play."

**Triggers**
1. `liveLoop` → `onLiveChange(fixtureKey)` after each batch of emits.
2. Settlement → `onLegSettled(fixtureKey, won)`; on `won=false` every containing bet receives a final `cashout:offer { cashOut: 0, reason: 'leg_lost' }` immediately.
3. `POST /bet/place` → `register(bet)`.
4. Cash-out / settle / expire → `unregister(betId)`.

**Cleanup**: every 60s, scan and drop entries whose fixtures are `finished` or whose bets are no longer `open`.

**Dedup**: skip emit if `Math.abs(new − old) / max(old, 1) < 0.005` (half a percent), which avoids socket spam when odds drift sub-cent on tiny stakes.

### Cash-out endpoint changes

`DELETE /bet/bets/:id` accepts an optional body `{ acceptedAmount: number }`:

| Case | Behavior |
|---|---|
| `acceptedAmount` omitted | Legacy path: credit the engine's current `lastOfferByBet.amount`. Lets the existing UI keep working. |
| `acceptedAmount` within 1% of current offer | Credit `lastOfferByBet.amount` (never trust client for the money path), mark `cashed_out`, push `wallet:update` and admin `cashout:executed`. |
| `acceptedAmount` more than 1% off current offer | `409 OFFER_STALE { currentOffer }`. Client re-renders and the user re-clicks. |
| Bet already settled/cashed-out | `409 ALREADY_SETTLED`. Atomic check on the receipt mutation. |
| System bet | Legacy `stake × totalOdds × 0.6` formula; engine state ignored. `acceptedAmount` is **not** validated for system bets — the legacy server-side amount is credited regardless. UI for system bets does not send `acceptedAmount`. |

### Bet receipt extensions

Persisted via the existing `createStore('bets')`:
- `lastCashOutOffer: { amount: number, ts: number } | null`
- `cashOutHistory: Array<{ ts: number, amount: number }>` — capped at 20 entries. Drives a future sparkline; useful for support.

### Settlement integration

[server/src/services/settlement.js](../../../server/src/services/settlement.js): after each leg settles, call `cashOutEngine.onLegSettled(fixtureKey, won)` before the per-bet settlement loop so the user sees the cash-out drop to zero before the final `bet:settled` event.

### Realtime event additions

New events on `/live`:

```
cashout:offer  (user room only)
  { betId, cashOut, potentialWin, ts,
    reason?: 'tick' | 'leg_settled' | 'leg_lost' }

match:event    (fixture room)
  { fixtureId, kind, minute, scoreHome, scoreAway, team?, ts }
```

Extension to `odds:tick`: each selection gains optional `direction: 'up' | 'down' | 'same'`.

On socket reconnect, server emits a snapshot of the last known `{ score, minute, markets }` for each fixture room the client rejoins (new behavior). Implemented via a `liveSnapshots: Map<fixtureKey, Snapshot>` in [realtime.js](../../../server/src/services/realtime.js). The map is written by `emitOddsTick` and `emitScoreUpdate` (each helper updates the snapshot before broadcasting), and read in the `subscribe` handler — when a fixture room is joined, the server emits the current snapshot to that socket only.

The header docstring in `realtime.js` is updated to list every event with its full schema.

## Client

### Routes & files

| Path | Purpose |
|---|---|
| `client/src/pages/LivePage.jsx` | New `/live` route. Lists live matches, sport tabs, league filter. |
| `client/src/pages/LiveMatchPage.jsx` | New `/live/:matchId` route. In-play detail. |
| `client/src/hooks/useLiveSocket.js` | Mounts once, exposes `subscribe(fixtureIds)`, dispatches events. |
| `client/src/state/liveStore.js` | `useSyncExternalStore` keyed by fixtureId: `{ scoreHome, scoreAway, minute, markets, lastTickAt, recentEvents[] }`. |
| `client/src/lib/animate.js` | `tweenNumber(from, to, ms, onUpdate)`, `pulseClass(el, className, ms)`. Shared by every animation. |
| `client/src/components/OddsButton.jsx` | Self-contained: subscribes to its selection's ticks, owns its own flash/tween state. |
| `client/src/components/MatchEventRibbon.jsx` | Stacked ribbon renderer. |
| `client/src/components/LiveCashOutCard.jsx` | Pinned card on LiveMatchPage when user has an open bet on the fixture. |

### LivePage

```
[Live now · 12]                    [⚽ Football  🏀 Basketball  🎾 Tennis]
─────────────────────────────────────────────────────────────────────────
LIVE 67'   Asante Kotoko 2 — 1 Hearts of Oak     1: 1.65↓  X: 3.40  2: 4.20  ▸
           Ghana Premier League
─────────────────────────────────────────────────────────────────────────
LIVE 23'   Man United  0 — 0  Forest             1: 2.10↑  X: 3.10  2: 3.60  ▸
           Premier League
```

Empty state mirrors the existing `live-empty` block in Home. Sport tabs are visible but only `⚽ Football` is enabled in v1.

### LiveMatchPage

- Header: teams, animated score, minute, league crest.
- Event feed: right rail on desktop, collapsible drawer on mobile. Reads `recentEvents[]`.
- Markets accordion: 1X2, Over/Under, BTTS, Double Chance, Next Goal, Cards Over/Under, Corners — every live-eligible market the provider returns.
- LiveCashOutCard pinned at top when the user has open bets on this fixture.

### Socket lifecycle

- LivePage mount: `subscribe({ sportIds: [currentSport] })` — pulls ticks via the existing `sport:` room.
- LiveMatchPage mount: `subscribe({ fixtureIds: [matchId] })`.
- Unsubscribe on unmount.
- BetHistoryPage subscribes to `cashout:offer` for each open bet to update inline cash-out values.

### Home page touch-up

- Live filter chip stays.
- The "Live now" featured banner reads from `liveStore` when fresh (last tick < 30s old), falls back to the existing seed shape.
- Adding a link from the banner → `/live`.

## Animations

All in CSS with React toggling classNames. No animation libraries.

| Animation | Trigger | Implementation |
|---|---|---|
| Odds tick flash | `odds:tick` with `direction !== 'same'` | `odds-flash-up` / `odds-flash-down` class for 600ms via setTimeout; background fades green/red. Number tweens 250ms via `tweenNumber`. |
| Score pulse | `score:update` with score delta | `score-pulse` class for 500ms (scale 1 → 1.18 → 1). |
| Minute tick | `score:update` with minute delta | Subtle opacity flicker (200ms). |
| Goal celebration | `match:event { kind: 'goal_*' }` | `goal-celebrate` class for 2s on the match card — layered linear-gradient sweep + box-shadow glow on the scoring side. |
| Match-event ribbon | `match:event` | `<MatchEventRibbon>` slides in from right (250ms), holds 2.5s, slides out (250ms). Stacks if multiple events fire close together. |
| Cash-out tween | `cashout:offer` | `tweenNumber` 400ms. |
| Cash-out glow | `newOffer / stake > 1` | `cashout-glow` class (gold pulse loop), removed when offer drops below stake. |
| Cash-out jump | `|new − old| / old > 0.05` | `cashout-jump` class for 300ms (one-shot scale + outline pulse). |

**Accessibility**: every animation honors `prefers-reduced-motion: reduce` — transitions collapse to instant value swaps; flashes, slides, and pulses are skipped.

**Performance**:
- Animations use only `transform` and `opacity` where possible.
- Per-selection tick throttle: if `odds:tick` arrives more than once per 200ms for the same selection, the second flash is skipped (only the latest value is tweened to).

## Failure modes

| Failure | Behavior |
|---|---|
| apiFootball live endpoint 5xx / 429 | Live failureStreak increments, backoff up to 60s, pre-match unaffected. Admin dashboard shows provider amber. UI keeps last known prices with a `stale` flag on the fixture card. |
| Provider key missing | Live track no-ops, logs warning once on boot. No crash. Pre-match continues with whatever providers are enabled. |
| Socket disconnect | Existing reconnect logic in [socketClient.js](../../../client/src/api/socketClient.js) handles it. On reconnect, server emits last known snapshot per fixture room the client rejoins. |
| Offer arrives for a settled bet | Engine prunes before emit. Client also ignores offers for non-open bets. |
| Two devices, same user, race to cash out | First DELETE wins via atomic check on receipt mutation. Second gets `409 ALREADY_SETTLED`. |
| Cash-out offer >> stake (free-money exploit attempt by clock-skew) | Engine clamps `cashOut ≤ stake × totalOdds × 0.99` defensively. Logs an admin warning if hit. |
| Clock skew on minute ticks | UI uses server-provided `minute` as-is, never client time. |

## Testing

**Unit**
- `cashOutEngine` — deterministic test: given a fixture's odds drift sequence, assert cash-out value at each tick. Cover `leg_lost` short-circuit, system-bet skip, dedup threshold.
- `oddsAggregator.liveLoop` — mock provider returning sequential snapshots; assert correct `score:update`, `match:event`, `odds:tick` emit, including `eventKind` derivation.

**Integration**
- `POST /bet/place` → tick → user socket receives expected `cashout:offer`.
- `DELETE /bet/bets/:id { acceptedAmount }` → wallet credits engine's amount, not client's. With drift > 1% → `409 OFFER_STALE`.
- Settlement of a losing leg → all containing bets receive `cashout:offer { cashOut: 0, reason: 'leg_lost' }` before final settlement.

**Manual smoke** (documented in this spec for the implementer)
1. Set `APIFOOTBALL_KEY` in env.
2. `npm run dev`.
3. Visit `/live`. Confirm live matches list populates within ~10s.
4. Open a match, place a 10 GHS single on a live market.
5. Watch cash-out value tick over the next 30 seconds.
6. Click cash out. Confirm wallet credited the displayed amount.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `APIFOOTBALL_KEY` | — | Live data source. If absent, live track no-ops. |
| `LIVE_POLL_MS` | 6000 | Live track cadence. Lower bound 3000 to respect provider rate limits. |
| `CASHOUT_HOUSE_MARGIN` | 0.05 | House margin on live cash-out. |
| `CASHOUT_DRIFT_TOLERANCE` | 0.01 | Maximum acceptable drift on `acceptedAmount`. |

## Rollout

1. Server changes behind no flag — pre-match path is untouched; live track only does anything when `APIFOOTBALL_KEY` is set.
2. New client routes ship with the build. Existing Home live-filter UX unchanged.
3. Existing `DELETE /bet/bets/:id` keeps working without `acceptedAmount` — the new UI sends it; older clients still get a working cash-out at server's current offer.

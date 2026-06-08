# SportyBet-style bet slip redesign

**Date:** 2026-06-08
**Scope:** Visual restyle of the existing bet slip bottom-sheet on the Home page, plus a new bet-slip icon button in the market filter row. Brand and behavior preserved.

## Goal

Match the SportyBet bet-slip visual language (header layout, selection card shape, summary panel labels, button polish) while keeping all current bet-slip behavior intact. Add a third tap target for opening the slip, located alongside the existing globe/filters icons in the market filter row.

## Non-goals

- No REAL/SIM toggle (no sim-betting feature exists).
- No "People also bet on…" recommendation dropdown (no recommendation engine).
- No Insure / Flex / 1UP / EarlyGoals tabs (no corresponding bet products).
- No Book Bet button or booking-code generation (no backend route).
- No gear/settings icon in the slip header (no settings panel exists).
- No "Pins" concept — slip selections are the existing slip selections, relabeled "My Selections".

## Layout changes

### A. Filter row — add a slip-icon button

Location: `client/src/pages/Home.jsx:946-956` (the `.sb-market-chips` row).

Add a third icon button after the existing globe (`Region`) and filters (`Filters`) icons:

- New class: `.sb-chip.sb-chip-icon.sb-chip-slip`
- Inline SVG: clipboard-with-pencil icon (consistent with the existing 14px SVG sizing).
- Conditional badge: when `selections.length > 0`, render `<span class="sb-chip-badge">{count}</span>` over the icon's top-right corner (small green pill).
- `onClick={() => setSlipOpen(true)}` — parallel entry point to the existing floating slip pill.
- `aria-label="Bet slip"`.

### B. Sheet header — two-row layout

Location: `client/src/pages/Home.jsx:1216-1226`.

Replace the existing single-row header with:

**Row 1 — title + balance + close:**
- Left: `Bet slip` wordmark + count in a small green pill `(2)` (only renders when `selections.length > 0`).
- Right (in flex row, gap 12): balance pill `GHS X.XX` (keep existing balance render, restyle pill) · close `×` button.

**Row 2 — utility (conditional):**
- Renders only when `selections.length > 0`.
- Left: `My Selections` label (small caps, dim).
- Right: trash icon button that wires to the existing `clearSlip` handler. Includes an `aria-label="Clear all selections"`.

Replaces the existing inline "N selection · Clear all" row at lines 1237-1250 (that block is removed).

### C. Selection card — restructure

Location: `client/src/pages/Home.jsx:1290-1303`.

Restructure each `.selection` card from four stacked lines + dashed divider into:

```jsx
<div className="selection">
  <button className="x" aria-label="Remove">×</button>
  <div className="sel-row-top">
    <span className="sel-pick">{s.pickLabel}</span>
    <span className="sel-odds-val">{s.odds.toFixed(2)}</span>
  </div>
  <div className="sel-teams">{s.meta}</div>
  <div className="sel-market">{s.marketLabel}</div>
</div>
```

- Drop the dashed divider and the `@odds` redundancy.
- `.sel-row-top` is a flex row: `.sel-pick` (bold, takes available space) and `.sel-odds-val` (right-aligned, green, mono).
- `.sel-teams` and `.sel-market` stay as dim text lines.
- The red × close button (`.selection .x`) stays in its existing top-right position, restyled to a slightly bolder red (matches mockup).

### D. CTA pill — new, conditional

Renders **above** the stake block (above the existing `.stake-block` div), only when:

```js
betMode === 'multiple' && selections.length > 0 && selections.length < 3
```

Markup:

```jsx
<div className="slip-cta-pill">
  Add more qualifying selections to boost your bonus
</div>
```

Threshold 3 matches the existing `BONUS = 0.08` multiple-bet boost, which only meaningfully pays out on accumulators. (Single mode never shows the pill; System mode never shows it.)

### E. Stake row — horizontal label

The existing `.stake-input` becomes one row in a labeled container:

```jsx
<div className="stake-row">
  <span className="stake-row-label">Total Stake</span>
  <div className="stake-input">
    <span>GHS</span>
    <input ... />
  </div>
</div>
```

Quick-stakes (`.quick-stakes` with `+10 / +50 / +100 / 2× / ALL IN`) are kept unchanged — they're a useful existing feature, not in the mockup but removing them would be a regression.

### F. Summary panel — relabel

Location: `client/src/pages/Home.jsx:1340-1364`.

For `betMode === 'multiple'`:
- `Total Odds`
- `Max Bonus`: shows `GHS {formatAmt(BONUS * stake)}` (computed from existing `BONUS = 0.08` and current stake). Replaces the existing "Bonus boost +8%" row.
- `Potential Win` (was "Potential win" — capitalize for mockup parity)

For `betMode === 'single'`:
- `Total Odds`
- `Potential Win`
- (No Max Bonus row — bonus only applies to multiples.)

For `betMode === 'system'`:
- Keep existing labels (`Stake / line`, `Lines`, `Total stake`, `Max return`) — system bets are a distinct math model, the mockup doesn't cover them, and changing labels would mislead.

### G. Place Bet button — subtitle

Location: `client/src/pages/Home.jsx:1366-1368`.

Existing markup:
```jsx
<button className="place-bet">
  <span>{isPlacing ? 'Placing...' : 'Place bet'}</span>
  <span className="arrow">→</span>
</button>
```

Becomes:
```jsx
<button className="place-bet">
  <span className="place-bet-main">{isPlacing ? 'Placing...' : 'Place bet'}</span>
  <span className="place-bet-sub">About to pay GHS {formatAmt(totalStake)}</span>
  <span className="arrow">→</span>
</button>
```

Stacks main + sub vertically on the left side, arrow on the right. `totalStake` is the existing computed value (same value used in the summary).

## File changes

- **`client/src/pages/Home.jsx`** — six surgical edits in regions listed above. No new imports, no new state, no new handlers.
- **`client/src/styles/app.css`** — extend existing rules (`.sb-sheet-head`, `.selection`, `.sel-*`, `.sum-row`, `.place-bet`); add new rules (`.sb-chip-slip`, `.sb-chip-badge`, `.slip-utility-row`, `.slip-trash`, `.slip-cta-pill`, `.stake-row`, `.stake-row-label`, `.place-bet-main`, `.place-bet-sub`, `.slip-balance` polish). No styles deleted that aren't replaced.
- **No new files, no new dependencies.**

## Behavior preserved

- All bet-slip state: `selections`, `stake`, `betMode`, `systemType`, `payout`, `totalStake`, `stakePerLine`, `linesCount`, `slipErr`, `isPlacing`.
- All handlers: `onPlaceBet`, `removeById`, `clearSlip`, `setStake`, `setBetMode`, `setSystemType`.
- The floating slip pill (`client/src/pages/Home.jsx:1206`) stays untouched as an alternate entry point.
- Booking-code lookup in the home footer (separate feature from the redesigned footer PR) is untouched.

## Risks

- **Stylesheet conflicts:** the existing `.selection`, `.sel-odds`, and `.sum-row` rules are reused elsewhere — check via grep (`grep -nE '\.selection\b|\.sel-odds\b|\.sum-row' client/src/`) before changing them in place; if there are other consumers, scope the new rules under `.sb-sheet .selection` instead of replacing globals.
- **`BONUS * stake` Max Bonus rendering on empty stake:** when `stake` is empty/zero, show `—` (match the existing `Potential win` pattern).
- **Filter-row icon contrast in light mode:** the existing `.sb-chip-icon` already adapts; the new slip-icon variant must use the same color tokens.

## Success criteria

- Bet slip sheet visually matches the mockup at the structural level (two-row header, restructured selection cards, CTA pill at < 3 multiples, relabeled summary, Place Bet with subtitle).
- New slip-icon in the filter row opens the sheet on tap, shows a count badge.
- No regression: place a bet on Multiple mode with 2+ selections, balance debits, success modal opens. Adding/removing selections updates the slip in real time. Clearing all from the trash icon empties the slip. Stake input still accepts decimals.
- No horizontal overflow at 320 px viewport in the open slip sheet.
- No console errors or warnings introduced.

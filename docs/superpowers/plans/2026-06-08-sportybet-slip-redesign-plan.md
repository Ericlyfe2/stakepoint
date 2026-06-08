# SportyBet-style Bet Slip Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the existing bet-slip bottom sheet on the Home page to match the SportyBet visual language (two-row header, restructured selection cards, conditional CTA pill, relabeled summary, Place Bet subtitle) and add a slip-icon button in the market filter row as a third entry point.

**Architecture:** Visual-only change. Six surgical JSX edits in `Home.jsx` plus new + extended CSS rules in `app.css`. No new state, no new handlers, no new files, no new dependencies. All bet-slip behavior preserved (selections, modes, stake, summary math, place-bet flow, floating slip pill).

**Tech Stack:** React 18 + Vite + plain CSS (no Tailwind). Verification via the project's preview MCP tools.

**Spec:** [docs/superpowers/specs/2026-06-08-sportybet-slip-redesign-design.md](../specs/2026-06-08-sportybet-slip-redesign-design.md)

**Pre-flight check (already done):** `.sum-row` is shared with `VirtualsPage.jsx` — this plan only relabels JSX cells, never modifies the `.sum-row` CSS rule. `.selection/.sel-*` and `.sb-chip-icon` are Home-only — safe to restructure.

---

## File Structure

- **Modify:** `client/src/styles/app.css`
  - **Add** new rules: `.sb-chip-slip`, `.sb-chip-badge`, `.slip-utility-row`, `.slip-trash`, `.slip-cta-pill`, `.stake-row`, `.stake-row-label`, `.place-bet-main`, `.place-bet-sub`, `.sel-row-top`, `.slip-ct-badge`, `.slip-balance` (polished).
  - **Modify in place:** `.selection`, `.sel-pick`, `.sel-market`, `.sel-teams`, `.sel-odds-val`, `.selection .x`, `.sb-sheet-head`, `.place-bet`.
  - **Do not touch:** `.sum-row` rule (shared with VirtualsPage), `.slip-mode`, `.mode-btn`, `.stake-input`, `.quick-stake*`, `.summary`, `.sum-row.payout`.

- **Modify:** `client/src/pages/Home.jsx`
  - Six surgical edits, in document order: market-chips row (add icon button), sheet header (two-row layout), selection card (restructure), CTA pill (insert above stake), stake input wrapped in `.stake-row`, summary relabels, Place Bet subtitle.

No new files. No deletions. No new imports.

---

## Task 1: Add new bet-slip CSS rules

**Files:**
- Modify: `client/src/styles/app.css` (append after existing `.place-bet .arrow` rule, around line 1038)
- Modify in place: rules at `client/src/styles/app.css:882-933` (`.selection` and `.sel-*`), `:2687-2693` (`.sb-sheet-head`)

- [ ] **Step 1: Append new rule block at end of bet-slip styles (after `.place-bet` block, ~line 1038)**

Open `client/src/styles/app.css`. Find the closing `}` of `.place-bet .arrow` rule (search for `.place-bet .arrow {` — its block ends a few lines below). Insert this block immediately after:

```css
/* ----- SportyBet-style bet slip extensions ----- */

/* Filter-row slip icon */
.sb-chip-slip {
  position: relative;
}
.sb-chip-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--accent);
  color: #0a0d0c;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--bg);
  box-sizing: content-box;
}

/* Slip header — count pill + balance pill */
.slip-ct-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  margin-left: 6px;
  border-radius: 999px;
  background: var(--accent);
  color: #0a0d0c;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 800;
}
.slip-balance {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-soft);
  background: rgba(30, 200, 81, 0.12);
  padding: 5px 9px;
  border-radius: 999px;
  white-space: nowrap;
}
.slip-balance strong {
  color: #1ec851;
  font-weight: 800;
  font-family: 'JetBrains Mono', monospace;
}

/* Slip utility row (My Selections + trash) */
.slip-utility-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0 4px;
  margin: 0 0 10px;
  border-bottom: 1px solid var(--line);
}
.slip-utility-row .lbl {
  font-size: 11px;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--text-dim);
  font-weight: 700;
}
.slip-trash {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: transparent;
  color: var(--text-soft);
  border: 0;
  cursor: pointer;
  transition: background .15s, color .15s;
}
.slip-trash:hover {
  background: rgba(229, 72, 72, 0.12);
  color: var(--accent-hot);
}

/* Selection card — new top row layout */
.sel-row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 4px;
}
.sel-row-top .sel-pick {
  flex: 1;
  margin-bottom: 0;
}
.sel-row-top .sel-odds-val {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 800;
  color: var(--accent);
  font-size: 16px;
  white-space: nowrap;
}

/* CTA pill */
.slip-cta-pill {
  margin: 8px 0 10px;
  padding: 10px 14px;
  background: linear-gradient(135deg, rgba(30, 200, 81, 0.16), rgba(30, 200, 81, 0.08));
  border: 1px solid rgba(30, 200, 81, 0.32);
  color: #1ec851;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  text-align: center;
  letter-spacing: .01em;
}

/* Total stake horizontal row */
.stake-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.stake-row-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-soft);
  letter-spacing: .04em;
  white-space: nowrap;
}
.stake-row .stake-input {
  flex: 1;
  margin: 0;
}

/* Place Bet — stacked main + sub label */
.place-bet-main {
  display: block;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: .02em;
  text-transform: uppercase;
  line-height: 1.1;
}
.place-bet-sub {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  font-weight: 700;
  opacity: .7;
  text-transform: none;
  letter-spacing: 0;
  font-family: 'JetBrains Mono', monospace;
}
```

- [ ] **Step 2: Modify the existing `.selection` rule in place (around line 882)**

Find:

```css
.selection {
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px;
  position: relative;
}
```

Replace with (the only change: bump padding-right slightly so the × never crowds the new top-row odds):

```css
.selection {
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 12px 14px;
  position: relative;
}
```

- [ ] **Step 3: Modify `.selection .x` rule (around line 889)**

Find:

```css
.selection .x {
  position: absolute;
  top: 8px; right: 8px;
  width: 18px; height: 18px;
  border-radius: 50%;
  display: grid; place-items: center;
  color: var(--text-dim);
  font-size: 11px;
  transition: all .15s;
}
.selection .x:hover { background: var(--accent-hot); color: #fff; }
```

Replace with:

```css
.selection .x {
  position: absolute;
  top: 8px; right: 8px;
  width: 20px; height: 20px;
  border-radius: 50%;
  display: grid; place-items: center;
  background: rgba(229, 72, 72, 0.16);
  color: var(--accent-hot);
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  transition: all .15s;
}
.selection .x:hover { background: var(--accent-hot); color: #fff; }
```

- [ ] **Step 4: Modify `.sel-odds-val` global rule (around line 922)**

Find:

```css
.sel-odds-val {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 700;
  color: var(--accent);
  font-size: 14px;
}
```

Replace with (bump weight + size — used both in the old dashed-row layout if anything still uses it, and in the new `.sel-row-top` override above):

```css
.sel-odds-val {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 800;
  color: var(--accent);
  font-size: 15px;
}
```

- [ ] **Step 5: Modify `.sb-sheet-head` rule (around line 2687) to stack two rows**

Find:

```css
.sb-sheet-head {
  display: flex;
  align-items: center;
  padding: 12px 16px 8px;
  gap: 12px;
}
.sb-sheet-head h3 { font-size: 15px; font-weight: 800; margin: 0; }
```

(Note: the exact existing padding/gap may differ slightly; locate the rule by selector and keep the file's own values for any property not listed here.)

Replace with:

```css
.sb-sheet-head {
  display: flex;
  flex-direction: column;
  padding: 12px 16px 4px;
  gap: 4px;
}
.sb-sheet-head .slip-head-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}
.sb-sheet-head h3 {
  font-size: 15px;
  font-weight: 800;
  margin: 0;
  display: inline-flex;
  align-items: center;
}
```

- [ ] **Step 6: Sanity-check CSS file parses**

Read the file around the appended block (`.sb-chip-slip` area) and around `.selection` (line ~882) and `.sb-sheet-head` (line ~2687). Confirm braces balance and no stray text.

- [ ] **Step 7: Commit**

```bash
git add client/src/styles/app.css
git commit -m "style(slip): add SportyBet-style bet slip CSS (header, selection, CTA pill, button subtitle)"
```

---

## Task 2: Update Home.jsx — six surgical JSX edits

**Files:**
- Modify: `client/src/pages/Home.jsx`

All six edits below land in this one file. Apply them top-to-bottom in document order; later edits use grep-by-context (not line numbers) so prior edits don't invalidate the location.

- [ ] **Step 1: Add the slip-icon button to the filter row**

Find this block (currently the last two buttons in `.sb-market-chips`):

```jsx
        <button type="button" className="sb-chip sb-chip-icon" aria-label="Filters">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
        </button>
      </div>
```

Insert a new button immediately before the closing `</div>`, so the row ends `Region · Filters · Bet slip`:

```jsx
        <button type="button" className="sb-chip sb-chip-icon" aria-label="Filters">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
        </button>
        <button
          type="button"
          className="sb-chip sb-chip-icon sb-chip-slip"
          aria-label="Bet slip"
          onClick={() => setSlipOpen(true)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="6" y="3" width="12" height="18" rx="2" />
            <path d="M9 7h6M9 11h6M9 15h4" />
          </svg>
          {selections.length > 0 && (
            <span className="sb-chip-badge">{selections.length}</span>
          )}
        </button>
      </div>
```

- [ ] **Step 2: Replace the sheet header (two-row layout)**

Find:

```jsx
        <div className="sb-sheet-head">
          <h3>Bet slip · <span style={{ color: 'var(--accent)' }}>{selections.length}</span></h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
            {account && (
              <span className="slip-balance" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-soft)', background: 'rgba(30,200,81,0.1)', padding: '4px 8px', borderRadius: 6 }}>
                Balance: <span style={{ color: '#1ec851' }}>₵{formatAmt(account.balance)}</span>
              </span>
            )}
            <button type="button" className="sb-sheet-close" onClick={() => setSlipOpen(false)} aria-label="Close" style={{ position: 'static', margin: 0 }}>×</button>
          </div>
        </div>
```

Replace with:

```jsx
        <div className="sb-sheet-head">
          <div className="slip-head-row">
            <h3>
              Bet slip
              {selections.length > 0 && <span className="slip-ct-badge">{selections.length}</span>}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
              {account && (
                <span className="slip-balance">
                  Balance <strong>GHS {formatAmt(account.balance)}</strong>
                </span>
              )}
              <button
                type="button"
                className="sb-sheet-close"
                onClick={() => setSlipOpen(false)}
                aria-label="Close"
                style={{ position: 'static', margin: 0 }}
              >×</button>
            </div>
          </div>
          {selections.length > 0 && (
            <div className="slip-utility-row">
              <span className="lbl">My Selections</span>
              <button
                type="button"
                className="slip-trash"
                onClick={clearSlip}
                aria-label="Clear all selections"
                title="Clear all"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1.5 14a2 2 0 0 1-2 1.8H8.5a2 2 0 0 1-2-1.8L5 6" />
                </svg>
              </button>
            </div>
          )}
        </div>
```

- [ ] **Step 3: Remove the inline "N selections · Clear all" row**

Find this block (immediately after the `.slip-mode` div in the sheet body):

```jsx
            {selections.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '.1em', textTransform: 'uppercase' }}>
                  {selections.length} selection{selections.length === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  onClick={clearSlip}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-soft)', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '4px 8px' }}
                >
                  Clear all
                </button>
              </div>
            )}
```

Delete the entire block (the count + clear-all moved into the header utility row).

- [ ] **Step 4: Restructure the selection card**

Find:

```jsx
            <div className="selections">
              {selections.map((s) => (
                <div key={s.id} className="selection">
                  <button type="button" className="x" aria-label="Remove" onClick={() => removeById(s.id)}>×</button>
                  <div className="sel-pick">{s.pickLabel}</div>
                  <div className="sel-market">{s.marketLabel}</div>
                  <div className="sel-teams">{s.meta}</div>
                  <div className="sel-odds">
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace' }}>@{s.odds.toFixed(2)}</span>
                    <span className="sel-odds-val">{s.odds.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
```

Replace with:

```jsx
            <div className="selections">
              {selections.map((s) => (
                <div key={s.id} className="selection">
                  <button type="button" className="x" aria-label="Remove" onClick={() => removeById(s.id)}>×</button>
                  <div className="sel-row-top">
                    <span className="sel-pick">{s.pickLabel}</span>
                    <span className="sel-odds-val">{s.odds.toFixed(2)}</span>
                  </div>
                  <div className="sel-teams">{s.meta}</div>
                  <div className="sel-market">{s.marketLabel}</div>
                </div>
              ))}
            </div>
```

- [ ] **Step 5: Insert CTA pill above the stake block**

Find the line that opens the stake block:

```jsx
            <div className="stake-block">
              <div className="stake-input">
                <span>GHS</span>
```

Insert immediately **before** the `<div className="stake-block">` opening line:

```jsx
            {betMode === 'multiple' && selections.length > 0 && selections.length < 3 && (
              <div className="slip-cta-pill">
                Add more qualifying selections to boost your bonus
              </div>
            )}
            <div className="stake-block">
              <div className="stake-input">
                <span>GHS</span>
```

- [ ] **Step 6: Wrap the stake input in a labeled row**

Inside the `<div className="stake-block">`, find:

```jsx
              <div className="stake-input">
                <span>GHS</span>
                <input
                  type="text"
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                />
              </div>
```

Replace with:

```jsx
              <div className="stake-row">
                <span className="stake-row-label">Total Stake</span>
                <div className="stake-input">
                  <span>GHS</span>
                  <input
                    type="text"
                    value={stake}
                    onChange={(e) => setStake(e.target.value)}
                    inputMode="decimal"
                    autoComplete="off"
                  />
                </div>
              </div>
```

- [ ] **Step 7: Relabel summary rows (single / multiple modes only — leave system alone)**

Find the summary block (around `<div className="summary">`):

```jsx
              <div className="summary">
                {betMode === 'system' ? (
                  <>
                    <div className="sum-row"><span className="lbl">Stake / line</span><span className="val">GHS {formatAmt(stakePerLine)}</span></div>
                    <div className="sum-row"><span className="lbl">Lines</span><span className="val">{linesCount || '—'}</span></div>
                    <div className="sum-row"><span className="lbl">Total stake</span><span className="val">GHS {formatAmt(totalStake)}</span></div>
                    <div className="sum-row payout">
                      <span className="lbl" style={{ color: 'var(--text)', fontWeight: 700 }}>Max return</span>
                      <span className="val">{payout > 0 ? `GHS ${formatAmt(payout)}` : '—'}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="sum-row"><span className="lbl">Total odds</span><span className="val">{selections.length ? totalOdds.toFixed(2) : '—'}</span></div>
                    <div className="sum-row"><span className="lbl">Stake</span><span className="val">GHS {formatAmt(stakePerLine)}</span></div>
                    {betMode === 'multiple' && (
                      <div className="sum-row"><span className="lbl">Bonus boost</span><span className="val" style={{ color: 'var(--accent)' }}>+8%</span></div>
                    )}
                    <div className="sum-row payout">
                      <span className="lbl" style={{ color: 'var(--text)', fontWeight: 700 }}>Potential win</span>
                      <span className="val">{payout > 0 ? `GHS ${formatAmt(payout)}` : '—'}</span>
                    </div>
                  </>
                )}
              </div>
```

Replace with (system block unchanged; single/multiple block relabeled and `Max Bonus` calculated as `BONUS * stake`):

```jsx
              <div className="summary">
                {betMode === 'system' ? (
                  <>
                    <div className="sum-row"><span className="lbl">Stake / line</span><span className="val">GHS {formatAmt(stakePerLine)}</span></div>
                    <div className="sum-row"><span className="lbl">Lines</span><span className="val">{linesCount || '—'}</span></div>
                    <div className="sum-row"><span className="lbl">Total stake</span><span className="val">GHS {formatAmt(totalStake)}</span></div>
                    <div className="sum-row payout">
                      <span className="lbl" style={{ color: 'var(--text)', fontWeight: 700 }}>Max return</span>
                      <span className="val">{payout > 0 ? `GHS ${formatAmt(payout)}` : '—'}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="sum-row"><span className="lbl">Total Odds</span><span className="val">{selections.length ? totalOdds.toFixed(2) : '—'}</span></div>
                    {betMode === 'multiple' && (
                      <div className="sum-row">
                        <span className="lbl">Max Bonus</span>
                        <span className="val" style={{ color: 'var(--accent)' }}>
                          {parseStake(stake) > 0 ? `GHS ${formatAmt(BONUS * parseStake(stake))}` : '—'}
                        </span>
                      </div>
                    )}
                    <div className="sum-row payout">
                      <span className="lbl" style={{ color: 'var(--text)', fontWeight: 700 }}>Potential Win</span>
                      <span className="val">{payout > 0 ? `GHS ${formatAmt(payout)}` : '—'}</span>
                    </div>
                  </>
                )}
              </div>
```

(Note: `BONUS` is already defined as `const BONUS = 0.08` at the top of `Home.jsx`. `parseStake` is already defined and used in the file. No new imports needed.)

- [ ] **Step 8: Add subtitle to the Place Bet button**

Find:

```jsx
              <button type="button" className="place-bet" onClick={onPlaceBet} disabled={isPlacing}>
                <span>{isPlacing ? 'Placing...' : 'Place bet'}</span><span className="arrow">→</span>
              </button>
```

Replace with:

```jsx
              <button type="button" className="place-bet" onClick={onPlaceBet} disabled={isPlacing}>
                <span>
                  <span className="place-bet-main">{isPlacing ? 'Placing...' : 'Place bet'}</span>
                  <span className="place-bet-sub">About to pay GHS {formatAmt(totalStake)}</span>
                </span>
                <span className="arrow">→</span>
              </button>
```

- [ ] **Step 9: Grep-check no stale markup remains**

Use the Grep tool with pattern `Bonus boost|Stake / line|Total odds[^O]|Potential win` in `client/src/pages/Home.jsx`.
Expected: only the system-mode `Stake / line` match should appear (it's in the unchanged system block). Any other match means a step above wasn't applied — find and fix.

Use the Grep tool with pattern `<button.*sb-chip.*Filters` and `sb-chip-slip` in `client/src/pages/Home.jsx`.
Expected: one match for `Filters` (existing button label), one match for `sb-chip-slip` (the new button).

- [ ] **Step 10: Commit**

```bash
git add client/src/pages/Home.jsx
git commit -m "feat(slip): SportyBet-style bet slip layout + filter-row slip icon

- Two-row sheet header (title + count badge + balance pill, then My
  Selections + trash icon)
- Restructured selection card (pick + odds on one row, no dashed
  divider)
- New CTA pill prompting more selections in Multiple mode under 3 picks
- Total Stake horizontal label row
- Summary relabeled: Total Odds / Max Bonus (money) / Potential Win
- Place Bet shows About to pay subtitle
- New slip-icon button in the market filter row opens the sheet with a
  count badge"
```

---

## Task 3: Visual verification in browser preview

**Files:** none modified; verification only.

- [ ] **Step 1: Ensure backend is running**

If `npm run dev -w server` is not already running in the background, start it:

```bash
npm run dev -w server
```

Wait until `http://127.0.0.1:4000/` responds (poll with `until curl -sf http://127.0.0.1:4000/api/health > /dev/null 2>&1; do sleep 2; done`).

- [ ] **Step 2: Start the preview**

Use `mcp__Claude_Preview__preview_start` with `name: "stakepoint"`. Note the `serverId`.

- [ ] **Step 3: Wait for Home to hydrate, then verify the filter-row slip icon exists**

Use `mcp__Claude_Preview__preview_eval`:

```javascript
(async () => {
  await new Promise(r => setTimeout(r, 4000));
  const slipIcon = document.querySelector('.sb-market-chips .sb-chip-slip');
  return {
    hasSlipIcon: !!slipIcon,
    hasBadge: !!document.querySelector('.sb-chip-slip .sb-chip-badge')
  };
})()
```

Expected: `hasSlipIcon: true`, `hasBadge: false` (no selections yet).

- [ ] **Step 4: Add one selection by clicking an odds button**

Use `mcp__Claude_Preview__preview_eval`:

```javascript
(() => {
  const odd = document.querySelector('.sb-odd:not(.disabled)');
  if (odd) odd.click();
  return { clicked: !!odd, badge: document.querySelector('.sb-chip-slip .sb-chip-badge')?.textContent };
})()
```

Expected: `clicked: true`, `badge: "1"`.

- [ ] **Step 5: Open the slip via the new filter-row icon**

Use `mcp__Claude_Preview__preview_click`:

Selector: `.sb-market-chips .sb-chip-slip`

Then verify the dialog opened with `mcp__Claude_Preview__preview_eval`:

```javascript
({
  open: document.querySelector('dialog.sb-sheet')?.open,
  hasUtilityRow: !!document.querySelector('.slip-utility-row'),
  ctBadge: document.querySelector('.slip-ct-badge')?.textContent,
  selectionRowTop: !!document.querySelector('.selection .sel-row-top'),
  ctaPillVisible: !!document.querySelector('.slip-cta-pill')
})
```

Expected: `open: true`, `hasUtilityRow: true`, `ctBadge: "1"`, `selectionRowTop: true`, `ctaPillVisible: false` (still in default single mode).

- [ ] **Step 6: Switch to Multiple mode and verify CTA pill appears**

Use `mcp__Claude_Preview__preview_click` with selector `dialog.sb-sheet .mode-btn:nth-of-type(2)`.

Then `mcp__Claude_Preview__preview_eval`:

```javascript
({
  ctaPillVisible: !!document.querySelector('.slip-cta-pill'),
  ctaText: document.querySelector('.slip-cta-pill')?.textContent?.trim(),
  maxBonusRow: Array.from(document.querySelectorAll('.summary .sum-row')).map(r => r.textContent.trim()),
})
```

Expected: `ctaPillVisible: true`, `ctaText` includes "Add more qualifying selections", and `maxBonusRow` includes a row containing "Max Bonus".

- [ ] **Step 7: Verify Place Bet subtitle renders**

Use `mcp__Claude_Preview__preview_eval`:

```javascript
({
  mainText: document.querySelector('.place-bet .place-bet-main')?.textContent,
  subText: document.querySelector('.place-bet .place-bet-sub')?.textContent,
})
```

Expected: `mainText: "Place bet"`, `subText` starts with "About to pay GHS".

- [ ] **Step 8: Verify trash icon clears the slip**

Use `mcp__Claude_Preview__preview_click` with selector `.slip-utility-row .slip-trash`.

Then `mcp__Claude_Preview__preview_eval`:

```javascript
({
  selectionsCount: document.querySelectorAll('.selection').length,
  badgeAfter: document.querySelector('.sb-chip-slip .sb-chip-badge')?.textContent,
  utilityRowVisible: !!document.querySelector('.slip-utility-row')
})
```

Expected: `selectionsCount: 0`, `badgeAfter: undefined` (no selections so badge is gone), `utilityRowVisible: false` (utility row hides when no selections).

- [ ] **Step 9: Take a screenshot of the open slip with 2+ selections**

Re-add two selections by clicking two different odds buttons (after closing the dialog if needed). Open the slip via the filter-row icon. Take screenshot via `mcp__Claude_Preview__preview_screenshot`.

Verify the screenshot shows: two-row header (Bet slip + count + balance + ×, then My Selections + trash), two restructured cards with pick + odds on one row, mode tabs, CTA pill (if in Multiple mode with 2 selections), Total Stake row, summary with Total Odds / Max Bonus / Potential Win, Place Bet with the subtitle.

- [ ] **Step 10: Mobile overflow check at 320 px**

Use `mcp__Claude_Preview__preview_resize` with `width: 320, height: 600`.
Use `mcp__Claude_Preview__preview_eval`:

```javascript
({
  bodyOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  dialogOverflow: (() => {
    const d = document.querySelector('dialog.sb-sheet');
    if (!d || !d.open) return null;
    return d.scrollWidth > d.clientWidth;
  })()
})
```

Expected: `bodyOverflow: false`. Dialog overflow may be `null` if dialog closed during resize — reopen it via the filter-row icon and re-check.

- [ ] **Step 11: Console error check**

Use `mcp__Claude_Preview__preview_console_logs` with `level: "error"`.
Expected: no new errors compared to baseline (the existing baseline is "no logs" on Home).

- [ ] **Step 12: Stop the preview**

Use `mcp__Claude_Preview__preview_stop`.

- [ ] **Step 13: Commit any verification-driven fixes (only if steps 9 or 10 surfaced issues)**

If any CSS tweaks were made:

```bash
git add client/src/styles/app.css
git commit -m "style(slip): tighten layout for narrow viewports"
```

Otherwise skip.

---

## Self-review

**Spec coverage check (against [2026-06-08-sportybet-slip-redesign-design.md](../specs/2026-06-08-sportybet-slip-redesign-design.md)):**

- Layout A (filter-row slip icon): Task 1 Step 1 `.sb-chip-slip` + `.sb-chip-badge` CSS; Task 2 Step 1 JSX button. ✓
- Layout B (two-row sheet header): Task 1 Step 5 `.sb-sheet-head` rule; Task 1 Step 1 `.slip-ct-badge`, `.slip-balance`, `.slip-utility-row`, `.slip-trash` rules; Task 2 Step 2 JSX. ✓
- Layout C (restructured selection card): Task 1 Steps 2-4 `.selection`, `.x`, `.sel-odds-val` rules + Step 1 `.sel-row-top` rule; Task 2 Step 4 JSX. ✓
- Layout D (CTA pill): Task 1 Step 1 `.slip-cta-pill` rule; Task 2 Step 5 JSX condition. ✓
- Layout E (Total Stake row): Task 1 Step 1 `.stake-row`, `.stake-row-label` rules; Task 2 Step 6 JSX wrap. ✓
- Layout F (relabeled summary): Task 2 Step 7 JSX relabels + Max Bonus calc (no CSS change — `.sum-row` is shared with Virtuals and must stay). ✓
- Layout G (Place Bet subtitle): Task 1 Step 1 `.place-bet-main`, `.place-bet-sub` rules; Task 2 Step 8 JSX. ✓
- Spec "Out of scope" (REAL/SIM, People-also-bet, Insure/Flex/1UP, Book Bet, gear, pins): nothing added matching those. ✓
- Spec "Behavior preserved" (selections, stake, modes, payout, onPlaceBet, removeById, clearSlip, BONUS constant): all referenced in Task 2 by existing name; no handlers added or removed. ✓
- Spec "Risks" — `.sum-row` shared with VirtualsPage: explicitly handled (no `.sum-row` CSS change). ✓
- Spec "Risks" — Max Bonus on empty stake: Task 2 Step 7 uses `parseStake(stake) > 0 ? ... : '—'`. ✓
- Spec "Success criteria" (badge updates, sheet opens via icon, trash clears, no overflow at 320px, no console errors): Task 3 Steps 3-11 cover each. ✓

**Placeholder scan:** all code blocks are complete; no TBD/TODO; all paths concrete; all selectors specified.

**Type/name consistency:**
- CSS class names referenced in Task 2 JSX (`sb-chip-slip`, `sb-chip-badge`, `slip-head-row`, `slip-ct-badge`, `slip-balance`, `slip-utility-row`, `slip-trash`, `sel-row-top`, `slip-cta-pill`, `stake-row`, `stake-row-label`, `place-bet-main`, `place-bet-sub`) all match selectors defined in Task 1. ✓
- Handlers referenced (`setSlipOpen`, `clearSlip`, `removeById`, `onPlaceBet`, `setBetMode`, `setStake`) and state (`selections`, `account`, `betMode`, `stake`, `totalStake`, `stakePerLine`, `payout`, `totalOdds`, `linesCount`, `slipErr`, `isPlacing`, `BONUS`, `formatAmt`, `parseStake`) all already exist in Home.jsx — confirmed in spec pre-flight. ✓
- Class name on the new button is `sb-chip sb-chip-icon sb-chip-slip` — three classes in document order, matches CSS selector `.sb-chip.sb-chip-icon.sb-chip-slip` via separate `.sb-chip-slip` rule. ✓

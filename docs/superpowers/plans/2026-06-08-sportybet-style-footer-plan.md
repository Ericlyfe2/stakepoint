# SportyBet-style Home Footer Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bottom region of the Home page (`client/src/pages/Home.jsx` lines 1130 + 1137–1163) with a five-block SportyBet-style footer (sponsor card, payslip, payment methods, legal, back-to-top) plus a relocated GrandPrizeWinners block at its top — keeping "Xenbet GH" brand and the booking-code lookup.

**Architecture:** Pure presentation change. One JSX block in Home.jsx swapped for a richer one; one CSS rule block in app.css swapped for a layered ruleset. No new files, no new dependencies, no behavior changes beyond moving where `<GrandPrizeWinners />` renders. CSS reuses existing design tokens (`--surface`, `--surface-2`, `--bg`, `--line`, `--accent`, `--accent-hot`, `--accent-cool`, `--text`, `--text-soft`, `--text-dim`).

**Tech Stack:** React 18 + Vite + plain CSS (no Tailwind, no CSS-in-JS). Verification via the project's preview MCP tools.

**Spec:** [docs/superpowers/specs/2026-06-08-sportybet-style-footer-design.md](../specs/2026-06-08-sportybet-style-footer-design.md)

---

## File Structure

- **Modify:** `client/src/styles/app.css`
  - Replace the rule block at lines 2327–2403 (existing `.sb-compliance` + `.sb-payslip` rules).
  - Replace the mobile overrides at lines 2984–2992 (`@media` overrides for those classes).
  - All new rules are namespaced under `.sb-footer` to avoid leaking into other screens.
- **Modify:** `client/src/pages/Home.jsx`
  - Delete the inline `{lgIdx === 0 && <GrandPrizeWinners />}` at line 1130.
  - Replace the JSX block at lines 1137–1163 (existing `.sb-compliance` div + `.sb-payslip` form) with the new `<footer className="sb-footer">` block.

No file creation. No deletions. No new imports (GrandPrizeWinners is already defined in the same file at line 1463).

---

## Task 1: Replace footer CSS

**Files:**
- Modify: `client/src/styles/app.css:2327-2403`
- Modify: `client/src/styles/app.css:2984-2992`

- [ ] **Step 1: Replace the main rule block at lines 2327–2403**

Open `client/src/styles/app.css`. Find the block starting with the comment `/* ----- compliance / sponsor strip ----- */` (line 2326) through the end of `.sb-payslip-foot` (line 2403). Replace those 78 lines with the following:

```css
/* ----- SportyBet-style home footer ----- */
.sb-footer {
  margin: 20px 0 0;
  padding: 0 12px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.sb-footer .sb-gpw-slot {
  margin: 0;
}

.sb-footer .sb-age-chip {
  align-self: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 1.5px solid var(--accent-hot);
  color: var(--accent-hot);
  font-weight: 800;
  font-size: 13px;
  letter-spacing: .02em;
}

/* Sponsor card */
.sb-sponsor-card {
  background: #ffffff;
  border-radius: 14px;
  padding: 18px 14px 16px;
  text-align: center;
  color: #111;
  box-shadow: 0 1px 0 rgba(0, 0, 0, .04);
}
.sb-sponsor-brand {
  font-size: 18px;
  font-weight: 900;
  letter-spacing: .01em;
  color: #e30613;
  line-height: 1;
}
.sb-sponsor-sub {
  margin-top: 4px;
  font-size: 10.5px;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: #444;
  font-weight: 700;
}
.sb-sponsor-logos {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
  margin: 14px 0 12px;
}
.sb-logo-rm {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 52px;
  border-radius: 6px 6px 22px 22px;
  background: #ffffff;
  border: 1.5px solid #0a1d6b;
  color: #0a1d6b;
  font-weight: 900;
  font-size: 13px;
  letter-spacing: .02em;
  font-family: 'JetBrains Mono', monospace;
}
.sb-logo-laliga {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 12px;
  border-radius: 999px;
  background: linear-gradient(135deg, #e30613 0%, #b30410 100%);
  color: #ffffff;
  font-weight: 900;
  font-size: 13px;
  letter-spacing: .02em;
}
.sb-sponsor-tag {
  font-size: 13px;
  font-weight: 800;
  color: #111;
}

/* Payslip card */
.sb-payslip {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 14px;
  text-align: center;
}
.sb-payslip-label {
  font-size: 10.5px;
  letter-spacing: .14em;
  color: var(--text-dim);
  text-transform: uppercase;
  margin-bottom: 6px;
}
.sb-payslip-code {
  font-family: 'JetBrains Mono', monospace;
  font-size: 24px;
  font-weight: 800;
  color: var(--accent-hot);
  letter-spacing: .04em;
  margin-bottom: 12px;
}
.sb-payslip-input {
  display: flex;
  align-items: center;
  gap: 0;
  background: var(--bg);
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  overflow: hidden;
}
.sb-payslip-input input {
  flex: 1;
  background: transparent;
  border: 0;
  outline: 0;
  padding: 12px 14px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  letter-spacing: .08em;
  color: var(--accent-cool);
  text-align: center;
}
.sb-payslip-input button {
  height: 100%;
  padding: 12px 16px;
  background: var(--accent);
  color: #0a0d0c;
  font-weight: 800;
  font-size: 13px;
  border: 0;
  cursor: pointer;
}
.sb-payslip-foot {
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-dim);
}

/* Payment methods */
.sb-payment {
  text-align: center;
}
.sb-payment-label {
  font-size: 10.5px;
  letter-spacing: .14em;
  color: var(--text-dim);
  text-transform: uppercase;
  margin-bottom: 8px;
}
.sb-payment-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}
.sb-pay-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 64px;
  padding: 6px 12px;
  border-radius: 6px;
  font-weight: 900;
  font-size: 12px;
  letter-spacing: .02em;
  font-family: 'JetBrains Mono', monospace;
}
.sb-pay-mtn    { background: #ffcc00; color: #111; }
.sb-pay-telecel{ background: #e30613; color: #fff; text-transform: lowercase; }
.sb-pay-visa   { background: #1a1f71; color: #f7b600; letter-spacing: .14em; }
.sb-pay-gtbank { background: #e95a0c; color: #fff; }

/* Legal block */
.sb-legal {
  text-align: center;
  padding: 6px 4px 0;
}
.sb-legal-brand {
  font-size: 11px;
  font-weight: 800;
  color: var(--text-soft);
  margin-bottom: 6px;
  letter-spacing: .04em;
}
.sb-legal-text {
  font-size: 10.5px;
  line-height: 1.55;
  color: var(--text-dim);
  margin-bottom: 10px;
}
.sb-legal-links {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-soft);
}
.sb-legal-links a {
  color: var(--text-soft);
  text-decoration: none;
}
.sb-legal-links a:hover {
  color: var(--accent);
}
.sb-legal-links .sep {
  color: var(--text-dim);
}

/* Back to top */
.sb-totop {
  margin-top: 6px;
  width: 100%;
  padding: 14px;
  background: #ffffff;
  color: #111;
  border: 0;
  border-radius: 10px;
  font-weight: 800;
  font-size: 13px;
  cursor: pointer;
}
.sb-totop:hover { background: #f1f1f1; }
```

- [ ] **Step 2: Replace the mobile media-query overrides at lines 2984–2992**

In the same file `client/src/styles/app.css`, find lines 2984–2992 (the `.sb-compliance` and `.sb-payslip` rules inside the `@media` block). Replace those exact 9 lines with:

```css
  .sb-footer {
    margin: 16px 0 0;
    padding: 0 10px 20px;
    gap: 12px;
  }
  .sb-sponsor-card {
    padding: 16px 12px 14px;
  }
  .sb-payslip {
    padding: 12px;
  }
  .sb-payslip-code {
    font-size: 22px;
  }
```

- [ ] **Step 3: Verify CSS file parses (no syntax errors)**

Run: `cd client && node -e "require('fs').readFileSync('./src/styles/app.css','utf8')"`
Expected: command exits 0 with no output. (Sanity check that the file is still readable; full validation happens at Task 3 when the preview server picks it up.)

- [ ] **Step 4: Commit the CSS change**

```bash
git add client/src/styles/app.css
git commit -m "style(home): SportyBet-style footer CSS (sponsor card, payment chips, back-to-top)"
```

---

## Task 2: Replace footer JSX and relocate GrandPrizeWinners

**Files:**
- Modify: `client/src/pages/Home.jsx:1130` (delete one line)
- Modify: `client/src/pages/Home.jsx:1137-1163` (replace JSX block)

- [ ] **Step 1: Delete the inline GrandPrizeWinners line**

Open `client/src/pages/Home.jsx`. At line 1130, find:

```jsx
                {lgIdx === 0 && <GrandPrizeWinners />}
```

Delete that one line. (Leave the surrounding `</Fragment>` and JSX intact.)

- [ ] **Step 2: Replace the JSX block at lines 1137–1163**

Still in `client/src/pages/Home.jsx`. Find the block beginning at:

```jsx
      {/* ─── Compliance / sponsors ─── */}
      <div className="sb-compliance">
```

and ending at the closing `</form>` of the payslip form (around line 1163, just before `{/* ─── Floating slip pill (mobile only via CSS) ─── */}`).

Replace those 27 lines with this exact block:

```jsx
      {/* ─── Home footer (sponsor / payslip / payment / legal / back-to-top) ─── */}
      <footer className="sb-footer">
        <div className="sb-gpw-slot">
          <GrandPrizeWinners />
        </div>

        <div className="sb-age-chip" aria-label="Age 18 and above only">18+</div>

        <div className="sb-sponsor-card">
          <div className="sb-sponsor-brand">Xenbet GH</div>
          <div className="sb-sponsor-sub">Official Sponsor · Betting Partner</div>
          <div className="sb-sponsor-logos" aria-hidden="true">
            <span className="sb-logo-rm">R·M</span>
            <span className="sb-logo-laliga">LaLiga</span>
          </div>
          <div className="sb-sponsor-tag">The world's sharper betting platform</div>
        </div>

        <form className="sb-payslip" onSubmit={onPayslip}>
          <div className="sb-payslip-label">Payslip</div>
          <div className="sb-payslip-code">*711*222#</div>
          <div className="sb-payslip-input">
            <input
              placeholder="Enter booking code"
              value={payslip}
              onChange={(e) => setPayslip(e.target.value.toUpperCase())}
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit">Check</button>
          </div>
          <div className="sb-payslip-foot">Enter a booking code to view a slip</div>
        </form>

        <div className="sb-payment">
          <div className="sb-payment-label">Payment methods</div>
          <div className="sb-payment-row" aria-hidden="true">
            <span className="sb-pay-chip sb-pay-mtn">MTN</span>
            <span className="sb-pay-chip sb-pay-telecel">telecel</span>
            <span className="sb-pay-chip sb-pay-visa">VISA</span>
            <span className="sb-pay-chip sb-pay-gtbank">GTBank</span>
          </div>
        </div>

        <div className="sb-legal">
          <div className="sb-legal-brand">Xenbet GH</div>
          <p className="sb-legal-text">
            Age 18 and above only. Play Responsibly. Betting is addictive and can be psychologically harmful. Xenbet GH is licensed by the Gaming Commission of Ghana under Licence No 0006027.
          </p>
          <div className="sb-legal-links">
            <a href="/terms">Terms &amp; Conditions</a>
            <span className="sep">·</span>
            <a href="/info">About Us</a>
            <span className="sep">·</span>
            <a href="/help">System Status</a>
          </div>
        </div>

        <button
          type="button"
          className="sb-totop"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          Back to Top
        </button>
      </footer>
```

- [ ] **Step 3: Grep-check that no stale references remain**

Run via the Grep tool: pattern `sb-compliance|badge18|sponsors|sponsor"` (literal classes from the old block), path `client/src`.
Expected: zero matches in `Home.jsx`. (Matches in CSS file are also expected to be zero after Task 1 — both should be gone together.)

If any match remains in `client/src` outside this footer, stop and investigate before continuing.

- [ ] **Step 4: Commit the JSX change**

```bash
git add client/src/pages/Home.jsx
git commit -m "feat(home): SportyBet-style footer with relocated GrandPrizeWinners

Replaces the old compliance/sponsors strip and payslip form with a
five-block footer (sponsor card, payslip card, payment methods, legal,
back-to-top) and moves GrandPrizeWinners from inline (after first league)
to the top of the footer stack."
```

---

## Task 3: Visual verification in browser preview

**Files:** none modified in this task; this is a verification + screenshot pass.

- [ ] **Step 1: Start the dev server via preview**

Use the `mcp__Claude_Preview__preview_start` tool with the project's dev command.
Expected: server boots, preview returns a local URL.

If preview_start needs explicit command, use `npm run dev` from `client/` (check `client/package.json` `"scripts"` for the actual key — typically `dev`).

- [ ] **Step 2: Navigate to Home and scroll to the footer**

Use `mcp__Claude_Preview__preview_eval` with:

```javascript
window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' });
```

- [ ] **Step 3: Snapshot the footer DOM**

Use `mcp__Claude_Preview__preview_snapshot` to grab text + structure of the rendered page.
Expected: `<footer class="sb-footer">` present, contains a `.sb-sponsor-card`, `.sb-payslip`, `.sb-payment`, `.sb-legal`, and `.sb-totop` button.

- [ ] **Step 4: Check console for errors**

Use `mcp__Claude_Preview__preview_console_logs`.
Expected: no React warnings, no unresolved CSS variable errors, no missing-route warnings.

- [ ] **Step 5: Take a screenshot of the footer region**

Use `mcp__Claude_Preview__preview_screenshot` after scrolling to the footer.
Expected: image shows GrandPrizeWinners → 18+ chip → white sponsor card with "Xenbet GH" + RM/LaLiga chips → dark payslip card with red `*711*222#` → payment chips row (MTN yellow, telecel red, VISA navy, GTBank orange) → legal text → Back to Top white pill.

- [ ] **Step 6: Verify 320px viewport has no horizontal overflow**

Use `mcp__Claude_Preview__preview_resize` to set viewport to 320×600.
Then `mcp__Claude_Preview__preview_eval` with:

```javascript
({
  scrollW: document.documentElement.scrollWidth,
  clientW: document.documentElement.clientWidth,
  overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
});
```

Expected: `overflow: false`. If true, inspect the offending element with `mcp__Claude_Preview__preview_inspect` and adjust gap/padding in `app.css` `.sb-payment-row` or `.sb-footer` (commit any fix as a follow-up commit on the same branch).

- [ ] **Step 7: Verify Back to Top button works**

Use `mcp__Claude_Preview__preview_eval`:

```javascript
window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' });
```

Then `mcp__Claude_Preview__preview_click` on `.sb-totop`.
Then `mcp__Claude_Preview__preview_eval` with `window.scrollY` — expected: returns to near 0 within ~1 second (smooth scroll). Poll once after a short delay if needed.

- [ ] **Step 8: Verify booking-code lookup still works**

Use `mcp__Claude_Preview__preview_fill` to type a known dummy code (e.g. `TEST123`) into the `.sb-payslip-input input`.
Use `mcp__Claude_Preview__preview_click` on the Check button.
Expected: existing `onPayslip` handler runs — either shows the bet-lookup modal/toast or a "not found" message. Either is a pass — we just need the handler invoked.

- [ ] **Step 9: Stop the preview**

Use `mcp__Claude_Preview__preview_stop`.

- [ ] **Step 10: Commit any verification-driven fixes (only if step 6 or 7 required adjustments)**

If any CSS tweaks were made during steps 6–7:

```bash
git add client/src/styles/app.css
git commit -m "style(home): tighten footer for narrow viewports"
```

If no fixes were needed, skip this step.

---

## Self-review

**Spec coverage check (against [2026-06-08-sportybet-style-footer-design.md](../specs/2026-06-08-sportybet-style-footer-design.md)):**

- Block 0 (GrandPrizeWinners relocated): Task 2 step 1 deletes the inline render; Task 2 step 2 includes it at top of new footer. ✓
- Block 1 (18+ chip): Task 1 `.sb-age-chip` rule; Task 2 `<div className="sb-age-chip">`. ✓
- Block 2 (Sponsor card): Task 1 `.sb-sponsor-card` + logo rules; Task 2 JSX. ✓
- Block 3 (Payslip card with USSD code): Task 1 `.sb-payslip` + `.sb-payslip-code`; Task 2 form JSX preserves `onPayslip`, `payslip`, `setPayslip`. ✓
- Block 4 (Payment methods row): Task 1 `.sb-payment` + 4 chip color rules; Task 2 JSX. ✓
- Block 5 (Legal block + links): Task 1 `.sb-legal*` rules; Task 2 JSX with routes `/terms`, `/info`, `/help`. ✓
- Block 6 (Back to Top): Task 1 `.sb-totop` rule; Task 2 button with `window.scrollTo`. ✓
- Brand text "Xenbet GH" throughout: Task 2 JSX uses it in both sponsor card and legal block. ✓
- No new files / no new deps: confirmed. ✓
- Success criteria (Back to Top works, booking-code lookup works, no overflow, no console errors): Task 3 steps 4, 6, 7, 8. ✓

**Placeholder scan:** no TBD/TODO; all code blocks complete; all paths absolute or repo-relative.

**Type/name consistency:** classes used in Task 2 JSX (`sb-footer`, `sb-gpw-slot`, `sb-age-chip`, `sb-sponsor-card`, `sb-sponsor-brand`, `sb-sponsor-sub`, `sb-sponsor-logos`, `sb-logo-rm`, `sb-logo-laliga`, `sb-sponsor-tag`, `sb-payslip`, `sb-payslip-label`, `sb-payslip-code`, `sb-payslip-input`, `sb-payslip-foot`, `sb-payment`, `sb-payment-label`, `sb-payment-row`, `sb-pay-chip`, `sb-pay-mtn`, `sb-pay-telecel`, `sb-pay-visa`, `sb-pay-gtbank`, `sb-legal`, `sb-legal-brand`, `sb-legal-text`, `sb-legal-links`, `sb-totop`) all match the rule selectors defined in Task 1. ✓

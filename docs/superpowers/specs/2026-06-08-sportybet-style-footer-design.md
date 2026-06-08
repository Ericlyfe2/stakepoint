# SportyBet-style Home footer redesign

**Date:** 2026-06-08
**Scope:** Visual redesign of the bottom region of the Home page (`client/src/pages/Home.jsx` lines 1137–1163) to match a SportyBet-style mockup while keeping the existing "Xenbet GH" brand identity.

## Goal

Replace the current sparse two-block bottom region (`.sb-compliance` + `.sb-payslip`) with a five-block stacked footer that visually matches the reference mockup. Keep all current behavior: booking-code lookup, brand text "Xenbet GH", existing routes.

## Non-goals

- No changes to the header, navigation tabs, market filter tabs, match list, bet slip, or bottom navigation.
- No changes to routes, providers, or API calls.
- No new dependencies, no asset downloads, no image files added.

## Layout (top → bottom)

1. **18+ chip** — single circular outlined badge, centered. Reuses existing `.badge18` styling, slightly larger.

2. **Sponsor card** (light/white surface, rounded 14px):
   - Brand row: "Xenbet GH" wordmark, with subtitle "Official Sponsor · Betting Partner" beneath.
   - Logo row: two stylized chips rendered with inline SVG + CSS:
     - **Real Madrid** placeholder — white shield silhouette outlined in navy, monogram "RM".
     - **LaLiga** placeholder — red gradient pill with "LaLiga" wordmark.
   - Tagline (bold, dark): *"The world's sharper betting platform"*.

3. **Payslip card** (dark surface, matches existing `.sb-payslip`):
   - Small uppercase label: "Payslip".
   - Prominent red mono USSD code: **`*711*222#`** (~22–24 px, JetBrains Mono).
   - Existing booking-code `<input>` + Check button preserved verbatim below the code.
   - Existing footer hint preserved: "Enter a booking code to view a slip".

4. **Payment methods row:**
   - Small label "Payment methods" above the row.
   - Four horizontal brand chips rendered with CSS-only color/text — no images:
     - MTN — yellow (`#ffcc00`) pill with black "MTN" text.
     - telecel — red (`#e30613`) pill with white "telecel" text.
     - VISA — navy (`#1a1f71`) pill with yellow "VISA" wordmark.
     - GTBank — orange (`#e95a0c`) pill with white "GTBank" text.

5. **Legal block:**
   - Small "Xenbet GH" wordmark.
   - Paragraph: *"Age 18 and above only. Play Responsibly. Betting is addictive and can be psychologically harmful. Xenbet GH is licensed by the Gaming Commission of Ghana under Licence No 0006027."*
   - Inline link row separated by middle dots: **Terms & Conditions** · **About Us** · **System Status**.
     - Routes: `/terms` (already redirects to `/info#terms`), `/info`, `/help`.

6. **Back to Top button:**
   - Full-width pill, light surface, dark text.
   - On click: `window.scrollTo({ top: 0, behavior: 'smooth' })`.

## File changes

- **`client/src/pages/Home.jsx`** — replace JSX block at lines 1137–1163 with the new footer JSX (~80 lines). No other lines touched.
- **`client/src/styles/app.css`** — replace the existing `.sb-compliance` + `.sb-payslip` rule block (lines 2327–2403) and any media-query overrides at lines 2984–2989 with a new layered footer ruleset (~150 lines). Reuses existing CSS variables (`--surface`, `--surface-2`, `--bg`, `--line`, `--accent`, `--accent-hot`, `--accent-cool`, `--text`, `--text-soft`, `--text-dim`).
- **No new files.** **No deleted files.** **No new dependencies.**

## Brand & legal approach

- Brand text stays "Xenbet GH" everywhere — the SportyBet mockup is a visual reference only.
- Logo and payment-method chips are CSS-styled placeholders that read as logos at a glance. No raster art for Real Madrid / LaLiga / MTN / telecel / VISA / GTBank ships with the repo, avoiding any trademark exposure.

## Behavior preserved

- Booking-code lookup form (`onPayslip` handler, `payslip` state) is unchanged — only its visual container changes.
- Floating bet-slip pill and slip bottom-sheet (Home.jsx lines 1165+) are unchanged.
- Bottom navigation (in `AppShell`) is unchanged.

## Risks

- **Visual regression on existing screens:** the styling overlap zone is narrow (only `.sb-compliance` and `.sb-payslip` rules are modified). Any other components reusing those class names would be affected — quick grep confirms they are only used on Home.
- **Color contrast:** the new white sponsor card sits inside a dark page surface; need to verify the contrast against the surrounding background and that the card's internal text passes WCAG AA at the chosen sizes.
- **Mobile width:** four payment chips must fit on a 320 px viewport; chips need `flex-wrap` and tight padding to avoid horizontal scroll.

## Success criteria

- Home page footer area visually matches the reference mockup structure (5 stacked blocks + Back to Top).
- Booking-code lookup still works (manual: enter a code, hit Check, confirm existing behavior).
- No horizontal overflow on a 320 px viewport.
- No console errors or warnings introduced.
- Brand text reads "Xenbet GH" — no stray "SportyBet" copy.

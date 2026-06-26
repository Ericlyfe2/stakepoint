# Oddsify Rebrand & Recolor — Design

**Status:** Approved (user verbally authorized execution).
**Date:** 2026-05-26.

## Goal

Rename the project from `xenbet` to `oddsify` across the entire codebase (Note: later rebranded to `BetXentra`)
(UI, package metadata, env keys, storage keys, internal references) and
replace the electric-lime accent palette with a green + yellow + pink-red
scheme inspired by reference images of competitor betting UIs (Oddywin,
ZentrixBet).

Scope is **visual + name only** — no information-architecture changes, no
new pages, no copy rewrites beyond replacing the brand name.

## Color tokens

### Dark theme (default)

```
--bg:           #08090B
--bg-soft:      #0E1013
--surface:      #14181C
--surface-2:    #1C2229
--line:         rgba(255,255,255,0.06)
--line-strong:  rgba(255,255,255,0.12)
--text:         #ECEDEE
--text-soft:    #A0A6AD
--text-dim:     #5F6770
--header-bg:    rgba(8,9,11,0.78)

--accent:       #1FAF52   /* betting green — brand, tabs, success, nav pills */
--accent-warm:  #FCC600   /* yellow — "Place Bet", "Get Bonus", money CTAs */
--accent-hot:   #FF3554   /* pink-red — LIVE pulses, errors, alerts */
--accent-cool:  #6AD0FF   /* picks / informational, kept */
--gold:         #D4A857   /* jackpot / premium, kept */
```

### Light theme

```
--bg:           #F4F6F4
--bg-soft:      #FFFFFF
--surface:      #FFFFFF
--surface-2:    #E9EDE9
--text:         #0B0E11
--text-soft:    #4A5258
--text-dim:     #7A848A
--accent:       #168B40
--accent-warm:  #C89400
--accent-hot:   #D6263F
```

Background radial-gradient glows updated from `rgba(197,255,61,…)` (lime)
to `rgba(31,175,82,…)` (green) in both themes.

## Identity

- **Wordmark:** `Odd<em>sify</em>` — italic serif tail in `--accent`.
- **Logo mark:** new 32×32 SVG, concentric "O" target/chip — green outer
  stroke (~3px) on dark fill, rotated -6° with green glow shadow.
- **Favicon + Apple touch icon:** updated to match new mark.

## Rename surface

User-facing:
- `<title>`, `<meta description>`, OG/Twitter tags in `client/index.html`
- Header wordmark in `AppShell.jsx`, `AdminShell.jsx`, `LoginPage.jsx`
- Body copy referencing "Xenbet" in Profile / Help / Info pages
- Email sender / display name (`server/src/services/email.js`)
- Admin seed display names (`server/src/db/seedAdmins.js`)

Internal:
- `package.json` names: `xenbet`, `xenbet-client`, `xenbet-server` →
  `oddsify`, `oddsify-client`, `oddsify-server`
- localStorage keys: `xenbet_*` → `oddsify_*`
- `JWT.issuer` env config: `xenbet` → `oddsify`
- API health `service` field: `xenbet-api` → `oddsify-api`
- `.env.example` defaults referencing xenbet domain
- Later rebranded to BetXentra: all occurrences of `xenbet`/`oddsify` branding now use `betxentra`
- `<meta name="theme-color">`: updated to new `--bg` (`#08090B`)

## Migration shim

A small `client/src/lib/migrateStorage.js` invoked once from `main.jsx`
copies any `xenbet_*` localStorage key to its `oddsify_*` counterpart (now migrated to `betxentra_*`)
then deletes the old key. Idempotent (no-op on subsequent loads).
Preserves existing users' theme preference and session.

## Component-level visual updates

- **Bottom-nav active pill:** green oval (Image 4 ZentrixBet pattern) —
  already structurally present, just inherits new `--accent`.
- **"Bet slip" badge in bottom-nav:** orange → yellow (`--accent-warm`)
  to align with the "money CTA = yellow" rule from Image 2.
- **"Join Now" button:** green pill (cascades from token).
- **Logo glow:** green shadow instead of lime.
- **LIVE indicator:** pink-red pulse, unchanged in structure.

## Out of scope (explicitly)

- Layout / IA changes
- Font changes (Bricolage Grotesque + Instrument Serif + JetBrains Mono stay)
- Image/photo asset changes beyond favicon + touch icon
- Backend behavior changes
- New features or copy rewrites

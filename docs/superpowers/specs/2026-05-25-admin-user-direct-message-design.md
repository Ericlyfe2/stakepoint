# Admin → user direct message + session persistence

Design covers two changes shipped together:

1. **Admin → user DM.** An admin can send a private notification to one specific user. The user sees a centred pop-up modal when the tab is open, an OS push notification when the tab is backgrounded, plus a header bell with persistent inbox. Separate from the existing platform-wide broadcast.
2. **Stay logged in.** Fix two over-eager `clearTokens()` paths that drop the session on any transient network failure. Refresh tokens already live 30 days; the bug is purely in how the client reacts to errors during silent refresh.

## Why this is separate from broadcasts

The existing `/api/admin/notifications` endpoint already publishes broadcasts to `all`, `verified`, or `admins`. The broadcast feed is a single, append-only log visible to every admin — mixing private DMs into it would muddle audit visibility (a "Notifications" list with DMs in it stops being a list of public announcements) and the audience field would start meaning two unrelated things. A dedicated `userMessages` store keeps the two surfaces clean: broadcasts continue exactly as today, DMs live alongside per-user state.

## Server

### Store

New `userMessages` store backed by `server/data/user_messages.json`, keyed by message id.

```
{
  id:           "msg-<timestamp>-<rand>",
  userId:       "u-…",
  fromAdminId:  "u-…",         // admin who sent it
  title:        string (2–80),
  body:         string (2–500),
  severity:     "info" | "success" | "warning" | "critical",
  createdAt:    ISO 8601,
  readAt:       ISO 8601 | null
}
```

### Endpoints

All endpoints reuse the existing `validate`, `requireAdmin` / `requireAuth`, `audit`, and `asyncHandler` middleware so error handling and audit logging match the rest of the API.

| Verb     | Path                                       | Auth         | Notes                                                                                                                                                                       |
| -------- | ------------------------------------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST`   | `/api/admin/users/:id/messages`            | admin        | Body `{ title, body, severity? }`. 404 if user gone; 400 if suspended. Persists, audits as `admin.user.message.sent`, emits `message:new` to `user:<id>` and to admin room. |
| `GET`    | `/api/admin/users/:id/messages`            | admin        | List DMs sent to that user, newest first, max 100.                                                                                                                          |
| `DELETE` | `/api/admin/messages/:id`                  | moderator+   | Unsend / hide. Audit `admin.user.message.deleted`, severity `warning`.                                                                                                      |
| `GET`    | `/api/profile/messages?unread=1&limit=50`  | user         | The user's own inbox. Default: newest 50.                                                                                                                                   |
| `POST`   | `/api/profile/messages/:id/read`           | user         | 404 if not theirs. Idempotent.                                                                                                                                              |
| `POST`   | `/api/profile/messages/read-all`           | user         | Marks all the user's unread messages read. Returns the new unread count (0).                                                                                                |

### Validation

Same shape as the broadcast schema in `routes/admin/notifications.js`, minus the audience field:

```js
const messageSchema = z.object({
  title:    z.string().trim().min(2).max(80),
  body:     z.string().trim().min(2).max(500),
  severity: z.enum(['info', 'success', 'warning', 'critical']).default('info'),
});
```

### Realtime delivery

Uses the existing `emitToUser(userId, event, payload)` helper from `services/realtime.js:237`. The `/live` namespace already places authed sockets into `user:<id>` on connect (`services/realtime.js:97`), so persistence + emit is enough — no new namespace, no new room.

When a message is sent the server also calls `emitAdmin('message:sent', record)` so any admin observing the realtime feed sees the event.

### Files touched (server)

- New: `server/src/routes/admin/messages.js` — single admin DM router exporting one `express.Router()`. Internally defines:
  - `POST  /users/:id/messages`
  - `GET   /users/:id/messages`
  - `DELETE /messages/:id`

  Mounted at `/api/admin` in `index.js` so both URL families resolve to this router.
- Modified: `server/src/routes/profile.js` — adds the three user inbox routes (`GET /messages`, `POST /messages/:id/read`, `POST /messages/read-all`). No new file; the user-facing surface is small enough to live with the existing profile router.
- Modified: `server/src/index.js` — one `app.use('/api/admin', adminMessagesRouter)` line. No other wiring.
- No change: `server/src/db/store.js`. Uses the generic `createStore('userMessages', {})` factory exactly the way `notifications.js` does today (`server/src/routes/admin/notifications.js:15`).

## Admin UI

### "Message user" button

In `client/src/pages/admin/Users.jsx`, the User Drawer footer (currently: Suspend / Verify / Adjust wallet / Reset password / View credentials / Login as user / Delete) gains a **"Message"** button between Verify and Adjust wallet. Visible to anyone who can already view the drawer (support+).

Clicking opens a Modal:
- Title input (`maxLength=80`, required)
- Body textarea (`maxLength=500`, required, 3 rows)
- Severity select: Info / Success / Warning / Critical
- "Cancel" + "Send message"

On success: toast "Message sent", refresh the new Messages tab, close the modal.

### Messages tab

New tab `Messages (n)` in the drawer tab strip alongside Profile / Bets / Transactions / Activity. Lists DMs to this user, newest first. Each row shows:
- Severity badge
- Title + body excerpt
- Sender (admin display name)
- "Read ✓ 5m ago" or unread indicator
- Delete button (moderator+ only)

### API helpers

Added to `client/src/api/adminApi.js`:

```js
export const adminSendUserMessage  = (id, body) => post(`/users/${encodeURIComponent(id)}/messages`, body);
export const adminListUserMessages = (id)       => get(`/users/${encodeURIComponent(id)}/messages`);
export const adminDeleteMessage    = (id)       => del(`/messages/${encodeURIComponent(id)}`);
```

The existing broadcast `NotificationsPage` is untouched.

## Player UI

### Modal pop-up on arrival

In addition to the toast + bell, a centred modal appears when a new admin message arrives **and the document is visible** (`document.visibilityState === 'visible'`):

- Severity-coloured top border + icon.
- Title (large), body (full text, no truncation).
- Sender label: "From the team" (the user shouldn't see internal admin identities).
- Single "OK" button. Clicking it calls `markRead(id)` and closes the modal.
- ESC key and click-on-backdrop also close + mark read.
- If multiple messages arrive while one is open, they queue (FIFO) — the next opens on close.

Component: `client/src/components/AdminMessageModal.jsx`. Mounted once in `AccountProvider`'s render tree, driven by a `pendingModalMessage` state slice that pops the next message from the unread queue.

### Browser push notification when backgrounded

When the document is **not** visible (`visibilityState === 'hidden'` — user is on another tab, screen locked, or the page is minimised), the client fires an OS-level notification using the Web Notification API:

```js
new Notification(record.title, {
  body: record.body,
  tag:  `admin-msg-${record.id}`,   // dedupe; later send replaces earlier
  icon: '/icon-192.png',            // existing PWA icon
});
```

Permission flow:
- On first sign-in, we **don't** prompt aggressively. The bell popover shows a one-line "Enable alerts" button that calls `Notification.requestPermission()`. Users who decline just keep modal+toast — graceful degradation.
- We never call `requestPermission()` from within `onLive('message:new')`. By spec, browsers will refuse permission requests that aren't tied to a user gesture.
- If `Notification.permission === 'granted'` and the tab is hidden, fire the OS notification. Clicking it focuses the tab — the in-app modal then opens on next visibility.

No service worker required for the v1 — we keep it tab-scoped. (Off-tab push that survives full browser close needs a service worker + push server; explicitly out of scope.)

### Header bell

New `client/src/components/NotificationBell.jsx`:
- Bell SVG with a small red dot/badge when `unreadCount > 0` (caps at `9+`).
- Click opens an anchored popover (10 most-recent messages).
- Each row: severity-coloured dot, title, body excerpt (`line-clamp: 2`), relative time, "Mark read" if unread.
- "Mark all read" button at the bottom.
- Click-outside closes; ESC closes; focus-trap when open.

Placed in both desktop and mobile header sections of `AppShell.jsx`, before the avatar.

### Account provider hookup

`client/src/providers/AccountProvider.jsx` already wires `onLive(...)` listeners (`wallet:update`, `bet:won`, `bet:settled`). Add:

```js
const offMessage = onLive('message:new', (record) => {
  setMessages((prev) => [record, ...prev].slice(0, 100));
  toast(record.title, severityToToastKind(record.severity),
        record.severity === 'critical' ? { ttl: 0 } : undefined);
});
```

`severity → toast kind`: `info → info`, `success → success`, `warning → warn`, `critical → error`. **Critical toasts do not auto-dismiss** (`ttl: 0`); other severities use the default 3.5s ttl.

On sign-in, fetch `/api/profile/messages` once and seed `messages` state so the bell badge survives reloads.

Expose via the existing `useAccount()` hook:
```js
const { messages, unreadCount, markRead, markAllRead } = useAccount();
```

### Files touched (client)

- New: `client/src/components/NotificationBell.jsx`
- New: `client/src/components/AdminMessageModal.jsx` — centred pop-up shown when a DM lands and the tab is visible.
- New: `client/src/api/messagesApi.js` (`fetchMessages`, `markMessageRead`, `markAllMessagesRead`).
- Modified: `client/src/providers/AccountProvider.jsx` — add messages state, fetcher, socket listener, mark-read helpers, modal queue, visibilitychange-aware OS notification + session rehydrate, hardened error handling (see "Stay logged in" below).
- Modified: `client/src/api/betApi.js` — narrow refresh-failure detection: clear tokens only on 401/403 from `/auth/refresh`, not on network errors or 5xx.
- Modified: `client/src/layout/AppShell.jsx` — render `<NotificationBell />` in both header variants.
- Modified: `client/src/api/adminApi.js` — three new helpers.
- Modified: `client/src/pages/admin/Users.jsx` — Message button, modal, Messages tab.

## Stay logged in (bug fix)

The auth stack already issues 15-min access tokens + 30-day refresh tokens stored in `localStorage`, and `rawFetch` silently refreshes on 401. The system is designed for long sessions — but two over-eager `clearTokens()` calls drop the session on the slightest network blip. Both must be tightened.

### Bug #1 — refresh failure clears tokens on network error

[`client/src/api/betApi.js:39-54`](client/src/api/betApi.js#L39-L54)

```js
refreshInflight = refreshInflight || (async () => {
  const r = await fetch(`${API_BASE}/auth/refresh`, …);
  if (!r.ok) throw new Error('refresh failed');
  …
})();
try { await refreshInflight; } catch { clearTokens(); return res; }
```

Any throw — `r.ok` false (including 500 / 502 / network), `fetch` rejection — triggers `clearTokens()`. **Fix:** only clear when the refresh endpoint explicitly returns 401 or 403 (the only statuses that mean "your refresh token is invalid"). On 5xx, network rejection, or any other failure, leave tokens alone and let the original 401 propagate so the UI can keep the user signed in while the next request retries.

### Bug #2 — fetchMe failure clears tokens

[`client/src/providers/AccountProvider.jsx:63-77`](client/src/providers/AccountProvider.jsx#L63-L77)

```js
const refresh = useCallback(async () => {
  if (!getAccess()) { setAccount(null); setLoading(false); return null; }
  try {
    const data = await fetchMe();
    setAccount(data.account);
    return data.account;
  } catch {
    clearTokens();         // ← unconditional
    setAccount(null);
    return null;
  } …
}, []);
```

`fetchMe()` failing on app mount is interpreted as "session invalid" regardless of cause. A single offline second during page load = logged out. **Fix:** inspect `err.status`. Only clear tokens on `401` or `403`. On network errors (status undefined) or 5xx, leave the tokens in place and surface a transient toast like "Reconnecting…" — the next call will retry through the same auto-refresh path.

### Visibility-change retry

Add a `visibilitychange` listener in `AccountProvider`: when the tab becomes visible again, if `account === null && getRefresh()` exists, attempt one `refresh()` rehydrate. Covers the case where the user closes the laptop overnight; on reopen, the access token is dead but the refresh is alive — we want them silently back in.

### Token-expiry-aware refresh

Optional, low-risk improvement: in `rawFetch`, before sending a request, peek at the JWT `exp` claim of the access token. If it's expired or within 30 seconds of expiring, refresh proactively. Eliminates the wasted-401 round-trip and keeps the experience smoother on slow networks. JWT decode is a 3-line `atob` of the middle segment — no new dependency.

### What about the server side?

No server change needed. Refresh tokens already live 30 days, are stored in JSON, are revocable on admin action (suspend / block / password change), and rotate on every refresh call. The fix is entirely in the client's reaction to errors. Long-lived refresh + silent rotation is already best practice for this kind of app.

### Symptoms that are NOT this bug (out of scope here)

- Admin or user explicitly clicked "Sign out" — expected.
- Admin suspended / blocked the account — intentional: `revokeAllForAccount` correctly invalidates every refresh token (server-side fix not needed).
- User changed their password — intentional: other sessions are signed out, as the toast says.

## Tests

- Smoke test (`server/test/admin-messages.test.js`): admin POST → persist → emit; user GET returns the record; mark-read mutates `readAt`; suspended-user POST returns 400.
- Manual checklist (stay-logged-in):
  - Sign in, kill the API for 5 seconds with the tab open, restart it — user remains signed in.
  - Sign in, close the laptop overnight (access token long expired), reopen — user remains signed in after a brief reconnect.
  - Admin suspends the user — the user is correctly signed out on next request (still works after the fix).
  - User clicks "Sign out" — signed out (no change).

## Out of scope

- Templated / scheduled messages.
- Push notifications (browser Notification API, mobile push).
- Bulk DM to multiple users (the user explicitly said one user at a time for now).
- Email mirror of the DM — the existing OTP/email infra could be reused later if required.

## Other bug-fix work (separate track)

The user also asked broadly for "fix all errors and bugs". The "Stay logged in" section above addresses one concrete bug. The remaining categories — server crashes, admin pages going blank, player-site issues, sports-provider work — need specific symptoms from the user before any fix is applied. They will be tackled in dedicated commits once described. Speculative refactoring is out of scope.

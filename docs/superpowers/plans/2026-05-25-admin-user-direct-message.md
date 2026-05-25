# Admin → user direct message + session persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin send a private message to one specific user (modal in-app when visible, OS push when backgrounded, persistent bell inbox), and stop logging users out on transient network errors.

**Architecture:** Adds a `userMessages` JSON-backed KV store, a small admin router mounted at `/api/admin`, three user-facing inbox endpoints on the existing `/api/profile` router, and live delivery via the already-built `emitToUser(userId, 'message:new', record)` socket helper. Client gains a bell + modal + OS-notification flow driven by `AccountProvider`. Session persistence is fixed in two places where `clearTokens()` was over-eager.

**Tech Stack:** Express 4, zod, Socket.IO (existing), React 18, JSON-file KV store (Postgres-compatible via the same `createStore` factory), `node:test` for server tests.

**Spec:** [`docs/superpowers/specs/2026-05-25-admin-user-direct-message-design.md`](../specs/2026-05-25-admin-user-direct-message-design.md)

---

## File Structure

**New files**

| Path | Responsibility |
|---|---|
| `server/src/db/userMessages.js` | Persistence helpers around the `userMessages` KV store. One file, narrow surface. |
| `server/src/routes/admin/messages.js` | Three admin routes (send DM, list DMs for a user, delete DM). |
| `server/test/userMessages.test.js` | Unit tests for the db helpers. |
| `server/test/admin-messages.endpoint.test.js` | Integration test for admin send + user GET + mark-read flow. |
| `client/src/api/messagesApi.js` | User-facing inbox client (`fetchMessages`, `markMessageRead`, `markAllMessagesRead`). |
| `client/src/components/NotificationBell.jsx` | Bell icon with unread badge + popover with recent messages. |
| `client/src/components/AdminMessageModal.jsx` | Centred pop-up that opens when a DM arrives while the tab is focused. |

**Modified files**

| Path | Why |
|---|---|
| `server/src/routes/profile.js` | Add three user inbox routes. |
| `server/src/index.js` | Mount the new admin router at `/api/admin`. |
| `client/src/api/betApi.js` | Tighten refresh-failure handling so network blips don't sign users out. |
| `client/src/api/adminApi.js` | Add three admin helpers. |
| `client/src/providers/AccountProvider.jsx` | Messages state, socket listener, modal queue, OS-notification dispatch, visibilitychange rehydrate, hardened `refresh()` error handling. |
| `client/src/layout/AppShell.jsx` | Render `<NotificationBell />` in both header variants. |
| `client/src/pages/admin/Users.jsx` | "Message" button in drawer footer + modal + "Messages" tab. |

---

## Task 1: `userMessages` store helpers

**Files:**
- Create: `server/src/db/userMessages.js`
- Test: `server/test/userMessages.test.js`

- [ ] **Step 1: Write the failing test**

Create `server/test/userMessages.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initStores } from '../src/db/store.js';
import {
  createMessage, listMessagesForUser, listMessagesByRecipient,
  markRead, markAllRead, getMessage, deleteMessage,
} from '../src/db/userMessages.js';

await initStores();

test('createMessage persists and returns a record', () => {
  const m = createMessage({ userId: 'u-1', fromAdminId: 'a-1', title: 'Hi', body: 'Welcome', severity: 'info' });
  assert.equal(m.userId, 'u-1');
  assert.equal(m.fromAdminId, 'a-1');
  assert.equal(m.title, 'Hi');
  assert.equal(m.body, 'Welcome');
  assert.equal(m.severity, 'info');
  assert.equal(m.readAt, null);
  assert.match(m.id, /^msg-/);
  assert.ok(m.createdAt);
});

test('listMessagesForUser returns newest first, scoped by user', () => {
  const a = createMessage({ userId: 'u-2', fromAdminId: 'a-1', title: 'A', body: 'A', severity: 'info' });
  const b = createMessage({ userId: 'u-2', fromAdminId: 'a-1', title: 'B', body: 'B', severity: 'info' });
  createMessage({       userId: 'u-3', fromAdminId: 'a-1', title: 'C', body: 'C', severity: 'info' });
  const list = listMessagesForUser('u-2');
  assert.equal(list.length, 2);
  assert.equal(list[0].id, b.id);
  assert.equal(list[1].id, a.id);
});

test('listMessagesByRecipient is the admin-side view of one user inbox', () => {
  // Same data as listMessagesForUser but the name reflects who's asking; both
  // return the same shape so the admin drawer + the user inbox can share UI.
  const list = listMessagesByRecipient('u-2');
  assert.equal(list.length, 2);
});

test('markRead sets readAt on the matching record only', () => {
  const m = createMessage({ userId: 'u-4', fromAdminId: 'a-1', title: 'X', body: 'X', severity: 'warning' });
  const after = markRead(m.id);
  assert.ok(after.readAt);
  assert.equal(getMessage(m.id).readAt, after.readAt);
});

test('markAllRead marks every unread record for one user', () => {
  createMessage({ userId: 'u-5', fromAdminId: 'a-1', title: '1', body: '1', severity: 'info' });
  createMessage({ userId: 'u-5', fromAdminId: 'a-1', title: '2', body: '2', severity: 'info' });
  const count = markAllRead('u-5');
  assert.equal(count, 2);
  for (const m of listMessagesForUser('u-5')) assert.ok(m.readAt);
});

test('deleteMessage removes the record', () => {
  const m = createMessage({ userId: 'u-6', fromAdminId: 'a-1', title: 'D', body: 'D', severity: 'info' });
  deleteMessage(m.id);
  assert.equal(getMessage(m.id), undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- test/userMessages.test.js`
Expected: FAIL — `userMessages.js` does not exist yet.

(If `npm test` isn't wired in `server/package.json`, run `node --test server/test/userMessages.test.js` from the repo root.)

- [ ] **Step 3: Implement the store helpers**

Create `server/src/db/userMessages.js`:

```js
/**
 * Per-user direct-message store. Sibling of admin broadcasts but
 * keyed per-user so the user inbox query is a single store filter.
 *
 * Record shape:
 *   {
 *     id:          "msg-<ts>-<rand>",
 *     userId:      lowercase user id (email),
 *     fromAdminId: admin user id,
 *     title:       string (validated upstream),
 *     body:        string (validated upstream),
 *     severity:    "info" | "success" | "warning" | "critical",
 *     createdAt:   ISO 8601,
 *     readAt:      ISO 8601 | null,
 *   }
 */
import { createStore } from './store.js';

const store = createStore('userMessages', {});

export function createMessage({ userId, fromAdminId, title, body, severity = 'info' }) {
  const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const record = {
    id,
    userId:      String(userId).toLowerCase(),
    fromAdminId: String(fromAdminId).toLowerCase(),
    title, body, severity,
    createdAt:   new Date().toISOString(),
    readAt:      null,
  };
  store.set(id, record);
  return record;
}

export function getMessage(id) {
  return store.get(id);
}

export function deleteMessage(id) {
  if (!store.get(id)) return false;
  store.delete(id);
  return true;
}

function newestFirst(a, b) {
  return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
}

export function listMessagesForUser(userId, { unreadOnly = false, limit = 50 } = {}) {
  const key = String(userId).toLowerCase();
  const all = store.list().filter((m) => m.userId === key && (!unreadOnly || !m.readAt));
  return all.sort(newestFirst).slice(0, limit);
}

// Same query, different name — kept so admin-side and user-side call sites
// read intentionally rather than aliasing the same function.
export const listMessagesByRecipient = (userId) => listMessagesForUser(userId, { limit: 100 });

export function markRead(id) {
  const m = store.get(id);
  if (!m) return null;
  if (m.readAt) return m;
  return store.update(id, (cur) => ({ ...cur, readAt: new Date().toISOString() }));
}

export function markAllRead(userId) {
  const key = String(userId).toLowerCase();
  let count = 0;
  for (const m of store.list()) {
    if (m.userId === key && !m.readAt) {
      store.update(m.id, (cur) => ({ ...cur, readAt: new Date().toISOString() }));
      count++;
    }
  }
  return count;
}

export function unreadCount(userId) {
  const key = String(userId).toLowerCase();
  let n = 0;
  for (const m of store.list()) if (m.userId === key && !m.readAt) n++;
  return n;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test server/test/userMessages.test.js`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/db/userMessages.js server/test/userMessages.test.js
git commit -m "feat(messages): add per-user direct-message KV store"
```

---

## Task 2: Admin DM router + mount

**Files:**
- Create: `server/src/routes/admin/messages.js`
- Modify: `server/src/index.js`
- Test: `server/test/admin-messages.endpoint.test.js`

- [ ] **Step 1: Write the failing integration test**

Create `server/test/admin-messages.endpoint.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import express from 'express';
import { initStores } from '../src/db/store.js';
import { createUser, updateUser } from '../src/db/users.js';
import { signAccessToken, signAdminAccessToken } from '../src/services/token.js';
import { errorHandler } from '../src/middleware/error.js';
import adminMessagesRouter from '../src/routes/admin/messages.js';
import profileRouter from '../src/routes/profile.js';

await initStores();

// Seed an admin and a regular user.
const admin = createUser({ email: 'admin@test.local', passwordHash: 'x', emailVerified: true });
updateUser(admin.id, { role: 'admin', adminRole: 'support' });
const user = createUser({ email: 'player@test.local', passwordHash: 'x', emailVerified: true });

const app = express();
app.use(express.json());
app.use('/api/admin',   adminMessagesRouter);
app.use('/api/profile', profileRouter);
app.use(errorHandler);
const server = http.createServer(app).listen(0);
const port = server.address().port;
const adminToken = signAdminAccessToken({ ...admin, role: 'admin', adminRole: 'support' });
const userToken  = signAccessToken({ ...user, role: 'user' });

const req = async (method, path, token, body) => {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
};

test('admin sends a DM, user lists it, user marks it read', async () => {
  const send = await req('POST', `/api/admin/users/${user.id}/messages`, adminToken, {
    title: 'Hello', body: 'Welcome to the platform.', severity: 'success',
  });
  assert.equal(send.status, 201);
  assert.ok(send.body.message.id);

  const list = await req('GET', '/api/profile/messages', userToken);
  assert.equal(list.status, 200);
  assert.equal(list.body.messages.length, 1);
  assert.equal(list.body.messages[0].title, 'Hello');
  assert.equal(list.body.unreadCount, 1);

  const mark = await req('POST', `/api/profile/messages/${send.body.message.id}/read`, userToken);
  assert.equal(mark.status, 200);

  const list2 = await req('GET', '/api/profile/messages', userToken);
  assert.equal(list2.body.unreadCount, 0);
});

test('admin cannot DM a suspended user', async () => {
  const suspended = createUser({ email: 'banned@test.local', passwordHash: 'x', emailVerified: true });
  updateUser(suspended.id, { suspended: true });
  const res = await req('POST', `/api/admin/users/${suspended.id}/messages`, adminToken, {
    title: 'X', body: 'Y', severity: 'info',
  });
  assert.equal(res.status, 400);
});

test('admin GET lists DMs sent to a user', async () => {
  const list = await req('GET', `/api/admin/users/${user.id}/messages`, adminToken);
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.body.messages));
  assert.ok(list.body.messages.length >= 1);
});

test.after(() => server.close());
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/test/admin-messages.endpoint.test.js`
Expected: FAIL — `routes/admin/messages.js` does not exist yet.

- [ ] **Step 3: Implement the admin router**

Create `server/src/routes/admin/messages.js`:

```js
/**
 * Admin direct messages — admin to one specific user.
 *
 * Separate from broadcasts (routes/admin/notifications.js) so the audit log
 * and feed stay clean. Mounted at /api/admin so both URL families coexist:
 *   POST   /api/admin/users/:id/messages
 *   GET    /api/admin/users/:id/messages
 *   DELETE /api/admin/messages/:id
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, requireRole, audit } from '../../middleware/adminAuth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { badRequest, notFound } from '../../utils/httpError.js';
import { getUserById } from '../../db/users.js';
import {
  createMessage, listMessagesByRecipient, getMessage, deleteMessage,
} from '../../db/userMessages.js';
import { emitToUser, emitAdmin } from '../../services/realtime.js';

const router = Router();

const messageSchema = z.object({
  title:    z.string().trim().min(2).max(80),
  body:     z.string().trim().min(2).max(500),
  severity: z.enum(['info', 'success', 'warning', 'critical']).default('info'),
});

router.post('/users/:id/messages',
  requireAdmin,
  validate(messageSchema),
  asyncHandler(async (req, res) => {
    const user = getUserById(req.params.id);
    if (!user)           throw notFound('User not found.');
    if (user.suspended)  throw badRequest('Cannot message a suspended user.');

    const record = createMessage({
      userId: user.id,
      fromAdminId: req.admin.id,
      title: req.body.title,
      body: req.body.body,
      severity: req.body.severity,
    });

    audit(req, {
      action: 'admin.user.message.sent',
      target: record.id,
      targetType: 'userMessage',
      meta: { userId: user.id, severity: record.severity },
    });

    emitToUser(user.id, 'message:new', record);
    emitAdmin('message:sent', record);

    res.status(201).json({ ok: true, message: record });
  })
);

router.get('/users/:id/messages',
  requireAdmin,
  (req, res, next) => {
    const user = getUserById(req.params.id);
    if (!user) return next(notFound('User not found.'));
    res.json({ messages: listMessagesByRecipient(user.id) });
  }
);

router.delete('/messages/:id',
  requireAdmin,
  requireRole('moderator', 'super_admin'),
  (req, res, next) => {
    const m = getMessage(req.params.id);
    if (!m) return next(notFound('Message not found.'));
    deleteMessage(m.id);
    audit(req, {
      action: 'admin.user.message.deleted',
      target: m.id,
      targetType: 'userMessage',
      severity: 'warning',
      meta: { userId: m.userId },
    });
    res.json({ ok: true });
  }
);

export default router;
```

- [ ] **Step 4: Wire the router into the server**

Modify `server/src/index.js`:

At the top, alongside the other admin router imports (`server/src/index.js:27-29`), add:

```js
import adminMessagesRouter      from './routes/admin/messages.js';
```

Then in the route-mount block (`server/src/index.js:91-101`), add this line right after `app.use('/api/admin/notifications', adminNotificationsRouter);`:

```js
app.use('/api/admin',               adminMessagesRouter);
```

Order matters here: `/api/admin` must come **after** the more-specific paths (`/api/admin/notifications`, `/api/admin/auth`, etc.) so Express doesn't shadow them with this catch-all. Express routes by first match per method, and the more-specific mounts above already register their own handlers — the new router only adds `/users/:id/messages` and `/messages/:id`, which none of them claim.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test server/test/admin-messages.endpoint.test.js`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/admin/messages.js server/src/index.js server/test/admin-messages.endpoint.test.js
git commit -m "feat(messages): admin DM endpoints + realtime emit"
```

---

## Task 3: User inbox routes on the profile router

**Files:**
- Modify: `server/src/routes/profile.js`

(Tests covered by the integration test in Task 2.)

- [ ] **Step 1: Add the three user inbox routes**

Modify `server/src/routes/profile.js`. At the top of the file, add to the imports:

```js
import {
  listMessagesForUser, getMessage, markRead, markAllRead, unreadCount,
} from '../db/userMessages.js';
import { notFound, forbidden } from '../utils/httpError.js';
```

Then add the following routes right before `export default router;` at the bottom:

```js
router.get('/messages', requireAuth, (req, res) => {
  const unread = req.query.unread === '1';
  const limit  = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  res.json({
    messages: listMessagesForUser(req.user.id, { unreadOnly: unread, limit }),
    unreadCount: unreadCount(req.user.id),
  });
});

router.post('/messages/:id/read', requireAuth, (req, res, next) => {
  const m = getMessage(req.params.id);
  if (!m)                                      return next(notFound('Message not found.'));
  if (m.userId !== req.user.id.toLowerCase())  return next(forbidden('Not your message.'));
  const updated = markRead(m.id);
  res.json({ message: updated, unreadCount: unreadCount(req.user.id) });
});

router.post('/messages/read-all', requireAuth, (req, res) => {
  const marked = markAllRead(req.user.id);
  res.json({ marked, unreadCount: 0 });
});
```

- [ ] **Step 2: Run the Task 2 integration test to verify the user-side calls still pass**

Run: `node --test server/test/admin-messages.endpoint.test.js`
Expected: all tests PASS (the test already exercises `GET /messages` and `POST /messages/:id/read`).

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/profile.js
git commit -m "feat(messages): user inbox routes (list/read/read-all)"
```

---

## Task 4: Client admin API helpers

**Files:**
- Modify: `client/src/api/adminApi.js`

- [ ] **Step 1: Add three helpers**

Modify `client/src/api/adminApi.js`. Find the `/* notifications (broadcasts) */` block (around `client/src/api/adminApi.js:189-192`) and add directly below it:

```js
/* user direct messages (DM) */
export const adminSendUserMessage  = (id, body) => post(`/users/${encodeURIComponent(id)}/messages`, body);
export const adminListUserMessages = (id)       => get(`/users/${encodeURIComponent(id)}/messages`);
export const adminDeleteMessage    = (id)       => del(`/messages/${encodeURIComponent(id)}`);
```

- [ ] **Step 2: Sanity-check the build**

Run from the repo root: `npm run build`
Expected: client builds without errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/api/adminApi.js
git commit -m "feat(messages): client admin API helpers for user DMs"
```

---

## Task 5: User-side messages client + provider integration

**Files:**
- Create: `client/src/api/messagesApi.js`
- Modify: `client/src/providers/AccountProvider.jsx`

This task lands the messages state in `AccountProvider` and the live-arrival listener. The bell + modal + OS-notification come in subsequent tasks; this is the data layer.

- [ ] **Step 1: Create the user-side messages API**

Create `client/src/api/messagesApi.js`:

```js
/**
 * User-facing messages client. Sits next to betApi.js so it shares the same
 * fetch helpers (auth, refresh) by going through that module.
 */
import { getAccess } from './betApi.js';

const API_BASE = (import.meta.env.VITE_API_BASE || '') + '/api/profile';

async function req(path, opts = {}) {
  const headers = new Headers(opts.headers || {});
  const token = getAccess();
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  if (opts.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || res.statusText || 'Request failed');
    err.status = res.status;
    throw err;
  }
  return body;
}

export const fetchMessages       = ()    => req('/messages?limit=50');
export const fetchUnreadMessages = ()    => req('/messages?unread=1&limit=50');
export const markMessageRead     = (id)  => req(`/messages/${encodeURIComponent(id)}/read`, { method: 'POST' });
export const markAllMessagesRead = ()    => req('/messages/read-all', { method: 'POST' });
```

- [ ] **Step 2: Extend `AccountProvider` with messages state**

Modify `client/src/providers/AccountProvider.jsx`.

Add to the imports at the top of the file, alongside the existing betApi imports (around `client/src/providers/AccountProvider.jsx:3-8`):

```js
import {
  fetchMessages, markMessageRead, markAllMessagesRead,
} from '../api/messagesApi.js';
```

Add a new state slice next to the existing `wins` state (around `client/src/providers/AccountProvider.jsx:48`):

```js
  const [messages, setMessages] = useState([]);
```

Replace the `EMPTY_ACCOUNT` constant at the top of the file (`client/src/providers/AccountProvider.jsx:18-23`) with:

```js
const EMPTY_ACCOUNT = {
  account: null, loading: false,
  signIn: () => {}, signOut: () => {}, adjustBalance: () => {},
  setAccount: () => {}, openDeposit: () => {}, openWithdraw: () => {},
  refresh: () => {}, showWin: () => {},
  messages: [], unreadCount: 0,
  markRead: () => {}, markAllRead: () => {},
};
```

In the polling-effect that already fetches wins (`client/src/providers/AccountProvider.jsx:82-119`), find this block:

```js
    const offWallet = onLive('wallet:update', ({ balance }) => {
```

And add a new listener directly before it:

```js
    const offMessage = onLive('message:new', (record) => {
      setMessages((prev) => [record, ...prev.filter((m) => m.id !== record.id)].slice(0, 100));
    });
```

In the cleanup `return` block of the same effect, change:

```js
      offWallet?.(); offWin?.(); offSettled?.();
```

To include the new listener:

```js
      offWallet?.(); offWin?.(); offSettled?.(); offMessage?.();
```

In the same effect, add an initial fetch right after `refreshAuth();` (around `client/src/providers/AccountProvider.jsx:86`):

```js
    // Seed the inbox so the bell badge survives reloads.
    fetchMessages().then((r) => { if (alive) setMessages(r.messages || []); }).catch(() => {});
```

Add two new callbacks above the `accountValue` memo (around `client/src/providers/AccountProvider.jsx:192`):

```js
  const markRead = useCallback(async (id) => {
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, readAt: new Date().toISOString() } : m));
    try { await markMessageRead(id); } catch { /* tolerated — next fetch reconciles */ }
  }, []);

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setMessages((prev) => prev.map((m) => m.readAt ? m : { ...m, readAt: now }));
    try { await markAllMessagesRead(); } catch { /* tolerated */ }
  }, []);
```

Update the `accountValue` memo to expose them (`client/src/providers/AccountProvider.jsx:192-197`):

```js
  const unreadCount = useMemo(() => messages.filter((m) => !m.readAt).length, [messages]);

  const accountValue = useMemo(() => ({
    account, loading,
    signIn, signOut, adjustBalance, setAccount,
    openDeposit, openWithdraw, refresh,
    showWin,
    messages, unreadCount, markRead, markAllRead,
  }), [account, loading, signIn, signOut, adjustBalance, openDeposit, openWithdraw, refresh, showWin, messages, unreadCount, markRead, markAllRead]);
```

In the `signOut` callback (`client/src/providers/AccountProvider.jsx:138-144`), add a line to clear messages on logout:

```js
  const signOut = useCallback(async () => {
    try { await apiLogout(); } catch { /* ignore network */ }
    clearTokens();
    setAccount(null);
    setMessages([]);
    toast('Logged out.');
    navigate('/', { replace: true });
  }, [toast, navigate]);
```

- [ ] **Step 3: Manual smoke test**

Run dev: `npm run dev`. In a browser, log in as a real user (seeded `demo@xenbet.app` works). Open DevTools → Network tab. You should see `GET /api/profile/messages?limit=50` fire after login.

In a second tab, log in as an admin and POST to `/api/admin/users/<user-id>/messages` (use the Network tab to copy the admin token, or temporarily call `adminSendUserMessage` from the browser console with the user's email lowercased as `id`). The first tab should receive a `message:new` socket event — check `useAccount().messages` in React DevTools to confirm the record landed.

- [ ] **Step 4: Commit**

```bash
git add client/src/api/messagesApi.js client/src/providers/AccountProvider.jsx
git commit -m "feat(messages): client messages state + live socket listener"
```

---

## Task 6: Auth hardening — keep users logged in across blips

**Files:**
- Modify: `client/src/api/betApi.js`
- Modify: `client/src/providers/AccountProvider.jsx`

- [ ] **Step 1: Narrow the refresh-failure detection in `betApi.js`**

Modify `client/src/api/betApi.js`. Replace the `refreshInflight` block (lines 39-58) with this:

```js
  // Try silent refresh exactly once.
  const refresh = getRefresh();
  if (!refresh) return res;
  try {
    refreshInflight = refreshInflight || (async () => {
      const r = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      if (r.ok) {
        const j = await r.json();
        setTokens(j.accessToken, j.refreshToken);
        return j.accessToken;
      }
      // Only treat an explicit auth rejection as a session kill. 5xx, network
      // hiccups, slow CDN — none of those mean the refresh token is bad.
      if (r.status === 401 || r.status === 403) {
        clearTokens();
        const err = new Error('refresh rejected');
        err.permanent = true;
        throw err;
      }
      // Transient failure: bubble out without clearing. The original 401
      // returns to the caller; the next call retries.
      throw new Error('refresh transient failure');
    })();
    await refreshInflight;
  } catch (e) {
    // Only the permanent-rejection branch clears tokens. Anything else
    // just falls through with the original 401 so the user stays signed
    // in and can retry on the next interaction.
    return res;
  } finally {
    refreshInflight = null;
  }
  return rawFetch(path, opts, false);
```

The change in one sentence: a 401 or 403 from `/auth/refresh` clears tokens (as before); any other failure no longer clears them.

- [ ] **Step 2: Harden `AccountProvider.refresh()`**

Modify `client/src/providers/AccountProvider.jsx`. Replace the `refresh` callback (`client/src/providers/AccountProvider.jsx:63-76`) with:

```js
  const refresh = useCallback(async () => {
    if (!getAccess()) { setAccount(null); setLoading(false); return null; }
    try {
      const data = await fetchMe();
      setAccount(data.account);
      return data.account;
    } catch (err) {
      // Only nuke the session for an explicit auth rejection. A flaky network
      // on app boot used to log everyone out — now we leave tokens in place
      // and let the next request retry through the auto-refresh path.
      if (err?.status === 401 || err?.status === 403) {
        clearTokens();
        setAccount(null);
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, []);
```

- [ ] **Step 3: Add visibilitychange rehydrate**

In the same file, add a new effect after the existing polling effect (around `client/src/providers/AccountProvider.jsx:119`):

```js
  // When the tab returns to the foreground after a long sleep, try once to
  // rehydrate the session silently. Covers "closed the laptop overnight,
  // access token long expired, refresh still valid" — previously the user
  // saw the login screen; now they're back in seamlessly.
  useEffect(() => {
    function onVis() {
      if (document.visibilityState !== 'visible') return;
      if (account) return;                      // already signed in
      if (!getAccess() && !getRefresh()) return; // not even tokens — nothing to do
      refresh();
    }
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [account, refresh]);
```

Make sure `getRefresh` is imported from `../api/betApi.js`. Update the existing import:

```js
import {
  setTokens, clearTokens, getAccess, getRefresh,
  fetchMe, logout as apiLogout,
  deposit as apiDeposit,
  fetchUnacknowledgedWins, acknowledgeBet,
} from '../api/betApi.js';
```

- [ ] **Step 4: Manual smoke test**

1. Run `npm run dev`. Sign in as a user.
2. In a separate terminal, stop the server: `pkill -f "node --watch"` (Windows: kill the api process via Task Manager or `Stop-Process -Name node`).
3. Wait 5 seconds. Click around the app (Home, Profile, Wallet). Expected: no automatic redirect to `/login`. You may see a transient error toast, but you stay signed in.
4. Restart the server (`npm run dev` again). Navigate anywhere in the app. Expected: requests resume, you're still signed in, no re-login needed.
5. Now sign out → sign in → close the tab → wait 30 minutes (access TTL is 15m) → reopen the tab. Expected: silent reauth, you land on the page with your account loaded.

- [ ] **Step 5: Commit**

```bash
git add client/src/api/betApi.js client/src/providers/AccountProvider.jsx
git commit -m "fix(auth): stop dropping session on transient network errors"
```

---

## Task 7: Notification bell component

**Files:**
- Create: `client/src/components/NotificationBell.jsx`
- Modify: `client/src/layout/AppShell.jsx`

- [ ] **Step 1: Create the component**

Create `client/src/components/NotificationBell.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react';
import { useAccount } from '../providers/AccountProvider.jsx';

const TONE = {
  info:     '#7c5cff',
  success:  '#18f0a1',
  warning:  '#f5a623',
  critical: '#ff5d6c',
};

function ago(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function NotificationBell() {
  const { account, messages, unreadCount, markRead, markAllRead } = useAccount();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey  = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  if (!account) return null;

  const recent = messages.slice(0, 10);

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="sb-bell-btn"
        aria-label={`Notifications${unreadCount ? ` — ${unreadCount} unread` : ''}`}
        onClick={() => setOpen((v) => !v)}
        style={{
          position: 'relative',
          width: 36, height: 36, borderRadius: 999,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--surface)', border: '1px solid var(--surface-2)',
          color: 'var(--text)', cursor: 'pointer',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            minWidth: 16, height: 16, padding: '0 4px',
            borderRadius: 999,
            background: '#ff5d6c', color: '#fff',
            fontSize: 10, fontWeight: 800, lineHeight: '16px',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0,
            width: 'min(360px, 92vw)', maxHeight: 'min(60vh, 480px)',
            background: 'var(--bg)', border: '1px solid var(--surface-2)',
            borderRadius: 12, boxShadow: '0 16px 48px rgba(0,0,0,.28)',
            display: 'flex', flexDirection: 'column', zIndex: 200,
            overflow: 'hidden',
          }}
        >
          <header style={{ padding: '12px 14px', borderBottom: '1px solid var(--surface-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <strong style={{ flex: 1 }}>Notifications</strong>
            {unreadCount > 0 && (
              <button type="button" onClick={markAllRead}
                style={{ background: 'transparent', border: 'none', color: 'var(--accent, #18f0a1)', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                Mark all read
              </button>
            )}
          </header>

          <div style={{ overflowY: 'auto' }}>
            {recent.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
                You're all caught up.
              </div>
            ) : recent.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => { if (!m.readAt) markRead(m.id); }}
                style={{
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                  width: '100%', textAlign: 'left',
                  padding: '12px 14px',
                  background: m.readAt ? 'transparent' : 'rgba(124, 92, 255, 0.06)',
                  border: 'none', borderBottom: '1px solid var(--surface-2)',
                  color: 'var(--text)', cursor: 'pointer',
                }}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: 999,
                  marginTop: 7, flexShrink: 0,
                  background: TONE[m.severity] || TONE.info,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <strong style={{ fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</strong>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{ago(m.createdAt)}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginTop: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {m.body}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Mount the bell in the AppShell header**

Modify `client/src/layout/AppShell.jsx`. Add to imports at the top:

```jsx
import NotificationBell from '../components/NotificationBell.jsx';
```

In the `MobileHeader` component, inside the `authed ? ( … )` branch (around `client/src/layout/AppShell.jsx:73-94`), add the bell directly before the existing balance chip:

```jsx
      {authed ? (
        <>
          <NotificationBell />
          <button
            type="button"
            className="sb-balance-chip"
            …
```

The desktop header is rendered further down the same file. Search for the file's "Desktop sidebar" section (look for where `account` is rendered with the avatar + balance) and add `<NotificationBell />` directly before the avatar in that block as well. If there are two render branches (signed in vs signed out), add it only to the signed-in branch.

If the existing header has no signed-in account widget yet (the avatar button only), place `<NotificationBell />` immediately before the avatar `<button>`.

- [ ] **Step 3: Manual smoke test**

Run `npm run dev`. Sign in. The bell should appear in both mobile and desktop header next to the avatar. Click it → empty state ("You're all caught up.") shows. From an admin tab, POST a DM to your user — within a second the bell should grow a red badge "1". Click the bell → message appears. Click it → badge clears.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/NotificationBell.jsx client/src/layout/AppShell.jsx
git commit -m "feat(messages): notification bell + unread badge in app shell"
```

---

## Task 8: Centred modal pop-up on arrival

**Files:**
- Create: `client/src/components/AdminMessageModal.jsx`
- Modify: `client/src/providers/AccountProvider.jsx`

- [ ] **Step 1: Create the modal**

Create `client/src/components/AdminMessageModal.jsx`:

```jsx
import { useEffect } from 'react';

const TONE = {
  info:     { border: '#7c5cff', icon: 'ℹ' },
  success:  { border: '#18f0a1', icon: '✓' },
  warning:  { border: '#f5a623', icon: '⚠' },
  critical: { border: '#ff5d6c', icon: '!' },
};

export default function AdminMessageModal({ message, onClose }) {
  useEffect(() => {
    if (!message) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [message, onClose]);

  if (!message) return null;
  const tone = TONE[message.severity] || TONE.info;

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-msg-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg)', color: 'var(--text)',
          width: 'min(440px, 100%)',
          borderRadius: 16,
          borderTop: `4px solid ${tone.border}`,
          padding: '20px 22px 18px',
          boxShadow: '0 24px 64px rgba(0,0,0,.45)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{
            width: 28, height: 28, borderRadius: 999,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: tone.border, color: '#0a0d14', fontWeight: 900,
          }}>{tone.icon}</span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.16em', fontWeight: 800 }}>
            From the team
          </span>
        </div>
        <h2 id="admin-msg-title" style={{ margin: 0, fontSize: 20, fontWeight: 800, lineHeight: 1.25 }}>{message.title}</h2>
        <p style={{ margin: '10px 0 18px', fontSize: 14.5, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{message.body}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            style={{
              padding: '10px 22px', borderRadius: 10, border: 'none',
              background: tone.border, color: '#0a0d14',
              fontWeight: 800, fontSize: 14, cursor: 'pointer',
            }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Drive the modal from `AccountProvider`**

Modify `client/src/providers/AccountProvider.jsx`. Add to imports:

```jsx
import AdminMessageModal from '../components/AdminMessageModal.jsx';
```

Add two new state slices next to `messages` (around `client/src/providers/AccountProvider.jsx:48`). The queue holds only **live-arrival** messages — pre-existing unread from the bell badge must not auto-pop on app load.

```js
  const [modalQueue, setModalQueue] = useState([]); // records that arrived live and haven't been shown yet
```

In the live socket listener you added in Task 5 (`onLive('message:new', ...)`), extend it to push onto the queue **only when the tab is focused**:

```js
    const offMessage = onLive('message:new', (record) => {
      setMessages((prev) => [record, ...prev.filter((m) => m.id !== record.id)].slice(0, 100));
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        setModalQueue((q) => q.some((m) => m.id === record.id) ? q : [...q, record]);
      }
    });
```

(The OS-notification dispatch for the hidden case is added in Task 9.)

Then in the JSX return block of `AppProviders`, right next to where `<WinTrophyModal …/>` is rendered (around `client/src/providers/AccountProvider.jsx:206-210`), add:

```jsx
        <AdminMessageModal
          message={modalQueue[0] || null}
          onClose={() => {
            const closed = modalQueue[0];
            if (closed) markRead(closed.id);
            setModalQueue((q) => q.slice(1)); // FIFO drain — next live arrival opens automatically
          }}
        />
```

The next message in the queue renders automatically because `modalQueue[0]` re-evaluates on every state change. No pre-existing unread is ever auto-shown — the bell is responsible for those.

- [ ] **Step 3: Manual smoke test**

Run `npm run dev`. Sign in as a user on tab A. From an admin session, send a DM to that user. **Tab A is focused →** a centred modal pops up with the title, body, and "OK" button. Click OK → modal closes, bell badge goes back to 0.

Send two DMs in quick succession while the first modal is still open. Close the first → the second opens automatically.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/AdminMessageModal.jsx client/src/providers/AccountProvider.jsx
git commit -m "feat(messages): centred modal pop-up on arrival (FIFO queue)"
```

---

## Task 9: OS push notification when backgrounded + permission button

**Files:**
- Modify: `client/src/providers/AccountProvider.jsx`
- Modify: `client/src/components/NotificationBell.jsx`

- [ ] **Step 1: Dispatch OS notification when tab is hidden**

Modify `client/src/providers/AccountProvider.jsx`. Extend the same `onLive('message:new', ...)` listener you added in Task 5 / 8:

```js
    const offMessage = onLive('message:new', (record) => {
      setMessages((prev) => [record, ...prev.filter((m) => m.id !== record.id)].slice(0, 100));
      const hidden = typeof document === 'undefined' || document.visibilityState !== 'visible';
      if (!hidden) {
        setModalQueue((q) => q.some((m) => m.id === record.id) ? q : [...q, record]);
        return;
      }
      // Tab is hidden — try an OS notification. We never request permission
      // here (spec requires a user gesture); the bell popover's "Enable alerts"
      // button is the consent path.
      if (typeof window !== 'undefined'
          && 'Notification' in window
          && Notification.permission === 'granted') {
        try {
          const n = new Notification(record.title, {
            body: record.body,
            tag:  `admin-msg-${record.id}`,
            icon: '/icon-192.png',
          });
          n.onclick = () => { window.focus(); n.close(); };
        } catch { /* some browsers throw if not in a secure context */ }
      }
    });
```

(`/icon-192.png` already exists in `client/public/`; verify with `ls client/public/`. If a different filename ships, swap it here.)

- [ ] **Step 2: Add an "Enable alerts" button to the bell popover**

Modify `client/src/components/NotificationBell.jsx`. Just below the existing `<header>` block in the popover (right above the `<div style={{ overflowY: 'auto' }}>` that lists messages), add this conditional notice:

```jsx
          {typeof window !== 'undefined'
           && 'Notification' in window
           && Notification.permission === 'default' && (
            <div style={{ padding: '10px 14px', background: 'var(--surface)', borderBottom: '1px solid var(--surface-2)', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, color: 'var(--text-dim)' }}>Get a heads-up when you're on another tab.</span>
              <button
                type="button"
                onClick={() => Notification.requestPermission().catch(() => {})}
                style={{ background: 'var(--accent, #18f0a1)', color: '#0a0d14', border: 'none', borderRadius: 8, padding: '6px 10px', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}
              >
                Enable alerts
              </button>
            </div>
          )}
```

- [ ] **Step 3: Verify icon exists**

Run from repo root: `ls client/public/`
Expected: `icon-192.png` (or similar PWA icon) exists. If only a different size exists (e.g., `favicon.svg`), update the `icon:` field in Step 1 to that path.

- [ ] **Step 4: Manual smoke test**

1. Run `npm run dev`. Sign in as user. Open the bell, click "Enable alerts" → grant in the browser prompt.
2. Switch to a different tab. From admin, POST a DM. Within a second a native OS notification appears. Click it → the app tab refocuses.
3. Decline the prompt instead. Repeat: no OS notification, but the bell badge still grows. Modal pops on next tab focus from the queue path in Task 8 — verify the flow gracefully degrades.

- [ ] **Step 5: Commit**

```bash
git add client/src/providers/AccountProvider.jsx client/src/components/NotificationBell.jsx
git commit -m "feat(messages): OS push when tab is hidden + permission button"
```

---

## Task 10: Admin UI — "Message" button + send modal

**Files:**
- Modify: `client/src/pages/admin/Users.jsx`

- [ ] **Step 1: Add the API import**

Modify `client/src/pages/admin/Users.jsx`. Update the existing adminApi import block at the top (around `client/src/pages/admin/Users.jsx:13-19`):

```jsx
import {
  adminListUsers, adminGetUser, adminUserBets, adminUserTx, adminUserLogins,
  adminUserStatus, adminUserKyc, adminUserWallet, adminUserTags, adminUserNotes,
  adminUserReset, adminImpersonate, adminDeleteUser, adminBulkDeleteUsers,
  adminCreateUser, adminUserCredentials,
  adminUserStage, adminUserBlocked,
  adminSendUserMessage, adminListUserMessages, adminDeleteMessage,
} from '../../api/adminApi.js';
```

- [ ] **Step 2: Add state + handler to `UserDrawer`**

In `UserDrawer` (the function around `client/src/pages/admin/Users.jsx:464`), add a new state slice next to `walletOpen` (around `client/src/pages/admin/Users.jsx:469-470`):

```jsx
  const [messageOpen, setMessageOpen] = useState(false);
  const [drawerMessages, setDrawerMessages] = useState(null);
```

Add a loader for the user's DM history. Inside the existing `useEffect(() => { if (!open || !user) return; … })` block (around `client/src/pages/admin/Users.jsx:474-493`), append a fetch after `setLogins(l.events || []);`:

```jsx
        const m = await adminListUserMessages(user.id);
        setDrawerMessages(m.messages || []);
```

And reset on open by adding `setDrawerMessages(null);` next to the existing resets at the top of the same effect (`setCredentials(null); setOpenBet(null);`):

```jsx
    setDetail(null); setBets([]); setTx([]); setLogins([]); setCredentials(null); setOpenBet(null); setDrawerMessages(null);
```

Add a handler next to `adjustWallet` (around `client/src/pages/admin/Users.jsx:542-549`):

```jsx
  async function sendMessage(payload) {
    try {
      await adminSendUserMessage(user.id, payload);
      showToast('Message sent.');
      setMessageOpen(false);
      const m = await adminListUserMessages(user.id);
      setDrawerMessages(m.messages || []);
    } catch (e) { showToast(e.message || 'Could not send.', 'error'); }
  }

  async function deleteDrawerMessage(id) {
    if (!confirm('Delete this message? The user will no longer see it.')) return;
    try {
      await adminDeleteMessage(id);
      showToast('Message deleted.');
      setDrawerMessages((prev) => (prev || []).filter((m) => m.id !== id));
    } catch (e) { showToast(e.message || 'Could not delete.', 'error'); }
  }
```

- [ ] **Step 3: Add the button to the drawer footer**

In the same component, find the drawer footer (the `footer={hasRole('moderator') ? ( …` block around `client/src/pages/admin/Users.jsx:586-608`). Add a new button right before "Reset password":

```jsx
          {hasRole('moderator', 'support') && (
            <button className="adm-btn" onClick={() => setMessageOpen(true)}>
              <IconKey size={14} /> Message
            </button>
          )}
```

Replace `<IconKey size={14} />` with a bell or chat icon if one exists; if not, leave `IconKey` for now — the cosmetics are a follow-up.

- [ ] **Step 4: Render the send modal**

Near the bottom of the `UserDrawer` JSX (around `client/src/pages/admin/Users.jsx:705-707`), beside `<WalletModal …/>`, add:

```jsx
      <SendMessageModal
        open={messageOpen}
        onClose={() => setMessageOpen(false)}
        user={detail || user}
        onSubmit={sendMessage}
      />
```

- [ ] **Step 5: Define `SendMessageModal`**

Below the existing `WalletModal` function in the same file (around `client/src/pages/admin/Users.jsx:1047`), add:

```jsx
function SendMessageModal({ open, onClose, user, onSubmit }) {
  const [form, setForm] = useState({ title: '', body: '', severity: 'info' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setForm({ title: '', body: '', severity: 'info' });
  }, [open]);

  async function submit(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) return;
    setBusy(true);
    try { await onSubmit({ title: form.title.trim(), body: form.body.trim(), severity: form.severity }); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose}
           title="Send message"
           description={user ? `Private message to ${user.email}. They see a pop-up in-app and an OS alert if their tab is hidden.` : ''}
           footer={null}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="adm-field">
          <label>Title</label>
          <input className="adm-input" value={form.title} required maxLength={80} autoFocus
                 onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                 placeholder="e.g. We've credited a bonus to your wallet" />
        </div>
        <div className="adm-field">
          <label>Body</label>
          <textarea className="adm-input" rows={4} value={form.body} required maxLength={500}
                    onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                    placeholder="Plain text. They'll see this in full." />
        </div>
        <div className="adm-field">
          <label>Severity</label>
          <select className="adm-select" value={form.severity}
                  onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}>
            <option value="info">Info</option>
            <option value="success">Success</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical (no auto-dismiss)</option>
          </select>
        </div>
        <div className="adm-modal-actions">
          <button type="button" className="adm-btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="adm-btn primary" disabled={busy || !form.title.trim() || !form.body.trim()}>
            {busy ? 'Sending…' : 'Send message'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 6: Manual smoke test**

Run `npm run dev`. Admin → Users → click a user → drawer opens → click "Message". Modal appears. Fill title + body, pick severity, send. Should toast "Message sent." On the user's session (another tab/window), the modal pops up.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/admin/Users.jsx
git commit -m "feat(messages): admin send-message button + modal in user drawer"
```

---

## Task 11: Admin UI — "Messages" tab in user drawer

**Files:**
- Modify: `client/src/pages/admin/Users.jsx`

- [ ] **Step 1: Add the tab to the tab strip**

In `client/src/pages/admin/Users.jsx`, find the drawer tab strip (around `client/src/pages/admin/Users.jsx:610-616`):

```jsx
      <div className="adm-drawer-tabs" style={{ marginLeft: -22, marginRight: -22, padding: '0 22px' }}>
        {['profile', 'bets', 'transactions', 'activity'].map((t) => (
          <button key={t} className={`adm-drawer-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'profile' ? 'Profile' : t === 'bets' ? `Bets (${bets.length})` : t === 'transactions' ? `Tx (${tx.length})` : `Activity (${logins.length})`}
          </button>
        ))}
      </div>
```

Replace the array and label expression with one that includes `messages`:

```jsx
      <div className="adm-drawer-tabs" style={{ marginLeft: -22, marginRight: -22, padding: '0 22px' }}>
        {['profile', 'bets', 'transactions', 'activity', 'messages'].map((t) => (
          <button key={t} className={`adm-drawer-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'profile' ? 'Profile'
             : t === 'bets' ? `Bets (${bets.length})`
             : t === 'transactions' ? `Tx (${tx.length})`
             : t === 'activity' ? `Activity (${logins.length})`
             : `Messages (${drawerMessages?.length ?? 0})`}
          </button>
        ))}
      </div>
```

- [ ] **Step 2: Render the messages list**

After the existing `{tab === 'activity' && ( … )}` block (which ends around `client/src/pages/admin/Users.jsx:703`), add a new block:

```jsx
      {tab === 'messages' && (
        !drawerMessages ? <Empty title="Loading…" /> :
        drawerMessages.length === 0 ? <Empty title="No messages yet" subtitle="Use the Message button to send one." /> : (
          <table className="adm-table">
            <thead><tr><th>When</th><th>Severity</th><th>Title</th><th>Body</th><th>Read</th><th></th></tr></thead>
            <tbody>
              {drawerMessages.map((m) => (
                <tr key={m.id}>
                  <td title={dateShort(m.createdAt)}>{ago(m.createdAt)}</td>
                  <td>
                    <Badge tone={m.severity === 'critical' ? 'danger'
                                  : m.severity === 'warning' ? 'warn'
                                  : m.severity === 'success' ? 'success' : 'info'}>
                      {m.severity}
                    </Badge>
                  </td>
                  <td style={{ fontWeight: 700, maxWidth: 200 }}>{m.title}</td>
                  <td style={{ maxWidth: 280, color: 'var(--text-dim)', fontSize: 12 }}>{m.body}</td>
                  <td>{m.readAt ? <Badge tone="success" dot>Read · {ago(m.readAt)}</Badge> : <Badge tone="warn">Unread</Badge>}</td>
                  <td className="row-actions">
                    {hasRole('moderator') && (
                      <button className="adm-btn sm danger" onClick={() => deleteDrawerMessage(m.id)}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
```

- [ ] **Step 3: Manual smoke test**

1. Open a user in the admin drawer.
2. Send 2 messages via the Task 10 button.
3. Click the new "Messages (2)" tab. Both messages appear with severity badges and "Unread" labels.
4. On the user's session, click one of the messages in the bell → it marks read.
5. Refresh the admin drawer (close + reopen) → that row should now show "Read · just now".
6. If you're a moderator+, click Delete on one → it disappears from the list. The user's inbox no longer has it (verify by checking the bell on the user's session).

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/admin/Users.jsx
git commit -m "feat(messages): per-user Messages tab in admin drawer"
```

---

## Final verification

After all tasks land:

- [ ] **Run the full server test suite**

```bash
node --test server/test/*.test.js
```

Expected: all tests pass, including the existing cashout/liveLoop tests.

- [ ] **Run a client production build**

```bash
npm run build
```

Expected: build succeeds with no errors. Warnings about chunk size are fine.

- [ ] **Walk through the end-to-end demo**

1. Two browsers (or one window + one incognito). Sign in as a user in window A; as an admin in window B.
2. From B, send a DM to the user with severity "success".
3. Window A: a centred green-bordered modal appears with title, body, OK button. Bell shows "1". Toast in the corner (existing path) also fires.
4. Click OK → modal closes, bell badge clears.
5. Switch window A to a different tab. From B, send another DM (severity "critical").
6. OS notification appears at the corner of your screen. Click it → window A's tab refocuses, the modal pops up automatically.
7. Stop the server. Click around window A — you stay signed in.
8. Restart the server, wait 20 seconds, refresh window A — still signed in, bell still shows 1 unread.
9. From B, navigate to Users → click the player → "Messages (2)" tab shows both. Delete one.
10. Window A: refresh — only the remaining message is in the bell.

/**
 * Per-user "hidden from my history" set, backed by localStorage.
 *
 * Deleting a ticket only removes it from this user's own bet history view —
 * the underlying bet record is untouched on the server, so admins/accounting
 * still see it. This is purely a client-side visibility filter.
 */

const MAX_HIDDEN_PER_USER = 500;

const ls = typeof localStorage !== 'undefined' ? localStorage : null;
const keyFor = (userId) => `bv_hidden_tickets:${String(userId || '').toLowerCase()}`;

export function readHiddenTicketIds(userId) {
  if (!ls || !userId) return new Set();
  try {
    const raw = ls.getItem(keyFor(userId));
    if (!raw) return new Set();
    const list = JSON.parse(raw);
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

export function hideTicket(userId, betId) {
  if (!ls || !userId || !betId) return new Set();
  const ids = readHiddenTicketIds(userId);
  ids.add(betId);
  const trimmed = [...ids].slice(-MAX_HIDDEN_PER_USER);
  try {
    ls.setItem(keyFor(userId), JSON.stringify(trimmed));
  } catch {
    /* quota — silently drop */
  }
  return new Set(trimmed);
}

/**
 * Per-user transaction cache backed by localStorage.
 *
 * Acts as a defensive second tier behind the server's txStore: if the
 * backend's ephemeral disk loses state (e.g. a free-tier container
 * restarts and DATABASE_URL is not configured), the wallet and
 * withdraw pages can still surface the user's recent deposit/withdraw
 * history that the client saw at write-time.
 *
 * Scope: keyed by the authenticated user's id (email or phone-as-id).
 * Only stores fields that are already public to the client — never
 * passwords, tokens, or admin metadata.
 */

const MAX_TX_PER_USER = 50;

const ls = typeof localStorage !== 'undefined' ? localStorage : null;
const keyFor = (userId) => `bv_tx_cache:${String(userId || '').toLowerCase()}`;

export function readTxCache(userId) {
  if (!ls || !userId) return [];
  try {
    const raw = ls.getItem(keyFor(userId));
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function clearTxCache(userId) {
  if (!ls || !userId) return;
  try { ls.removeItem(keyFor(userId)); } catch { /* ignore */ }
}

export function writeTxCache(userId, txs) {
  if (!ls || !userId || !Array.isArray(txs)) return;
  try {
    const trimmed = txs.slice(0, MAX_TX_PER_USER);
    ls.setItem(keyFor(userId), JSON.stringify(trimmed));
  } catch {
    /* quota or serialization failure — silently drop */
  }
}

export function appendTxCache(userId, tx) {
  if (!ls || !userId || !tx) return;
  const list = readTxCache(userId);
  // De-dupe by id so a repeated write doesn't bloat the cache.
  const next = [tx, ...list.filter((t) => t.id !== tx.id)].slice(0, MAX_TX_PER_USER);
  writeTxCache(userId, next);
}

/**
 * Merge server list with cache: server entries win on id collision,
 * cache fills in anything the server has forgotten. Sorted by `at`
 * descending so the most recent transaction appears first.
 */
export function mergeTxLists(serverList, cacheList) {
  const byId = new Map();
  for (const t of cacheList || []) if (t && t.id) byId.set(t.id, t);
  for (const t of serverList || []) if (t && t.id) byId.set(t.id, t);
  const merged = [...byId.values()];
  merged.sort((a, b) => {
    const ta = new Date(a.at || a.createdAt || 0).getTime();
    const tb = new Date(b.at || b.createdAt || 0).getTime();
    return tb - ta;
  });
  return merged.slice(0, MAX_TX_PER_USER);
}

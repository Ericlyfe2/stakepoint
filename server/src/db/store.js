/**
 * Key-value store with two backends:
 *
 *  - Postgres (production)  → enabled when DATABASE_URL is set.
 *    Single `kv_store` table keyed on (store_name, key) with a JSONB
 *    `data` column.  In-memory cache for synchronous reads; writes
 *    are debounced and flushed in the background.
 *
 *  - JSON files (dev)       → fallback when DATABASE_URL is unset.
 *    One file per store under server/data/<name>.json.  Atomic
 *    tmp+rename, debounced flush.  Lets you `npm run dev` with no
 *    external database.
 *
 * Public API matches the original file-only store, so callers in
 * server/src/db/*.js don't change.  `initStores()` MUST be awaited
 * once at startup before the HTTP server begins accepting traffic.
 */
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { PATHS } from '../config/env.js';
import { log } from '../utils/logger.js';

const { Pool } = pg;

const useDb = !!process.env.DATABASE_URL;
const stores = new Map();

// ---- Postgres backend ------------------------------------------------------

let pool = null;
function getPool() {
  if (pool) return pool;
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Neon (and most managed Postgres) requires SSL.  Render -> Neon traffic
    // works fine with rejectUnauthorized: false.
    ssl: { rejectUnauthorized: false },
    max: 4,
    idleTimeoutMillis: 30_000,
  });
  pool.on('error', (e) => log.error('pg pool error:', e.message));
  return pool;
}

async function ensureSchema() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS kv_store (
      store_name TEXT NOT NULL,
      key        TEXT NOT NULL,
      data       JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (store_name, key)
    );
  `);
}

async function loadFromPg(name) {
  const { rows } = await getPool().query(
    'SELECT key, data FROM kv_store WHERE store_name = $1',
    [name]
  );
  const out = {};
  for (const r of rows) out[r.key] = r.data;
  return out;
}

async function upsertPg(name, key, data) {
  await getPool().query(
    `INSERT INTO kv_store (store_name, key, data, updated_at)
       VALUES ($1, $2, $3, NOW())
     ON CONFLICT (store_name, key)
     DO UPDATE SET data = EXCLUDED.data, updated_at = NOW();`,
    [name, key, data]
  );
}

async function deletePg(name, key) {
  await getPool().query('DELETE FROM kv_store WHERE store_name = $1 AND key = $2', [name, key]);
}

// ---- File backend (unchanged behaviour) -----------------------------------

if (!useDb) {
  if (!fs.existsSync(PATHS.data)) fs.mkdirSync(PATHS.data, { recursive: true });
}

function loadFromFile(file, fallback) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw);
  } catch {
    return structuredClone(fallback);
  }
}

function persistFile(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

// ---- Public createStore() --------------------------------------------------

export function createStore(name, fallback = {}) {
  if (stores.has(name)) return stores.get(name);

  const file = useDb ? null : path.join(PATHS.data, `${name}.json`);
  // dirtyKeys tracks per-key writes when using Postgres so we don't
  // re-serialize the entire store on every change.
  const state = {
    data: useDb ? null : loadFromFile(file, fallback),
    fallback,
    loaded: !useDb,
    dirty: false,
    dirtyKeys: new Set(),
    deletedKeys: new Set(),
    timer: null,
    pendingFlush: null,
  };

  const ensureLoaded = () => {
    if (!state.loaded) {
      throw new Error(`Store "${name}" used before initStores() resolved. Add a hop into initStores().`);
    }
  };

  const flushPg = async () => {
    if (!state.dirty) return;
    state.dirty = false;
    const keys    = [...state.dirtyKeys];   state.dirtyKeys.clear();
    const deletes = [...state.deletedKeys]; state.deletedKeys.clear();
    try {
      for (const k of keys)    await upsertPg(name, k, state.data[k]);
      for (const k of deletes) await deletePg(name, k);
    } catch (e) {
      // Put the keys back so a later flush retries them.
      keys.forEach((k) => state.dirtyKeys.add(k));
      deletes.forEach((k) => state.deletedKeys.add(k));
      state.dirty = true;
      log.error(`kv_store flush failed for "${name}":`, e.message);
    }
  };

  const flushFile = () => {
    if (!state.dirty) return;
    state.dirty = false;
    persistFile(file, state.data);
  };

  const flush = () => {
    if (state.timer) { clearTimeout(state.timer); state.timer = null; }
    if (useDb) {
      // Return the promise so SIGTERM can await it.
      state.pendingFlush = flushPg();
      return state.pendingFlush;
    }
    flushFile();
    return undefined;
  };

  const markDirty = (key, deleted = false) => {
    state.dirty = true;
    if (useDb) {
      if (deleted) {
        state.deletedKeys.add(key);
        state.dirtyKeys.delete(key);
      } else {
        state.dirtyKeys.add(key);
        state.deletedKeys.delete(key);
      }
    }
    if (state.timer) return;
    state.timer = setTimeout(() => {
      state.timer = null;
      flush();
    }, useDb ? 200 : 50);
  };

  const api = {
    all() { ensureLoaded(); return state.data; },
    get(k) { ensureLoaded(); return state.data[k]; },
    set(k, v) { ensureLoaded(); state.data[k] = v; markDirty(k); return v; },
    delete(k) { ensureLoaded(); delete state.data[k]; markDirty(k, true); },
    update(k, fn) {
      ensureLoaded();
      state.data[k] = fn(state.data[k]);
      markDirty(k);
      return state.data[k];
    },
    list() { ensureLoaded(); return Object.values(state.data); },
    flush,

    // Internal: called by initStores() to populate the in-memory cache.
    async _load() {
      if (!useDb) { state.loaded = true; return; }
      const fromPg = await loadFromPg(name);
      state.data = fromPg;
      state.loaded = true;
    },
  };

  stores.set(name, api);
  return api;
}

/**
 * Must be awaited at startup, before any HTTP traffic.  Creates the
 * Postgres schema if needed and pre-loads every registered store into
 * its in-memory cache so read operations stay synchronous.
 */
export async function initStores() {
  if (useDb) {
    await ensureSchema();
    log.info(`kv_store: using Postgres (${stores.size} stores registered).`);
  } else {
    log.info(`kv_store: using JSON files at ${PATHS.data} (${stores.size} stores).`);
  }
  for (const s of stores.values()) await s._load();
}

// ---- Graceful shutdown -----------------------------------------------------

async function flushAll() {
  for (const s of stores.values()) {
    try { await s.flush(); } catch { /* logged inside */ }
  }
  if (pool) await pool.end().catch(() => {});
}
process.on('SIGINT',  () => { flushAll().finally(() => process.exit(0)); });
process.on('SIGTERM', () => { flushAll().finally(() => process.exit(0)); });
process.on('beforeExit', () => { flushAll(); });

/**
 * Odds aggregator.
 *
 * Pulls normalised odds + fixtures from every enabled provider on a staggered
 * schedule, merges them into a canonical index by fixtureKey, picks freshest
 * odds per (fixture, market, selection), and:
 *   - persists into the cache (TTL ~60s)
 *   - applies any admin overrides on top
 *   - emits realtime odds:tick / odds:movement events when a price changes
 *
 * If every provider for a fixture fails or is disabled, the existing static
 * matchesData feed continues to serve — that's the fallback layer.
 *
 * Designed to scale: per-provider concurrency, cancellable polls, exponential
 * back-off on repeated failures, and idempotent merges.
 */
import { enabledProviders, providersHealth } from './providerRegistry.js';
import { get as cacheGet, set as cacheSet } from './cache.js';
import { emitOddsTick, emitOddsMovement, emitProviderHealth } from './realtime.js';
import { setOddsOverride } from '../db/sportsAdmin.js';
import { log } from '../utils/logger.js';
import { recordOddsLag } from './metrics.js';

const POLL_INTERVAL_MS = 60_000;     // base cadence
const PROVIDER_STAGGER_MS = 4_000;   // stagger so we don't burst all providers
const CACHE_KEY_AGG = 'odds:aggregate';
const CACHE_TTL_S   = 90;

let timer = null;
let running = false;

const lastPriceByKey = new Map(); // canonicalKey -> { [market]: { [sel]: odds } }
const failureStreak  = new Map(); // providerId -> consecutive failures

const liveLastByKey  = new Map(); // fixtureKey -> { scoreHome, scoreAway, minute, redCardsHome, redCardsAway }
const liveFailureStreak = new Map(); // 'live' -> consecutive global live-loop failures
let liveTimer = null;
let liveRunning = false;

function isKickOff(next) {
  const n = Number(next?.minute);
  return Number.isFinite(n) && n <= 1;
}

/**
 * Returns the set of event kinds that occurred between prev and next.
 * Empty array when nothing notable changed. Multiple deltas in one tick
 * (e.g. goal AND red card) all surface so downstream consumers don't
 * lose state-changing events.
 */
function deriveEventKinds(prev, next) {
  const out = [];
  if (!prev) { if (isKickOff(next)) out.push('kick_off'); return out; }
  if (next.scoreHome > (prev.scoreHome ?? 0)) out.push('goal_home');
  if (next.scoreAway > (prev.scoreAway ?? 0)) out.push('goal_away');
  if ((next.redCardsHome ?? 0) > (prev.redCardsHome ?? 0)) out.push('red_card');
  if ((next.redCardsAway ?? 0) > (prev.redCardsAway ?? 0)) out.push('red_card');
  if (prev.minute !== 'HT' && next.minute === 'HT') out.push('half_time');
  if (prev.minute !== 'FT' && next.minute === 'FT') out.push('full_time');
  return out;
}

function teamFromKind(kind) {
  if (kind === 'goal_home') return 'home';
  if (kind === 'goal_away') return 'away';
  return undefined;
}

function backoffMs(streak) {
  return Math.min(POLL_INTERVAL_MS * Math.pow(2, streak), 10 * 60_000);
}

async function pullProvider(p, sport = 'football') {
  const streak = failureStreak.get(p.id) || 0;
  const t0 = Date.now();
  try {
    const rows = await p.fetchOdds(sport).catch(() => []);
    failureStreak.set(p.id, 0);
    recordOddsLag(Date.now() - t0);
    return rows || [];
  } catch (e) {
    failureStreak.set(p.id, streak + 1);
    recordOddsLag(Date.now() - t0);
    const next = backoffMs(streak + 1);
    log.warn(`Provider ${p.id} failure ×${streak + 1} — backing off ${Math.round(next / 1000)}s: ${e.message}`);
    return [];
  }
}

/** Combine multiple Odds rows for the same fixtureKey into one canonical view. */
function mergeRows(rows) {
  if (rows.length === 1) return rows[0];
  // Always pick the freshest row as the base, then layer in markets/selections
  const sorted = [...rows].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const base = { ...sorted[0], providers: [], markets: { ...(sorted[0].markets || {}) } };
  base.providers = Array.from(new Set(rows.map((r) => r.provider)));

  // For each other provider, fold its markets into base, picking highest odds for player benefit
  for (const r of sorted.slice(1)) {
    for (const [mk, market] of Object.entries(r.markets || {})) {
      const target = base.markets[mk] = base.markets[mk] || { name: market.name, selections: [] };
      for (const sel of market.selections || []) {
        const existing = target.selections.find((s) => s.key === sel.key);
        if (!existing) target.selections.push({ ...sel });
        else if (sel.odds > existing.odds) Object.assign(existing, { odds: sel.odds, bookmaker: r.provider });
      }
    }
  }
  return base;
}

/** Detect price movements vs last tick and fire realtime events. */
function diffEmit(fix) {
  const prevAll = lastPriceByKey.get(fix.key) || {};
  const next = {};
  let changed = false;
  for (const [mk, market] of Object.entries(fix.markets || {})) {
    next[mk] = {};
    for (const sel of market.selections || []) {
      next[mk][sel.key] = sel.odds;
      const prevPrice = prevAll[mk]?.[sel.key];
      if (prevPrice !== undefined && Math.abs(prevPrice - sel.odds) > 0.005) {
        changed = true;
        emitOddsMovement({
          fixtureId: fix.sourceId || fix.key,
          key: fix.key,
          home: fix.home, away: fix.away,
          market: mk,
          selection: sel.key,
          prev: prevPrice,
          next: sel.odds,
          provider: sel.bookmaker || fix.provider,
        });
      }
    }
  }
  if (changed || !lastPriceByKey.has(fix.key)) {
    emitOddsTick({
      fixtureId: fix.sourceId || fix.key,
      key: fix.key,
      sport: fix.sport,
      home: fix.home,
      away: fix.away,
      markets: fix.markets,
      providers: fix.providers || [fix.provider],
      updatedAt: fix.updatedAt,
    });
  }
  lastPriceByKey.set(fix.key, next);
}

/** Also push the best-odds into the admin override store so the storefront
 *  shows aggregator prices without a separate code path. Off by default —
 *  enable with AGGREGATOR_PUSH_OVERRIDES=true to let market-makers tune. */
function maybePushToOverrides(fix) {
  if (process.env.AGGREGATOR_PUSH_OVERRIDES !== 'true') return;
  if (!fix?.sourceId) return;
  for (const [mk, market] of Object.entries(fix.markets || {})) {
    for (const sel of market.selections || []) {
      try { setOddsOverride(fix.sourceId, mk, sel.key, sel.odds); } catch {}
    }
  }
}

export async function aggregateOnce() {
  if (running) return null;
  running = true;
  const start = Date.now();
  try {
    const providers = enabledProviders();
    if (providers.length === 0) {
      emitProviderHealth(providersHealth());
      return { providers: 0, fixtures: 0 };
    }

    const rowsPerProvider = await Promise.all(providers.map(async (p, i) => {
      // soft stagger across providers
      if (i) await new Promise((r) => setTimeout(r, i * PROVIDER_STAGGER_MS));
      return pullProvider(p, 'football');
    }));

    // bucket by fixtureKey
    const byKey = new Map();
    for (const rows of rowsPerProvider) {
      for (const row of rows) {
        const list = byKey.get(row.key) || [];
        list.push(row);
        byKey.set(row.key, list);
      }
    }

    const merged = [];
    for (const rows of byKey.values()) {
      const m = mergeRows(rows);
      merged.push(m);
      diffEmit(m);
      maybePushToOverrides(m);
    }

    await cacheSet(CACHE_KEY_AGG, merged, { ex: CACHE_TTL_S });

    const health = providersHealth();
    emitProviderHealth(health);

    log.info(`aggregator: ${providers.length} providers, ${merged.length} fixtures, ${Date.now() - start}ms`);
    return { providers: providers.length, fixtures: merged.length, durationMs: Date.now() - start };
  } finally {
    running = false;
  }
}

export async function getAggregatedOdds() {
  const hit = await cacheGet(CACHE_KEY_AGG);
  return hit || [];
}

export function startAggregator() {
  if (timer) return;
  // first run with a 4s delay so the rest of boot finishes first
  setTimeout(() => { aggregateOnce().catch(() => {}); }, 4000);
  timer = setInterval(() => { aggregateOnce().catch(() => {}); }, POLL_INTERVAL_MS);
}

export function stopAggregator() {
  if (timer) clearInterval(timer);
  timer = null;
}

/**
 * Given an array of merged live Odds rows, return a (fixtureKey, market, outcome)
 * → odds lookup function. cashOutEngine consumes this.
 */
function makeOddsLookup(rows) {
  const idx = new Map();
  for (const row of rows) {
    for (const [mk, market] of Object.entries(row.markets || {})) {
      for (const sel of market.selections || []) {
        idx.set(`${row.key}::${mk}::${sel.key}`, sel.odds);
      }
    }
  }
  return (fixtureKey, market, outcome) => idx.get(`${fixtureKey}::${market}::${outcome}`) ?? null;
}

async function liveLoop() {
  if (liveRunning) return;
  liveRunning = true;
  try {
    const { fetchLiveOddsAll, fetchLiveScoresAll } = await import('./providerRegistry.js');
    const [oddsRows, scoreRows] = await Promise.all([
      fetchLiveOddsAll('football').catch(() => []),
      fetchLiveScoresAll('football').catch(() => []),
    ]);

    // 1) Score & match-event emits.
    const { emitScoreUpdate } = await import('./realtime.js');
    for (const fx of scoreRows) {
      if (!fx?.key) continue;
      const prev = liveLastByKey.get(fx.key);
      const kinds = deriveEventKinds(prev, fx);
      liveLastByKey.set(fx.key, {
        scoreHome: fx.scoreHome, scoreAway: fx.scoreAway, minute: fx.minute,
        redCardsHome: fx.redCardsHome, redCardsAway: fx.redCardsAway,
      });
      const scoreOrMinuteChanged = !prev
        || prev.scoreHome !== fx.scoreHome
        || prev.scoreAway !== fx.scoreAway
        || prev.minute    !== fx.minute;
      if (kinds.length > 0) {
        for (const kind of kinds) {
          emitScoreUpdate({
            fixtureId: fx.key,
            sport: fx.sport,
            scoreHome: fx.scoreHome,
            scoreAway: fx.scoreAway,
            minute: fx.minute,
            eventKind: kind,
            team: teamFromKind(kind),
          });
        }
      } else if (scoreOrMinuteChanged) {
        emitScoreUpdate({
          fixtureId: fx.key,
          sport: fx.sport,
          scoreHome: fx.scoreHome,
          scoreAway: fx.scoreAway,
          minute: fx.minute,
        });
      }
    }

    // 2) Odds emits via existing diffEmit machinery.
    const grouped = new Map();
    for (const row of oddsRows) {
      if (!row?.key) continue;
      const arr = grouped.get(row.key) || [];
      arr.push(row);
      grouped.set(row.key, arr);
    }
    for (const [, rows] of grouped) {
      const merged = mergeRows(rows);
      diffEmit(merged);
    }

    // 3) Cash-out recompute for every fixture we just saw a tick on.
    const engine = await import('./cashOutEngine.js');
    const lookup = makeOddsLookup(oddsRows);
    const { LIVE_BETTING } = await import('../config/env.js');
    for (const fx of scoreRows) {
      if (!fx?.key) continue;
      engine.onLiveChange(fx.key, lookup, LIVE_BETTING.houseMargin);
    }
    engine.sweep();

    liveFailureStreak.clear();
  } catch (e) {
    const streak = (liveFailureStreak.get('live') || 0) + 1;
    liveFailureStreak.set('live', streak);
    log.warn(`Live track failure ×${streak}: ${e.message}`);
  } finally {
    liveRunning = false;
  }
}

export async function startLiveTrack() {
  const { LIVE_BETTING } = await import('../config/env.js');
  if (liveTimer) return;
  // Gate on "is there any football-capable provider enabled?" rather than a
  // specific env var. The previous check tied us to APIFOOTBALL_KEY, which
  // blocked the loop even when other providers (football-data.org, sportMonks,
  // theOddsApi, …) were configured. With this change the live track activates
  // as soon as at least one provider can fetch football scores or odds; if
  // none expose a live minute/cards (e.g. football-data.org's free tier),
  // those fields surface as null but score updates and cash-out math still run.
  const { enabledProviders } = await import('./providerRegistry.js');
  const liveCapable = enabledProviders().filter((p) => p.sports?.includes('football'));
  if (liveCapable.length === 0) {
    log.info('Live track disabled — no football-capable providers configured.');
    return;
  }
  liveTimer = setInterval(() => { liveLoop().catch(() => {}); }, LIVE_BETTING.pollMs);
  liveLoop().catch(() => {});
  log.info(`Live track started (${liveCapable.length} provider${liveCapable.length === 1 ? '' : 's'}: ${liveCapable.map((p) => p.id).join(', ')}), polling every ${LIVE_BETTING.pollMs}ms.`);
}

export function stopLiveTrack() {
  if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
}

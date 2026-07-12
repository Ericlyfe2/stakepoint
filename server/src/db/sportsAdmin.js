/**
 * Admin overrides for the sportsbook.
 * Sits on top of matchesData (which is the canonical fixture source) so we
 * never have to mutate the upstream feed. Each override is keyed by matchId.
 *
 *   overrides   : { [matchId]: { ...patch } }           // per-fixture tweaks
 *   oddsOverrides: { [matchId]: { [market]: { [key]: number } } } // odds tweaks
 *   suspensions : { [matchId]: { all?: true, markets?: string[], selections?: string[] } }
 *   results     : { [matchId]: { scoreHome, scoreAway, finishedAt, source } }
 *   custom      : { [matchId]: fullFixtureObject }      // admin-created fixtures
 */
import { createStore } from './store.js';
import { lookupSelection, getMatchById, SPORTS } from '../matchesData.js';

const store = createStore('sports_admin', {
  overrides: {},
  oddsOverrides: {},
  suspensions: {},
  results: {},
  custom: {},
  customLeagues: {},
});

export function readSportsAdmin() {
  return {
    overrides: store.get('overrides') || {},
    oddsOverrides: store.get('oddsOverrides') || {},
    suspensions: store.get('suspensions') || {},
    results: store.get('results') || {},
    custom: store.get('custom') || {},
    customLeagues: store.get('customLeagues') || {},
  };
}

/** Apply all admin overrides to the live fixture data. Returns a deep-merged view. */
export function compiledLeagues() {
  const { overrides, oddsOverrides, suspensions, results, custom, customLeagues } = readSportsAdmin();
  const sports = SPORTS.map((sp) => {
    const liveLeagues = (sp.leagues || []).map((lg) => ({
      ...lg,
      matches: (lg.matches || [])
        .map((m) => applyOverride(m, overrides[m.id], oddsOverrides[m.id], suspensions[m.id], results[m.id]))
        .filter(Boolean),
    }));
    const extraLeagues = Object.values(customLeagues || {}).filter((cl) => cl.sport === sp.id);
    // attach any custom fixtures created on existing leagues
    for (const fx of Object.values(custom || {})) {
      if (fx.sport !== sp.id) continue;
      const leagueId = fx.leagueId || 'admin-misc';
      let target = liveLeagues.find((lg) => lg.id === leagueId) ||
                   extraLeagues.find((lg) => lg.id === leagueId);
      if (!target) {
        target = { id: leagueId, name: 'Admin fixtures', region: 'admin', crest: { style: 'background:linear-gradient(135deg,#7c5cff,#22d3ee);color:#fff', label: 'ADM' }, matches: [], sport: sp.id, admin: true };
        extraLeagues.push(target);
      }
      const view = applyOverride(fx, overrides[fx.id], oddsOverrides[fx.id], suspensions[fx.id], results[fx.id]);
      if (!view) continue;
      target.matches = [...(target.matches || []), view];
    }
    return { ...sp, leagues: [...liveLeagues, ...extraLeagues] };
  });
  return sports;
}

function applyOverride(match, patch, oddsPatch, suspendPatch, result) {
  if (!match) return null;
  let next = { ...match };
  if (patch) next = { ...next, ...patch };
  if (result) {
    next = {
      ...next,
      scoreHome: result.scoreHome,
      scoreAway: result.scoreAway,
      isLive: false,
      finished: true,
      finishedAt: result.finishedAt,
      finalSource: result.source,
    };
  }
  if (oddsPatch || suspendPatch) {
    next = { ...next, markets: { ...(next.markets || {}) } };
    for (const [mKey, market] of Object.entries(next.markets)) {
      let nextMarket = market;
      if (oddsPatch?.[mKey]) {
        nextMarket = {
          ...market,
          selections: (market.selections || []).map((sel) =>
            oddsPatch[mKey][sel.key] !== undefined ? { ...sel, odds: Number(oddsPatch[mKey][sel.key]) } : sel
          ),
        };
      }
      if (suspendPatch?.all || suspendPatch?.markets?.includes(mKey)) {
        nextMarket = { ...nextMarket, suspended: true };
      }
      if (suspendPatch?.all || suspendPatch?.selections?.length) {
        nextMarket = {
          ...nextMarket,
          selections: (nextMarket.selections || []).map((sel) =>
            suspendPatch.all || suspendPatch.selections.includes(`${mKey}:${sel.key}`) ? { ...sel, suspended: true } : sel
          ),
        };
      }
      next.markets[mKey] = nextMarket;
    }
    if (suspendPatch?.all) next.suspended = true;
  }
  return next;
}

/** Atomic updaters. */
export function patchOverride(matchId, patch) {
  const cur = store.get('overrides') || {};
  store.set('overrides', { ...cur, [matchId]: { ...(cur[matchId] || {}), ...patch } });
}
export function setOddsOverride(matchId, market, key, value) {
  const cur = store.get('oddsOverrides') || {};
  const next = { ...(cur[matchId] || {}) };
  next[market] = { ...(next[market] || {}), [key]: Number(value) };
  store.set('oddsOverrides', { ...cur, [matchId]: next });
}
export function clearOddsOverride(matchId) {
  const cur = store.get('oddsOverrides') || {};
  if (cur[matchId]) {
    const { [matchId]: _, ...rest } = cur;
    store.set('oddsOverrides', rest);
  }
}
export function setSuspension(matchId, patch) {
  const cur = store.get('suspensions') || {};
  store.set('suspensions', { ...cur, [matchId]: { ...(cur[matchId] || {}), ...patch } });
}
export function clearSuspension(matchId) {
  const cur = store.get('suspensions') || {};
  const { [matchId]: _, ...rest } = cur;
  store.set('suspensions', rest);
}
export function setResult(matchId, scoreHome, scoreAway, source = 'manual') {
  const cur = store.get('results') || {};
  store.set('results', { ...cur, [matchId]: { scoreHome, scoreAway, source, finishedAt: new Date().toISOString() } });
}
export function getResult(matchId) {
  return (store.get('results') || {})[matchId] || null;
}
export function addCustomFixture(fx) {
  const cur = store.get('custom') || {};
  store.set('custom', { ...cur, [fx.id]: fx });
}

/** Add a new market (with selections) to a custom fixture. */
export function addMarketToFixture(matchId, marketKey, marketDef) {
  const cur = store.get('custom') || {};
  const fx = cur[matchId];
  if (!fx) return null;
  const markets = { ...(fx.markets || {}) };
  if (markets[marketKey]) return null; // already exists
  markets[marketKey] = {
    name: marketDef.name || marketKey,
    selections: (marketDef.selections || []).map((s) => ({
      key: s.key, label: s.label || s.key, odds: Number(s.odds),
    })),
  };
  store.set('custom', { ...cur, [matchId]: { ...fx, markets, moreMarkets: Object.keys(markets).length } });
  return markets[marketKey];
}

/** Remove a market from a custom fixture. */
export function removeMarketFromFixture(matchId, marketKey) {
  const cur = store.get('custom') || {};
  const fx = cur[matchId];
  if (!fx || !fx.markets?.[marketKey]) return false;
  const markets = { ...fx.markets };
  delete markets[marketKey];
  store.set('custom', { ...cur, [matchId]: { ...fx, markets, moreMarkets: Object.keys(markets).length } });
  return true;
}
export function deleteCustomFixture(id) {
  const cur = store.get('custom') || {};
  if (cur[id]) {
    const { [id]: _, ...rest } = cur;
    store.set('custom', rest);
  }
}
export function addCustomLeague(lg) {
  const cur = store.get('customLeagues') || {};
  store.set('customLeagues', { ...cur, [lg.id]: lg });
}
export function updateCustomLeague(id, patch) {
  const cur = store.get('customLeagues') || {};
  const existing = cur[id];
  if (!existing) return null;
  store.set('customLeagues', { ...cur, [id]: { ...existing, ...patch } });
  return { ...existing, ...patch };
}
export function deleteCustomLeague(id) {
  const cur = store.get('customLeagues') || {};
  if (cur[id]) {
    const { [id]: _, ...rest } = cur;
    store.set('customLeagues', rest);
  }
}

/** Combined fixture lookup (admin view) — returns compiled match or null. */
export function adminLookupFixture(matchId) {
  for (const sp of compiledLeagues()) {
    for (const lg of sp.leagues || []) {
      const m = (lg.matches || []).find((x) => x.id === matchId);
      if (m) return { match: m, league: lg, sport: sp };
    }
  }
  // fall back to the un-compiled feed in case overrides desynced
  return getMatchById(matchId);
}

export function adminListFixtures() {
  const rows = [];
  for (const sp of compiledLeagues()) {
    for (const lg of sp.leagues || []) {
      for (const m of lg.matches || []) {
        rows.push({
          ...m,
          sport: sp.id,
          leagueId: lg.id,
          leagueName: lg.name,
        });
      }
    }
  }
  return rows;
}

/** Convenience for the settlement engine and the storefront. */
export function adminLookupSelection({ matchId, market, outcome }) {
  const view = adminLookupFixture(matchId);
  if (!view) return null;
  const mk = view.match.markets?.[market];
  if (!mk) return null;
  const sel = mk.selections?.find((s) => s.key === outcome);
  if (!sel) return null;
  return { row: view, market: mk, selection: sel };
}

function publicMatch(m) { const { fh, fa, ...rest } = m; return rest; }

/** Build a getOddsSnapshot-style payload that reflects all admin overrides. */
export function buildPublicSnapshot(sportId = 'football', seedSlipFn) {
  const sports = compiledLeagues();
  const sport = sports.find((s) => s.id === sportId) || sports[0];
  return {
    sport: sport.id,
    sports: sports.map((s) => ({
      id: s.id, name: s.name,
      count: (s.leagues || []).reduce((n, l) => n + (l.matches?.length || 0), 0),
    })),
    featuredMatchId: sport.leagues[0]?.matches[0]?.id || null,
    seedSlip: sport.id === 'football' && typeof seedSlipFn === 'function' ? seedSlipFn() : [],
    leagues: (sport.leagues || []).map((lg) => ({
      id: lg.id, name: lg.name, region: lg.region,
      countryMeta: lg.countryMeta, crest: lg.crest,
      matches: (lg.matches || []).map(publicMatch),
    })),
  };
}

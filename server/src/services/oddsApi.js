/**
 * The Odds API integration with aggressive caching to preserve credits.
 * Plan: 500 credits/month — credits = regions × markets per request.
 * Strategy: 4-hour TTL per (sport,region) tuple, h2h only, stale-on-error.
 */

import { buildMarkets } from '../matchesData.js';

const API_KEY  = process.env.ODDS_API_KEY || 'f29329416dc60d4defee32c746c2f9e2';
const BASE     = 'https://api.the-odds-api.com/v4';
const TTL_MS   = 4 * 60 * 60 * 1000;   // 4 hours
const REQ_TIMEOUT_MS = 8000;

const cache = new Map();
let lastRequestsRemaining = null;
let lastRequestsUsed = null;

/** Sport-key map: our id → real Odds API keys (multiple per sport for league coverage) */
export const ODDS_SPORT_KEYS = {
  football: [
    { key: 'soccer_epl',                    leagueId: 'pl',     leagueName: 'Premier League',         region: 'europe', countryMeta: 'ENG · MATCHDAY 24',  crest: { style: 'background:linear-gradient(135deg,#3d195b,#00ff87);color:#fff', label: 'PL' } },
    { key: 'soccer_spain_la_liga',          leagueId: 'laliga', leagueName: 'LaLiga EA Sports',       region: 'europe', countryMeta: 'ESP · JORNADA 26',   crest: { style: 'background:linear-gradient(135deg,#ee8707,#d12028);color:#fff', label: 'LL' } },
    { key: 'soccer_uefa_champs_league',     leagueId: 'ucl',    leagueName: 'UEFA Champions League',  region: 'europe', countryMeta: 'UEFA · ROUND OF 16', crest: { style: 'background:linear-gradient(135deg,#003366,#ffd100);color:#fff', label: 'CL' } },
    { key: 'soccer_germany_bundesliga',     leagueId: 'bun',    leagueName: 'Bundesliga',             region: 'europe', countryMeta: 'GER · SPIELTAG 27',  crest: { style: 'background:linear-gradient(135deg,#d20515,#000);color:#fff',     label: 'BUN' } },
    { key: 'soccer_italy_serie_a',          leagueId: 'sa',     leagueName: 'Serie A',                region: 'europe', countryMeta: 'ITA · GIORNATA 28',  crest: { style: 'background:linear-gradient(135deg,#008c45,#cd212a);color:#fff', label: 'SA' } },
  ],
  basketball: [
    { key: 'basketball_nba',          leagueId: 'nba',   leagueName: 'NBA',         region: 'americas', countryMeta: 'USA · REGULAR SEASON', crest: { style: 'background:linear-gradient(135deg,#17408b,#c9082a);color:#fff', label: 'NBA' } },
    { key: 'basketball_euroleague',   leagueId: 'eurol', leagueName: 'EuroLeague',  region: 'europe',   countryMeta: 'EUR · ROUND 26',        crest: { style: 'background:linear-gradient(135deg,#ff6b00,#000);color:#fff',     label: 'EL'  } },
  ],
  tennis: [
    /* tennis sport keys are seasonal (e.g. tennis_atp_aus_open_singles); resolved at runtime */
  ],
};

/* ---------------- internal helpers ---------------- */

async function timedFetch(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), REQ_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function cachedFetch(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  try {
    const res = await timedFetch(url);
    if (res.headers.get('x-requests-remaining')) {
      lastRequestsRemaining = res.headers.get('x-requests-remaining');
      lastRequestsUsed      = res.headers.get('x-requests-used');
    }
    if (!res.ok) {
      if (hit) return hit.data; // serve stale on error
      const text = await res.text().catch(() => '');
      throw new Error(`Odds API ${res.status}: ${text.slice(0, 120)}`);
    }
    const data = await res.json();
    cache.set(url, { at: Date.now(), data });
    return data;
  } catch (err) {
    if (hit) return hit.data;
    throw err;
  }
}

/** Pick the median bookmaker price for a given outcome to smooth out outliers */
function consensusPrice(bookmakers, outcomeName) {
  const prices = [];
  for (const bm of bookmakers || []) {
    for (const m of bm.markets || []) {
      if (m.key !== 'h2h') continue;
      for (const o of m.outcomes || []) {
        if (o.name === outcomeName && Number.isFinite(o.price)) prices.push(o.price);
      }
    }
  }
  if (!prices.length) return null;
  prices.sort((a, b) => a - b);
  return prices[Math.floor(prices.length / 2)];
}

function commenceToHumanTime(iso) {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const matchDay = new Date(d); matchDay.setHours(0,0,0,0);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  let day = d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
  if (matchDay.getTime() === today.getTime()) day = 'Today';
  else if (matchDay.getTime() === tomorrow.getTime()) day = 'Tomorrow';
  return { kickoff: `${hh}:${mm}`, day };
}

function formDots() {
  // We don't get form data from the Odds API; emit a neutral pattern
  const arr = [];
  for (let i = 0; i < 5; i++) arr.push(['w','d','l'][Math.floor(Math.random() * 3)]);
  return arr;
}

function buildFootballMarkets(home, draw, away) {
  // Synthetic OU/BTTS based on goals expectation implied by 1X2 (rough heuristic).
  const total = 1 / home + 1 / draw + 1 / away;
  const homeProb = (1 / home) / total;
  const awayProb = (1 / away) / total;
  const intensity = Math.max(homeProb, awayProb);
  const ouOver  = Number((1.5 + intensity * 0.7).toFixed(2));
  const ouUnder = Number((1 / (1 - 1 / ouOver) * 0.92).toFixed(2));
  const bttsYes = Number((1.6 + (1 - intensity) * 0.4).toFixed(2));
  const bttsNo  = Number((1 / (1 - 1 / bttsYes) * 0.92).toFixed(2));

  // Delegate to the canonical builder so live fixtures expose the full market list.
  return buildMarkets({
    odds: { '1': home, 'X': draw, '2': away },
    ou: [ouOver, ouUnder],
    btts: [bttsYes, bttsNo],
  });
}

function buildBasketballMarkets(home, away) {
  return {
    'ML': { name: 'Money Line', selections: [
      { key: '1', label: 'Home', odds: home },
      { key: '2', label: 'Away', odds: away },
    ]},
    'TP': { name: 'Total Points (Over/Under 220.5)', selections: [
      { key: 'Over',  label: 'Over 220.5',  odds: 1.9 },
      { key: 'Under', label: 'Under 220.5', odds: 1.9 },
    ]},
    'HCAP': { name: 'Handicap', selections: [
      { key: '1H', label: 'Home -4.5', odds: 1.9 },
      { key: '2H', label: 'Away +4.5', odds: 1.9 },
    ]},
  };
}

function buildTennisMarkets(home, away) {
  return {
    'ML':   { name: 'Match Winner', selections: [
      { key: '1', label: 'Player 1', odds: home },
      { key: '2', label: 'Player 2', odds: away },
    ]},
    'SETS': { name: 'Total Sets (Over/Under 2.5)', selections: [
      { key: 'Over',  label: 'Over 2.5',  odds: 1.85 },
      { key: 'Under', label: 'Under 2.5', odds: 1.95 },
    ]},
  };
}

function eventToMatch(ev, sport) {
  const home = consensusPrice(ev.bookmakers, ev.home_team);
  const away = consensusPrice(ev.bookmakers, ev.away_team);
  if (home == null || away == null) return null;
  const draw = consensusPrice(ev.bookmakers, 'Draw');
  const { kickoff, day } = commenceToHumanTime(ev.commence_time);

  let markets;
  if (sport === 'football') {
    if (draw == null) return null;
    markets = buildFootballMarkets(home, draw, away);
  } else if (sport === 'basketball') {
    markets = buildBasketballMarkets(home, away);
  } else {
    markets = buildTennisMarkets(home, away);
  }

  return {
    id: `od-${ev.id}`,
    sport,
    home: ev.home_team,
    away: ev.away_team,
    kickoff,
    day,
    isLive: false,
    moreMarkets: Object.keys(markets).length,
    odds: sport === 'football'
      ? { '1': home, 'X': draw, '2': away }
      : { '1': home, '2': away },
    markets,
    form: { home: formDots(), away: formDots() },
  };
}

/* ---------------- public API ---------------- */

export async function fetchSports() {
  return cachedFetch(`${BASE}/sports?apiKey=${API_KEY}`);
}

export async function fetchOddsForSportKey(sportKey, region = 'eu') {
  return cachedFetch(`${BASE}/sports/${encodeURIComponent(sportKey)}/odds/?regions=${region}&markets=h2h&oddsFormat=decimal&apiKey=${API_KEY}`);
}

/** Resolve tennis sport keys dynamically from the in-season list */
async function resolveTennisKeys() {
  try {
    const list = await fetchSports();
    return (list || []).filter((s) => s.group === 'Tennis' && s.active && !s.has_outrights).slice(0, 2);
  } catch {
    return [];
  }
}

export async function fetchSportSnapshot(sport) {
  let leagueDescriptors = ODDS_SPORT_KEYS[sport] || [];
  if (sport === 'tennis' && leagueDescriptors.length === 0) {
    const keys = await resolveTennisKeys();
    leagueDescriptors = keys.map((s) => ({
      key: s.key,
      leagueId: s.key,
      leagueName: s.title || 'ATP / WTA',
      region: 'global',
      countryMeta: s.description || 'Tennis tour',
      crest: { style: 'background:linear-gradient(135deg,#003c71,#fdb913);color:#fff', label: (s.title || 'TEN').slice(0, 3).toUpperCase() },
    }));
  }

  const leagues = await Promise.all(leagueDescriptors.map(async (descriptor) => {
    let events = [];
    try {
      events = await fetchOddsForSportKey(descriptor.key);
    } catch {
      events = [];
    }
    const matches = events
      .map((ev) => eventToMatch(ev, sport))
      .filter(Boolean)
      .slice(0, 12);
    return {
      id: descriptor.leagueId,
      name: descriptor.leagueName,
      region: descriptor.region,
      countryMeta: descriptor.countryMeta,
      crest: descriptor.crest,
      matches,
    };
  }));

  return leagues.filter((lg) => lg.matches.length > 0);
}

export function oddsApiStatus() {
  return {
    keyConfigured: !!API_KEY,
    requestsRemaining: lastRequestsRemaining,
    requestsUsed: lastRequestsUsed,
    cacheSize: cache.size,
    ttlMinutes: TTL_MS / 60000,
  };
}

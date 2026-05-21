/** Xenbet fixture book — static fallback + live merge from The Odds API */
import { fetchSportSnapshot } from './services/oddsApi.js';

export const BONUS_RATE = 0.08;
export const CURRENCY = 'GHS';

const formDots = (s) => s.split('').map((c) => (c === 'w' ? 'w' : c === 'd' ? 'd' : 'l'));

// Decimal odds from probability, with a small house margin baked in.
function priceFromProb(p, margin = 0.06) {
  const q = Math.max(0.015, Math.min(0.985, p));
  return Number(((1 / q) * (1 - margin)).toFixed(2));
}

export function buildMarkets({ odds, ou = [1.85, 1.95], btts = [1.72, 2.05], dc }) {
  const [over, under] = ou;
  const [yes, no] = btts;
  const [home, draw, away] = [odds['1'], odds['X'], odds['2']];

  // Normalised probabilities so combo markets stay realistic.
  const rH = 1 / home, rD = 1 / draw, rA = 1 / away;
  const sumM = rH + rD + rA;
  const pH = rH / sumM, pD = rD / sumM, pA = rA / sumM;

  const rO = 1 / over, rU = 1 / under;
  const sumOU = rO + rU;
  const pO = rO / sumOU, pU = rU / sumOU;

  const rY = 1 / yes, rN = 1 / no;
  const sumBT = rY + rN;
  const pY = rY / sumBT, pN = rN / sumBT;

  const dcDefault = {
    '1X': Number((1 / (1 / home + 1 / draw)).toFixed(2)),
    'X2': Number((1 / (1 / draw + 1 / away)).toFixed(2)),
    '12': Number((1 / (1 / home + 1 / away)).toFixed(2)),
  };

  // Draw No Bet — remove draw, redistribute.
  const dnbDen = pH + pA;
  const pDnbH = pH / dnbDen, pDnbA = pA / dnbDen;

  // Over/Under 1.5 and 3.5 — derived around O2.5 baseline.
  const pO15 = Math.min(0.97, pO + 0.18);
  const pU15 = 1 - pO15;
  const pO35 = Math.max(0.05, pO * 0.55);
  const pU35 = 1 - pO35;

  // Asian Handicap ±1 (home -1 / away +1). Home -1 means win by 2+.
  const pAH1H = Math.max(0.05, pH * 0.55);
  const pAH1A = 1 - pAH1H;

  // 1st Half markets — draws are heavier, goals fewer.
  const p1hD = Math.max(0.30, pD + 0.18);
  const p1hH_raw = pH * 0.62;
  const p1hA_raw = pA * 0.62;
  const rem1h = 1 - p1hD;
  const p1hSplit = p1hH_raw + p1hA_raw || 1;
  const p1hH = (p1hH_raw / p1hSplit) * rem1h;
  const p1hA = (p1hA_raw / p1hSplit) * rem1h;
  const pHT_O05 = Math.min(0.92, pO * 0.55 + 0.18);
  const pHT_U05 = 1 - pHT_O05;
  const pHT_Yes = Math.max(0.05, pY * 0.32);
  const pHT_No  = 1 - pHT_Yes;

  // Win + BTTS combos (joint, mostly independent).
  const wbHy = pH * pY, wbHn = pH * pN;
  const wbDy = pD * pY, wbDn = pD * pN;
  const wbAy = pA * pY, wbAn = pA * pN;

  // Win + Over/Under 2.5 combos.
  const woHo = pH * pO, woHu = pH * pU;
  const woDo = pD * pO, woDu = pD * pU;
  const woAo = pA * pO, woAu = pA * pU;

  // BTTS + Over/Under 2.5 combos — correlated (Yes implies ≥2 goals).
  // Boost Yes/Over and No/Under since these align; suppress the other diagonals.
  const corr = 0.10;
  const bbYO = Math.min(0.95, pY * pO + corr * Math.min(pY, pO));
  const bbNU = Math.min(0.95, pN * pU + corr * Math.min(pN, pU));
  const bbRest = Math.max(0.02, 1 - bbYO - bbNU);
  const bbYU = bbRest * 0.45;
  const bbNO = bbRest * 0.55;

  // Half-Time / Full-Time (9 outcomes). Probabilities assume teams that lead at
  // HT usually preserve, draws often flip to a win, trailing rarely turns around.
  const htft = {
    '1/1': pH * 0.62,
    '1/X': pH * 0.10,
    '1/2': pH * 0.04,
    'X/1': pD * 0.28,
    'X/X': pD * 0.35,
    'X/2': pD * 0.22,
    '2/1': pA * 0.04,
    '2/X': pA * 0.10,
    '2/2': pA * 0.62,
  };

  // Correct Score (popular 8). Scaled around match expectation.
  const homeStrong = pH > pA;
  const goalRich = pO > 0.55;
  const csBase = {
    '1-0': homeStrong ? 0.13 : 0.08,
    '2-0': homeStrong ? 0.10 : 0.05,
    '2-1': homeStrong ? 0.12 : 0.09,
    '1-1': 0.13,
    '0-0': goalRich ? 0.06 : 0.10,
    '0-1': homeStrong ? 0.05 : 0.10,
    '0-2': homeStrong ? 0.03 : 0.07,
    '1-2': homeStrong ? 0.05 : 0.10,
    '2-2': goalRich ? 0.07 : 0.04,
    'OTHER': 0.26,
  };

  return {
    '1X2': { name: 'Match Result', selections: [
      { key: '1', label: 'Home', odds: home },
      { key: 'X', label: 'Draw', odds: draw },
      { key: '2', label: 'Away', odds: away },
    ]},
    'DC': { name: 'Double Chance', selections: [
      { key: '1X', label: 'Home or Draw', odds: dc?.['1X'] ?? dcDefault['1X'] },
      { key: 'X2', label: 'Draw or Away', odds: dc?.['X2'] ?? dcDefault['X2'] },
      { key: '12', label: 'Home or Away', odds: dc?.['12'] ?? dcDefault['12'] },
    ]},
    'DNB': { name: 'Draw No Bet', selections: [
      { key: '1', label: 'Home', odds: priceFromProb(pDnbH) },
      { key: '2', label: 'Away', odds: priceFromProb(pDnbA) },
    ]},
    'AH1': { name: 'Asian Handicap (±1)', selections: [
      { key: 'H-1', label: 'Home -1', odds: priceFromProb(pAH1H, 0.08) },
      { key: 'A+1', label: 'Away +1', odds: priceFromProb(pAH1A, 0.08) },
    ]},
    'OU15': { name: 'Total Goals (O/U 1.5)', selections: [
      { key: 'Over',  label: 'Over 1.5',  odds: priceFromProb(pO15) },
      { key: 'Under', label: 'Under 1.5', odds: priceFromProb(pU15) },
    ]},
    'OU25': { name: 'Total Goals (Over/Under 2.5)', selections: [
      { key: 'Over',  label: 'Over 2.5',  odds: over },
      { key: 'Under', label: 'Under 2.5', odds: under },
    ]},
    'OU35': { name: 'Total Goals (O/U 3.5)', selections: [
      { key: 'Over',  label: 'Over 3.5',  odds: priceFromProb(pO35) },
      { key: 'Under', label: 'Under 3.5', odds: priceFromProb(pU35) },
    ]},
    'BTTS': { name: 'Both Teams To Score', selections: [
      { key: 'Yes', label: 'Yes', odds: yes },
      { key: 'No',  label: 'No',  odds: no  },
    ]},
    'WINBTTS': { name: 'Result & Both Teams To Score', selections: [
      { key: '1Y', label: 'Home & Yes', odds: priceFromProb(wbHy, 0.10) },
      { key: '1N', label: 'Home & No',  odds: priceFromProb(wbHn, 0.10) },
      { key: 'XY', label: 'Draw & Yes', odds: priceFromProb(wbDy, 0.10) },
      { key: 'XN', label: 'Draw & No',  odds: priceFromProb(wbDn, 0.10) },
      { key: '2Y', label: 'Away & Yes', odds: priceFromProb(wbAy, 0.10) },
      { key: '2N', label: 'Away & No',  odds: priceFromProb(wbAn, 0.10) },
    ]},
    'WINOU25': { name: 'Result & Total Goals (2.5)', selections: [
      { key: '1O', label: 'Home & Over 2.5',  odds: priceFromProb(woHo, 0.10) },
      { key: '1U', label: 'Home & Under 2.5', odds: priceFromProb(woHu, 0.10) },
      { key: 'XO', label: 'Draw & Over 2.5',  odds: priceFromProb(woDo, 0.10) },
      { key: 'XU', label: 'Draw & Under 2.5', odds: priceFromProb(woDu, 0.10) },
      { key: '2O', label: 'Away & Over 2.5',  odds: priceFromProb(woAo, 0.10) },
      { key: '2U', label: 'Away & Under 2.5', odds: priceFromProb(woAu, 0.10) },
    ]},
    'BTTSOU25': { name: 'BTTS & Total Goals (2.5)', selections: [
      { key: 'YO', label: 'Yes & Over 2.5',  odds: priceFromProb(bbYO, 0.09) },
      { key: 'YU', label: 'Yes & Under 2.5', odds: priceFromProb(bbYU, 0.09) },
      { key: 'NO', label: 'No & Over 2.5',   odds: priceFromProb(bbNO, 0.09) },
      { key: 'NU', label: 'No & Under 2.5',  odds: priceFromProb(bbNU, 0.09) },
    ]},
    'HTFT': { name: 'Half-Time / Full-Time', selections: [
      { key: '1/1', label: 'Home / Home', odds: priceFromProb(htft['1/1'], 0.10) },
      { key: '1/X', label: 'Home / Draw', odds: priceFromProb(htft['1/X'], 0.10) },
      { key: '1/2', label: 'Home / Away', odds: priceFromProb(htft['1/2'], 0.10) },
      { key: 'X/1', label: 'Draw / Home', odds: priceFromProb(htft['X/1'], 0.10) },
      { key: 'X/X', label: 'Draw / Draw', odds: priceFromProb(htft['X/X'], 0.10) },
      { key: 'X/2', label: 'Draw / Away', odds: priceFromProb(htft['X/2'], 0.10) },
      { key: '2/1', label: 'Away / Home', odds: priceFromProb(htft['2/1'], 0.10) },
      { key: '2/X', label: 'Away / Draw', odds: priceFromProb(htft['2/X'], 0.10) },
      { key: '2/2', label: 'Away / Away', odds: priceFromProb(htft['2/2'], 0.10) },
    ]},
    'CS': { name: 'Correct Score', selections: [
      { key: '1-0', label: '1 - 0', odds: priceFromProb(csBase['1-0'], 0.10) },
      { key: '2-0', label: '2 - 0', odds: priceFromProb(csBase['2-0'], 0.10) },
      { key: '2-1', label: '2 - 1', odds: priceFromProb(csBase['2-1'], 0.10) },
      { key: '1-1', label: '1 - 1', odds: priceFromProb(csBase['1-1'], 0.10) },
      { key: '0-0', label: '0 - 0', odds: priceFromProb(csBase['0-0'], 0.10) },
      { key: '0-1', label: '0 - 1', odds: priceFromProb(csBase['0-1'], 0.10) },
      { key: '0-2', label: '0 - 2', odds: priceFromProb(csBase['0-2'], 0.10) },
      { key: '1-2', label: '1 - 2', odds: priceFromProb(csBase['1-2'], 0.10) },
      { key: '2-2', label: '2 - 2', odds: priceFromProb(csBase['2-2'], 0.10) },
      { key: 'OTHER', label: 'Any Other Score', odds: priceFromProb(csBase['OTHER'], 0.10) },
    ]},
    '1H1X2': { name: '1st Half Result', selections: [
      { key: '1', label: 'Home', odds: priceFromProb(p1hH, 0.07) },
      { key: 'X', label: 'Draw', odds: priceFromProb(p1hD, 0.07) },
      { key: '2', label: 'Away', odds: priceFromProb(p1hA, 0.07) },
    ]},
    '1HOU05': { name: '1st Half Goals (O/U 0.5)', selections: [
      { key: 'Over',  label: 'Over 0.5',  odds: priceFromProb(pHT_O05) },
      { key: 'Under', label: 'Under 0.5', odds: priceFromProb(pHT_U05) },
    ]},
    '1HBTTS': { name: '1st Half BTTS', selections: [
      { key: 'Yes', label: 'Yes', odds: priceFromProb(pHT_Yes, 0.08) },
      { key: 'No',  label: 'No',  odds: priceFromProb(pHT_No,  0.08) },
    ]},
  };
}

function makeFootballMatch(row) {
  const markets = buildMarkets({ odds: row.odds, ou: row.ou, btts: row.btts, dc: row.dc });
  return {
    sport: 'football',
    form: row.fh && row.fa ? { home: formDots(row.fh), away: formDots(row.fa) } : undefined,
    markets,
    moreMarkets: row.extraMarketCount || Object.keys(markets).length,
    ...row,
  };
}

function makeBasketMatch(row) {
  const [home, away] = [row.odds['1'], row.odds['2']];
  const [over, under] = row.totalPoints || [1.9, 1.9];
  const markets = {
    'ML':   { name: 'Money Line', selections: [
      { key: '1', label: 'Home', odds: home },
      { key: '2', label: 'Away', odds: away },
    ]},
    'TP':   { name: `Total Points (Over/Under ${row.line || 220.5})`, selections: [
      { key: 'Over',  label: `Over ${row.line || 220.5}`,  odds: over  },
      { key: 'Under', label: `Under ${row.line || 220.5}`, odds: under },
    ]},
    'HCAP': { name: 'Handicap', selections: [
      { key: '1H', label: `Home -${Math.abs(row.handicap || 4.5)}`, odds: 1.9 },
      { key: '2H', label: `Away +${Math.abs(row.handicap || 4.5)}`, odds: 1.9 },
    ]},
  };
  return {
    sport: 'basketball',
    markets,
    moreMarkets: row.extraMarketCount || Object.keys(markets).length,
    ...row,
  };
}

/* --------- STATIC FALLBACK / GHANA-SPECIFIC LEAGUES --------- */

export const GHANA_FOOTBALL_LEAGUE = {
  id: 'ghpl',
  name: 'Ghana Premier League',
  region: 'africa',
  countryMeta: 'GHA · MATCHWEEK 18',
  crest: { style: 'background:linear-gradient(135deg,#ce1126,#fcd116,#006b3f);color:#fff', label: 'GH' },
  matches: [
    makeFootballMatch({
      id: 'gh-adu-med', home: 'Aduana Stars', away: 'Medeama SC',
      kickoff: '16:00', day: 'Today',
      odds: { '1': 2.85, 'X': 2.95, '2': 2.55 },
      extraMarketCount: 48, fh: 'dwlwd', fa: 'wdwwl',
    }),
    makeFootballMatch({
      id: 'gh-dre-bec', home: 'Dreams FC', away: 'Bechem United',
      kickoff: '18:00', day: 'Today',
      odds: { '1': 1.95, 'X': 3.2, '2': 3.8 },
      extraMarketCount: 54, fh: 'wlwdw', fa: 'ldlwl',
    }),
  ],
};

export const FALLBACK_FOOTBALL_LEAGUES = [
  {
    id: 'pl', name: 'Premier League', region: 'europe',
    countryMeta: 'ENG · MATCHDAY 24',
    crest: { style: 'background:linear-gradient(135deg,#3d195b,#00ff87);color:#fff', label: 'PL' },
    matches: [
      makeFootballMatch({
        id: 'hero-ars-che', home: 'Arsenal', away: 'Chelsea',
        isLive: true, scoreHome: 2, scoreAway: 1, minute: "73'",
        odds: { '1': 1.42, 'X': 4.2, '2': 7.5 },
        extraMarketCount: 118, fh: 'wwdww', fa: 'wlwdl',
      }),
      makeFootballMatch({
        id: 'pl-mci-liv', home: 'Manchester City', away: 'Liverpool',
        kickoff: '17:30', day: 'Today',
        odds: { '1': 2.1, 'X': 3.5, '2': 3.25 },
        extraMarketCount: 142, fh: 'wwwwd', fa: 'wdwwl',
      }),
    ],
  },
];

export const FALLBACK_BASKETBALL_LEAGUES = [
  {
    id: 'nba', name: 'NBA', region: 'americas',
    countryMeta: 'USA · REGULAR SEASON',
    crest: { style: 'background:linear-gradient(135deg,#17408b,#c9082a);color:#fff', label: 'NBA' },
    matches: [
      makeBasketMatch({
        id: 'nba-lal-bos', home: 'LA Lakers', away: 'Boston Celtics',
        kickoff: '02:00', day: 'Tomorrow',
        odds: { '1': 2.4, '2': 1.55 }, line: 224.5, totalPoints: [1.9, 1.9], handicap: -4.5,
        extraMarketCount: 86,
      }),
    ],
  },
];

export const FALLBACK_TENNIS_LEAGUES = [
  {
    id: 'atp', name: 'ATP Tour', region: 'global',
    countryMeta: 'ATP 1000 · INDIAN WELLS',
    crest: { style: 'background:linear-gradient(135deg,#003c71,#fdb913);color:#fff', label: 'ATP' },
    matches: [],
  },
];

/* --------- BACKING STORE --------- */

const liveLeagues = {
  football: [...FALLBACK_FOOTBALL_LEAGUES, GHANA_FOOTBALL_LEAGUE],
  basketball: FALLBACK_BASKETBALL_LEAGUES,
  tennis: FALLBACK_TENNIS_LEAGUES,
};

let lastRefreshAt = { football: 0, basketball: 0, tennis: 0 };

const REFRESH_TTL_MS = 4 * 60 * 60 * 1000; // refresh same TTL as oddsApi cache

export async function ensureFreshLeagues(sportId) {
  const now = Date.now();
  if (now - (lastRefreshAt[sportId] || 0) < REFRESH_TTL_MS) return;
  try {
    const live = await fetchSportSnapshot(sportId);
    if (live && live.length) {
      if (sportId === 'football') {
        liveLeagues.football = [...live, GHANA_FOOTBALL_LEAGUE];
      } else {
        liveLeagues[sportId] = live;
      }
      lastRefreshAt[sportId] = now;
    }
  } catch {
    /* keep current data; stale serves */
  }
}

/* --------- PUBLIC ACCESSORS --------- */

const SPORT_DESCRIPTORS = [
  { id: 'football',   name: 'Football'   },
  { id: 'basketball', name: 'Basketball' },
  { id: 'tennis',     name: 'Tennis'     },
];

export const SPORTS = SPORT_DESCRIPTORS.map((s) => ({
  ...s,
  get leagues() { return liveLeagues[s.id]; },
}));

/** legacy alias */
export const LEAGUES = liveLeagues.football;

export function getSport(id) {
  return SPORTS.find((s) => s.id === id);
}

export function getMatchById(id) {
  for (const sportId of Object.keys(liveLeagues)) {
    for (const lg of liveLeagues[sportId]) {
      const match = lg.matches.find((x) => x.id === id);
      if (match) return { league: lg, match, sport: sportId };
    }
  }
  return null;
}

function publicMatch(mat) {
  const { fh, fa, ...rest } = mat;
  return rest;
}

function pickLabel(market, key, match) {
  const teamFor = (k) => (k === '1' ? match.home : k === '2' ? match.away : 'Draw');

  if (market === '1X2' || market === '1H1X2') {
    const prefix = market === '1H1X2' ? '1H · ' : '';
    if (key === '1') return `${prefix}${match.home} to win`;
    if (key === '2') return `${prefix}${match.away} to win`;
    return `${prefix}Draw`;
  }
  if (market === 'ML')   return `${key === '1' ? match.home : match.away} to win`;
  if (market === 'OU25') return `${key} 2.5 goals`;
  if (market === 'OU15') return `${key} 1.5 goals`;
  if (market === 'OU35') return `${key} 3.5 goals`;
  if (market === '1HOU05') return `1H · ${key} 0.5 goals`;
  if (market === 'BTTS')  return `Both Teams To Score · ${key}`;
  if (market === '1HBTTS') return `1H · Both Teams To Score · ${key}`;
  if (market === 'DC') {
    if (key === '1X') return `${match.home} or Draw`;
    if (key === 'X2') return `Draw or ${match.away}`;
    return `${match.home} or ${match.away}`;
  }
  if (market === 'DNB') return `Draw No Bet · ${teamFor(key)}`;
  if (market === 'AH1') {
    if (key === 'H-1') return `${match.home} -1`;
    if (key === 'A+1') return `${match.away} +1`;
    return `Handicap ${key}`;
  }
  if (market === 'WINBTTS') {
    const result = key[0] === '1' ? match.home : key[0] === '2' ? match.away : 'Draw';
    return `${result} & BTTS ${key[1] === 'Y' ? 'Yes' : 'No'}`;
  }
  if (market === 'WINOU25') {
    const result = key[0] === '1' ? match.home : key[0] === '2' ? match.away : 'Draw';
    return `${result} & ${key[1] === 'O' ? 'Over' : 'Under'} 2.5`;
  }
  if (market === 'BTTSOU25') {
    return `BTTS ${key[0] === 'Y' ? 'Yes' : 'No'} & ${key[1] === 'O' ? 'Over' : 'Under'} 2.5`;
  }
  if (market === 'HTFT') {
    const half = (k) => (k === '1' ? match.home : k === '2' ? match.away : 'Draw');
    const [a, b] = key.split('/');
    return `HT/FT · ${half(a)} / ${half(b)}`;
  }
  if (market === 'CS') return `Correct Score ${key === 'OTHER' ? 'Any Other' : key}`;
  if (market === 'TP')   return `${key} ${match.line || ''} pts`;
  if (market === 'SETS') return `${key} 2.5 sets`;
  if (market === 'HCAP') return `Handicap ${key}`;
  return `${market} · ${key}`;
}

function matchMetaLine(_league, match) {
  if (match.isLive) return `${match.home} vs ${match.away} · LIVE ${match.minute || ''}`;
  return `${match.home} vs ${match.away} · ${[match.kickoff, match.day].filter(Boolean).join(' ')}`;
}

const SEED_SLIP_LEGS = [
  { matchId: 'gh-kot-hea', market: '1X2', key: '1' },
];

export function buildSeedSelections() {
  const out = [];
  for (const { matchId, market, key } of SEED_SLIP_LEGS) {
    const row = getMatchById(matchId);
    if (!row) continue;
    const m = row.match.markets?.[market];
    const sel = m?.selections.find((s) => s.key === key);
    if (!sel) continue;
    out.push({
      id: `seed-${matchId}-${market}-${key}`,
      matchId, market, outcome: key, odds: sel.odds,
      pickLabel: pickLabel(market, key, row.match),
      marketLabel: `${m.name} · ${key}`,
      meta: matchMetaLine(row.league, row.match),
      trend: null,
    });
  }
  return out;
}

export async function getOddsSnapshot(sportId = 'football') {
  await ensureFreshLeagues(sportId);
  const sport = getSport(sportId) || SPORTS[0];
  return {
    updatedAt: new Date().toISOString(),
    currency: CURRENCY,
    sport: sport.id,
    sports: SPORTS.map((s) => ({
      id: s.id, name: s.name,
      count: liveLeagues[s.id].reduce((n, l) => n + l.matches.length, 0),
    })),
    featuredMatchId: sport.leagues[0]?.matches[0]?.id || null,
    seedSlip: sport.id === 'football' ? buildSeedSelections() : [],
    leagues: sport.leagues.map((lg) => ({
      id: lg.id, name: lg.name, region: lg.region,
      countryMeta: lg.countryMeta, crest: lg.crest,
      matches: lg.matches.map(publicMatch),
    })),
  };
}

export function lookupSelection({ matchId, market, outcome }) {
  const row = getMatchById(matchId);
  if (!row) return null;
  const m = row.match.markets?.[market];
  if (!m) return null;
  const sel = m.selections.find((s) => s.key === outcome);
  if (!sel) return null;
  return { row, market: m, selection: sel };
}

/* --------- Casino, Virtuals, Jackpot, Promotions data (unchanged) --------- */

export const CASINO_GAMES = [
  { id: 'dice',      title: 'Dice',      provider: 'Xenbet Originals', category: 'Instant', rtp: 99.0, hot: true,  hue: '#22c55e', route: '/casino/dice',      tagline: 'Pick a target. Roll the dice.' },
  { id: 'spin2win',  title: 'Spin2Win',  provider: 'Xenbet Originals', category: 'Instant', rtp: 97.3, hot: true,  hue: '#c81e1e', route: '/casino/spin2win',  tagline: 'Roulette-style number grid.'   },
  { id: 'red-black', title: 'Red Black', provider: 'Xenbet Originals', category: 'Instant', rtp: 98.0,             hue: '#0ea5e9', route: '/casino/red-black', tagline: 'Flip the card. Pays 2x.'       },
];

export const VIRTUAL_LEAGUES = [
  {
    id: 'vfl', name: 'Virtual Football League', nextDraw: 60,
    matches: [
      { id: 'v-1', home: 'Red Tigers',    away: 'Blue Wolves',    odds: { '1': 1.8, 'X': 3.4, '2': 4.2 } },
      { id: 'v-2', home: 'Yellow Eagles', away: 'Green Panthers', odds: { '1': 2.1, 'X': 3.2, '2': 3.4 } },
      { id: 'v-3', home: 'Orange Bulls',  away: 'Purple Hawks',   odds: { '1': 1.6, 'X': 3.8, '2': 5.0 } },
      { id: 'v-4', home: 'Silver Lions',  away: 'Black Sharks',   odds: { '1': 2.5, 'X': 3.1, '2': 2.8 } },
    ],
  },
];

export const JACKPOT_GAME = {
  id: 'mega-13',
  name: 'Mega-13 Jackpot',
  pool: 1840000,
  currency: CURRENCY,
  entryFee: 5,
  drawsIn: '4d 12h 32m',
  legs: [
    { id: 'j1',  fixture: 'Arsenal vs Chelsea',                outcomes: ['1', 'X', '2'] },
    { id: 'j2',  fixture: 'Manchester City vs Liverpool',      outcomes: ['1', 'X', '2'] },
    { id: 'j3',  fixture: 'Tottenham vs Manchester Utd',       outcomes: ['1', 'X', '2'] },
    { id: 'j4',  fixture: 'Real Madrid vs Barcelona',          outcomes: ['1', 'X', '2'] },
    { id: 'j5',  fixture: 'Atletico Madrid vs Sevilla',        outcomes: ['1', 'X', '2'] },
    { id: 'j6',  fixture: 'Bayern München vs Inter Milan',     outcomes: ['1', 'X', '2'] },
    { id: 'j7',  fixture: 'PSG vs Borussia Dortmund',          outcomes: ['1', 'X', '2'] },
    { id: 'j8',  fixture: 'Aduana Stars vs Medeama SC',        outcomes: ['1', 'X', '2'] },
    { id: 'j9',  fixture: 'Dreams FC vs Bechem United',        outcomes: ['1', 'X', '2'] },
    { id: 'j10', fixture: 'Hearts of Lions vs Karela United',  outcomes: ['1', 'X', '2'] },
    { id: 'j11', fixture: 'Newcastle vs Brighton',             outcomes: ['1', 'X', '2'] },
    { id: 'j12', fixture: 'Aston Villa vs West Ham',           outcomes: ['1', 'X', '2'] },
    { id: 'j13', fixture: 'Real Sociedad vs Villarreal',       outcomes: ['1', 'X', '2'] },
  ],
};

export const PROMOTIONS = [
  { id: 'welcome',     title: '200% Welcome Bonus',   tag: 'New customers', cta: 'Claim now',         body: 'Get a 200% boost on your first deposit. Maximum bonus GHS 1,000.', expires: '30 days from signup' },
  { id: 'multi-boost', title: 'Acca Boost up to 75%', tag: 'All customers', cta: 'Build a multi',     body: 'Multi-bets of 5+ legs earn boosts on potential winnings — up to 75% extra.', expires: 'Ongoing' },
  { id: 'cashback',    title: 'Weekly Cashback 15%',  tag: 'Active bettors',cta: 'Opt in',            body: 'Get 15% cashback on net losses every Monday — credited automatically.', expires: 'Weekly' },
  { id: 'free-spin',   title: '50 Free Spins',        tag: 'Casino',        cta: 'Deposit & claim',   body: 'Deposit GHS 100 and get 50 free spins on Sweet Bonanza.', expires: 'This week' },
];

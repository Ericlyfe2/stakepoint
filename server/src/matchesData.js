/** Xenbet fixture book — static fallback + live merge from The Odds API */
import { fetchSportSnapshot } from './services/oddsApi.js';

export const BONUS_RATE = 0.08;
export const CURRENCY = 'GHS';

const formDots = (s) => s.split('').map((c) => (c === 'w' ? 'w' : c === 'd' ? 'd' : 'l'));

function buildMarkets({ odds, ou = [1.85, 1.95], btts = [1.72, 2.05], dc }) {
  const [over, under] = ou;
  const [yes, no] = btts;
  const [home, draw, away] = [odds['1'], odds['X'], odds['2']];
  const dcDefault = {
    '1X': Number((1 / (1 / home + 1 / draw)).toFixed(2)),
    'X2': Number((1 / (1 / draw + 1 / away)).toFixed(2)),
    '12': Number((1 / (1 / home + 1 / away)).toFixed(2)),
  };
  return {
    '1X2': { name: 'Match Result', selections: [
      { key: '1', label: 'Home', odds: home },
      { key: 'X', label: 'Draw', odds: draw },
      { key: '2', label: 'Away', odds: away },
    ]},
    'OU25': { name: 'Total Goals (Over/Under 2.5)', selections: [
      { key: 'Over',  label: 'Over 2.5',  odds: over },
      { key: 'Under', label: 'Under 2.5', odds: under },
    ]},
    'BTTS': { name: 'Both Teams To Score', selections: [
      { key: 'Yes', label: 'Yes', odds: yes },
      { key: 'No',  label: 'No',  odds: no  },
    ]},
    'DC': { name: 'Double Chance', selections: [
      { key: '1X', label: 'Home or Draw', odds: dc?.['1X'] ?? dcDefault['1X'] },
      { key: 'X2', label: 'Draw or Away', odds: dc?.['X2'] ?? dcDefault['X2'] },
      { key: '12', label: 'Home or Away', odds: dc?.['12'] ?? dcDefault['12'] },
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
      id: 'gh-kot-hea', home: 'Asante Kotoko', away: 'Hearts of Oak',
      isLive: true, scoreHome: 1, scoreAway: 0, minute: "56'",
      odds: { '1': 1.65, 'X': 3.4, '2': 5.8 },
      extraMarketCount: 62, fh: 'wwwdw', fa: 'ldwld', starred: true,
    }),
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
  if (market === '1X2') {
    if (key === '1') return `${match.home} to win`;
    if (key === '2') return `${match.away} to win`;
    return 'Draw';
  }
  if (market === 'ML')   return `${key === '1' ? match.home : match.away} to win`;
  if (market === 'OU25') return `${key} 2.5 goals`;
  if (market === 'BTTS') return `Both Teams To Score · ${key}`;
  if (market === 'DC') {
    if (key === '1X') return `${match.home} or Draw`;
    if (key === 'X2') return `Draw or ${match.away}`;
    return `${match.home} or ${match.away}`;
  }
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
  { id: 'aviator',     title: 'Aviator',         provider: 'Spribe',    category: 'Crash', rtp: 97.0, hot: true,  hue: '#ff5252' },
  { id: 'live-rolette',title: 'Lightning Roulette', provider: 'Evolution', category: 'Live', rtp: 97.3, hot: true, hue: '#ffd000' },
  { id: 'mines',       title: 'Mines',           provider: 'Spribe',    category: 'Crash', rtp: 97.0, hue: '#27e0c4' },
  { id: 'plinko',      title: 'Plinko',          provider: 'Spribe',    category: 'Crash', rtp: 97.0, hue: '#7a8cff' },
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
    { id: 'j8',  fixture: 'Asante Kotoko vs Hearts of Oak',    outcomes: ['1', 'X', '2'] },
    { id: 'j9',  fixture: 'Aduana Stars vs Medeama SC',        outcomes: ['1', 'X', '2'] },
    { id: 'j10', fixture: 'Dreams FC vs Bechem United',        outcomes: ['1', 'X', '2'] },
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

/* ---------------------------------------------------------------------------
   stitchSeed.js
   ---------------------------------------------------------------------------
   Designed fixture set for the four Stitch ports. Used only as a fallback when
   /bet/matches is unreachable (design review, preview deploy, offline) so the
   screens render their full layout instead of an error state.

   The league / team / odds values mirror the Stitch screens one-for-one, and
   the market objects use the SAME keys and shape the server's buildMarkets()
   produces — so a selection made against seed data is indistinguishable from
   one made against live data once the API is reachable.
   ------------------------------------------------------------------------- */

const r2 = (n) => Number(Number(n).toFixed(2));

/** Build the server-shaped market map from a 1X2 price triple. */
function buildMarkets({ h, d, a, ou = 2.5, bttsLine = '1.5' }) {
  const rH = 1 / h, rD = 1 / d, rA = 1 / a;
  const s = rH + rD + rA;
  const pH = rH / s, pD = rD / s, pA = rA / s;

  // Over/Under centred on the 2.5 line, derived from total-goal expectation.
  const total = pH * 2.1 + pD * 1.15 + pA * 1.7;
  const pO = Math.min(0.82, Math.max(0.24, 0.5 + (total - 2.3) * 0.22));
  const ouOver = r2(1 / pO);
  const ouUnder = r2(1 / (1 - pO));
  const pU = 1 - pO;

  const pY = Math.min(0.85, Math.max(0.3, (pH + pA) * 0.82));
  const bttsYes = r2(1 / pY);
  const bttsNo = r2(1 / (1 - pY));
  const pN = 1 - pY;

  const dnbDen = pH + pA;
  const pDnbH = pH / dnbDen, pDnbA = pA / dnbDen;

  const pO15 = Math.min(0.95, pO + 0.24);
  const pO35 = Math.max(0.06, pO * 0.52);

  const pAH1H = Math.max(0.06, pH * 0.52);
  const p1hD = Math.min(0.52, pD + 0.16);
  const rem1h = 1 - p1hD;
  const rawH = pH * 0.6, rawA = pA * 0.6;
  const sp = rawH + rawA || 1;
  const p1hH = (rawH / sp) * rem1h, p1hA = (rawA / sp) * rem1h;
  const pHT_O05 = Math.min(0.88, pO * 0.55 + 0.2);
  const pHT_Yes = Math.max(0.06, pY * 0.3);
  const pHT_No = 1 - pHT_Yes;

  return {
    '1X2': {
      name: 'Match Result',
      selections: [
        { key: '1', label: 'Home', odds: h },
        { key: 'X', label: 'Draw', odds: d },
        { key: '2', label: 'Away', odds: a },
      ],
    },
    DC: {
      name: 'Double Chance',
      selections: [
        { key: '1X', label: 'Home or Draw', odds: r2(1 / (rH + rD)) },
        { key: 'X2', label: 'Draw or Away', odds: r2(1 / (rD + rA)) },
        { key: '12', label: 'Home or Away', odds: r2(1 / (rH + rA)) },
      ],
    },
    DNB: {
      name: 'Draw No Bet',
      selections: [
        { key: '1', label: 'Home', odds: r2(1 / pDnbH) },
        { key: '2', label: 'Away', odds: r2(1 / pDnbA) },
      ],
    },
    AH1: {
      name: 'Asian Handicap (-1)',
      selections: [
        { key: '1', label: 'Home -1', odds: r2(1 / pAH1H) },
        { key: '2', label: 'Away +1', odds: r2(1 / (1 - pAH1H)) },
      ],
    },
    OU25: {
      name: 'Total Goals (Over/Under 2.5)',
      selections: [
        { key: 'Over', label: 'Over 2.5', odds: ouOver },
        { key: 'Under', label: 'Under 2.5', odds: ouUnder },
      ],
    },
    OU15: {
      name: 'Total Goals (O/U 1.5)',
      selections: [
        { key: 'Over', label: 'Over 1.5', odds: r2(1 / pO15) },
        { key: 'Under', label: 'Under 1.5', odds: r2(1 / (1 - pO15)) },
      ],
    },
    OU35: {
      name: 'Total Goals (O/U 3.5)',
      selections: [
        { key: 'Over', label: 'Over 3.5', odds: r2(1 / pO35) },
        { key: 'Under', label: 'Under 3.5', odds: r2(1 / (1 - pO35)) },
      ],
    },
    BTTS: {
      name: 'Both Teams To Score',
      selections: [
        { key: 'Yes', label: 'Yes', odds: bttsYes },
        { key: 'No', label: 'No', odds: bttsNo },
      ],
    },
    WINBTTS: {
      name: 'Result & Both Teams To Score',
      selections: [
        { key: '1', label: 'Home & Yes', odds: r2(1 / (pH * pY)) },
        { key: 'X', label: 'Draw & Yes', odds: r2(1 / (pD * pY)) },
        { key: '2', label: 'Away & Yes', odds: r2(1 / (pA * pY)) },
      ],
    },
    WINOU25: {
      name: 'Result & Total Goals (2.5)',
      selections: [
        { key: '1', label: 'Home & Over', odds: r2(1 / (pH * pO)) },
        { key: 'X', label: 'Draw & Over', odds: r2(1 / (pD * pO)) },
        { key: '2', label: 'Away & Over', odds: r2(1 / (pA * pO)) },
      ],
    },
    BTTSOU25: {
      name: 'BTTS & Total Goals (2.5)',
      selections: [
        { key: 'Yes', label: 'Yes & Over', odds: r2(1 / (pY * pO)) },
        { key: 'No', label: 'No & Over', odds: r2(1 / (pN * pO)) },
      ],
    },
    HTFT: {
      name: 'Half-Time / Full-Time',
      selections: [
        { key: 'H/H', label: 'HT Home / FT Home', odds: r2(1 / (pH * p1hH * 0.55)) },
        { key: 'D/D', label: 'HT Draw / FT Draw', odds: r2(1 / (pD * p1hD * 0.5)) },
        { key: 'A/A', label: 'HT Away / FT Away', odds: r2(1 / (pA * p1hA * 0.55)) },
      ],
    },
    '1H1X2': {
      name: '1st Half Result',
      selections: [
        { key: '1', label: 'Home', odds: r2(1 / p1hH) },
        { key: 'X', label: 'Draw', odds: r2(1 / p1hD) },
        { key: '2', label: 'Away', odds: r2(1 / p1hA) },
      ],
    },
    '1HOU05': {
      name: '1st Half Goals (O/U 0.5)',
      selections: [
        { key: 'Over', label: 'Over 0.5', odds: r2(1 / pHT_O05) },
        { key: 'Under', label: 'Under 0.5', odds: r2(1 / (1 - pHT_O05)) },
      ],
    },
    '1HBTTS': {
      name: '1st Half BTTS',
      selections: [
        { key: 'Yes', label: 'Yes', odds: r2(1 / pHT_Yes) },
        { key: 'No', label: 'No', odds: r2(1 / pHT_No) },
      ],
    },
  };
}

const form = (wins, draws, losses) => [
  ...Array(wins).fill('w'), ...Array(draws).fill('d'), ...Array(losses).fill('l'),
];

function fx(o) {
  const markets = buildMarkets(o.odds1x2 ?? { h: o.h, d: o.d, a: o.a });
  return {
    id: o.id,
    sport: 'football',
    home: o.home,
    away: o.away,
    kickoff: o.kickoff,
    day: o.day,
    isLive: !!o.isLive,
    minute: o.minute,
    period: o.period,
    scoreHome: o.scoreHome,
    scoreAway: o.scoreAway,
    suspended: false,
    moreMarkets: Object.keys(markets).length,
    markets,
    form: {
      home: o.formHome || form(2, 1, 1),
      away: o.formAway || form(1, 2, 1),
    },
    ...(o.events ? { events: o.events } : {}),
  };
}

/* ---- Arsenal v Chelsea: the live hero fixture from screen 3 --------------- */
const ARSENAL_EVENTS = [
  { minute: 74, kind: 'free_kick', team: 'home', note: 'Free kick won by Saka' },
  { minute: 68, kind: 'goal', team: 'home', note: 'Goal — Arsenal (Havertz)' },
  { minute: 52, kind: 'card', team: 'away', note: 'Yellow card — Caicedo' },
  { minute: 34, kind: 'goal', team: 'away', note: 'Goal — Chelsea (Palmer)' },
  { minute: 12, kind: 'goal', team: 'home', note: 'Goal — Arsenal (Rice)' },
];

const EPL = {
  id: 'pl',
  name: 'Premier League',
  short: 'PL',
  country: 'England',
  meta: 'MATCHDAY 29',
  crest: { style: 'background:linear-gradient(135deg,#3d195b,#00ff87);color:#fff', label: 'PL' },
  matches: [
    fx({
      id: 'seed-ars-che', home: 'Arsenal', away: 'Chelsea',
      h: 1.32, d: 5.1, a: 9.5,
      kickoff: '16:00', day: 'Today', isLive: true, minute: 74, period: '2ND HALF',
      scoreHome: 2, scoreAway: 1,
      events: ARSENAL_EVENTS,
      formHome: form(3, 1, 0), formAway: form(2, 0, 2),
    }),
    fx({
      id: 'seed-ars-lee', home: 'Arsenal', away: 'Leeds United',
      h: 1.45, d: 4.5, a: 7.2,
      kickoff: '14:00', day: 'Today',
      formHome: form(3, 1, 0), formAway: form(1, 2, 1),
    }),
    fx({
      id: 'seed-liv-mci', home: 'Liverpool', away: 'Manchester City',
      h: 2.55, d: 3.7, a: 2.6,
      kickoff: '16:30', day: 'Sun',
      formHome: form(2, 2, 0), formAway: form(2, 1, 1),
    }),
    fx({
      id: 'seed-che-tot', home: 'Chelsea', away: 'Tottenham',
      h: 2.05, d: 3.55, a: 3.4,
      kickoff: '18:30', day: 'Today',
    }),
  ],
};

const GPL = {
  id: 'gpl',
  name: 'Ghana Premier League',
  short: 'GPL',
  country: 'Ghana',
  meta: 'MATCHDAY 14',
  crest: { style: 'background:linear-gradient(135deg,#ce1126,#fcd116);color:#fff', label: 'GPL' },
  matches: [
    fx({
      id: 'seed-kum-cap', home: 'Kumasi Royals', away: 'Cape Coast Stars',
      h: 1.69, d: 4.44, a: 8.12,
      kickoff: '16:30', day: 'Today',
    }),
    fx({
      id: 'seed-acc-tam', home: 'Accra Lions', away: 'Tamale City',
      h: 3.2, d: 4.44, a: 2.49,
      kickoff: '15:00', day: 'Today',
    }),
    fx({
      id: 'seed-ho-sun', home: 'Ho Warriors', away: 'Sunyani Kings',
      h: 2.58, d: 4.44, a: 3.07,
      kickoff: '17:04', day: 'Tomorrow',
    }),
  ],
};

const UCL = {
  id: 'ucl',
  name: 'UEFA Champions League',
  short: 'CL',
  country: 'Europe',
  meta: 'ROUND OF 16',
  crest: { style: 'background:linear-gradient(135deg,#003366,#ffd100);color:#fff', label: 'CL' },
  matches: [
    fx({
      id: 'seed-rma-fcb', home: 'Real Madrid', away: 'Bayern München',
      h: 2.15, d: 3.6, a: 3.1,
      kickoff: '19:45', day: 'Tomorrow',
    }),
    fx({
      id: 'seed-mci-int', home: 'Manchester City', away: 'Inter',
      h: 1.62, d: 4.1, a: 5.4,
      kickoff: '20:00', day: 'Tomorrow',
    }),
  ],
};

const VFL = {
  id: 'vfl',
  name: 'Virtual Football League',
  short: 'VFL',
  country: 'Global',
  meta: 'LIVE',
  crest: { style: 'background:linear-gradient(135deg,#0b3d2e,#00e676);color:#fff', label: 'VFL' },
  matches: [
    fx({
      id: 'seed-rbv-stv', home: 'Rapid Bay', away: 'Storm Valley',
      h: 2.45, d: 3.1, a: 2.9,
      kickoff: '', day: 'Live', isLive: true, minute: 38, period: '1ST HALF',
      scoreHome: 1, scoreAway: 1,
    }),
    fx({
      id: 'seed-nrt-ash', home: 'Northport', away: 'Ashford Rovers',
      h: 1.95, d: 3.4, a: 4.1,
      kickoff: '', day: 'Live', isLive: true, minute: 22, period: '1ST HALF',
      scoreHome: 0, scoreAway: 0,
    }),
  ],
};

/* ---- sport category counts from the Stitch side rail -------------------- */
export const SPORT_CATEGORIES = [
  { id: 'football', label: 'Football', icon: '⚽', count: 18 },
  { id: 'basketball', label: 'Basketball', icon: '🏀', count: 6 },
  { id: 'tennis', label: 'Tennis', icon: '🎾', count: 4 },
  { id: 'baseball', label: 'Baseball', icon: '⚾', count: 2 },
  { id: 'esports', label: 'Esports', icon: '🎮', count: 11 },
  { id: 'hockey', label: 'Ice Hockey', icon: '🏒', count: 3 },
  { id: 'boxing', label: 'Boxing', icon: '🥊', count: 5 },
  { id: 'tabletennis', label: 'Table Tennis', icon: '🏓', count: 9 },
];

export const MARKET_FILTERS = [
  { id: '1X2', label: '1X2' },
  { id: 'DC', label: 'Double Chance' },
  { id: 'OU25', label: 'Over/Under 2.5' },
  { id: 'BTTS', label: 'Both to Score' },
  { id: 'live', label: 'Live Now' },
];

export function seedSnapshot() {
  return {
    leagues: [EPL, GPL, UCL, VFL],
    seedSlip: null,
    _seed: true,
  };
}

/* ---- event momentum series ------------------------------------------------
   Fifteen 5-minute blocks. Each block carries the REAL share of pressure events
   (goals, penalties, free kicks, corners, shots) by team from the fixture's
   event feed — no synthetic waveform. Blocks with no events are flagged `empty`
   so the chart renders a neutral stub rather than inventing dominance. */
const PRESSURE_KINDS = new Set(['goal', 'penalty', 'free_kick', 'corner', 'shot']);

export function momentumBlocks(events = []) {
  const out = [];
  for (let i = 0; i < 15; i += 1) {
    const from = i * 5;
    const to = from + 5;
    const inBlock = (Array.isArray(events) ? events : []).filter((e) => {
      const m = Number(e.minute);
      return Number.isFinite(m) && m >= from && m < to && PRESSURE_KINDS.has(e.kind);
    });
    const home = inBlock.filter((e) => e.team === 'home').length;
    const away = inBlock.filter((e) => e.team === 'away').length;
    const total = home + away;
    out.push({
      from,
      to,
      home: total ? home / total : 0.5,
      empty: total === 0,
    });
  }
  return out;
}

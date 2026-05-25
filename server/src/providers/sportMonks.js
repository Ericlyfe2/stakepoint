/**
 * SportMonks — premium football data with advanced analytics.
 * Activate with SPORTMONKS_TOKEN. Endpoint shape per their v3 docs.
 */
import { Provider, fixtureKey } from './base.js';

export class SportMonksProvider extends Provider {
  constructor(token, base = 'https://api.sportmonks.com/v3/football') {
    super({
      id: 'sportMonks',
      label: 'SportMonks',
      enabled: !!token,
      sports: ['football'],
    });
    this.token = token;
    this.base = base;
  }

  async fetchFixtures() {
    if (!this.enabled) return [];
    const today = new Date().toISOString().slice(0, 10);
    const url = `${this.base}/fixtures/date/${today}?api_token=${this.token}&include=participants;league;scores`;
    const json = await this.http(url);
    return (json?.data || []).map((r) => normalise(r, this.id));
  }

  async fetchScores() {
    if (!this.enabled) return [];
    // /livescores/inplay returns ONLY currently-live fixtures (smaller payload,
    // tighter cadence than /livescores which spans a 3-day window). Richer
    // include set lets the normaliser surface the live clock from `periods`
    // and red-card counts from `events` — both consumed downstream by the
    // cash-out engine in services/oddsAggregator.js.
    const url = `${this.base}/livescores/inplay`
              + `?api_token=${this.token}`
              + `&include=participants;scores;periods;events;league.country;round`;
    const json = await this.http(url);
    return (json?.data || []).map((r) => {
      const fx = normalise(r, this.id);
      // Match the apiFootball provider's contract so the aggregator can dedup
      // red cards across both feeds with a single key.
      const reds = redCardCounts(r);
      fx.redCardsHome = reds.home;
      fx.redCardsAway = reds.away;
      fx.providerKey = fx.key;
      return fx;
    });
  }
}

function normalise(r, providerId) {
  const parts = r.participants || [];
  const homeP = parts.find((p) => p.meta?.location === 'home') || parts[0];
  const awayP = parts.find((p) => p.meta?.location === 'away') || parts[1];
  const home = homeP?.name;
  const away = awayP?.name;
  const kickoff = r.starting_at || r.starts_at;
  // SportMonks state taxonomy: 1=NS, 2=INPLAY_1H, 3=HT, 4=INPLAY_2H,
  // 5=FT, 6=AET, 7=PEN, 22=FT_AFTER_PEN, 25=AET_FT — anything ≥5 is finished.
  // INPLAY states (2,3,4) are the live window. /livescores/inplay only
  // returns rows in those states, so we read state_id directly instead of
  // depending on the older boolean `is_live` field (which v3 doesn't send).
  const sid = r.state_id ?? r.state?.id;
  const finished = sid >= 5;
  const isLive   = sid === 2 || sid === 3 || sid === 4;
  return {
    key: fixtureKey('football', home, away, kickoff),
    provider: providerId,
    sourceId: String(r.id),
    sport: 'football',
    league: {
      id: String(r.league_id || r.league?.id || ''),
      name: r.league?.name,
      country: r.league?.country?.name,
    },
    round: r.round?.name ?? null,
    home, away, kickoff,
    homeId: homeP?.id != null ? String(homeP.id) : null,
    awayId: awayP?.id != null ? String(awayP.id) : null,
    status: finished ? 'finished' : isLive ? 'live' : 'upcoming',
    scoreHome: pickScore(r.scores, 'home'),
    scoreAway: pickScore(r.scores, 'away'),
    minute: pickMinute(r.periods),
    updatedAt: new Date().toISOString(),
  };
}

// SportMonks event types: 14=Goal, 18=Sub, 19=Yellow, 20=Red, 21=YellowRed.
// Both 20 and 21 leave the player off the pitch, so we count both as a red.
// `rescinded === true` events should NOT count (VAR overturns happen live).
function redCardCounts(r) {
  const parts = r.participants || [];
  const homeId = parts.find((p) => p.meta?.location === 'home')?.id;
  const awayId = parts.find((p) => p.meta?.location === 'away')?.id;
  let home = 0, away = 0;
  for (const e of r.events || []) {
    if (e.rescinded === true) continue;
    const isRed = e.type_id === 20 || e.type_id === 21
                  || /redcard/i.test(e.addition || '');
    if (!isRed) continue;
    if (e.participant_id === homeId) home++;
    else if (e.participant_id === awayId) away++;
  }
  return { home, away };
}

// Use the ticking period as the live clock. If no period is ticking (e.g. HT)
// fall back to the highest `minutes` value seen so the UI shows the last
// observed minute rather than going blank.
function pickMinute(periods) {
  if (!Array.isArray(periods) || periods.length === 0) return null;
  const ticking = periods.find((p) => p.ticking);
  if (ticking?.minutes != null) return `${ticking.minutes}'`;
  const maxMin = periods.reduce((m, p) => Math.max(m, p.minutes || 0), 0);
  return maxMin > 0 ? `${maxMin}'` : null;
}

// SportMonks scores live as `{ description, score: { goals, participant } }`.
// The participant ('home' / 'away') is nested inside `score`, NOT a top-level
// field on the row — the previous version of this function looked at
// `s.participant` directly and silently returned null for every match.
function pickScore(scores, side) {
  if (!Array.isArray(scores)) return null;
  const row = scores.find(
    (s) => s.description === 'CURRENT' && s.score?.participant === side
  );
  return row?.score?.goals ?? null;
}

/**
 * football-data.org (v4).
 *
 * Free tier: 10 req/min, ~10 competitions including Premier League, La Liga,
 * Serie A, Bundesliga, Ligue 1, Champions League, EURO, World Cup. Auth is a
 * single `X-Auth-Token` header — sign up at https://www.football-data.org/client/register.
 *
 * Odds NOTE: the free tier does NOT include odds. /v4/matches returns an
 * `odds` stub like `{ msg: "Activate Odds-Package in User-Panel..." }`. This
 * provider therefore implements only fetchFixtures + fetchScores; fetchOdds
 * is a no-op for interface parity. Pair this provider with theOddsApi /
 * sharpApi / sportsGameOdds for live markets.
 *
 * Activate with FOOTBALL_DATA_TOKEN.
 */
import { Provider, fixtureKey } from './base.js';

export class FootballDataOrgProvider extends Provider {
  constructor(token, base = 'https://api.football-data.org/v4') {
    super({
      id: 'footballDataOrg',
      label: 'football-data.org',
      enabled: !!token,
      sports: ['football'],
    });
    this.token = token;
    this.base = base;
  }

  headers() {
    return { 'X-Auth-Token': this.token };
  }

  async fetchFixtures(sport = 'football') {
    if (!this.enabled || sport !== 'football') return [];
    // /v4/matches without filters defaults to "today" but the docs warn the
    // default window is unstable; passing dateFrom=dateTo=today is explicit
    // and survives provider-side default changes.
    const today = new Date().toISOString().slice(0, 10);
    const url = `${this.base}/matches?dateFrom=${today}&dateTo=${today}`;
    const json = await this.http(url, { headers: this.headers() });
    return (json?.matches || []).map((m) => normalise(m, this.id));
  }

  async fetchScores(sport = 'football') {
    if (!this.enabled || sport !== 'football') return [];
    // PAUSED covers half-time; LIVE and IN_PLAY are both used by the provider
    // (semantics overlap, but both appear in the wild).
    const url = `${this.base}/matches?status=LIVE,IN_PLAY,PAUSED`;
    const json = await this.http(url, { headers: this.headers() });
    return (json?.matches || []).map((m) => normalise(m, this.id));
  }

  // No-op: see file header for why. Adding paid odds later means hitting
  // /v4/matches/{id} per fixture and parsing the `odds` block.
  async fetchOdds() { return []; }
}

function normalise(m, providerId) {
  const home = m.homeTeam?.name;
  const away = m.awayTeam?.name;
  const kickoff = m.utcDate;
  const status = String(m.status || '').toUpperCase();
  // Status taxonomy from football-data.org v4 docs:
  //   SCHEDULED | TIMED | IN_PLAY | PAUSED | FINISHED | SUSPENDED |
  //   POSTPONED | CANCELLED | AWARDED | LIVE
  // FINISHED and AWARDED both terminate the match; LIVE/IN_PLAY/PAUSED are
  // the in-play window.
  const finished = status === 'FINISHED' || status === 'AWARDED';
  const live     = status === 'LIVE' || status === 'IN_PLAY' || status === 'PAUSED';
  const finalScore = m.score?.fullTime || {};
  const liveScore  = m.score?.halfTime || {}; // only useful when not yet finished
  const sh = Number.isFinite(finalScore.home) ? finalScore.home
           : Number.isFinite(liveScore.home)  ? liveScore.home
           : null;
  const sa = Number.isFinite(finalScore.away) ? finalScore.away
           : Number.isFinite(liveScore.away)  ? liveScore.away
           : null;
  return {
    key: fixtureKey('football', home, away, kickoff),
    provider: providerId,
    sourceId: String(m.id),
    sport: 'football',
    league: {
      id: String(m.competition?.id || ''),
      name: m.competition?.name,
      country: m.area?.name,
    },
    home, away, kickoff,
    homeId: m.homeTeam?.id != null ? String(m.homeTeam.id) : null,
    awayId: m.awayTeam?.id != null ? String(m.awayTeam.id) : null,
    status: finished ? 'finished' : live ? 'live' : 'upcoming',
    scoreHome: sh,
    scoreAway: sa,
    // football-data.org doesn't expose a running minute on the matches list
    // endpoint. /v4/matches/{id} returns `minute`; we read it if present but
    // accept null otherwise.
    minute: m.minute != null ? `${m.minute}'` : null,
    updatedAt: m.lastUpdated || new Date().toISOString(),
  };
}

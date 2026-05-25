/**
 * API Football (api-football.com / RapidAPI).
 * Provides fixtures, live scores, stats, standings, predictions.
 *
 * Two host modes — same JSON shape, different URL layout:
 *   - Direct API-Sports:  host = v3.football.api-sports.io   (paths: /fixtures, /odds, …)
 *   - RapidAPI gateway:   host = api-football-v1.p.rapidapi.com (paths: /v3/fixtures, /v3/odds, …)
 * Both accept the same x-rapidapi-key / x-rapidapi-host header pair, so the
 * only thing that differs is the base path. We detect the gateway by suffix
 * and prepend /v3 automatically — callers below stay path-agnostic.
 *
 * Activate with APIFOOTBALL_KEY. Override the host with APIFOOTBALL_HOST.
 */
import { Provider, fixtureKey } from './base.js';

export class ApiFootballProvider extends Provider {
  constructor(apiKey, host = 'v3.football.api-sports.io') {
    super({
      id: 'apiFootball',
      label: 'API Football',
      enabled: !!apiKey,
      sports: ['football'],
    });
    this.apiKey = apiKey;
    this.host = host;
    // RapidAPI gateway mounts the v3 namespace one level deeper than the
    // direct host does, so paths like /fixtures must become /v3/fixtures.
    this.basePath = host.endsWith('.rapidapi.com') ? '/v3' : '';
  }

  headers() {
    return {
      'x-rapidapi-key': this.apiKey,
      'x-rapidapi-host': this.host,
    };
  }

  url(path) {
    return `https://${this.host}${this.basePath}${path}`;
  }

  async fetchFixtures(sport = 'football') {
    if (!this.enabled || sport !== 'football') return [];
    const today = new Date().toISOString().slice(0, 10);
    const json = await this.http(this.url(`/fixtures?date=${today}`), { headers: this.headers() });
    return (json?.response || []).map((r) => normaliseFixture(r, this.id));
  }

  async fetchScores(sport = 'football') {
    if (!this.enabled || sport !== 'football') return [];
    const json = await this.http(this.url('/fixtures?live=all'), { headers: this.headers() });
    return (json?.response || []).map((r) => {
      const fx = normaliseFixture(r, this.id);
      const reds = (r.events || []).filter((e) => e.type === 'Card' && e.detail === 'Red Card');
      fx.redCardsHome = reds.filter((e) => e.team?.id === r.teams?.home?.id).length;
      fx.redCardsAway = reds.filter((e) => e.team?.id === r.teams?.away?.id).length;
      fx.providerKey = fx.key;
      return fx;
    });
  }

  async fetchOdds(sport = 'football', opts = {}) {
    if (!this.enabled || sport !== 'football') return [];
    const path = opts.live
      ? '/odds/live'
      : `/odds?date=${new Date().toISOString().slice(0, 10)}`;
    const json = await this.http(this.url(path), { headers: this.headers() });
    return (json?.response || []).map((r) => normaliseOdds(r, this.id));
  }
}

function normaliseFixture(r, providerId) {
  const home = r.teams?.home?.name;
  const away = r.teams?.away?.name;
  const kickoff = r.fixture?.date;
  const status = r.fixture?.status?.short || '';
  const isLive   = ['1H', 'HT', '2H', 'ET', 'P', 'LIVE'].includes(status);
  const finished = ['FT', 'AET', 'PEN'].includes(status);
  return {
    key: fixtureKey('football', home, away, kickoff),
    provider: providerId,
    sourceId: String(r.fixture?.id || ''),
    sport: 'football',
    league: { id: String(r.league?.id || ''), name: r.league?.name, country: r.league?.country },
    home, away, kickoff,
    status: finished ? 'finished' : isLive ? 'live' : 'upcoming',
    minute: r.fixture?.status?.elapsed ? `${r.fixture.status.elapsed}'` : null,
    scoreHome: r.goals?.home ?? null,
    scoreAway: r.goals?.away ?? null,
    updatedAt: new Date().toISOString(),
  };
}

function normaliseOdds(r, providerId) {
  // Build canonical fixture key the same way fetchFixtures does, so odds
  // join with fixtures via key.
  const home = r?.teams?.home?.name || r?.fixture?.home || '';
  const away = r?.teams?.away?.name || r?.fixture?.away || '';
  const date = r?.fixture?.date || '';
  const key  = fixtureKey('football', home, away, date);

  const markets = {};

  // api-football returns a list of bookmakers; we fold every supported bet
  // type from every bookmaker into one canonical market, keeping the highest
  // odds per selection (the aggregator further merges across providers).
  for (const bm of r?.bookmakers || []) {
    const bookmakerName = bm?.name || (bm?.id != null ? String(bm.id) : 'apiFootball');
    for (const bet of bm?.bets || []) {
      const name = String(bet?.name || '').toLowerCase();

      // Match Winner -> 1X2
      if (name === 'match winner' || name === '1x2' || name === 'fulltime result') {
        const m = markets['1X2'] = markets['1X2'] || { name: 'Match Winner', selections: [] };
        for (const v of bet?.values || []) {
          const value = String(v?.value || '').toLowerCase();
          const odds  = Number(v?.odd);
          if (!Number.isFinite(odds)) continue;
          let selKey = null, label = null;
          if (value === 'home' || value === '1') { selKey = '1'; label = 'Home'; }
          else if (value === 'draw' || value === 'x') { selKey = 'X'; label = 'Draw'; }
          else if (value === 'away' || value === '2') { selKey = '2'; label = 'Away'; }
          if (!selKey) continue;
          upsertSelection(m.selections, selKey, label, odds, bookmakerName);
        }
        continue;
      }

      // Goals Over/Under (only the 2.5 line goes into OU25)
      if (name === 'goals over/under' || name === 'over/under') {
        const m = markets['OU25'] = markets['OU25'] || { name: 'Over/Under 2.5', selections: [] };
        for (const v of bet?.values || []) {
          const value = String(v?.value || '').toLowerCase();
          const odds  = Number(v?.odd);
          if (!Number.isFinite(odds)) continue;
          if (value === 'over 2.5')  upsertSelection(m.selections, 'Over',  'Over 2.5',  odds, bookmakerName);
          if (value === 'under 2.5') upsertSelection(m.selections, 'Under', 'Under 2.5', odds, bookmakerName);
        }
        continue;
      }

      // Both Teams to Score -> BTTS
      if (name === 'both teams to score' || name === 'both teams score' || name === 'btts') {
        const m = markets['BTTS'] = markets['BTTS'] || { name: 'Both Teams to Score', selections: [] };
        for (const v of bet?.values || []) {
          const value = String(v?.value || '').toLowerCase();
          const odds  = Number(v?.odd);
          if (!Number.isFinite(odds)) continue;
          if (value === 'yes') upsertSelection(m.selections, 'Yes', 'Yes', odds, bookmakerName);
          if (value === 'no')  upsertSelection(m.selections, 'No',  'No',  odds, bookmakerName);
        }
        continue;
      }

      // Other markets are ignored in v1 — markets-expansion is its own
      // spec. Adding more markets here later is mechanical.
    }
  }

  return {
    key,
    sourceId: String(r?.fixture?.id || ''),
    provider: providerId,
    markets,
    updatedAt: new Date().toISOString(),
  };
}

function upsertSelection(arr, key, label, odds, bookmaker) {
  const existing = arr.find((s) => s.key === key);
  if (!existing) { arr.push({ key, label, odds, bookmaker }); return; }
  if (odds > existing.odds) { existing.odds = odds; existing.bookmaker = bookmaker; }
}

/**
 * Server-match → design-match adapter.
 *
 * The Oddsify backend returns matches with a nested markets shape:
 *   match.markets['1X2'].selections[] = [{ key:'1', odds:1.42 }, ...]
 *
 * The design components (ported from Oddsify.html) expect a flat shape:
 *   match.odds = { '1': 1.42, 'X': 4.2, '2': 7.5 }
 *
 * This adapter keeps the design component code untouched while letting pages
 * pull straight from the live `/api/bet/matches` response. It also unifies
 * the score field names (server: scoreHome/scoreAway, design: scoreH/scoreA).
 */
export function normalizeMatch(m, leagueName = '') {
  if (!m) return null;
  const market = m.markets?.['1X2'];
  const flatOdds = {};
  if (market?.selections) {
    for (const sel of market.selections) flatOdds[sel.key] = sel.odds;
  }
  return {
    id: m.id,
    home: m.home,
    away: m.away,
    isLive: !!m.isLive,
    minute: m.minute,
    scoreH: m.scoreHome ?? m.scoreH,
    scoreA: m.scoreAway ?? m.scoreA,
    day: m.day,
    time: m.kickoff || m.time,
    odds: flatOdds,
    market: '1X2',
    marketCount: m.extraMarketCount,
    sport: m.sport,
    featured: m.featured,
    leagueName,
    league: leagueName?.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase() || '—',
  };
}

/**
 * Flatten the leagues response into a single sorted match list and tag each
 * with its parent league name.
 */
export function flattenLeagues(payload) {
  if (!payload?.leagues) return [];
  return payload.leagues.flatMap(l =>
    (l.matches || []).map(m => normalizeMatch(m, l.name))
  );
}

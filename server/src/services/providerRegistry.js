/**
 * Provider registry. Single source of truth for "which adapters exist and
 * are turned on right now". The rest of the system never imports a provider
 * directly — it asks the registry.
 *
 * Adding a new provider is one import + one entry below.
 */
import { TheOddsApiProvider }      from '../providers/theOddsApi.js';
import { ApiFootballProvider }     from '../providers/apiFootball.js';
import { SportMonksProvider }      from '../providers/sportMonks.js';
import { SharpApiProvider }        from '../providers/sharpApi.js';
import { SportsGameOddsProvider }  from '../providers/sportsGameOdds.js';
import { FootballDataOrgProvider } from '../providers/footballDataOrg.js';

const env = process.env;

const _providers = [
  new TheOddsApiProvider(env.ODDS_API_KEY || ''),
  new ApiFootballProvider(
    env.APIFOOTBALL_KEY || env.APIFOOTBALL_TOKEN || '',
    env.APIFOOTBALL_HOST || 'v3.football.api-sports.io',
  ),
  new SportMonksProvider(env.SPORTMONKS_TOKEN || env.SPORTMONKS_KEY || ''),
  new SharpApiProvider(env.SHARPAPI_KEY || ''),
  new SportsGameOddsProvider(env.SPORTSGAMEODDS_KEY || ''),
  new FootballDataOrgProvider(env.FOOTBALL_DATA_TOKEN || ''),
];

export function listProviders() { return _providers; }
export function enabledProviders() { return _providers.filter((p) => p.enabled); }
export function getProvider(id) { return _providers.find((p) => p.id === id) || null; }
export function providersHealth() { return _providers.map((p) => p.health()); }

/**
 * Fetch live in-play odds across all enabled providers. Each provider
 * decides whether it supports live; non-supporting providers return [].
 * Errors are isolated per provider so one bad upstream doesn't blank the feed.
 */
export async function fetchLiveOddsAll(sport = 'football') {
  const results = await Promise.all(
    enabledProviders().map((p) =>
      Promise.resolve(p.fetchOdds(sport, { live: true })).catch(() => [])
    )
  );
  return results.flat();
}

/**
 * Fetch live scores across all enabled providers. Same isolation contract.
 */
export async function fetchLiveScoresAll(sport = 'football') {
  const results = await Promise.all(
    enabledProviders().map((p) =>
      Promise.resolve(p.fetchScores(sport)).catch(() => [])
    )
  );
  return results.flat();
}

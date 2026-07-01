import { createStore } from './store.js';

const store = createStore('market_templates', []);

const DEFAULT_TEMPLATES = [
  { key: '1X2',    name: 'Match Result',       sport: 'football', description: 'Pick the final outcome — Home Win, Draw, or Away Win.', selections: [{ key: '1', label: 'Home', defaultOdds: 2.10 }, { key: 'X', label: 'Draw', defaultOdds: 3.40 }, { key: '2', label: 'Away', defaultOdds: 3.50 }], sort: 1, active: true, icon: 'trophy' },
  { key: 'DC',     name: 'Double Chance',       sport: 'football', description: 'Cover two out of three outcomes.', selections: [{ key: '1X', label: 'Home or Draw', defaultOdds: 1.30 }, { key: '12', label: 'Home or Away', defaultOdds: 1.25 }, { key: 'X2', label: 'Draw or Away', defaultOdds: 1.35 }], sort: 2, active: true, icon: 'layers' },
  { key: 'DNB',    name: 'Draw No Bet',         sport: 'football', description: 'If the match ends in a draw, your stake is returned.', selections: [{ key: '1', label: 'Home', defaultOdds: 1.55 }, { key: '2', label: 'Away', defaultOdds: 2.40 }], sort: 3, active: true, icon: 'shield' },
  { key: 'OU05',   name: 'Over/Under 0.5',      sport: 'football', description: 'Will there be at least 1 goal?', selections: [{ key: 'Over', label: 'Over 0.5', defaultOdds: 1.10 }, { key: 'Under', label: 'Under 0.5', defaultOdds: 6.50 }], sort: 4, active: true, icon: 'trending-up' },
  { key: 'OU15',   name: 'Over/Under 1.5',      sport: 'football', description: 'Will there be at least 2 goals?', selections: [{ key: 'Over', label: 'Over 1.5', defaultOdds: 1.70 }, { key: 'Under', label: 'Under 1.5', defaultOdds: 2.10 }], sort: 5, active: true, icon: 'trending-up' },
  { key: 'OU25',   name: 'Over/Under 2.5',      sport: 'football', description: 'Will there be at least 3 goals?', selections: [{ key: 'Over', label: 'Over 2.5', defaultOdds: 2.00 }, { key: 'Under', label: 'Under 2.5', defaultOdds: 1.80 }], sort: 6, active: true, icon: 'trending-up' },
  { key: 'OU35',   name: 'Over/Under 3.5',      sport: 'football', description: 'Will there be at least 4 goals?', selections: [{ key: 'Over', label: 'Over 3.5', defaultOdds: 3.20 }, { key: 'Under', label: 'Under 3.5', defaultOdds: 1.35 }], sort: 7, active: true, icon: 'trending-up' },
  { key: 'OU45',   name: 'Over/Under 4.5',      sport: 'football', description: 'Will there be at least 5 goals?', selections: [{ key: 'Over', label: 'Over 4.5', defaultOdds: 5.50 }, { key: 'Under', label: 'Under 4.5', defaultOdds: 1.15 }], sort: 8, active: true, icon: 'trending-up' },
  { key: 'BTTS',   name: 'Both Teams to Score', sport: 'football', description: 'Will both teams score at least one goal?', selections: [{ key: 'Yes', label: 'Yes', defaultOdds: 2.00 }, { key: 'No', label: 'No', defaultOdds: 1.80 }], sort: 9, active: true, icon: 'target' },
  { key: 'AH1',    name: 'Asian Handicap ±1',   sport: 'football', description: 'Level the playing field with a 1-goal handicap.', selections: [{ key: 'H-1', label: 'Home –1', defaultOdds: 2.50 }, { key: 'A+1', label: 'Away +1', defaultOdds: 1.50 }], sort: 10, active: true, icon: 'minus' },
  { key: '1H1X2',  name: '1st Half Result',     sport: 'football', description: 'Pick the half-time result.', selections: [{ key: '1', label: 'Home', defaultOdds: 2.50 }, { key: 'X', label: 'Draw', defaultOdds: 2.00 }, { key: '2', label: 'Away', defaultOdds: 3.40 }], sort: 11, active: true, icon: 'clock' },
  { key: '1HOU05', name: '1st Half O/U 0.5',    sport: 'football', description: 'Will there be a goal in the first half?', selections: [{ key: 'Over', label: 'Over 0.5', defaultOdds: 1.50 }, { key: 'Under', label: 'Under 0.5', defaultOdds: 2.60 }], sort: 12, active: true, icon: 'clock' },
  { key: '1HBTTS', name: '1st Half BTTS',       sport: 'football', description: 'Will both teams score in the first half?', selections: [{ key: 'Yes', label: 'Yes', defaultOdds: 3.50 }, { key: 'No', label: 'No', defaultOdds: 1.30 }], sort: 13, active: true, icon: 'clock' },
  { key: 'HTFT',   name: 'HT/FT Double',        sport: 'football', description: 'Predict the half-time AND full-time result.', selections: [{ key: '1/1', label: 'Home / Home', defaultOdds: 3.50 }, { key: '1/X', label: 'Home / Draw', defaultOdds: 15.00 }, { key: '1/2', label: 'Home / Away', defaultOdds: 40.00 }, { key: 'X/1', label: 'Draw / Home', defaultOdds: 4.50 }, { key: 'X/X', label: 'Draw / Draw', defaultOdds: 5.00 }, { key: 'X/2', label: 'Draw / Away', defaultOdds: 12.00 }, { key: '2/1', label: 'Away / Home', defaultOdds: 40.00 }, { key: '2/X', label: 'Away / Draw', defaultOdds: 15.00 }, { key: '2/2', label: 'Away / Away', defaultOdds: 5.50 }], sort: 14, active: true, icon: 'repeat' },
  { key: 'CS',     name: 'Correct Score',       sport: 'football', description: 'Predict the exact final score.', selections: [
      { key: '1-0', label: '1-0', defaultOdds: 11.00 }, { key: '2-0', label: '2-0', defaultOdds: 24.00 }, { key: '2-1', label: '2-1', defaultOdds: 15.00 },
      { key: '3-0', label: '3-0', defaultOdds: 75.00 }, { key: '3-1', label: '3-1', defaultOdds: 50.00 }, { key: '3-2', label: '3-2', defaultOdds: 60.00 },
      { key: '4-0', label: '4-0', defaultOdds: 250.00 }, { key: '4-1', label: '4-1', defaultOdds: 200.00 }, { key: '4-2', label: '4-2', defaultOdds: 250.00 }, { key: '4-3', label: '4-3', defaultOdds: 250.00 },
      { key: '0-0', label: '0-0', defaultOdds: 9.75 }, { key: '1-1', label: '1-1', defaultOdds: 7.00 }, { key: '2-2', label: '2-2', defaultOdds: 19.00 }, { key: '3-3', label: '3-3', defaultOdds: 120.00 }, { key: '4-4', label: '4-4', defaultOdds: 250.00 },
      { key: '0-1', label: '0-1', defaultOdds: 6.50 }, { key: '0-2', label: '0-2', defaultOdds: 8.25 }, { key: '1-2', label: '1-2', defaultOdds: 9.00 },
      { key: '0-3', label: '0-3', defaultOdds: 15.50 }, { key: '1-3', label: '1-3', defaultOdds: 17.00 }, { key: '2-3', label: '2-3', defaultOdds: 35.00 },
      { key: '0-4', label: '0-4', defaultOdds: 40.00 }, { key: '1-4', label: '1-4', defaultOdds: 45.00 }, { key: '2-4', label: '2-4', defaultOdds: 80.00 }, { key: '3-4', label: '3-4', defaultOdds: 90.00 },
      { key: 'OTHER', label: 'Any Other', defaultOdds: 33.00 },
    ], sort: 15, active: true, icon: 'grid' },
  { key: 'WINBTTS', name: 'Result & BTTS',      sport: 'football', description: 'Combine match result with both teams to score.', selections: [{ key: '1Y', label: 'Home & Yes', defaultOdds: 5.00 }, { key: '1N', label: 'Home & No', defaultOdds: 4.00 }, { key: 'XY', label: 'Draw & Yes', defaultOdds: 4.50 }, { key: 'XN', label: 'Draw & No', defaultOdds: 6.00 }, { key: '2Y', label: 'Away & Yes', defaultOdds: 7.00 }, { key: '2N', label: 'Away & No', defaultOdds: 5.00 }], sort: 16, active: true, icon: 'layers' },
  { key: 'WINOU25', name: 'Result & O/U 2.5',   sport: 'football', description: 'Combine match result with over/under 2.5 goals.', selections: [{ key: '1O', label: 'Home & Over', defaultOdds: 5.50 }, { key: '1U', label: 'Home & Under', defaultOdds: 4.50 }, { key: 'XO', label: 'Draw & Over', defaultOdds: 6.00 }, { key: 'XU', label: 'Draw & Under', defaultOdds: 5.00 }, { key: '2O', label: 'Away & Over', defaultOdds: 8.00 }, { key: '2U', label: 'Away & Under', defaultOdds: 6.00 }], sort: 17, active: true, icon: 'layers' },
  { key: 'ML',     name: 'Money Line',          sport: 'basketball', description: 'Pick the outright winner.', selections: [{ key: '1', label: 'Home', defaultOdds: 1.90 }, { key: '2', label: 'Away', defaultOdds: 1.90 }], sort: 18, active: true, icon: 'trophy' },
  { key: 'TP',     name: 'Total Points',        sport: 'basketball', description: 'Over/under on total points scored.', selections: [{ key: 'Over', label: 'Over', defaultOdds: 1.90 }, { key: 'Under', label: 'Under', defaultOdds: 1.90 }], sort: 19, active: true, icon: 'trending-up' },
  { key: 'HCAP',   name: 'Handicap',            sport: 'basketball', description: 'Point spread betting.', selections: [{ key: '1H', label: 'Home Handicap', defaultOdds: 1.90 }, { key: '2H', label: 'Away Handicap', defaultOdds: 1.90 }], sort: 20, active: true, icon: 'minus' },
];

export function seedMarketTemplates() {
  const existing = store.all();
  if (existing && Object.keys(existing).length > 0) return;
  for (const tpl of DEFAULT_TEMPLATES) {
    store.set(tpl.key, tpl);
  }
}

export function listMarketTemplates() {
  const all = store.all() || {};
  return Object.values(all).sort((a, b) => (a.sort || 99) - (b.sort || 99));
}

export function getMarketTemplate(key) {
  return store.get(key) || null;
}

export function createMarketTemplate(data) {
  store.set(data.key, { ...data, active: data.active !== false });
  return store.get(data.key);
}

export function updateMarketTemplate(key, patch) {
  const existing = store.get(key);
  if (!existing) return null;
  const updated = { ...existing, ...patch, key };
  store.set(key, updated);
  return updated;
}

export function deleteMarketTemplate(key) {
  return store.del(key);
}

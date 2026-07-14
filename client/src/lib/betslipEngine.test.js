import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatAmt,
  parseStake,
  generateId,
  pickLabel,
  matchMeta,
  marketName,
  buildSelection,
  isDuplicate,
  findSelection,
  computeSinglePayout,
  computeMultipleOdds,
  computeMultiplePayout,
  computeTotalOdds,
  validateBetSlip,
} from './betslipEngine.js';

const mockMatch = {
  id: 'match-1',
  home: 'Arsenal',
  away: 'Chelsea',
  competition: 'Premier League',
  isLive: false,
  kickoff: '20:00',
  day: 'Sat',
};

const mockLiveMatch = {
  id: 'match-2',
  home: 'Liverpool',
  away: 'Man City',
  competition: 'Premier League',
  isLive: true,
  minute: 73,
};

describe('formatAmt', () => {
  test('formats zero', () => {
    assert.equal(formatAmt(0), '0.00');
  });
  test('formats integer', () => {
    assert.equal(formatAmt(1000), '1,000.00');
  });
  test('formats decimal', () => {
    assert.equal(formatAmt(1234.56), '1,234.56');
  });
  test('handles null/undefined', () => {
    assert.equal(formatAmt(null), '0.00');
    assert.equal(formatAmt(undefined), '0.00');
  });
  test('handles string input', () => {
    assert.equal(formatAmt('500.5'), '500.50');
  });
});

describe('parseStake', () => {
  test('parses normal number string', () => {
    assert.equal(parseStake('400'), 400);
  });
  test('parses decimal string', () => {
    assert.equal(parseStake('100.50'), 100.5);
  });
  test('returns 0 for empty string', () => {
    assert.equal(parseStake(''), 0);
  });
  test('returns 0 for garbage', () => {
    assert.equal(parseStake('abc'), 0);
  });
  test('removes commas', () => {
    assert.equal(parseStake('1,000'), 1000);
  });
  test('clamps negative to 0', () => {
    assert.equal(parseStake('-50'), 0);
  });
  test('handles number type', () => {
    assert.equal(parseStake(400), 400);
  });
});

describe('generateId', () => {
  test('returns a string starting with sel-', () => {
    const id = generateId();
    assert.ok(id.startsWith('sel-'));
  });
  test('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    assert.equal(ids.size, 100);
  });
});

describe('pickLabel', () => {
  const m = { home: 'Arsenal', away: 'Chelsea' };

  test('1X2 - home', () => {
    assert.equal(pickLabel('1X2', '1', m), 'Arsenal to win');
  });
  test('1X2 - draw', () => {
    assert.equal(pickLabel('1X2', 'X', m), 'Draw');
  });
  test('1X2 - away', () => {
    assert.equal(pickLabel('1X2', '2', m), 'Chelsea to win');
  });
  test('1H1X2 - home', () => {
    assert.equal(pickLabel('1H1X2', '1', m), '1H Arsenal to win');
  });
  test('ML - home', () => {
    assert.equal(pickLabel('ML', '1', m), 'Arsenal to win');
  });
  test('OU25 - over', () => {
    assert.equal(pickLabel('OU25', 'Over', m), 'Over 2.5 Goals');
  });
  test('OU25 - under', () => {
    assert.equal(pickLabel('OU25', 'Under', m), 'Under 2.5 Goals');
  });
  test('DC - 1X', () => {
    assert.equal(pickLabel('DC', '1X', m), 'Arsenal or Draw');
  });
  test('DC - X2', () => {
    assert.equal(pickLabel('DC', 'X2', m), 'Draw or Chelsea');
  });
  test('DC - 12', () => {
    assert.equal(pickLabel('DC', '12', m), 'Arsenal or Chelsea');
  });
  test('DNB - home', () => {
    assert.equal(pickLabel('DNB', '1', m), 'Draw No Bet - Arsenal');
  });
  test('DNB - away', () => {
    assert.equal(pickLabel('DNB', '2', m), 'Draw No Bet - Chelsea');
  });
  test('BTTS - yes', () => {
    assert.equal(pickLabel('BTTS', 'Yes', m), 'Both Teams To Score - Yes');
  });
  test('BTTS - no', () => {
    assert.equal(pickLabel('BTTS', 'No', m), 'Both Teams To Score - No');
  });
  test('CS', () => {
    assert.equal(pickLabel('CS', '1-0', m), 'Correct Score 1 - 0');
  });
  test('CS - OTHER', () => {
    assert.equal(pickLabel('CS', 'OTHER', m), 'Correct Score Any Other');
  });
  test('HTFT', () => {
    assert.equal(pickLabel('HTFT', '1/1', m), 'HT/FT - Arsenal / Arsenal');
  });
  test('AH1', () => {
    assert.equal(pickLabel('AH1', 'H-1', m), 'Arsenal -1');
    assert.equal(pickLabel('AH1', 'A+1', m), 'Chelsea +1');
  });
  test('WINBTTS', () => {
    const r = pickLabel('WINBTTS', '1Y', m);
    assert.ok(r.includes('Arsenal'));
    assert.ok(r.includes('BTTS Yes'));
  });
  test('WINOU25', () => {
    const r = pickLabel('WINOU25', '2O', m);
    assert.ok(r.includes('Chelsea'));
    assert.ok(r.includes('Over 2.5'));
  });
  test('BTTSOU25', () => {
    const r = pickLabel('BTTSOU25', 'YU', m);
    assert.ok(r.includes('BTTS Yes'));
    assert.ok(r.includes('Under 2.5'));
  });
  test('unknown market falls through', () => {
    assert.equal(pickLabel('UNKNOWN', 'X', m), 'UNKNOWN - X');
  });
});

describe('matchMeta', () => {
  test('non-live match', () => {
    assert.equal(matchMeta(mockMatch), 'Arsenal vs Chelsea - 20:00 Sat');
  });
  test('live match', () => {
    assert.equal(matchMeta(mockLiveMatch), 'Liverpool vs Man City - LIVE 73');
  });
});

describe('marketName', () => {
  test('known markets', () => {
    assert.equal(marketName('1X2'), 'Match Result');
    assert.equal(marketName('DC'), 'Double Chance');
    assert.equal(marketName('BTTS'), 'Both Teams To Score');
    assert.equal(marketName('OU25'), 'Total Goals Over/Under 2.5');
    assert.equal(marketName('CS'), 'Correct Score');
    assert.equal(marketName('HTFT'), 'Half Time / Full Time');
    assert.equal(marketName('DNB'), 'Draw No Bet');
    assert.equal(marketName('AH1'), 'Asian Handicap +/-1');
  });
  test('unknown market returns key', () => {
    assert.equal(marketName('NONEXISTENT'), 'NONEXISTENT');
  });
});

describe('buildSelection', () => {
  test('builds a complete selection object', () => {
    const s = buildSelection(mockMatch, '1X2', '1', 1.5);
    assert.ok(s.id.startsWith('sel-'));
    assert.equal(s.matchId, 'match-1');
    assert.equal(s.market, '1X2');
    assert.equal(s.outcome, '1');
    assert.equal(s.odds, 1.5);
    assert.equal(s.pickLabel, 'Arsenal to win');
    assert.equal(s.marketLabel, 'Match Result');
    assert.equal(s.meta, 'Arsenal vs Chelsea - 20:00 Sat');
    assert.equal(s.home, 'Arsenal');
    assert.equal(s.away, 'Chelsea');
    assert.equal(s.isLive, false);
    assert.equal(s.trend, null);
    assert.equal(s.stale, false);
    assert.equal(s.locked, false);
  });

  test('builds a live selection', () => {
    const s = buildSelection(mockLiveMatch, '1X2', '1', 2.1);
    assert.equal(s.isLive, true);
    assert.ok(s.meta.includes('LIVE'));
  });
});

describe('isDuplicate', () => {
  const selections = [
    { matchId: 'm1', market: '1X2', outcome: '1' },
    { matchId: 'm1', market: '1X2', outcome: 'X' },
  ];

  test('detects duplicate', () => {
    assert.ok(isDuplicate(selections, 'm1', '1X2', '1'));
  });
  test('different outcome is not duplicate', () => {
    assert.ok(!isDuplicate(selections, 'm1', '1X2', '2'));
  });
  test('different match is not duplicate', () => {
    assert.ok(!isDuplicate(selections, 'm2', '1X2', '1'));
  });
  test('different market is not duplicate', () => {
    assert.ok(!isDuplicate(selections, 'm1', 'DC', '1'));
  });
});

describe('findSelection', () => {
  const selections = [
    { matchId: 'm1', market: '1X2', outcome: '1', odds: 2.0 },
  ];

  test('finds existing selection', () => {
    const found = findSelection(selections, 'm1', '1X2', '1');
    assert.ok(found);
    assert.equal(found.odds, 2.0);
  });
  test('returns undefined for missing', () => {
    assert.equal(findSelection(selections, 'm1', '1X2', '2'), undefined);
  });
});

describe('computeSinglePayout', () => {
  test('simple calculation', () => {
    assert.equal(computeSinglePayout(2.0, 100), 200);
  });
  test('zero stake', () => {
    assert.equal(computeSinglePayout(2.0, 0), 0);
  });
});

describe('computeMultipleOdds', () => {
  test('two selections', () => {
    const s = [{ odds: 2.0 }, { odds: 3.0 }];
    assert.equal(computeMultipleOdds(s), 6.0);
  });
  test('three selections', () => {
    const s = [{ odds: 1.5 }, { odds: 2.0 }, { odds: 4.0 }];
    assert.equal(computeMultipleOdds(s), 12.0);
  });
  test('empty returns 0', () => {
    assert.equal(computeMultipleOdds([]), 0);
  });
  test('single selection', () => {
    const s = [{ odds: 2.5 }];
    assert.equal(computeMultipleOdds(s), 2.5);
  });
});

describe('computeMultiplePayout', () => {
  test('includes 8% bonus', () => {
    const s = [{ odds: 2.0 }, { odds: 3.0 }];
    const payout = computeMultiplePayout(s, 100);
    assert.equal(payout, 100 * 6.0 * 1.08);
  });
});

describe('computeTotalOdds', () => {
  test('matches computeMultipleOdds', () => {
    const s = [{ odds: 2.0 }, { odds: 4.0 }];
    assert.equal(computeTotalOdds(s), computeMultipleOdds(s));
  });
});

describe('validateBetSlip', () => {
  const account = { balance: 1000 };

  test('empty selections', () => {
    const errors = validateBetSlip({ selections: [], betMode: 'multiple', stakes: {}, account, minStake: 300 });
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes('Add at least one'));
  });

  test('multiple mode with 1 selection', () => {
    const errors = validateBetSlip({
      selections: [{ id: 's1', matchId: 'm1' }],
      betMode: 'multiple',
      stakes: { multiple: 400 },
      account,
      minStake: 300,
    });
    assert.ok(errors.some((e) => e.includes('at least 2 selections')));
  });

  test('multiple mode - no stake', () => {
    const errors = validateBetSlip({
      selections: [{ id: 's1', matchId: 'm1' }, { id: 's2', matchId: 'm2' }],
      betMode: 'multiple',
      stakes: { multiple: 0 },
      account,
      minStake: 300,
    });
    assert.ok(errors.some((e) => e.includes('stake amount')));
  });

  test('multiple mode - below minimum', () => {
    const errors = validateBetSlip({
      selections: [{ id: 's1', matchId: 'm1' }, { id: 's2', matchId: 'm2' }],
      betMode: 'multiple',
      stakes: { multiple: 100 },
      account,
      minStake: 300,
    });
    assert.ok(errors.some((e) => e.includes('Minimum stake')));
  });

  test('multiple mode - valid', () => {
    const errors = validateBetSlip({
      selections: [{ id: 's1', matchId: 'm1' }, { id: 's2', matchId: 'm2' }],
      betMode: 'multiple',
      stakes: { multiple: 400 },
      account,
      minStake: 300,
    });
    assert.equal(errors.length, 0);
  });

  test('single mode - missing stake for selection', () => {
    const errors = validateBetSlip({
      selections: [{ id: 's1', matchId: 'm1', pickLabel: 'Arsenal' }],
      betMode: 'single',
      stakes: { s1: 0 },
      account,
      minStake: 300,
    });
    assert.ok(errors.some((e) => e.includes('Enter a stake')));
  });

  test('single mode - below total minimum', () => {
    const errors = validateBetSlip({
      selections: [{ id: 's1', matchId: 'm1', pickLabel: 'Arsenal' }],
      betMode: 'single',
      stakes: { s1: 100 },
      account,
      minStake: 300,
    });
    assert.ok(errors.some((e) => e.includes('Minimum total stake')));
  });

  test('single mode - valid', () => {
    const errors = validateBetSlip({
      selections: [{ id: 's1', matchId: 'm1', pickLabel: 'Arsenal' }],
      betMode: 'single',
      stakes: { s1: 400 },
      account,
      minStake: 300,
    });
    assert.equal(errors.length, 0);
  });

  test('detects stale/locked selections', () => {
    const errors = validateBetSlip({
      selections: [
        { id: 's1', matchId: 'm1', stale: true },
        { id: 's2', matchId: 'm2', locked: true },
      ],
      betMode: 'multiple',
      stakes: { multiple: 400 },
      account,
      minStake: 300,
    });
    assert.ok(errors.some((e) => e.includes('stale odds')));
  });
});

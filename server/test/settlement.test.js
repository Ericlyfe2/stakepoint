import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { legWon } from '../src/services/settlement.js';

// Regression coverage for the bug where any market legWon() didn't
// recognize fell through to `return null`, which settleNow() treats as a
// void leg — refunding the stake instead of paying out a genuine win. A
// real ticket (Correct Score 3-2 pick, FT 3-2) was wrongly voided this way.

describe('legWon — Correct Score (CS)', () => {
  test('pays out an exact score match', () => {
    assert.equal(legWon({ market: 'CS', outcome: '3-2' }, 3, 2), true);
  });
  test('loses a non-matching enumerated score', () => {
    assert.equal(legWon({ market: 'CS', outcome: '3-2' }, 2, 1), false);
  });
  test('resolves scorelines outside the enumerated list as OTHER', () => {
    assert.equal(legWon({ market: 'CS', outcome: 'OTHER' }, 5, 2), true);
    assert.equal(legWon({ market: 'CS', outcome: '3-2' }, 5, 2), false);
  });
});

describe('legWon — Draw No Bet (DNB)', () => {
  test('wins straightforwardly when not a draw', () => {
    assert.equal(legWon({ market: 'DNB', outcome: '1' }, 2, 1), true);
    assert.equal(legWon({ market: 'DNB', outcome: '2' }, 1, 2), true);
  });
  test('voids (push) on a draw regardless of pick', () => {
    assert.equal(legWon({ market: 'DNB', outcome: '1' }, 1, 1), null);
  });
});

describe('legWon — Over/Under lines other than 2.5', () => {
  test('OU05, OU15, OU35, OU45 all resolve off the total goals', () => {
    assert.equal(legWon({ market: 'OU05', outcome: 'Over' }, 1, 0), true);
    assert.equal(legWon({ market: 'OU15', outcome: 'Under' }, 1, 0), true);
    assert.equal(legWon({ market: 'OU35', outcome: 'Over' }, 2, 2), true);
    assert.equal(legWon({ market: 'OU45', outcome: 'Under' }, 2, 2), true);
  });
});

describe('legWon — Asian Handicap ±1 (AH1)', () => {
  test('home -1 wins when home wins by 2+', () => {
    assert.equal(legWon({ market: 'AH1', outcome: 'H-1' }, 3, 1), true);
  });
  test('home -1 pushes (void) when home wins by exactly 1', () => {
    assert.equal(legWon({ market: 'AH1', outcome: 'H-1' }, 2, 1), null);
  });
  test('away +1 wins on a draw or away win', () => {
    assert.equal(legWon({ market: 'AH1', outcome: 'A+1' }, 1, 1), true);
    assert.equal(legWon({ market: 'AH1', outcome: 'A+1' }, 0, 1), true);
  });
});

describe('legWon — combo markets', () => {
  test('WINBTTS: home win & both teams scored', () => {
    assert.equal(legWon({ market: 'WINBTTS', outcome: '1Y' }, 2, 1), true);
    assert.equal(legWon({ market: 'WINBTTS', outcome: '1N' }, 2, 0), true);
  });
  test('WINOU25: draw & under 2.5', () => {
    assert.equal(legWon({ market: 'WINOU25', outcome: 'XU' }, 1, 1), true);
    assert.equal(legWon({ market: 'WINOU25', outcome: 'XO' }, 1, 1), false);
  });
});

describe('legWon — still-unsupported half-time-dependent markets', () => {
  test('1H1X2/HTFT/etc still void rather than fabricate a result', () => {
    assert.equal(legWon({ market: '1H1X2', outcome: '1' }, 2, 1), null);
    assert.equal(legWon({ market: 'HTFT', outcome: '1/1' }, 2, 1), null);
  });
});

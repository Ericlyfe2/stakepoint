import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useBetslip from './useBetslip.js';

const mockMatch = {
  id: 'match-1',
  home: 'Arsenal',
  away: 'Chelsea',
  competition: 'Premier League',
  isLive: false,
  kickoff: '20:00',
};

const mockMatch2 = {
  id: 'match-2',
  home: 'Liverpool',
  away: 'Man City',
  competition: 'Premier League',
  isLive: false,
  kickoff: '18:00',
};

describe('useBetslip', () => {
  let hook;

  beforeEach(() => {
    hook = renderHook(() => useBetslip());
  });

  describe('initial state', () => {
    test('starts with empty selections', () => {
      expect(hook.result.current.selections).toEqual([]);
      expect(hook.result.current.selectionCount).toBe(0);
    });
    test('default bet mode is multiple', () => {
      expect(hook.result.current.betMode).toBe('multiple');
    });
    test('stakes initialized with multiple=0', () => {
      expect(hook.result.current.stakes).toEqual({ multiple: 0 });
    });
    test('no odds changes', () => {
      expect(hook.result.current.hasOddsChanges).toBe(false);
      expect(hook.result.current.oddsChanges).toEqual([]);
    });
    test('totalOdds is 0', () => {
      expect(hook.result.current.totalOdds).toBe(0);
    });
    test('totalStake is 0', () => {
      expect(hook.result.current.totalStake).toBe(0);
    });
    test('payout is 0', () => {
      expect(hook.result.current.payout).toBe(0);
    });
  });

  describe('toggleSelection', () => {
    test('adds a selection', () => {
      act(() => {
        hook.result.current.toggleSelection(mockMatch, '1X2', '1', 2.0);
      });
      expect(hook.result.current.selectionCount).toBe(1);
      const sel = hook.result.current.selections[0];
      expect(sel.matchId).toBe('match-1');
      expect(sel.market).toBe('1X2');
      expect(sel.outcome).toBe('1');
      expect(sel.odds).toBe(2.0);
      expect(sel.home).toBe('Arsenal');
      expect(sel.away).toBe('Chelsea');
    });

    test('does not add if odds is null', () => {
      act(() => {
        hook.result.current.toggleSelection(mockMatch, '1X2', '1', null);
      });
      expect(hook.result.current.selectionCount).toBe(0);
    });

    test('does not add if odds is NaN', () => {
      act(() => {
        hook.result.current.toggleSelection(mockMatch, '1X2', '1', NaN);
      });
      expect(hook.result.current.selectionCount).toBe(0);
    });

    test('toggles off when clicking same selection again', () => {
      act(() => {
        hook.result.current.toggleSelection(mockMatch, '1X2', '1', 2.0);
      });
      expect(hook.result.current.selectionCount).toBe(1);
      act(() => {
        hook.result.current.toggleSelection(mockMatch, '1X2', '1', 2.0);
      });
      expect(hook.result.current.selectionCount).toBe(0);
    });

    test('allows adding different outcomes from same match', () => {
      act(() => {
        hook.result.current.toggleSelection(mockMatch, '1X2', '1', 2.0);
        hook.result.current.toggleSelection(mockMatch, 'DC', '1X', 1.2);
      });
      expect(hook.result.current.selectionCount).toBe(2);
    });

    test('allows adding selections from different matches', () => {
      act(() => {
        hook.result.current.toggleSelection(mockMatch, '1X2', '1', 2.0);
        hook.result.current.toggleSelection(mockMatch2, '1X2', '2', 3.0);
      });
      expect(hook.result.current.selectionCount).toBe(2);
    });
  });

  describe('removeSelection', () => {
    test('removes a selection by id', () => {
      act(() => {
        hook.result.current.toggleSelection(mockMatch, '1X2', '1', 2.0);
      });
      const id = hook.result.current.selections[0].id;
      act(() => {
        hook.result.current.removeSelection(id);
      });
      expect(hook.result.current.selectionCount).toBe(0);
    });

    test('does nothing if id does not exist', () => {
      act(() => {
        hook.result.current.toggleSelection(mockMatch, '1X2', '1', 2.0);
      });
      act(() => {
        hook.result.current.removeSelection('nonexistent');
      });
      expect(hook.result.current.selectionCount).toBe(1);
    });

    test('cleans up stake when removing a selection', () => {
      act(() => {
        hook.result.current.toggleSelection(mockMatch, '1X2', '1', 2.0);
      });
      const id = hook.result.current.selections[0].id;
      act(() => {
        hook.result.current.setSelectionStake(id, '400');
      });
      expect(hook.result.current.stakes[id]).toBe(400);
      act(() => {
        hook.result.current.removeSelection(id);
      });
      expect(hook.result.current.stakes[id]).toBeUndefined();
    });
  });

  describe('clearSlip', () => {
    test('clears all selections and stakes', () => {
      act(() => {
        hook.result.current.toggleSelection(mockMatch, '1X2', '1', 2.0);
        hook.result.current.toggleSelection(mockMatch2, '1X2', '2', 3.0);
        hook.result.current.setMultipleStake('500');
      });
      expect(hook.result.current.selectionCount).toBe(2);
      act(() => {
        hook.result.current.clearSlip();
      });
      expect(hook.result.current.selectionCount).toBe(0);
      expect(hook.result.current.stakes).toEqual({ multiple: 0 });
      expect(hook.result.current.oddsChanges).toEqual([]);
    });
  });

  describe('bet mode switching', () => {
    test('setBetMode changes the mode', () => {
      act(() => { hook.result.current.setBetMode('single'); });
      expect(hook.result.current.betMode).toBe('single');
      act(() => { hook.result.current.setBetMode('multiple'); });
      expect(hook.result.current.betMode).toBe('multiple');
    });

    test('selections survive mode switch', () => {
      act(() => {
        hook.result.current.toggleSelection(mockMatch, '1X2', '1', 2.0);
        hook.result.current.toggleSelection(mockMatch2, '1X2', '2', 3.0);
      });
      expect(hook.result.current.selectionCount).toBe(2);
      act(() => { hook.result.current.setBetMode('single'); });
      expect(hook.result.current.selectionCount).toBe(2);
      act(() => { hook.result.current.setBetMode('multiple'); });
      expect(hook.result.current.selectionCount).toBe(2);
    });
  });

  describe('stake management', () => {
    test('setMultipleStake sets multiple stake', () => {
      act(() => { hook.result.current.setMultipleStake('400'); });
      expect(hook.result.current.stakes.multiple).toBe(400);
    });

    test('setMultipleStake handles zero', () => {
      act(() => { hook.result.current.setMultipleStake('0'); });
      expect(hook.result.current.stakes.multiple).toBe(0);
    });

    test('setSelectionStake sets per-selection stake', () => {
      act(() => { hook.result.current.toggleSelection(mockMatch, '1X2', '1', 2.0); });
      const id = hook.result.current.selections[0].id;
      act(() => { hook.result.current.setSelectionStake(id, '400'); });
      expect(hook.result.current.stakes[id]).toBe(400);
    });
  });

  describe('computations', () => {
    test('totalOdds for 2 selections', () => {
      act(() => {
        hook.result.current.toggleSelection(mockMatch, '1X2', '1', 2.0);
        hook.result.current.toggleSelection(mockMatch2, '1X2', '2', 3.0);
      });
      expect(hook.result.current.totalOdds).toBe(6.0);
    });

    test('totalStake in multiple mode', () => {
      act(() => {
        hook.result.current.toggleSelection(mockMatch, '1X2', '1', 2.0);
        hook.result.current.setMultipleStake('400');
      });
      expect(hook.result.current.totalStake).toBe(400);
    });

    test('totalStake in single mode sums per-selection stakes', () => {
      act(() => {
        hook.result.current.toggleSelection(mockMatch, '1X2', '1', 2.0);
        hook.result.current.toggleSelection(mockMatch2, '1X2', '2', 3.0);
        hook.result.current.setBetMode('single');
      });
      const ids = hook.result.current.selections.map((s) => s.id);
      act(() => {
        hook.result.current.setSelectionStake(ids[0], '200');
        hook.result.current.setSelectionStake(ids[1], '300');
      });
      expect(hook.result.current.totalStake).toBe(500);
    });

    test('payout in multiple mode includes bonus', () => {
      act(() => {
        hook.result.current.toggleSelection(mockMatch, '1X2', '1', 2.0);
        hook.result.current.toggleSelection(mockMatch2, '1X2', '2', 3.0);
        hook.result.current.setMultipleStake('100');
      });
      expect(hook.result.current.payout).toBe(100 * 6.0 * 1.08);
    });

    test('payout in single mode sums individual wins', () => {
      act(() => {
        hook.result.current.toggleSelection(mockMatch, '1X2', '1', 2.0);
        hook.result.current.toggleSelection(mockMatch2, '1X2', '2', 3.0);
        hook.result.current.setBetMode('single');
      });
      const ids = hook.result.current.selections.map((s) => s.id);
      act(() => {
        hook.result.current.setSelectionStake(ids[0], '100');
        hook.result.current.setSelectionStake(ids[1], '50');
      });
      expect(hook.result.current.payout).toBe(100 * 2.0 + 50 * 3.0);
    });

    test('selectionPayouts in single mode', () => {
      act(() => {
        hook.result.current.toggleSelection(mockMatch, '1X2', '1', 2.0);
        hook.result.current.setBetMode('single');
      });
      const id = hook.result.current.selections[0].id;
      act(() => { hook.result.current.setSelectionStake(id, '400'); });
      expect(hook.result.current.selectionPayouts[id]).toBe(800);
    });

    test('selectionPayouts empty in multiple mode', () => {
      act(() => {
        hook.result.current.toggleSelection(mockMatch, '1X2', '1', 2.0);
      });
      expect(hook.result.current.selectionPayouts).toEqual({});
    });

    test('payout is 0 when totalStake is 0', () => {
      act(() => {
        hook.result.current.toggleSelection(mockMatch, '1X2', '1', 2.0);
      });
      expect(hook.result.current.payout).toBe(0);
    });
  });

  describe('syncOdds', () => {
    test('updates odds and marks trend', () => {
      act(() => {
        hook.result.current.toggleSelection(mockMatch, '1X2', '1', 2.0);
      });
      const snapshot = {
        leagues: [{
          matches: [{
            ...mockMatch,
            markets: { '1X2': { selections: [{ key: '1', odds: 1.8 }] } },
          }],
        }],
      };
      act(() => {
        hook.result.current.syncOdds(snapshot);
      });
      expect(hook.result.current.selections[0].odds).toBe(1.8);
      expect(hook.result.current.selections[0].trend).toBe('down');
    });

    test('marks stale when match not found', () => {
      act(() => {
        hook.result.current.toggleSelection(mockMatch, '1X2', '1', 2.0);
      });
      act(() => {
        hook.result.current.syncOdds({ leagues: [{ matches: [] }] });
      });
      expect(hook.result.current.selections[0].stale).toBe(true);
    });

    test('marks stale when market not found', () => {
      act(() => {
        hook.result.current.toggleSelection(mockMatch, '1X2', '1', 2.0);
      });
      const snapshot = {
        leagues: [{
          matches: [{
            id: 'match-1',
            markets: {},
          }],
        }],
      };
      act(() => {
        hook.result.current.syncOdds(snapshot);
      });
      expect(hook.result.current.selections[0].stale).toBe(true);
    });

    test('marks stale when selection suspended', () => {
      act(() => {
        hook.result.current.toggleSelection(mockMatch, '1X2', '1', 2.0);
      });
      const snapshot = {
        leagues: [{
          matches: [{
            id: 'match-1',
            markets: { '1X2': { selections: [{ key: '1', odds: 2.0, suspended: true }] } },
          }],
        }],
      };
      act(() => {
        hook.result.current.syncOdds(snapshot);
      });
      expect(hook.result.current.selections[0].stale).toBe(true);
    });

    test('no-op when snapshot is null', () => {
      act(() => {
        hook.result.current.toggleSelection(mockMatch, '1X2', '1', 2.0);
      });
      act(() => {
        hook.result.current.syncOdds(null);
      });
      expect(hook.result.current.selections[0].odds).toBe(2.0);
    });
  });

  describe('refreshOdds + accept/reject', () => {
    test('refreshOdds tracks changes and marks trend up', () => {
      act(() => {
        hook.result.current.toggleSelection(mockMatch, '1X2', '1', 2.0);
      });
      const snapshot = {
        leagues: [{
          matches: [{
            id: 'match-1',
            markets: { '1X2': { selections: [{ key: '1', odds: 2.5 }] } },
          }],
        }],
      };
      act(() => {
        hook.result.current.refreshOdds(snapshot);
      });
      expect(hook.result.current.selections[0].odds).toBe(2.5);
      expect(hook.result.current.selections[0].trend).toBe('up');
      expect(hook.result.current.hasOddsChanges).toBe(true);
      expect(hook.result.current.oddsChanges[0].oldOdds).toBe(2.0);
      expect(hook.result.current.oddsChanges[0].newOdds).toBe(2.5);
    });

    test('acceptOddsChanges clears changes', () => {
      act(() => {
        hook.result.current.toggleSelection(mockMatch, '1X2', '1', 2.0);
      });
      const snapshot = {
        leagues: [{
          matches: [{
            id: 'match-1',
            markets: { '1X2': { selections: [{ key: '1', odds: 2.5 }] } },
          }],
        }],
      };
      act(() => { hook.result.current.refreshOdds(snapshot); });
      expect(hook.result.current.hasOddsChanges).toBe(true);
      act(() => { hook.result.current.acceptOddsChanges(); });
      expect(hook.result.current.hasOddsChanges).toBe(false);
      expect(hook.result.current.selectionCount).toBe(1);
    });

    test('rejectOddsChanges clears changes and selections', () => {
      act(() => {
        hook.result.current.toggleSelection(mockMatch, '1X2', '1', 2.0);
      });
      const snapshot = {
        leagues: [{
          matches: [{
            id: 'match-1',
            markets: { '1X2': { selections: [{ key: '1', odds: 2.5 }] } },
          }],
        }],
      };
      act(() => { hook.result.current.refreshOdds(snapshot); });
      expect(hook.result.current.hasOddsChanges).toBe(true);
      act(() => { hook.result.current.rejectOddsChanges(); });
      expect(hook.result.current.hasOddsChanges).toBe(false);
      expect(hook.result.current.selectionCount).toBe(0);
    });
  });

  describe('buildPlaceBetPayload', () => {
    test('multiple mode payload', () => {
      act(() => {
        hook.result.current.toggleSelection(mockMatch, '1X2', '1', 2.0);
        hook.result.current.toggleSelection(mockMatch2, '1X2', '2', 3.0);
      });
      const payload = hook.result.current.buildPlaceBetPayload();
      expect(payload).toHaveLength(2);
      expect(payload[0]).toEqual({ matchId: 'match-1', market: '1X2', outcome: '1', odds: 2.0 });
      expect(payload[1]).toEqual({ matchId: 'match-2', market: '1X2', outcome: '2', odds: 3.0 });
    });

    test('single mode includes per-selection stakes', () => {
      act(() => {
        hook.result.current.toggleSelection(mockMatch, '1X2', '1', 2.0);
        hook.result.current.setBetMode('single');
      });
      const id = hook.result.current.selections[0].id;
      act(() => { hook.result.current.setSelectionStake(id, '400'); });
      const payload = hook.result.current.buildPlaceBetPayload();
      expect(payload[0].stake).toBe(400);
    });
  });

  describe('loadSelections', () => {
    test('replaces all selections and sets mode', () => {
      act(() => {
        hook.result.current.loadSelections(
          [
            { id: 'preloaded-1', matchId: 'm1', market: '1X2', outcome: '1', odds: 2.0 },
            { id: 'preloaded-2', matchId: 'm2', market: '1X2', outcome: '2', odds: 3.0 },
          ],
          'single',
        );
      });
      expect(hook.result.current.selectionCount).toBe(2);
      expect(hook.result.current.betMode).toBe('single');
      expect(hook.result.current.stakes.multiple).toBe(400);
    });
  });
});

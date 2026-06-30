import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  generateId,
  buildSelection,
  isDuplicate,
  findConflictingSelection,
  pickLabel,
  parseStake,
  computeTotalOdds,
  computeSinglePayout,
  computeMultipleOdds,
  computeMultiplePayout,
  formatAmt,
} from '../lib/betslipEngine';

const SLIP_KEY = 'betxentra_betslip';

function loadSavedSlip() {
  try {
    const raw = localStorage.getItem(SLIP_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.selections) || !data.selections.length) return null;
    return data;
  } catch { return null; }
}

function saveSlip(selections, betMode, stakes) {
  try {
    if (!selections.length) {
      localStorage.removeItem(SLIP_KEY);
      return;
    }
    localStorage.setItem(SLIP_KEY, JSON.stringify({ selections, betMode, stakes }));
  } catch {}
}

export default function useBetslip(initialBetMode = 'multiple') {
  const saved = useRef(loadSavedSlip());
  const [selections, setSelections] = useState(saved.current?.selections || []);
  const [betMode, setBetModeRaw] = useState(saved.current?.betMode || initialBetMode);
  const [stakes, setStakes] = useState(saved.current?.stakes || { multiple: 0 });
  const [oddsChanges, setOddsChanges] = useState([]);
  const [replacedSelection, setReplacedSelection] = useState(null);
  const selectionIdCounter = useRef(0);

  useEffect(() => {
    saveSlip(selections, betMode, stakes);
  }, [selections, betMode, stakes]);

  useEffect(() => {
    if (replacedSelection) {
      const t = setTimeout(() => setReplacedSelection(null), 4000);
      return () => clearTimeout(t);
    }
  }, [replacedSelection]);

  const nextId = useCallback(() => {
    selectionIdCounter.current += 1;
    return `sel-${Date.now()}-${selectionIdCounter.current}`;
  }, []);

  const toggleSelection = useCallback((match, market, outcome, odds) => {
    let replaced = null;
    setSelections((prev) => {
      const existingIdx = prev.findIndex(
        (s) => s.matchId === match.id && s.market === market && s.outcome === outcome
      );

      if (existingIdx >= 0) {
        const next = prev.slice();
        next.splice(existingIdx, 1);
        return next;
      }

      if (odds == null || !Number.isFinite(Number(odds))) return prev;

      const conflict = findConflictingSelection(prev, match.id, market);
      if (conflict) {
        replaced = { oldPickLabel: conflict.pickLabel, newPickLabel: pickLabel(market, outcome, match) };
        const next = prev.filter((s) => s.id !== conflict.id);
        const newPick = buildSelection(match, market, outcome, Number(odds));
        return [...next, newPick];
      }

      const newPick = buildSelection(match, market, outcome, Number(odds));
      return [...prev, newPick];
    });
    if (replaced) setReplacedSelection(replaced);
  }, []);

  const clearReplacedSelection = useCallback(() => {
    setReplacedSelection(null);
  }, []);

  const removeSelection = useCallback((id) => {
    setSelections((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      return filtered;
    });
    setStakes((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const clearSlip = useCallback(() => {
    setSelections([]);
    setStakes({ multiple: 0 });
    setOddsChanges([]);
    localStorage.removeItem(SLIP_KEY);
  }, []);

  const setBetMode = useCallback((mode) => {
    setBetModeRaw(mode);
  }, []);

  const syncOdds = useCallback((snapshot) => {
    if (!snapshot) return;
    setSelections((prev) => {
      let changed = false;
      const next = prev.map((s) => {
        const match = snapshot.leagues
          .flatMap((lg) => lg.matches)
          .find((m) => m.id === s.matchId);
        if (!match) { changed = true; return { ...s, stale: true }; }
        const mkt = match.markets?.[s.market];
        if (!mkt || mkt.suspended) { changed = true; return { ...s, stale: true }; }
        const sel = mkt.selections?.find((x) => x.key === s.outcome);
        if (!sel || sel.suspended) { changed = true; return { ...s, stale: true }; }
        if (sel.odds === s.odds) return { ...s, stale: false, trend: null };
        changed = true;
        return {
          ...s,
          odds: sel.odds,
          trend: sel.odds > s.odds ? 'up' : 'down',
          stale: false,
        };
      });
      return changed ? next : prev;
    });
  }, []);

  const refreshOdds = useCallback((snapshot) => {
    if (!snapshot || !selections.length) return;
    const changes = [];
    const next = selections.map((s) => {
      const match = snapshot.leagues
        .flatMap((lg) => lg.matches)
        .find((m) => m.id === s.matchId);
      if (!match) return s;
      const mkt = match.markets?.[s.market];
      if (!mkt) return s;
      const sel = mkt.selections?.find((x) => x.key === s.outcome);
      if (!sel) return s;
      if (sel.odds !== s.odds) {
        changes.push({ id: s.id, oldOdds: s.odds, newOdds: sel.odds, pickLabel: s.pickLabel });
      }
      return {
        ...s,
        odds: sel.odds,
        trend: sel.odds > s.odds ? 'up' : sel.odds < s.odds ? 'down' : null,
        stale: false,
      };
    });
    setSelections(next);
    if (changes.length > 0) {
      setOddsChanges((prev) => [...prev, ...changes]);
    }
  }, [selections]);

  const acceptOddsChanges = useCallback(() => {
    setOddsChanges([]);
  }, []);

  const rejectOddsChanges = useCallback(() => {
    setOddsChanges([]);
    setSelections([]);
  }, []);

  const setMultipleStake = useCallback((val) => {
    setStakes((prev) => ({ ...prev, multiple: parseStake(val) }));
  }, []);

  const setSelectionStake = useCallback((selId, val) => {
    setStakes((prev) => ({ ...prev, [selId]: parseStake(val) }));
  }, []);

  const bulkSetSelectionStakes = useCallback(() => {
    if (betMode !== 'single') return;
    const avg = Math.max(1, parseStake(stakes.multiple || 0));
    setStakes((prev) => {
      const next = { ...prev };
      selections.forEach((s) => {
        if (!next[s.id] || next[s.id] <= 0) {
          next[s.id] = avg;
        }
      });
      return next;
    });
  }, [betMode, selections, stakes]);

  const totalOdds = useMemo(() => {
    if (!selections.length) return 0;
    return computeTotalOdds(selections);
  }, [selections]);

  const totalStake = useMemo(() => {
    if (betMode === 'single') {
      return selections.reduce((sum, s) => sum + (stakes[s.id] || 0), 0);
    }
    return parseStake(stakes.multiple || 0);
  }, [betMode, selections, stakes]);

  const payout = useMemo(() => {
    if (!selections.length || totalStake <= 0) return 0;

    if (betMode === 'single') {
      return selections.reduce((sum, s) => {
        const stake = stakes[s.id] || 0;
        return sum + computeSinglePayout(s.odds, stake);
      }, 0);
    }

    if (betMode === 'multiple') {
      return computeMultiplePayout(selections, totalStake);
    }

    return 0;
  }, [betMode, selections, stakes, totalStake]);

  const selectionPayouts = useMemo(() => {
    if (betMode !== 'single') return {};
    const result = {};
    for (const s of selections) {
      const stake = stakes[s.id] || 0;
      result[s.id] = computeSinglePayout(s.odds, stake);
    }
    return result;
  }, [betMode, selections, stakes]);

  const selectionCount = selections.length;

  const hasSameMatchSelections = useMemo(() => {
    const matchIds = selections.map(s => s.matchId);
    return new Set(matchIds).size < matchIds.length;
  }, [selections]);

  const hasOddsChanges = oddsChanges.length > 0;

  const buildPlaceBetPayload = useCallback(() => {
    if (betMode === 'single') {
      return selections.map((s) => ({
        matchId: s.matchId,
        market: s.market,
        outcome: s.outcome,
        odds: s.odds,
        stake: stakes[s.id] || 0,
      }));
    }
    return selections.map((s) => ({
      matchId: s.matchId,
      market: s.market,
      outcome: s.outcome,
      odds: s.odds,
    }));
  }, [betMode, selections, stakes]);

  const loadSelections = useCallback((newSelections, mode) => {
    setSelections(newSelections);
    setStakes({ multiple: 400 });
    if (mode) setBetModeRaw(mode);
    setOddsChanges([]);
  }, []);

  return {
    selections,
    betMode,
    setBetMode,
    stakes,
    oddsChanges,
    replacedSelection,
    toggleSelection,
    removeSelection,
    clearSlip,
    clearReplacedSelection,
    syncOdds,
    refreshOdds,
    acceptOddsChanges,
    rejectOddsChanges,
    setMultipleStake,
    setSelectionStake,
    bulkSetSelectionStakes,
    totalOdds,
    totalStake,
    payout,
    selectionPayouts,
    selectionCount,
    hasSameMatchSelections,
    hasOddsChanges,
    buildPlaceBetPayload,
    loadSelections,
  };
}

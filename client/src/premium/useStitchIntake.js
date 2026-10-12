import { useEffect } from 'react';
import { pickLabel } from '../lib/betslipEngine.js';

/* ---------------------------------------------------------------------------
   useStitchIntake
   ---------------------------------------------------------------------------
   One-shot bridge for "add to betslip" flows that cross a route boundary
   (Code Hub -> "/"). A route change unmounts the source page before its
   betslip-persistence effect can flush to localStorage, so the legacy app
   passes the legs through sessionStorage ("sp_recommended_legs"). The premium
   home consumes the same key on mount, hydrates real selection objects and
   drops them into the slip. It clears the key either way so a refresh never
   re-adds a stale slip.
   ------------------------------------------------------------------------- */

const LEGS_KEY = 'sp_recommended_legs';

function readLegs() {
  try {
    const raw = sessionStorage.getItem(LEGS_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(LEGS_KEY);
    const parsed = JSON.parse(raw);
    const legs = Array.isArray(parsed?.legs) ? parsed.legs : Array.isArray(parsed) ? parsed : [];
    return legs.length ? legs : null;
  } catch {
    return null;
  }
}

function hydrate(leg, i) {
  const market = leg.market;
  const outcome = leg.outcome;
  return {
    id: `sel-${Date.now()}-${i}`,
    matchId: leg.matchId,
    market,
    outcome,
    odds: Number(leg.odds),
    pickLabel: leg.pick || pickLabel(market, outcome, { home: leg.home, away: leg.away }),
    marketLabel: leg.marketName || leg.type || `${market} · ${outcome}`,
    meta: leg.matchLabel || `${leg.home} vs ${leg.away}`,
    home: leg.home,
    away: leg.away,
    trend: null,
  };
}

function modeFor(selections) {
  const ids = selections.map((s) => s.matchId);
  return new Set(ids).size < ids.length ? 'single' : 'multiple';
}

export default function useStitchIntake(slip, toast) {
  useEffect(() => {
    const legs = readLegs();
    if (!legs) return;
    const selections = legs.map(hydrate).filter((s) => s.matchId && s.market && s.outcome);
    if (!selections.length) return;
    slip.loadSelections(selections, modeFor(selections));
    toast?.(`Loaded ${selections.length} selection${selections.length === 1 ? '' : 's'} from the Code Hub.`);
    // Intentionally run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

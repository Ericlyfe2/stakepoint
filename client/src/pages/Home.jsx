import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  fetchMatches,
  placeBet,
  fetchBetByCode,
} from '../api/betApi.js';
import { useToast, useAccount } from '../layout/AppShell.jsx';
import BetSuccessModal, { toBookingCode } from '../components/BetSuccessModal.jsx';
import { useFavouriteLeagues } from '../hooks/useFavourites.js';
import { onLive, subscribeSports, unsubscribeSports } from '../api/socketClient.js';
import {
  SYSTEM_TYPES,
  eligibleSystemTypes,
  defaultSystemType,
  maxSystemReturn,
} from '../lib/systemBets.js';

const BONUS = 0.08;

function formatAmt(n) {
  return Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pickLabel(market, key, match) {
  const team = (k) => (k === '1' ? match.home : k === '2' ? match.away : 'Draw');

  if (market === '1X2' || market === '1H1X2') {
    const prefix = market === '1H1X2' ? '1H · ' : '';
    if (key === '1') return `${prefix}${match.home} to win`;
    if (key === '2') return `${prefix}${match.away} to win`;
    return `${prefix}Draw`;
  }
  if (market === 'ML') return `${key === '1' ? match.home : match.away} to win`;
  if (market === 'OU25') return `${key} 2.5 goals`;
  if (market === 'OU15') return `${key} 1.5 goals`;
  if (market === 'OU35') return `${key} 3.5 goals`;
  if (market === '1HOU05') return `1H · ${key} 0.5 goals`;
  if (market === 'BTTS') return `Both Teams To Score · ${key}`;
  if (market === '1HBTTS') return `1H · Both Teams To Score · ${key}`;
  if (market === 'DC') {
    if (key === '1X') return `${match.home} or Draw`;
    if (key === 'X2') return `Draw or ${match.away}`;
    return `${match.home} or ${match.away}`;
  }
  if (market === 'DNB') return `Draw No Bet · ${team(key)}`;
  if (market === 'AH1') {
    if (key === 'H-1') return `${match.home} -1`;
    if (key === 'A+1') return `${match.away} +1`;
    return `Handicap ${key}`;
  }
  if (market === 'WINBTTS') {
    const result = key[0] === '1' ? match.home : key[0] === '2' ? match.away : 'Draw';
    return `${result} & BTTS ${key[1] === 'Y' ? 'Yes' : 'No'}`;
  }
  if (market === 'WINOU25') {
    const result = key[0] === '1' ? match.home : key[0] === '2' ? match.away : 'Draw';
    return `${result} & ${key[1] === 'O' ? 'Over' : 'Under'} 2.5`;
  }
  if (market === 'BTTSOU25') {
    return `BTTS ${key[0] === 'Y' ? 'Yes' : 'No'} & ${key[1] === 'O' ? 'Over' : 'Under'} 2.5`;
  }
  if (market === 'HTFT') {
    const half = (k) => (k === '1' ? match.home : k === '2' ? match.away : 'Draw');
    const [a, b] = key.split('/');
    return `HT/FT · ${half(a)} / ${half(b)}`;
  }
  if (market === 'CS') return `Correct Score ${key === 'OTHER' ? 'Any Other' : key}`;
  if (market === 'TP')   return `${key} ${match.line || ''} pts`;
  if (market === 'SETS') return `${key} 2.5 sets`;
  if (market === 'HCAP') return `Handicap ${key}`;
  return `${market} · ${key}`;
}

function matchMeta(match) {
  const h = match.home, a = match.away;
  if (match.isLive) return `${h} vs ${a} · LIVE ${match.minute || ''}`;
  return `${h} vs ${a} · ${[match.kickoff, match.day].filter(Boolean).join(' ')}`;
}

function parseStake(raw) {
  const n = parseFloat(String(raw || '').replace(/,/g, ''));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function systemTypeHint(count) {
  if (count < 3) return `${3 - count} more selection${count === 2 ? '' : 's'}`;
  if (count > 8) return 'fewer selections (max 8 for system bets)';
  return 'a different combination';
}

// Returns the column keys for the current market chip, with fallbacks.
function columnsFor(marketChip, match) {
  // Aliases — fall back to 1X2 / ML if the chip's market isn't priced.
  if (marketChip === '1X2') {
    const m = match.markets?.['1X2'] || match.markets?.['ML'];
    if (!m) return null;
    return { market: match.markets?.['1X2'] ? '1X2' : 'ML', selections: m.selections };
  }
  if (marketChip === 'OU25') {
    const m = match.markets?.['OU25'];
    if (!m) return null;
    return { market: 'OU25', selections: m.selections };
  }
  if (marketChip === 'DC') {
    const m = match.markets?.['DC'];
    if (!m) return null;
    return { market: 'DC', selections: m.selections };
  }
  if (marketChip === 'HT') {
    // first-half O/U; if not provided, no row
    const m = match.markets?.['HT_OU15'] || match.markets?.['HT_OU05'] || match.markets?.['BTTS'];
    if (!m) return null;
    return { market: m.id || 'HT', selections: m.selections };
  }
  return null;
}

export default function Home({ initialChip }) {
  const { toast } = useToast();
  const { account, adjustBalance, setAccount } = useAccount();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sportParam = searchParams.get('sport') || 'football';

  const { favourites, isFavourite, toggle: toggleFavourite } = useFavouriteLeagues();

  const [sportId, setSportId]         = useState(sportParam);
  const [snapshot, setSnapshot]       = useState(null);
  const [loadErr, setLoadErr]         = useState(null);
  const [selections, setSelections]   = useState([]);
  const [betMode, setBetMode]         = useState('multiple');
  const [systemType, setSystemType]   = useState(null);
  const [stake, setStake]   = useState('300.00');
  const [activeLeague, setActiveLeague] = useState(null);

  // new mobile-first UI state
  const [subTab, setSubTab]           = useState(initialChip === 'live' ? 'live' : 'highlights');
  const [marketChip, setMarketChip]   = useState('1X2');
  const [collapsed, setCollapsed]     = useState({});
  const [slipOpen, setSlipOpen]       = useState(false);
  const [payslip, setPayslip]         = useState('');
  const [successBet, setSuccessBet]   = useState(null);
  const [marketsForMatch, setMarketsForMatch] = useState(null);
  const [featuredTab, setFeaturedTab] = useState('featured');
  const [activeCategory, setActiveCategory] = useState(null);
  const [slipErr, setSlipErr] = useState('');
  const [isPlacing, setIsPlacing] = useState(false);

  const slipDlg     = useRef(null);
  const marketsDlg  = useRef(null);

  // Initial sport from URL change
  useEffect(() => { setSportId(sportParam); }, [sportParam]);

  // Load matches when sport changes
  useEffect(() => {
    let cancelled = false;
    setSnapshot(null);
    setLoadErr(null);
    (async () => {
      try {
        const data = await fetchMatches(sportId);
        if (cancelled) return;
        setSnapshot(data);
        if (sportId === 'football' && selections.length === 0) {
          setSelections((data.seedSlip || []).map((s) => ({ ...s })));
        }
      } catch (e) {
        if (!cancelled) setLoadErr(e.message || 'Could not load fixtures.');
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sportId]);

  // Odds refresh — 10s on Live tab, 30s otherwise. Always calls the API
  // so prices stay in sync with the server snapshot.
  useEffect(() => {
    if (sportId !== 'football') return;
    const intervalMs = subTab === 'live' ? 10000 : 30000;
    const t = setInterval(() => {
      fetchMatches(sportId).then((d) => setSnapshot(d)).catch(() => {});
    }, intervalMs);
    return () => clearInterval(t);
  }, [sportId, subTab]);

  // Realtime socket overlay on Live tab — merges odds:tick and score:update
  // into the snapshot so prices/scores move between API polls.
  useEffect(() => {
    if (subTab !== 'live') return;
    subscribeSports([sportId]);

    const offOdds = onLive('odds:tick', (payload) => {
      if (!payload?.fixtureId || !payload?.market) return;
      setSnapshot((cur) => {
        if (!cur) return cur;
        let touched = false;
        const leagues = cur.leagues.map((lg) => ({
          ...lg,
          matches: lg.matches.map((m) => {
            if (m.id !== payload.fixtureId) return m;
            const prev = m.markets?.[payload.market];
            if (!prev) return m;
            const selections = Array.isArray(payload.selections)
              ? payload.selections.map((s) => ({
                  key: s.key,
                  label: s.label,
                  odds: typeof s.odds === 'number' ? s.odds : prev.selections?.find((x) => x.key === s.key)?.odds,
                  suspended: !!s.suspended,
                }))
              : prev.selections;
            touched = true;
            return { ...m, markets: { ...m.markets, [payload.market]: { ...prev, selections } } };
          }),
        }));
        return touched ? { ...cur, leagues } : cur;
      });
    });

    const offScore = onLive('score:update', (payload) => {
      if (!payload?.fixtureId) return;
      setSnapshot((cur) => {
        if (!cur) return cur;
        let touched = false;
        const leagues = cur.leagues.map((lg) => ({
          ...lg,
          matches: lg.matches.map((m) => {
            if (m.id !== payload.fixtureId) return m;
            touched = true;
            return {
              ...m,
              scoreHome: payload.scoreHome ?? m.scoreHome,
              scoreAway: payload.scoreAway ?? m.scoreAway,
              minute: payload.minute ?? m.minute,
            };
          }),
        }));
        return touched ? { ...cur, leagues } : cur;
      });
    });

    return () => {
      try { offOdds?.(); } catch { /* ignore */ }
      try { offScore?.(); } catch { /* ignore */ }
      try { unsubscribeSports([sportId]); } catch { /* ignore */ }
    };
  }, [subTab, sportId]);

  // Bottom-sheet open/close wiring
  useEffect(() => {
    const dlg = slipDlg.current;
    if (!dlg) return;
    if (slipOpen && !dlg.open) dlg.showModal();
    if (!slipOpen && dlg.open) dlg.close();
    if (slipOpen) setSlipErr(''); // clear error when reopening
  }, [slipOpen]);

  const upsertSelection = useCallback((row) => {
    setSelections((prev) => {
      // Dedupe by (matchId, market, outcome) so the same odd can't appear
      // twice on the slip, but different outcomes in the same market — and
      // different markets on the same match — can coexist.
      const i = prev.findIndex((s) => s.matchId === row.matchId && s.market === row.market && s.outcome === row.outcome);
      if (i === -1) return [...prev, row];
      const next = [...prev];
      next[i] = { ...row, id: prev[i].id };
      return next;
    });
  }, []);

  const removeByOutcome = useCallback((matchId, market, outcome) => {
    setSelections((prev) => prev.filter((s) => !(s.matchId === matchId && s.market === market && s.outcome === outcome)));
  }, []);

  const removeById = useCallback((id) => {
    setSelections((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const toggleSelection = useCallback((league, match, market, key, odds) => {
    setSelections((prev) => {
      // Toggle by exact (matchId, market, outcome): same odd clicked twice => deselect.
      // Deselect path must work even when odds are null / market suspended, so the
      // user can always remove a stale pick.
      const existingIdx = prev.findIndex(
        (s) => s.matchId === match.id && s.market === market && s.outcome === key,
      );
      if (existingIdx >= 0) {
        const next = prev.slice();
        next.splice(existingIdx, 1);
        return next;
      }

      // Adding a new pick requires a valid price.
      if (odds == null || !Number.isFinite(Number(odds))) return prev;

      const newPick = {
        id: `sel-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`}`,
        matchId: match.id,
        market,
        outcome: key,
        odds: Number(odds),
        pickLabel: pickLabel(market, key, match),
        marketLabel: market === '1X2' || market === 'ML' ? `Match · ${key}` : `${market} · ${key}`,
        meta: matchMeta(match),
        trend: null,
      };

      if (betMode === 'single') return [newPick];

      if (prev.length >= 12) {
        toast('Slip is full — 12 selections max.');
        return prev;
      }

      return [...prev, newPick];
    });
  }, [betMode, toast]);

  const clearSlip = useCallback(() => {
    setSelections([]);
    toast('Slip cleared.');
  }, [toast]);

  // Side-effects when bet mode changes
  useEffect(() => {
    if (betMode === 'single' && selections.length > 1) {
      setSelections((prev) => prev.slice(-1));
    }
    if (betMode === 'system') {
      const next = defaultSystemType(selections.length);
      setSystemType(next);
    } else {
      setSystemType(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [betMode, selections.length]);

  // Keep slip odds in sync with the live snapshot
  useEffect(() => {
    if (!snapshot) return;
    setSelections((prev) => {
      let changed = false;
      const next = prev.map((s) => {
        const match = snapshot.leagues
          .flatMap((lg) => lg.matches)
          .find((m) => m.id === s.matchId);
        if (!match) { changed = true; return null; } // match finished or removed
        const mkt = match.markets?.[s.market];
        if (!mkt || mkt.suspended) { changed = true; return null; } // market closed
        const sel = mkt.selections?.find((x) => x.key === s.outcome);
        if (!sel || sel.suspended) { changed = true; return null; } // selection closed
        if (sel.odds === s.odds) return s;
        changed = true;
        return { ...s, odds: sel.odds, trend: sel.odds > s.odds ? '↑' : '↓' };
      }).filter(Boolean); // actually remove the nulls
      return changed ? next : prev;
    });
  }, [snapshot]);

  const eligibleSystems = useMemo(
    () => eligibleSystemTypes(selections.length),
    [selections.length],
  );

  const systemDef    = systemType ? SYSTEM_TYPES[systemType] : null;
  const linesCount   = systemDef?.totalLines || 0;
  const stakePerLine = parseStake(stake);

  const totalOdds = useMemo(() => {
    if (!selections.length) return 0;
    if (betMode === 'single')   return selections[0].odds;
    if (betMode === 'multiple') return selections.reduce((p, s) => p * s.odds, 1);
    if (betMode === 'system' && systemDef && stakePerLine > 0) {
      const ret = maxSystemReturn(selections.map((s) => s.odds), systemType, stakePerLine);
      const totalStake = stakePerLine * linesCount;
      return totalStake > 0 ? ret / totalStake : 0;
    }
    return 0;
  }, [selections, betMode, systemDef, systemType, stakePerLine, linesCount]);

  const totalStake = betMode === 'system'
    ? Number((stakePerLine * linesCount).toFixed(2))
    : stakePerLine;

  const payout = useMemo(() => {
    if (!selections.length || stakePerLine <= 0) return 0;
    if (betMode === 'system') {
      if (!systemDef) return 0;
      return maxSystemReturn(selections.map((s) => s.odds), systemType, stakePerLine);
    }
    if (!totalOdds) return 0;
    return stakePerLine * totalOdds * (1 + BONUS);
  }, [selections, stakePerLine, totalOdds, betMode, systemDef, systemType]);

  // Hydrate a booking code into the live slip — looks up the legs and replaces
  // the current selection list, then opens the slip.
  const loadFromCode = useCallback(async (rawCode) => {
    const code = String(rawCode || '').trim().toUpperCase();
    if (!code) return false;
    try {
      const { bet } = await fetchBetByCode(code);
      if (!bet?.legs?.length) {
        toast(`Booking code ${code} has no selections.`);
        return false;
      }
      const hydrated = bet.legs.map((l, i) => ({
        id: `sel-${Date.now()}-${i}`,
        matchId: l.matchId,
        market: l.market,
        outcome: l.outcome,
        odds: l.odds,
        pickLabel: pickLabel(l.market, l.outcome, { home: l.home, away: l.away }),
        marketLabel: l.marketName || `${l.market} · ${l.outcome}`,
        meta: `${l.home} vs ${l.away}`,
        home: l.home,
        away: l.away,
        trend: null,
      }));
      setSelections(hydrated);
      setBetMode(hydrated.length === 1 ? 'single' : 'multiple');
      setSlipOpen(true);
      setSlipErr('');
      toast(`Loaded ${hydrated.length} selection${hydrated.length === 1 ? '' : 's'} from ${code}.`);
      return true;
    } catch {
      toast(`Booking code ${code} not found.`);
      return false;
    }
  }, [toast]);

  const onPlaceBet = async () => {
    setSlipErr('');
    if (!selections.length) { setSlipErr('Add at least one selection to your bet slip.'); return; }
    if (betMode === 'multiple' && selections.length < 2) {
      setSlipErr('Multiple bets need at least 2 selections.'); return;
    }
    if (betMode === 'system' && !systemDef) {
      setSlipErr('Pick a valid number of selections for a system bet (3–8).'); return;
    }
    const linePrice = parseStake(stake);
    if (linePrice <= 0) { setSlipErr('Enter a stake amount.'); return; }
    const cost = betMode === 'system' ? linePrice * linesCount : linePrice;
    if (cost < 300) { setSlipErr(`Minimum bet is GHS 300 (this ticket costs GHS ${formatAmt(cost)}).`); return; }
    if (!account) { 
      setSlipOpen(false);
      navigate('/login?next=/');
      toast('Sign in to place a bet.'); 
      return; 
    }
    if (cost > account.balance) {
      setSlipErr(`Insufficient balance — this ticket costs GHS ${formatAmt(cost)}.`); 
      return;
    }
    
    setIsPlacing(true);
    // Optimistic balance update for instant feedback
    adjustBalance(-cost);
    try {
      const res = await placeBet({
        mode: betMode,
        stake: linePrice,
        ...(betMode === 'system' ? { systemType } : {}),
        selections: selections.map((s) => ({
          matchId: s.matchId, market: s.market, outcome: s.outcome, odds: s.odds,
        })),
      });
      if (res.account) setAccount(res.account);
      toast(`Bet placed — booking code ${res.bet.bookingCode}.`);
      setSelections([]);
      setSlipOpen(false);
      setSuccessBet(res.bet);
    } catch (e) {
      // Revert optimistic update on failure
      adjustBalance(cost);
      if (e.status === 409) {
        setSlipErr(e.message || 'Odds changed or market closed — refreshing.');
        setSelections([]); // Clear invalid selections
        try { setSnapshot(await fetchMatches(sportId)); } catch {/* ignore */}
      } else {
        setSlipErr(e.message || 'Could not place bet.');
      }
    } finally {
      setIsPlacing(false);
    }
  };

  const openMarkets = (league, match) => {
    setMarketsForMatch({ league, match });
    requestAnimationFrame(() => marketsDlg.current?.showModal());
  };

  const onPayslip = async (e) => {
    e.preventDefault();
    const ok = await loadFromCode(payslip);
    if (ok) setPayslip('');
  };

  // Code-loader state for the Featured/Codes tab input (declared above early
  // returns so hook order stays stable across renders).
  const [featuredCode, setFeaturedCode] = useState('');

  // Featured cards built from the live snapshot. Each card holds real legs
  // (matchId + market + outcome + odds) so "Add to Betslip" hydrates them
  // straight into the slip.
  const featuredCards = useMemo(() => {
    if (!snapshot?.leagues?.length) return [];

    const flat = [];
    for (const lg of snapshot.leagues) {
      for (const m of (lg.matches || [])) {
        if (m.finished || m.suspended) continue;
        flat.push({ league: lg, match: m });
      }
    }
    if (!flat.length) return [];

    const buildLeg = (match, market, outcome) => {
      const mk = match.markets?.[market];
      if (!mk) return null;
      const sel = mk.selections?.find((s) => s.key === outcome);
      if (!sel) return null;
      const dot = market === '1X2'
        ? (outcome === '1' ? 'home' : outcome === '2' ? 'away' : 'draw')
        : market === 'OU25' && outcome === 'Over' ? 'home'
        : market === 'BTTS' && outcome === 'Yes' ? 'home'
        : 'draw';
      const pretty = (() => {
        if (market === '1X2') return outcome === '1' ? `Home @${sel.odds.toFixed(2)}` : outcome === '2' ? `Away @${sel.odds.toFixed(2)}` : `Draw @${sel.odds.toFixed(2)}`;
        if (market === 'OU25') return `${outcome} 2.5 @${sel.odds.toFixed(2)}`;
        if (market === 'BTTS') return `BTTS ${outcome} @${sel.odds.toFixed(2)}`;
        if (market === 'WINBTTS') return `${sel.label} @${sel.odds.toFixed(2)}`;
        return `${sel.label || outcome} @${sel.odds.toFixed(2)}`;
      })();
      return {
        matchId: match.id,
        market,
        outcome,
        odds: sel.odds,
        home: match.home,
        away: match.away,
        marketName: mk.name,
        pick: pretty,
        type: market === '1X2' ? '1X2' : market === 'OU25' ? 'O/U' : market,
        match: `${match.home} vs ${match.away}`,
        time: match.isLive ? `LIVE ${match.minute || ''}` : `${match.day || 'Today'} ${match.kickoff || ''}`.trim(),
        dot,
      };
    };

    const favourites = flat
      .map(({ match }) => {
        const m = match.markets?.['1X2'];
        if (!m) return null;
        const best = m.selections.reduce((a, b) => (a.odds < b.odds ? a : b));
        return { match, outcome: best.key, odds: best.odds };
      })
      .filter(Boolean)
      .filter((x) => x.odds >= 1.3 && x.odds <= 2.5)
      .sort((a, b) => a.odds - b.odds)
      .slice(0, 3);

    const overPicks = flat
      .map(({ match }) => {
        const m = match.markets?.['OU25'];
        if (!m) return null;
        const over = m.selections.find((s) => s.key === 'Over');
        return over ? { match, odds: over.odds } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.odds - b.odds)
      .slice(0, 3);

    const bttsPicks = flat
      .map(({ match }) => {
        const m = match.markets?.['BTTS'];
        if (!m) return null;
        const yes = m.selections.find((s) => s.key === 'Yes');
        return yes ? { match, odds: yes.odds } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.odds - b.odds)
      .slice(0, 3);

    const buildCard = (id, code, picks, mapToLeg) => {
      const legs = picks.map(mapToLeg).filter(Boolean);
      if (legs.length < 2) return null;
      const odds = Number(legs.reduce((acc, l) => acc * l.odds, 1).toFixed(2));
      return { id, code, folds: legs.length, odds, legs };
    };

    return [
      buildCard('top-picks', 'TOP' + flat.length.toString().padStart(3, '0'), favourites, ({ match, outcome }) => buildLeg(match, '1X2', outcome)),
      buildCard('goals-galore', 'GOL' + flat.length.toString().padStart(3, '0'), overPicks, ({ match }) => buildLeg(match, 'OU25', 'Over')),
      buildCard('btts-special', 'BTS' + flat.length.toString().padStart(3, '0'), bttsPicks, ({ match }) => buildLeg(match, 'BTTS', 'Yes')),
    ].filter(Boolean);
  }, [snapshot]);

  const loadCardToSlip = useCallback((card) => {
    if (!card?.legs?.length) return;
    const hydrated = card.legs.map((l, i) => ({
      id: `sel-${Date.now()}-${i}`,
      matchId: l.matchId,
      market: l.market,
      outcome: l.outcome,
      odds: l.odds,
      pickLabel: pickLabel(l.market, l.outcome, { home: l.home, away: l.away }),
      marketLabel: l.marketName || `${l.market} · ${l.outcome}`,
      meta: `${l.home} vs ${l.away}`,
      home: l.home,
      away: l.away,
      trend: null,
    }));
    setSelections(hydrated);
    setBetMode(hydrated.length === 1 ? 'single' : 'multiple');
    setSlipOpen(true);
    setSlipErr('');
    toast(`Loaded ${hydrated.length} legs onto your slip.`);
  }, [toast]);

  const onFeaturedCodeLoad = async (e) => {
    e.preventDefault();
    const ok = await loadFromCode(featuredCode);
    if (ok) setFeaturedCode('');
  };

  if (loadErr) {
    return (
      <main style={{ padding: 48, textAlign: 'center' }}>
        <p style={{ color: 'var(--accent-hot)', marginBottom: 16 }}>{loadErr}</p>
        <p style={{ color: 'var(--text-soft)', fontSize: 14 }}>Refresh the page to retry.</p>
      </main>
    );
  }
  if (!snapshot) return <main style={{ padding: 48, textAlign: 'center', color: 'var(--text-dim)' }}>Loading fixtures…</main>;

  const sportTabs = snapshot.sports || [{ id: 'football', name: 'Football' }];

  // Category quick links (SportyBet-style). `leagueId` maps to a real league
  // section so clicking the pill scrolls the user straight to it.
  const categoryLinks = [
    { id: 'today_football', label: "Today's Football" },
    { id: 'next_3h', label: 'Football In Next 3 Hours' },
    { id: 'epl',        label: 'England Premier League', leagueId: 'pl'     },
    { id: 'laliga',     label: 'Spain La Liga',          leagueId: 'laliga' },
    { id: 'serie_a',    label: 'Italy Serie A',          leagueId: 'sa'     },
    { id: 'bundesliga', label: 'Germany Bundesliga',     leagueId: 'bun'    },
    { id: 'ligue1',     label: 'France Ligue 1'                             },
  ];

  const scrollToLeague = (leagueId) => {
    if (!leagueId) return;
    // Make sure the section is visible: clear single-league filter, switch off
    // 'live' tab, and uncollapse the section so the user lands on the matches.
    setActiveLeague(null);
    setSubTab((prev) => (prev === 'live' ? 'highlights' : prev));
    setCollapsed((prev) => (prev[leagueId] ? { ...prev, [leagueId]: false } : prev));
    // Wait a tick so any state-driven re-render lands before scrolling.
    requestAnimationFrame(() => {
      const el = document.getElementById(`league-${leagueId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const visibleLeagues = activeLeague
    ? snapshot.leagues.filter((l) => l.id === activeLeague)
    : snapshot.leagues;

  // Today = matches whose `day` doesn't read like a date string ("Sun", "Mon", a future date).
  // Live always counts as today. Live tab = only isLive matches.
  const filteredLeaguesRaw = subTab === 'today'
    ? visibleLeagues
        .map((lg) => ({ ...lg, matches: lg.matches.filter((m) => m.isLive || /today/i.test(String(m.day || ''))) }))
        .filter((lg) => lg.matches.length > 0)
    : subTab === 'live'
    ? visibleLeagues
        .map((lg) => ({ ...lg, matches: lg.matches.filter((m) => m.isLive) }))
        .filter((lg) => lg.matches.length > 0)
    : visibleLeagues;

  // Favourited leagues float to the top so they stay sticky in the list.
  const filteredLeagues = [...filteredLeaguesRaw].sort((a, b) => {
    const af = isFavourite(a.id) ? 0 : 1;
    const bf = isFavourite(b.id) ? 0 : 1;
    return af - bf;
  });

  // Grand Prize Winners state (replaced by animated GrandPrizeWinners component)

  const marketChips = [
    ['1X2',  '1X2'],
    ['OU25', 'O/U'],
    ['DC',   'DC'],
    ['HT',   '1st Half O/U'],
  ];

  return (
    <>
      {/* ─── Sport tabs (with Live) ─── */}
      <div className="sb-sport-tabs">
        <button
          type="button"
          className="sb-sport-tab"
          style={{ fontWeight: 800, color: 'var(--text)' }}
        >
          Sports
        </button>
        {sportTabs.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`sb-sport-tab${sportId === s.id ? ' active' : ''}`}
            onClick={() => {
              window.history.replaceState({}, '', `?sport=${s.id}`);
              setSportId(s.id);
              setActiveLeague(null);
            }}
          >
            {s.name}
            {s.count != null && <span className="ct">{s.count}</span>}
          </button>
        ))}
      </div>

      {/* ─── Category quick links (SportyBet-style) ─── */}
      <div className="sb-category-pills">
        <button
          type="button"
          className={`sb-category-pill${subTab === 'live' ? ' active' : ''}`}
          onClick={() => {
            setSubTab(subTab === 'live' ? 'highlights' : 'live');
            requestAnimationFrame(() => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            });
          }}
          style={{
            background: subTab === 'live' ? 'linear-gradient(135deg,#ff3d3d,#c81e1e)' : undefined,
            color: subTab === 'live' ? '#fff' : undefined,
            fontWeight: 800,
          }}
        >
          🔴 LIVE
        </button>
        {categoryLinks.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={`sb-category-pill${activeCategory === cat.id ? ' active' : ''}`}
            onClick={() => {
              setActiveCategory(cat.id);
              if (cat.leagueId) scrollToLeague(cat.leagueId);
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* ─── Featured section (SportyBet Codes style) — hidden on Live tab so live matches sit above the fold ─── */}
      {subTab !== 'live' && (
      <section className="sb-featured">
        <div className="sb-featured-tabs">
          {[
            ['featured',  'Featured'],
            ['codes',     'Load Code'],
            ['matches',   'Matches'],
            ['games',     'Games'],
            ['virtuals',  'Virtuals'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`sb-featured-tab${featuredTab === key ? ' active' : ''}`}
              onClick={() => setFeaturedTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Booking-code loader — visible on Featured and Load Code tabs */}
        {(featuredTab === 'featured' || featuredTab === 'codes') && (
          <form
            onSubmit={onFeaturedCodeLoad}
            style={{
              display: 'flex', gap: 8, padding: '10px 12px 4px',
              alignItems: 'stretch',
            }}
          >
            <input
              type="text"
              value={featuredCode}
              onChange={(e) => setFeaturedCode(e.target.value.toUpperCase().replace(/\s+/g, ''))}
              placeholder="Enter booking code (e.g. ME94621)"
              maxLength={12}
              autoCapitalize="characters"
              spellCheck={false}
              style={{
                flex: 1, padding: '12px 14px', borderRadius: 10,
                border: '1px solid var(--surface-border, #2a2a2a)',
                background: 'var(--surface, #161616)',
                color: 'var(--text, #fff)',
                fontSize: 14, fontWeight: 700, letterSpacing: '0.06em',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={!featuredCode.trim()}
              style={{
                padding: '0 18px', borderRadius: 10, border: 'none',
                background: featuredCode.trim() ? '#116f43' : '#2a2a2a',
                color: '#fff', fontWeight: 800, fontSize: 13, cursor: featuredCode.trim() ? 'pointer' : 'not-allowed',
                whiteSpace: 'nowrap',
              }}
            >
              Load Slip
            </button>
          </form>
        )}

        <div className="sb-featured-body">
          {featuredTab === 'codes' && featuredCards.length === 0 && (
            <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
              Enter a booking code above to load its selections onto your slip.
            </div>
          )}

          {featuredTab !== 'codes' && featuredCards.length === 0 && (
            <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
              No featured cards available — check back after the next odds refresh.
            </div>
          )}

          {(featuredTab === 'featured' || featuredTab === 'codes' || featuredTab === 'matches') &&
            featuredCards.map((sc) => (
              <div key={sc.id} className="sb-code-card">
                <div className="sb-code-header">
                  <span className="sb-code-id">{sc.code}</span>
                  <div className="sb-code-meta">
                    <span>Folds: <strong>{sc.folds}</strong></span>
                    <span>Odds: <span className="odds-val">{sc.odds.toFixed(2)}</span></span>
                  </div>
                </div>
                {sc.legs.map((leg, li) => (
                  <div key={li} className="sb-code-leg">
                    <span className={`sb-code-leg-dot ${leg.dot}`} />
                    <div className="sb-code-leg-info">
                      <div className="sb-code-leg-pick">{leg.pick} | {leg.type}</div>
                      <div className="sb-code-leg-match">{leg.match}</div>
                    </div>
                    <span className="sb-code-leg-time">{leg.time}</span>
                  </div>
                ))}
                <div className="sb-code-actions">
                  <button
                    type="button"
                    className="sb-code-share"
                    onClick={async () => {
                      try {
                        if (navigator.share) {
                          await navigator.share({ title: 'Xenbet slip', text: `Check out this slip on Xenbet — booking idea ${sc.code}` });
                        } else {
                          await navigator.clipboard?.writeText(sc.code);
                          toast(`Code ${sc.code} copied.`);
                        }
                      } catch {/* user cancelled */}
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                      <polyline points="16 6 12 2 8 6" />
                      <line x1="12" y1="2" x2="12" y2="15" />
                    </svg>
                    Share
                  </button>
                  <button type="button" className="sb-code-add" onClick={() => loadCardToSlip(sc)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Add to Betslip
                  </button>
                </div>
              </div>
            ))}

          {featuredTab === 'games' && (
            <div style={{ padding: '24px 12px', textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => navigate('/casino')}
                style={{ padding: '12px 20px', borderRadius: 10, border: 'none', background: '#116f43', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: 14 }}
              >
                Open Casino
              </button>
            </div>
          )}

          {featuredTab === 'virtuals' && (
            <div style={{ padding: '24px 12px', textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => navigate('/virtuals')}
                style={{ padding: '12px 20px', borderRadius: 10, border: 'none', background: '#116f43', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: 14 }}
              >
                Open Virtuals
              </button>
            </div>
          )}
        </div>
      </section>
      )}

      {/* ─── Secondary tabs ─── */}
      <div className="sb-sub-tabs">
        {[
          ['highlights', 'Highlights'],
          ['live',       'Live'],
          ['today',      'Today'],
          ['countries',  'Countries'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`sb-sub-tab${subTab === key ? ' active' : ''}`}
            onClick={() => setSubTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ─── Market chips ─── */}
      <div className="sb-market-chips">
        {marketChips.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`sb-chip${marketChip === key ? ' active' : ''}`}
            onClick={() => setMarketChip(key)}
          >
            {label}
          </button>
        ))}
        <button type="button" className="sb-chip sb-chip-icon" aria-label="Region">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
          </svg>
        </button>
        <button type="button" className="sb-chip sb-chip-icon" aria-label="Filters">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
        </button>
      </div>

      {/* ─── Countries view ─── */}
      {subTab === 'countries' ? (
        <div style={{ padding: '8px 12px 24px' }}>
          {visibleLeagues.map((lg) => (
            <button
              key={lg.id}
              type="button"
              className="sb-league"
              style={{ display: 'block', width: '100%', textAlign: 'left' }}
              onClick={() => {
                setActiveLeague(lg.id);
                setSubTab('highlights');
              }}
            >
              <div className="sb-league-head">
                <span className="sb-flag">{lg.crest?.label?.slice(0, 2) || lg.name.slice(0, 2).toUpperCase()}</span>
                <span>{lg.name}</span>
                <span className="sb-count">{lg.matches.length}</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <>
          {favourites.length > 0 && (
            <div className="sb-favs-strip" role="region" aria-label="Favourite leagues">
              <span className="sb-favs-strip-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14">
                  <path d="M12 2.5l2.95 6.13 6.55.78-4.84 4.6 1.32 6.54L12 17.37l-5.98 3.18 1.32-6.54-4.84-4.6 6.55-.78L12 2.5z" fill="currentColor" />
                </svg>
              </span>
              <span className="sb-favs-strip-label">Favourites</span>
              {filteredLeagues
                .filter((lg) => isFavourite(lg.id))
                .map((lg) => (
                  <button
                    key={lg.id}
                    type="button"
                    className="sb-favs-chip"
                    onClick={() => setActiveLeague(activeLeague === lg.id ? null : lg.id)}
                    title={`Filter to ${lg.name}`}
                  >
                    {lg.name}
                    <span className="ct">{lg.matches.length}</span>
                  </button>
                ))}
            </div>
          )}

          {filteredLeagues.length === 0 && (
            <p style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
              Nothing here yet — try “Highlights”.
            </p>
          )}

          {filteredLeagues.map((lg, lgIdx) => {
            const isCollapsed = !!collapsed[lg.id];
            // Determine column structure from the first match in this league.
            const sample = lg.matches[0] && columnsFor(marketChip, lg.matches[0]);
            const colCount = sample?.selections?.length || 3;
            const gridClass = colCount === 2 ? 'cols-2' : '';

            return (
              <Fragment key={lg.id}>
                <section
                  id={`league-${lg.id}`}
                  className={`sb-league${isCollapsed ? ' collapsed' : ''}`}
                  style={{ scrollMarginTop: 96 }}
                >
                  <header
                    className="sb-league-head"
                    onClick={() => setCollapsed((prev) => ({ ...prev, [lg.id]: !prev[lg.id] }))}
                  >
                    <svg className="sb-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                    <span className="sb-flag">{(lg.crest?.label || lg.name).slice(0, 2).toUpperCase()}</span>
                    <span>{lg.name}</span>
                    <span className="sb-count">{lg.matches.length}</span>
                    <button
                      type="button"
                      className={`sb-fav-btn${isFavourite(lg.id) ? ' active' : ''}`}
                      aria-label={isFavourite(lg.id) ? `Remove ${lg.name} from favourites` : `Add ${lg.name} to favourites`}
                      aria-pressed={isFavourite(lg.id)}
                      onClick={(e) => { e.stopPropagation(); toggleFavourite(lg.id); }}
                      title={isFavourite(lg.id) ? 'Unfavourite league' : 'Favourite league'}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                        <path
                          d="M12 2.5l2.95 6.13 6.55.78-4.84 4.6 1.32 6.54L12 17.37l-5.98 3.18 1.32-6.54-4.84-4.6 6.55-.78L12 2.5z"
                          fill={isFavourite(lg.id) ? 'currentColor' : 'none'}
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </header>

                  <div className="sb-league-body">
                    <div className={`sb-league-cols ${gridClass}`}>
                      <span>Time</span>
                      <span>Match</span>
                      {sample?.selections?.map((s) => <span key={s.key}>{s.key}</span>)
                        || <><span>1</span><span>X</span><span>2</span></>}
                    </div>

                    {lg.matches.map((match) => {
                      const cols = columnsFor(marketChip, match);
                      const market = cols?.market;
                      const myPicks = selections.filter((s) => s.matchId === match.id && s.market === market);

                      return (
                        <div key={match.id} className={`sb-match ${gridClass}`}>
                          <button
                            type="button"
                            className="sb-match-time"
                            onClick={() => openMarkets(lg, match)}
                            style={{ textAlign: 'left' }}
                          >
                            {match.isLive ? (
                              <>
                                <span className="live">● LIVE</span>
                                <span className="score">{match.scoreHome}-{match.scoreAway}</span>
                                <span>{match.minute || ''}</span>
                              </>
                            ) : (
                              <>
                                <span>{match.kickoff || ''}</span>
                                <span>{match.day || ''}</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            className="sb-match-teams"
                            onClick={() => openMarkets(lg, match)}
                            style={{ textAlign: 'left' }}
                          >
                            <span className="row">{match.home}</span>
                            <span className="row">{match.away}</span>
                          </button>

                          {cols ? (
                            cols.selections.map((s) => {
                              const isSel = myPicks.some((p) => p.outcome === s.key);
                              return (
                                <button
                                  key={s.key}
                                  type="button"
                                  className={`sb-odd${isSel ? ' selected' : ''}`}
                                  onClick={() => toggleSelection(lg, match, market, s.key, s.odds)}
                                >
                                  {s.odds?.toFixed(2)}
                                </button>
                              );
                            })
                          ) : (
                            <>
                              <span className="sb-odd disabled">—</span>
                              <span className="sb-odd disabled">—</span>
                              <span className="sb-odd disabled">—</span>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>

                {lgIdx === 0 && <GrandPrizeWinners />}
              </Fragment>
            );
          })}
        </>
      )}

      {/* ─── Compliance / sponsors ─── */}
      <div className="sb-compliance">
        <div className="badge18">18+</div>
        <div className="legal">© {new Date().getFullYear()} Xenbet GH · Licensed by the Gaming Commission of Ghana</div>
        <div className="sponsors">
          <span className="sponsor">Real Madrid</span>
          <span className="sponsor">LaLiga</span>
        </div>
        <div className="tagline">The world's sharper betting platform</div>
      </div>

      {/* ─── Payslip ─── */}
      <form className="sb-payslip" onSubmit={onPayslip}>
        <div className="sb-payslip-label">Payslip</div>
        <div className="sb-payslip-input">
          <input
            placeholder="*711+222#"
            value={payslip}
            onChange={(e) => setPayslip(e.target.value.toUpperCase())}
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit">Check</button>
        </div>
        <div className="sb-payslip-foot">Enter a booking code to view a slip</div>
      </form>

      {/* ─── Floating slip pill (mobile only via CSS) ─── */}
      {selections.length > 0 && (
        <button type="button" className="sb-slip-pill" onClick={() => setSlipOpen(true)}>
          <span className="ct">{selections.length}</span>
          <span>Bet slip</span>
          <span className="odds">@ {totalOdds.toFixed(2)}</span>
        </button>
      )}

      {/* ─── Slip bottom sheet ─── */}
      <dialog ref={slipDlg} className="sb-sheet" onClose={() => setSlipOpen(false)}>
        <div className="sb-sheet-grip" />
        <div className="sb-sheet-head">
          <h3>Bet slip · <span style={{ color: 'var(--accent)' }}>{selections.length}</span></h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
            {account && (
              <span className="slip-balance" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-soft)', background: 'rgba(30,200,81,0.1)', padding: '4px 8px', borderRadius: 6 }}>
                Balance: <span style={{ color: '#1ec851' }}>₵{formatAmt(account.balance)}</span>
              </span>
            )}
            <button type="button" className="sb-sheet-close" onClick={() => setSlipOpen(false)} aria-label="Close" style={{ position: 'static', margin: 0 }}>×</button>
          </div>
        </div>
        <div className="sb-sheet-body">
          <div className="betslip">
            <div className="slip-mode">
              {(['single', 'multiple', 'system']).map((m) => (
                <button key={m} type="button" className={`mode-btn${betMode === m ? ' active' : ''}`} onClick={() => setBetMode(m)}>
                  {m === 'single' ? 'Single' : m === 'multiple' ? 'Multiple' : 'System'}
                </button>
              ))}
            </div>

            {selections.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '.1em', textTransform: 'uppercase' }}>
                  {selections.length} selection{selections.length === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  onClick={clearSlip}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-soft)', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '4px 8px' }}
                >
                  Clear all
                </button>
              </div>
            )}

            {betMode === 'system' && (
              <div style={{ margin: '8px 0 4px', padding: '10px 12px', background: 'var(--surface-2)', border: '1px solid rgba(255,181,71,.18)', borderRadius: 10 }}>
                {eligibleSystems.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--text-soft)', margin: 0 }}>
                    Pick {systemTypeHint(selections.length)} to unlock a system bet.
                  </p>
                ) : (
                  <>
                    <div style={{ fontSize: 10, letterSpacing: '.1em', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 6 }}>System type</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {eligibleSystems.map((sys) => (
                        <button
                          key={sys.key}
                          type="button"
                          onClick={() => setSystemType(sys.key)}
                          className={`mode-btn${systemType === sys.key ? ' active' : ''}`}
                          style={{ padding: '6px 10px', fontSize: 12 }}
                        >
                          {sys.label} <span style={{ opacity: .6, marginLeft: 2 }}>· {sys.totalLines}L</span>
                        </button>
                      ))}
                    </div>
                    {systemDef && (
                      <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--text-soft)' }}>
                        <strong style={{ color: 'var(--text)' }}>{systemDef.label}</strong> — {linesCount} line{linesCount > 1 ? 's' : ''} · total stake <strong style={{ color: 'var(--accent-warm)' }}>GHS {formatAmt(totalStake)}</strong>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {selections.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-dim)', padding: '12px 0' }}>
                Tap any odds to add a selection. Mix markets across matches.
              </p>
            )}

            <div className="selections">
              {selections.map((s) => (
                <div key={s.id} className="selection">
                  <button type="button" className="x" aria-label="Remove" onClick={() => removeById(s.id)}>×</button>
                  <div className="sel-pick">{s.pickLabel}</div>
                  <div className="sel-market">{s.marketLabel}</div>
                  <div className="sel-teams">{s.meta}</div>
                  <div className="sel-odds">
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace' }}>@{s.odds.toFixed(2)}</span>
                    <span className="sel-odds-val">{s.odds.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="stake-block">
              <div className="stake-input">
                <span>GHS</span>
                <input
                  type="text"
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                />
              </div>
              <div className="quick-stakes">
                {[10, 50, 100].map((n) => (
                  <button key={n} type="button" className="quick-stake" onClick={() => setStake(formatAmt(parseStake(stake) + n))}>+{n}</button>
                ))}
                <button
                  type="button"
                  className="quick-stake"
                  onClick={() => {
                    const doubled = parseStake(stake) * 2;
                    const cap = Number(account?.balance) || doubled;
                    setStake(formatAmt(Math.min(doubled, cap)));
                  }}
                >
                  2×
                </button>
                <button
                  type="button"
                  className="quick-stake all-in"
                  onClick={() => setStake(formatAmt(account?.balance || 0))}
                  title="Set stake to your full balance"
                >
                  ALL IN
                </button>
              </div>
              <div className="summary">
                {betMode === 'system' ? (
                  <>
                    <div className="sum-row"><span className="lbl">Stake / line</span><span className="val">GHS {formatAmt(stakePerLine)}</span></div>
                    <div className="sum-row"><span className="lbl">Lines</span><span className="val">{linesCount || '—'}</span></div>
                    <div className="sum-row"><span className="lbl">Total stake</span><span className="val">GHS {formatAmt(totalStake)}</span></div>
                    <div className="sum-row payout">
                      <span className="lbl" style={{ color: 'var(--text)', fontWeight: 700 }}>Max return</span>
                      <span className="val">{payout > 0 ? `GHS ${formatAmt(payout)}` : '—'}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="sum-row"><span className="lbl">Total odds</span><span className="val">{selections.length ? totalOdds.toFixed(2) : '—'}</span></div>
                    <div className="sum-row"><span className="lbl">Stake</span><span className="val">GHS {formatAmt(stakePerLine)}</span></div>
                    {betMode === 'multiple' && (
                      <div className="sum-row"><span className="lbl">Bonus boost</span><span className="val" style={{ color: 'var(--accent)' }}>+8%</span></div>
                    )}
                    <div className="sum-row payout">
                      <span className="lbl" style={{ color: 'var(--text)', fontWeight: 700 }}>Potential win</span>
                      <span className="val">{payout > 0 ? `GHS ${formatAmt(payout)}` : '—'}</span>
                    </div>
                  </>
                )}
              </div>
              {slipErr && <div style={{ color: 'var(--danger, #ff5d5d)', fontSize: 13, textAlign: 'center', marginBottom: 12, fontWeight: 700 }}>{slipErr}</div>}
              <button type="button" className="place-bet" onClick={onPlaceBet} disabled={isPlacing}>
                <span>{isPlacing ? 'Placing...' : 'Place bet'}</span><span className="arrow">→</span>
              </button>
            </div>
          </div>
        </div>
      </dialog>

      {/* ─── Markets dialog (per match) ─── */}
      <dialog ref={marketsDlg} className="bv-dialog markets-dlg">
        {marketsForMatch && (() => {
          const matchesInLeague = marketsForMatch.league.matches || [];
          const curIdx = matchesInLeague.findIndex((m) => m.id === marketsForMatch.match.id);
          const goPrev = () => {
            if (curIdx > 0) setMarketsForMatch({ league: marketsForMatch.league, match: matchesInLeague[curIdx - 1] });
          };
          const goNext = () => {
            if (curIdx >= 0 && curIdx < matchesInLeague.length - 1) {
              setMarketsForMatch({ league: marketsForMatch.league, match: matchesInLeague[curIdx + 1] });
            }
          };
          const hasPrev = curIdx > 0;
          const hasNext = curIdx >= 0 && curIdx < matchesInLeague.length - 1;
          return (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, position: 'sticky', top: 0, background: 'var(--surface)', padding: '4px 0', zIndex: 5 }}>
              <button
                type="button"
                onClick={() => marketsDlg.current?.close()}
                aria-label="Close"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', color: 'var(--text)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                Back
              </button>
              <button
                type="button"
                onClick={goPrev}
                disabled={!hasPrev}
                aria-label="Previous match"
                title="Previous match in league"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', color: hasPrev ? 'var(--text)' : 'var(--text-dim)', cursor: hasPrev ? 'pointer' : 'not-allowed', opacity: hasPrev ? 1 : 0.5 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
              </button>
              <span style={{ fontSize: 12, color: 'var(--text-dim)', flex: 1, textAlign: 'center' }}>
                {curIdx >= 0 ? `${curIdx + 1} / ${matchesInLeague.length}` : ''}
              </span>
              <button
                type="button"
                onClick={goNext}
                disabled={!hasNext}
                aria-label="Next match"
                title="Next match in league"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', color: hasNext ? 'var(--text)' : 'var(--text-dim)', cursor: hasNext ? 'pointer' : 'not-allowed', opacity: hasNext ? 1 : 0.5 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </button>
            </div>
            <h3 style={{
              fontSize: 'clamp(22px, 6.5vw, 34px)',
              lineHeight: 1.1,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              margin: '8px 0 6px',
              wordBreak: 'break-word',
            }}>{marketsForMatch.match.home} vs {marketsForMatch.match.away}</h3>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>
              {marketsForMatch.league.name} · {matchMeta(marketsForMatch.match)}
            </p>
            {Object.entries(marketsForMatch.match.markets || {}).map(([mkey, mkt]) => (
              <div key={mkey} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-soft)', marginBottom: 8 }}>{mkt.name}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                  {mkt.selections.map((s) => {
                    const sel = selections.find((x) => x.matchId === marketsForMatch.match.id && x.market === mkey && x.outcome === s.key);
                    return (
                      <button
                        key={s.key}
                        type="button"
                        className={`odd-btn${sel ? ' selected' : ''}`}
                        onClick={() => toggleSelection(marketsForMatch.league, marketsForMatch.match, mkey, s.key, s.odds)}
                        style={{ padding: '10px 12px' }}
                      >
                        <span className="ol" style={{ fontSize: 11 }}>{s.label}</span>
                        <span className="ov">{s.odds.toFixed(2)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="bv-dialog-actions">
              <button type="button" className="btn btn-ghost" onClick={() => marketsDlg.current?.close()}>Close</button>
              <button type="button" className="btn btn-primary" onClick={() => { marketsDlg.current?.close(); setSlipOpen(true); }}>
                Done · {selections.length} on slip
              </button>
            </div>
          </>
          );
        })()}
      </dialog>

      <BetSuccessModal
        bet={successBet}
        onClose={() => setSuccessBet(null)}
        onConfirm={() => { setSuccessBet(null); navigate('/my-bets'); }}
        onRebet={() => {
          if (!successBet?.legs) return;
          setSelections(successBet.legs.map((l) => ({
            matchId: l.matchId, market: l.market, outcome: l.outcome, odds: l.odds,
            home: l.home, away: l.away,
            marketName: l.marketName || l.market,
            league: '', minute: '', kickoff: '',
          })));
          setSlipOpen(true);
        }}
      />
    </>
  );
}

/* ─── Helper: generate a random winner entry ─── */
function makeWinner() {
  // Ghana mobile prefixes (MTN, Vodafone/Telecel, AirtelTigo, Glo) — masked
  // so the punter's identity stays private. Example: 024 *** **42
  const prefixes = ['024', '025', '054', '055', '059', '020', '050', '027', '057', '026', '056'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const lastTwo = String(Math.floor(Math.random() * 100)).padStart(2, '0');
  const who = `${prefix} *** **${lastTwo}`;
  const amt = 200000 + Math.random() * (600501.75 - 200000);
  const mins = Math.floor(Math.random() * 3) + 1;
  return { who, amt, src: 'in Sports', ago: mins === 1 ? '1 min ago' : `${mins} mins ago` };
}

/* ─── Live Grand Prize Winners ticker ─── */
function GrandPrizeWinners() {
  const [items, setItems] = useState(() => Array.from({ length: 10 }, () => makeWinner()));

  useEffect(() => {
    const id = setInterval(() => {
      setItems((prev) => { const n = [...prev]; n.shift(); n.push(makeWinner()); return n; });
    }, 3500);
    return () => clearInterval(id);
  }, []);

  const doubled = [...items, ...items];

  return (
    <section className="sb-winners">
      <div className="sb-winners-head">
        <h3>🏆 Grand Prize Winners</h3>
      </div>
      <div className="sb-winners-scroll">
        <div className="sb-winners-track">
          {doubled.map((w, i) => (
            <div key={i} className="sb-winner">
              <div className="sb-winner-bg-icon">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19,5h-2V3c0-0.55-0.45-1-1-1H8C7.45,2,7,2.45,7,3v2H5C3.9,5,3,5.9,3,7v1c0,2.55,1.92,4.63,4.39,4.94C8.23,14.73,9.44,16,11,16v3H7v2h10v-2h-4v-3c1.56,0,2.77-1.27,3.61-3.06C19.08,12.63,21,10.55,21,8V7C21,5.9,20.1,5,19,5z M5,8V7h2v3.82C5.84,10.4,5,9.3,5,8z M19,8c0,1.3-0.84,2.4-2,2.82V7h2V8z"/></svg>
              </div>
              <span className="who">{w.who}</span>
              <span className="amt">GHS {formatAmt(w.amt)}</span>
              <span className="src">{w.src}</span>
              <span className="ago">{w.ago}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

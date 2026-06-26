import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  fetchMatches,
  placeBet,
  bookBet,
  fetchBetByCode,
} from '../api/betApi.js';
import { useToast, useAccount } from '../layout/AppShell.jsx';
import { toBookingCode } from '../components/BetSuccessModal.jsx';
import BetPlacementSuccessModal from '../components/bets/BetPlacementSuccessModal.jsx';
import OddsGauge from '../components/OddsGauge.jsx';
import NumericKeypad from '../components/NumericKeypad.jsx';
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
  const [stake, setStake]   = useState('400.00');
  const [activeLeague, setActiveLeague] = useState(null);

  // new mobile-first UI state
  const [subTab, setSubTab]           = useState(initialChip === 'live' ? 'live' : 'highlights');
  const [marketChip, setMarketChip]   = useState('1X2');
  const [collapsed, setCollapsed]     = useState({});
  const [slipOpen, setSlipOpen]       = useState(false);
  const [payslip, setPayslip]         = useState('');
  const [successBet, setSuccessBet]   = useState(null);
  const [successType, setSuccessType] = useState('placed');
  const [marketsForMatch, setMarketsForMatch] = useState(null);
  const [featuredTab, setFeaturedTab] = useState('featured');
  const [activeCategory, setActiveCategory] = useState(null);
  const [slipErr, setSlipErr] = useState('');
  const [isBooking, setIsBooking] = useState(false);
  const [isPlacing, setIsPlacing] = useState(false);
  const [showKeypad, setShowKeypad] = useState(false);
  const [betRealMode, setBetRealMode] = useState('REAL');

  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [codeInput, setCodeInput]         = useState('');
  const [codeErr, setCodeErr]             = useState('');
  const [codeLoading, setCodeLoading]     = useState(false);

  const [commentsMatch, setCommentsMatch] = useState(null);
  const [allComments, setAllComments] = useState(() => {
    try {
      const stored = localStorage.getItem('betxentra_comments');
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });

  const persistComments = useCallback((next) => {
    setAllComments(next);
    try { localStorage.setItem('betxentra_comments', JSON.stringify(next)); } catch {}
  }, []);

  const slipDlg     = useRef(null);
  const marketsDlg  = useRef(null);
  const codeDlg     = useRef(null);
  const commentsDlg = useRef(null);
  const codeInputRef = useRef(null);

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
        // Don't nullify selections on temporary snapshot gaps — keep stale
        // odds so the slip doesn't vanish during polling transitions.
        if (!match) return { ...s, stale: true };
        const mkt = match.markets?.[s.market];
        if (!mkt || mkt.suspended) return { ...s, stale: true };
        const sel = mkt.selections?.find((x) => x.key === s.outcome);
        if (!sel || sel.suspended) return { ...s, stale: true };
        if (sel.odds === s.odds) return { ...s, stale: false };
        changed = true;
        return { ...s, odds: sel.odds, trend: sel.odds > s.odds ? '↑' : '↓', stale: false };
      });
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

  // Load ticket code from sessionStorage (set by /ticket/:code route)
  useEffect(() => {
    let code;
    try { code = sessionStorage.getItem('sp_ticket_code'); } catch { /* ignore */ }
    if (code) {
      try { sessionStorage.removeItem('sp_ticket_code'); } catch { /* ignore */ }
      loadFromCode(code);
    }
    // Load recommended legs from CodeHubPage
    let rec;
    try {
      rec = JSON.parse(sessionStorage.getItem('sp_recommended_legs') || 'null');
    } catch { /* ignore */ }
    if (rec?.legs?.length) {
      try { sessionStorage.removeItem('sp_recommended_legs'); } catch { /* ignore */ }
      const hydrated = rec.legs.map((l, i) => ({
        id: `sel-${Date.now()}-${i}`,
        matchId: l.matchId,
        market: l.market,
        outcome: l.outcome,
        odds: l.odds,
        pickLabel: l.pick || '',
        marketLabel: l.type || l.market,
        meta: l.matchLabel || `${l.home || ''} vs ${l.away || ''}`,
        home: l.home || '',
        away: l.away || '',
        trend: null,
      }));
      if (hydrated.length) {
        setSelections(hydrated);
        setBetMode(hydrated.length === 1 ? 'single' : 'multiple');
        setSlipOpen(true);
        setSlipErr('');
      }
    }
    // Load remix selections from BetHistoryPage
    let remix;
    try {
      remix = JSON.parse(localStorage.getItem('bv_remix_selections') || 'null');
    } catch { /* ignore */ }
    if (remix?.length) {
      try { localStorage.removeItem('bv_remix_selections'); } catch { /* ignore */ }
      const hydrated = remix.map((l, i) => ({
        id: `sel-${Date.now()}-${i}`,
        matchId: l.matchId,
        market: l.market,
        outcome: l.outcome,
        odds: l.odds,
        pickLabel: pickLabel(l.market, l.outcome, { home: l.home || '', away: l.away || '' }),
        marketLabel: l.marketName || l.market,
        meta: `${l.home || ''} vs ${l.away || ''}`,
        home: l.home || '',
        away: l.away || '',
        trend: null,
      }));
      if (hydrated.length) {
        setSelections(hydrated);
        setBetMode(hydrated.length === 1 ? 'single' : 'multiple');
        setSlipOpen(true);
        setSlipErr('');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for betxentra:load-code events (from BookingCodeOverlay, GlobalFAB, etc.)
  useEffect(() => {
    const handler = (e) => {
      const code = e.detail?.code;
      if (code) loadFromCode(code);
    };
    window.addEventListener('betxentra:load-code', handler);
    return () => window.removeEventListener('betxentra:load-code', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCodeModal = useCallback(() => {
    setCodeInput('');
    setCodeErr('');
    setCodeModalOpen(true);
    requestAnimationFrame(() => {
      codeDlg.current?.showModal();
      codeInputRef.current?.focus();
    });
  }, []);

  const closeCodeModal = useCallback(() => {
    codeDlg.current?.close();
    setCodeModalOpen(false);
    setCodeErr('');
  }, []);

  const handleCodeLoad = useCallback(async (e) => {
    e?.preventDefault();
    const trimmed = codeInput.trim().toUpperCase();
    if (!trimmed) { setCodeErr('Enter a booking code.'); return; }
    if (!/^[A-Z]{2}\d{5}$/.test(trimmed)) { setCodeErr('Use 2 letters + 5 digits (e.g. AB12345).'); return; }
    setCodeLoading(true);
    setCodeErr('');
    const ok = await loadFromCode(trimmed);
    setCodeLoading(false);
    if (ok) {
      try {
        const stored = localStorage.getItem('betxentra_recent_codes');
        let list = stored ? JSON.parse(stored) : [];
        list = [trimmed, ...list.filter((c) => c !== trimmed)].slice(0, 8);
        localStorage.setItem('betxentra_recent_codes', JSON.stringify(list));
      } catch { /* ignore */ }
      closeCodeModal();
    } else {
      setCodeErr('Booking code not found.');
    }
  }, [codeInput, loadFromCode, closeCodeModal]);

  const makeBetId = () => `bv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const onBookBet = useCallback(async () => {
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
    if (!account) {
      setSlipOpen(false);
      navigate('/login?next=/');
      toast('Sign in to book a bet.');
      return;
    }

    setIsBooking(true);
    try {
      const res = await bookBet({
        mode: betMode,
        stake: linePrice,
        ...(betMode === 'system' ? { systemType } : {}),
        selections: selections.map((s) => ({
          matchId: s.matchId, market: s.market, outcome: s.outcome, odds: s.odds,
        })),
      });
      setSelections([]);
      setSlipOpen(false);
      setSuccessType('booked');
      setSuccessBet(res.bet);
      toast(`Bet booked — code ${res.bet.bookingCode}.`);
    } catch (e) {
      if (e.status === 409) {
        setSlipErr(e.message || 'Odds changed or market closed — refreshing.');
        setSelections([]);
        try { setSnapshot(await fetchMatches(sportId)); } catch {/* ignore */}
      } else {
        setSlipErr(e.message || 'Could not book bet.');
      }
    } finally {
      setIsBooking(false);
    }
  }, [selections, betMode, systemDef, stake, linesCount, totalOdds, payout, toast, sportId, account, navigate]);

  const onPlaceBet = useCallback(async () => {
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
    if (cost < 400) { setSlipErr(`Minimum stake is GHS 400 (this ticket costs GHS ${formatAmt(cost)}).`); return; }
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
      try {
        const stored = localStorage.getItem('betxentra_recent_codes');
        let list = stored ? JSON.parse(stored) : [];
        list = [res.bet.bookingCode, ...list.filter((c) => c !== res.bet.bookingCode)].slice(0, 8);
        localStorage.setItem('betxentra_recent_codes', JSON.stringify(list));
      } catch { /* ignore */ }
      setSelections([]);
      setSlipOpen(false);
      setSuccessType('placed');
      setSuccessBet(res.bet);
    } catch (e) {
      adjustBalance(cost);
      if (e.status === 409) {
        setSlipErr(e.message || 'Odds changed or market closed — refreshing.');
        setSelections([]);
        try { setSnapshot(await fetchMatches(sportId)); } catch {/* ignore */}
      } else {
        setSlipErr(e.message || 'Could not place bet.');
      }
    } finally {
      setIsPlacing(false);
    }
  }, [selections, betMode, systemDef, stake, linesCount, totalOdds, payout, toast, account, navigate, sportId]);

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
      {/* ─── Hero + Promo Carousel ─── */}
      <div className="xb-promo-track-wrap">
        <div className="xb-promo-track">
          {[0, 1, 2].map((dup) => (
            <div className="xb-promo-set" key={dup} aria-hidden={dup > 0 ? 'true' : undefined}>
              <div className="xb-promo-card xb-promo-card-hero">
                <img src="/images/hero-banner.png" alt="BetXentra — Official Betting Partner in Africa" className="xb-hero-img"
                  onError={(e) => { e.target.style.display = 'none'; }} />
              </div>
              <div className="xb-promo-card">
                <div className="xb-promo-card-inner xb-promo-worldcup">
                  <span className="xb-promo-tag xb-promo-tag-gold">FIFA WORLD CUP</span>
                  <h3>Bet the Tournament</h3>
                  <p>Back your nation through every match — sharper odds on the world&apos;s biggest stage.</p>
                  <div className="xb-promo-btns">
                    <button type="button" className="xb-promo-btn-primary" onClick={() => navigate('/')}>Bet Now</button>
                    <button type="button" className="xb-promo-btn-outline" onClick={() => setSubTab('highlights')}>View All</button>
                  </div>
                </div>
              </div>
              <div className="xb-promo-card">
                <div className="xb-promo-card-inner xb-promo-payout">
                  <span className="xb-promo-tag">FAST PAYOUTS</span>
                  <h3>Instant MoMo Withdrawals</h3>
                  <p>Deposit and withdraw with MTN, Telecel Cash and AirtelTigo Money.</p>
                  <div className="xb-promo-btns">
                    <button type="button" className="xb-promo-btn-primary" onClick={() => navigate('/wallet')}>Get Bonus</button>
                    <button type="button" className="xb-promo-btn-outline" onClick={() => navigate('/referral')}>Referral</button>
                  </div>
                </div>
              </div>
              <div className="xb-promo-card">
                <div className="xb-promo-card-inner xb-promo-bonus">
                  <div className="xb-promo-bonus-icon">💰</div>
                  <span className="xb-promo-tag xb-promo-tag-green">WELCOME BONUS</span>
                  <h3>Free $8 Signup Bonus</h3>
                  <p>Claim your bonus balance and start betting on top football matches.</p>
                  <div className="xb-promo-btns">
                    <button type="button" className="xb-promo-btn-primary" onClick={() => navigate('/wallet')}>Get Bonus</button>
                    <button type="button" className="xb-promo-btn-outline" onClick={() => navigate('/referral')}>Referral</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Category Grid (auto-slide) ─── */}
      <div className="xb-cat-grid">
        <div className="xb-cat-track">
          {[0, 1].map((dup) => {
            const cats = [
              { img: '/images/cat-europe.png', label: 'Europe', action: () => { setActiveCategory('epl'); scrollToLeague('pl'); } },
              { img: '/images/cat-conference.png', label: 'Conference', action: () => setSubTab('highlights') },
              { img: '/images/cat-worldcup.png', label: 'World Cup', action: () => setSubTab('highlights') },
              { icon: '📅', label: 'Upcoming', action: () => setSubTab('today') },
              { icon: '🔴', label: 'Live', action: () => setSubTab('live') },
              { icon: '🎰', label: 'Casino', action: () => navigate('/casino') },
              { icon: '🎁', label: 'Referral', action: () => navigate('/referral') },
            ];
            return cats.map((cat) => (
              <button key={`${dup}-${cat.label}`} type="button" className="xb-cat-item" onClick={cat.action}>
                {cat.img
                  ? <img src={cat.img} alt={cat.label} className="xb-cat-img" />
                  : <span className="xb-cat-icon">{cat.icon}</span>}
                <span className="xb-cat-label">{cat.label}</span>
              </button>
            ));
          })}
        </div>
      </div>

      {/* ─── Verified Sports Payouts ─── */}
      <div className="xb-payouts-ticker">
        <span className="xb-ticker-badge">✅ Verified Sports Payouts</span>
        <span className="xb-ticker-right">
          <span className="xb-paid-dot" />Paid winners
          <span className="xb-ticker-date">Updated {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
        </span>
      </div>
      <div className="xb-winners-wrap">
        <div className="xb-winners-track">
          {[0, 1].map((dup) => (
            <div className="xb-winners-set" key={dup}>
              {[
                { phone: '059*****782', amount: 'GHS 187,340' },
                { phone: '055****081', amount: 'GHS 42,650' },
                { phone: '059*****602', amount: 'GHS 128,900' },
                { phone: '050*****439', amount: 'GHS 73,210' },
                { phone: '024****391', amount: 'GHS 15,870' },
                { phone: '053*****117', amount: 'GHS 96,500' },
                { phone: '020****845', amount: 'GHS 154,280' },
                { phone: '026*****963', amount: 'GHS 61,740' },
              ].map((w, i) => (
                <div className="xb-winner-card" key={`${dup}-${i}`}>
                  <div className="xb-winner-top">
                    <span className="xb-winner-trophy">🏆</span>
                    <span className="xb-winner-phone">{w.phone} won</span>
                  </div>
                  <div className="xb-winner-amount">{w.amount}</div>
                  <div className="xb-winner-badge">⏱ SPORTS · PAID</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ─── Sport tabs ─── */}
      <div className="sb-sport-tabs">
        <button type="button" className="sb-sport-tab" style={{ fontWeight: 800, color: 'var(--text)' }}>Sports</button>
        {sportTabs.map((s) => (
          <button key={s.id} type="button" className={`sb-sport-tab${sportId === s.id ? ' active' : ''}`}
            onClick={() => { window.history.replaceState({}, '', `?sport=${s.id}`); setSportId(s.id); setActiveLeague(null); }}>
            {s.name}{s.count != null && <span className="ct">{s.count}</span>}
          </button>
        ))}
      </div>

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
                    <span className="sb-league-head-left">
                      <svg className="sb-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                      <span className="sb-flag">{(lg.crest?.label || lg.name).slice(0, 2).toUpperCase()}</span>
                      <span className="sb-league-name">{lg.name}</span>
                    </span>
                    <span className="sb-league-head-right">
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
                    </span>
                  </header>

                  <div className="sb-league-body">
                    <div className={`sb-league-cols ${gridClass}`}>
                      <span />
                      <span />
                      {sample?.selections?.map((s) => <span key={s.key}>{s.key}</span>)
                        || <><span>1</span><span>X</span><span>2</span></>}
                    </div>

                    {lg.matches.map((match, mIdx) => {
                      const cols = columnsFor(marketChip, match);
                      const market = cols?.market;
                      const myPicks = selections.filter((s) => s.matchId === match.id && s.market === market);
                      const minOdds = cols?.selections ? Math.min(...cols.selections.map((s) => s.odds || 99)) : 99;
                      const isHot = match.isLive || minOdds < 1.8;
                      const isBestOdds = !match.isLive && minOdds >= 1.3 && minOdds < 2.2 && mIdx % 3 !== 2;
                      const commentCount = ((match.id?.charCodeAt?.(0) || mIdx) % 5) + 1;

                      return (
                        <div key={match.id} className={`sb-match ${gridClass}`}>
                          {(isHot || isBestOdds) && (
                            <div className="sb-match-badges">
                              {isHot && <span className="sb-badge-hot">HOT</span>}
                              {isBestOdds && <span className="sb-badge-best">BEST ODDS</span>}
                            </div>
                          )}

                          <div className="sb-match-id-bar">
                            <span>ID {String(match.id || '').slice(-5).replace(/\D/g, '') || (43000 + mIdx)}</span>
                            <span>{lg.name.includes('International') ? 'International' : lg.name.split(' ').pop()}</span>
                            <span>•</span>
                            <span>{match.day || 'Today'}</span>
                          </div>

                          <div className="sb-match-row">
                            <button
                              type="button"
                              className="sb-match-time"
                              onClick={() => openMarkets(lg, match)}
                            >
                              {match.isLive ? (
                                <>
                                  <span className="live">LIVE</span>
                                  <span className="score">{match.scoreHome}-{match.scoreAway}</span>
                                  <span className="minute">{match.minute || ''}'</span>
                                </>
                              ) : (
                                <>
                                  <span className="kickoff">{match.kickoff || ''}</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              className="sb-match-teams"
                              onClick={() => openMarkets(lg, match)}
                            >
                              <span className="row">{match.home}</span>
                              <span className="row">{match.away}</span>
                            </button>

                            <div className="sb-odds-group">
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
                          </div>

                          <div className="sb-match-footer">
                            <button
                              type="button"
                              className="sb-match-comments"
                              onClick={() => {
                                setCommentsMatch({ league: lg, match });
                                requestAnimationFrame(() => commentsDlg.current?.showModal());
                              }}
                            >
                              💬 Comments {(allComments[match.id] || []).length || ''}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </Fragment>
            );
          })}
        </>
      )}

      {/* ─── Grand Prize Winners ─── */}
      <div className="sb-bottom-stack">
        <GrandPrizeWinners />
      </div>

      {/* ─── Draggable floating betslip button ─── */}
      <DraggableBetFAB
        count={selections.length}
        totalOdds={totalOdds}
        onClick={() => setSlipOpen(true)}
      />

      {/* ─── Slip bottom sheet ─── */}
      <dialog ref={slipDlg} className="sb-sheet sporty-betslip-sheet" onClose={() => setSlipOpen(false)}>
        <div className="xb-sheet-header">
          <div className="xb-header-left">
            <span className="xb-count-badge">{selections.length}</span>
            <span className="xb-header-title">Bet Slip</span>
          </div>
          <div className="xb-header-right">
            <span className="xb-balance">Bal: GHS {formatAmt(account?.balance || 0)}</span>
            <button type="button" className="xb-minimize-btn" onClick={() => setSlipOpen(false)} aria-label="Minimize">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
        </div>

        <div className="sb-sheet-body" style={{ padding: '0 0 max(80px, env(safe-area-inset-bottom))' }}>
          {/* Clear slip button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 12px 0' }}>
            {selections.length > 0 && (
              <button type="button" onClick={clearSlip} style={{ background: 'none', border: 0, color: '#d32f2f', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Clear All
              </button>
            )}
          </div>

          <div className="betslip" style={{ padding: '0 12px 12px' }}>
            {/* Mode tabs — Multiple / Single */}
            <div className="xb-mode-tabs">
              <button type="button" className={`xb-mode-tab${betMode === 'multiple' ? ' active' : ''}`} onClick={() => setBetMode('multiple')}>Multiple</button>
              <button type="button" className={`xb-mode-tab${betMode === 'single' ? ' active' : ''}`} onClick={() => setBetMode('single')}>Single</button>
              <button type="button" className="xb-mode-close" onClick={() => setSlipOpen(false)} aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* Selections list */}
            {selections.length === 0 ? (
              <p style={{ fontSize: 13, color: '#888', padding: '24px 0', textAlign: 'center' }}>
                Tap any odds to add a selection.
              </p>
            ) : (
              <div className="xb-selections" style={{ maxHeight: '220px', overflowY: 'auto' }}>
                {selections.map((s) => (
                  <div key={s.id} className="xb-sel-card">
                    <div className="xb-sel-top">
                      <div className="xb-sel-info">
                        <div className="xb-sel-teams">{s.meta}</div>
                        <div className="xb-sel-pick">{s.pickLabel} @ {s.odds.toFixed(2)}</div>
                      </div>
                      <div className="xb-sel-actions">
                        <button type="button" className="xb-view-match" onClick={() => {/* navigate to match */}}>View Match</button>
                        <button type="button" className="xb-sel-remove" aria-label="Remove" onClick={() => removeById(s.id)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>
                    </div>
                    {/* Single mode: individual stake per selection */}
                    {betMode === 'single' && (
                      <div className="xb-sel-stake-row">
                        <div className="xb-sel-stake-input">
                          <input
                            type="text"
                            value={stake}
                            onChange={(e) => setStake(e.target.value)}
                            inputMode="decimal"
                            placeholder="Enter stake (USD)"
                          />
                        </div>
                        <div className="xb-sel-win">
                          <span className="xb-sel-win-label">Single Win</span>
                          <span className="xb-sel-win-val">${payout > 0 ? formatAmt(s.odds * parseStake(stake)) : '0.00'}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Summary section */}
            <div className="xb-summary">
              {betMode === 'single' && (
                <div className="xb-summary-row">
                  <span>Selections</span>
                  <span>{selections.length}</span>
                </div>
              )}
              {betMode === 'multiple' && (
                <div className="xb-summary-row">
                  <span>Total Odds</span>
                  <span>{selections.length ? totalOdds.toFixed(2) : '—'}</span>
                </div>
              )}
              <div className="xb-summary-row">
                <span>Total Stake</span>
                <span>${formatAmt(totalStake)}</span>
              </div>
              <div className="xb-summary-row">
                <span>Potential Win</span>
                <span>${payout > 0 ? formatAmt(payout) : '0.00'}</span>
              </div>
            </div>

            {/* Multiple mode: single stake input + quick buttons */}
            {betMode === 'multiple' && (
              <div className="xb-stake-section">
                <div className="xb-stake-row">
                  <span className="xb-stake-label">Stake</span>
                  <div className="xb-stake-input-wrap">
                    <input
                      type="text"
                      value={stake}
                      onChange={(e) => setStake(e.target.value)}
                      inputMode="decimal"
                      placeholder="Enter stake (USD)"
                      autoComplete="off"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Quick stake add buttons */}
            <div className="xb-quick-stakes">
              {[100, 200, 300, 400, 500, 600, 700, 800, 900, 1000].map((amt) => (
                <button key={amt} type="button" className="xb-quick-btn" onClick={() => setStake(formatAmt(parseStake(stake) + amt))}>+{amt}</button>
              ))}
            </div>

            {/* Minimum stake warning */}
            {parseStake(stake) > 0 && parseStake(stake) < 400 && (
              <div className="xb-warn">Enter stake on each selection above.</div>
            )}

            {/* Insufficient balance */}
            {parseStake(stake) > (account?.balance || 0) && betRealMode === 'REAL' && (
              <div className="xb-warn" style={{ color: '#d32f2f' }}>
                Insufficient balance. <a href="#deposit" className="xb-deposit-link" onClick={(e) => { e.preventDefault(); setSlipOpen(false); openDeposit(); }}>Deposit</a>
              </div>
            )}

            {slipErr && <div className="xb-warn" style={{ color: '#d32f2f' }}>{slipErr}</div>}

            {/* Booking code section */}
            <div className="xb-booking-section">
              <div className="xb-booking-title">Booking Code</div>
              <div className="xb-booking-row">
                <input
                  type="text"
                  className="xb-booking-input"
                  placeholder="Enter booking code"
                  value={payslip}
                  onChange={(e) => setPayslip(e.target.value)}
                />
                <button type="button" className="xb-booking-load" onClick={async () => {
                  if (!payslip.trim()) return;
                  const ok = await loadFromCode(payslip);
                  if (ok) { setPayslip(''); toast('Selections loaded!'); }
                  else toast('Booking code not found.');
                }}>Load</button>
              </div>
            </div>

            {/* Action buttons */}
            <div className="xb-actions">
              <button
                type="button"
                className="xb-book-btn"
                onClick={onBookBet}
                disabled={isBooking}
              >
                {isBooking ? 'Booking...' : 'Book Bet'}
              </button>
              <button
                type="button"
                className="xb-place-btn"
                onClick={onPlaceBet}
                disabled={isPlacing || !selections.length || parseStake(stake) <= 0 || (parseStake(stake) > (account?.balance || 0) && betRealMode === 'REAL')}
              >
                {isPlacing ? 'Placing...' : 'Place Bet'}
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

      <BetPlacementSuccessModal
        isOpen={!!successBet}
        betType={successType}
        onClose={() => { setSuccessBet(null); setSuccessType('placed'); }}
        onShare={() => {
          const code = successBet?.bookingCode || 'XX00000';
          const text = `Check out my bet on BetXentra!\nBooking Code: ${code}`;
          if (navigator.share) {
            navigator.share({ title: 'BetXentra Booking Code', text, url: `https://betxentra.vercel.app/ticket/${code}` }).catch(() => {});
          } else {
            navigator.clipboard.writeText(code).then(() => toast('Booking code copied!', 'success')).catch(() => {});
          }
        }}
        onViewOpenBets={() => { setSuccessBet(null); navigate('/bet-history'); }}
        onAddToBetslip={(code) => {
          setSuccessBet(null);
          setPayslip(code);
          setSlipOpen(true);
        }}
        totalStake={successBet?.stake ?? totalStake}
        potentialWin={successBet?.potentialWin ?? payout}
        bookingCode={successBet?.bookingCode || (successBet?.id ? toBookingCode(successBet.id) : 'XX00000')}
        sport={sportId === 'football' ? 'Football' : sportId.charAt(0).toUpperCase() + sportId.slice(1)}
      />

      {/* ─── Booking code modal ─── */}
      <dialog ref={codeDlg} className="gfab-modal" onClose={() => setCodeModalOpen(false)}>
        <div className="gfab-modal-inner">
          <div className="gfab-modal-header">
            <h3 className="gfab-modal-title">Load Booking Code</h3>
            <button type="button" className="gfab-modal-close" onClick={closeCodeModal} aria-label="Close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <p className="gfab-modal-desc">Enter your booking code to restore your selections.</p>
          <form onSubmit={handleCodeLoad} className="gfab-modal-form">
            <div className="gfab-input-wrap">
              <input
                ref={codeInputRef}
                type="text"
                value={codeInput}
                onChange={(e) => { setCodeInput(e.target.value.toUpperCase().replace(/\s+/g, '')); setCodeErr(''); }}
                placeholder="e.g. AB12345"
                maxLength={7}
                autoCapitalize="characters"
                spellCheck={false}
                autoComplete="off"
                className="gfab-input"
                aria-label="Booking code"
                aria-invalid={!!codeErr}
                disabled={codeLoading}
              />
              {codeInput && !codeLoading && (
                <button type="button" className="gfab-input-clear"
                  onClick={() => { setCodeInput(''); setCodeErr(''); codeInputRef.current?.focus(); }}
                  aria-label="Clear input">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                </button>
              )}
            </div>
            {codeErr && (
              <div className="gfab-error" role="alert">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {codeErr}
              </div>
            )}
            <div className="gfab-modal-actions">
              <button type="button" className="gfab-btn-cancel" onClick={closeCodeModal} disabled={codeLoading}>Cancel</button>
              <button type="submit" className="gfab-btn-load" disabled={!codeInput.trim() || codeLoading}>
                {codeLoading ? <span className="gfab-spinner" /> : <>Load Ticket</>}
              </button>
            </div>
          </form>
          <RecentCodes onSelect={(c) => { setCodeInput(c); setCodeErr(''); }} />
        </div>
      </dialog>

      {/* ─── Comments dialog ─── */}
      <dialog ref={commentsDlg} className="sb-comments-dlg" onClose={() => setCommentsMatch(null)}>
        {commentsMatch && (
          <CommentsPanel
            match={commentsMatch.match}
            league={commentsMatch.league}
            comments={allComments[commentsMatch.match.id] || []}
            onAdd={(text) => {
              const matchId = commentsMatch.match.id;
              const entry = {
                id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                text,
                user: account?.displayName || account?.phone || account?.email?.split('@')[0] || 'Guest',
                at: new Date().toISOString(),
                likes: 0,
              };
              const next = { ...allComments, [matchId]: [...(allComments[matchId] || []), entry] };
              persistComments(next);
            }}
            onLike={(commentId) => {
              const matchId = commentsMatch.match.id;
              const list = (allComments[matchId] || []).map((c) =>
                c.id === commentId ? { ...c, likes: (c.likes || 0) + 1 } : c
              );
              persistComments({ ...allComments, [matchId]: list });
            }}
            onClose={() => { commentsDlg.current?.close(); setCommentsMatch(null); }}
            isLoggedIn={!!account}
          />
        )}
      </dialog>
    </>
  );
}

function RecentCodes({ onSelect }) {
  const [codes, setCodes] = useState([]);
  useEffect(() => {
    try {
      const stored = localStorage.getItem('betxentra_recent_codes');
      if (stored) setCodes(JSON.parse(stored).slice(0, 5));
    } catch { /* ignore */ }
  }, []);
  if (!codes.length) return null;
  return (
    <div className="gfab-recent">
      <div className="gfab-recent-title">Recent codes</div>
      <div className="gfab-recent-list">
        {codes.map((c) => (
          <button key={c} type="button" className="gfab-recent-chip" onClick={() => onSelect(c)}>{c}</button>
        ))}
      </div>
    </div>
  );
}

/* ─── Comments panel ─── */
function CommentsPanel({ match, league, comments, onAdd, onLike, onClose, isLoggedIn }) {
  const [text, setText] = useState('');
  const listRef = useRef(null);

  const submit = (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setText('');
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    });
  };

  const timeAgo = (iso) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="sb-comments-panel">
      <header className="sb-comments-head">
        <button type="button" className="sb-comments-back" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div className="sb-comments-title">
          <span className="sb-comments-match">{match.home} vs {match.away}</span>
          <span className="sb-comments-league">{league.name}</span>
        </div>
        <span className="sb-comments-count">{comments.length}</span>
      </header>

      <div className="sb-comments-list" ref={listRef}>
        {comments.length === 0 ? (
          <div className="sb-comments-empty">
            <span className="sb-comments-empty-icon">💬</span>
            <p>No comments yet</p>
            <p className="sb-comments-empty-sub">Be the first to share your prediction!</p>
          </div>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="sb-comment">
              <div className="sb-comment-avatar">{(c.user || 'G')[0].toUpperCase()}</div>
              <div className="sb-comment-body">
                <div className="sb-comment-meta">
                  <span className="sb-comment-user">{c.user}</span>
                  <span className="sb-comment-time">{timeAgo(c.at)}</span>
                </div>
                <p className="sb-comment-text">{c.text}</p>
                <button type="button" className="sb-comment-like" onClick={() => onLike(c.id)}>
                  👍 {c.likes > 0 && <span>{c.likes}</span>}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {isLoggedIn ? (
        <form className="sb-comments-input" onSubmit={submit}>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Share your prediction..."
            maxLength={280}
            autoComplete="off"
          />
          <button type="submit" disabled={!text.trim()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
          </button>
        </form>
      ) : (
        <div className="sb-comments-login-prompt">
          Sign in to join the conversation
        </div>
      )}
    </div>
  );
}

/* ─── Helper: generate a random winner entry ─── */
/* ─── Draggable floating betslip FAB ─── */
function DraggableBetFAB({ count, totalOdds, onClick }) {
  const fabRef = useRef(null);
  const dragState = useRef({ dragging: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0 });
  const [pos, setPos] = useState(() => {
    try {
      const saved = localStorage.getItem('betxentra_fab_pos');
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return null;
  });
  const [dragged, setDragged] = useState(false);

  const getInitial = useCallback(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return { x: vw - 76, y: vh - 160 };
  }, []);

  useEffect(() => {
    if (!pos) setPos(getInitial());
    const onResize = () => {
      setPos((p) => {
        if (!p) return getInitial();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        return { x: Math.min(p.x, vw - 60), y: Math.min(p.y, vh - 60) };
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [pos, getInitial]);

  const handleStart = useCallback((clientX, clientY) => {
    if (!pos) return;
    dragState.current = { dragging: true, startX: clientX, startY: clientY, offsetX: pos.x, offsetY: pos.y };
    setDragged(false);
  }, [pos]);

  const handleMove = useCallback((clientX, clientY) => {
    const ds = dragState.current;
    if (!ds.dragging) return;
    const dx = clientX - ds.startX;
    const dy = clientY - ds.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) setDragged(true);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPos({
      x: Math.max(0, Math.min(vw - 60, ds.offsetX + dx)),
      y: Math.max(0, Math.min(vh - 60, ds.offsetY + dy)),
    });
  }, []);

  const handleEnd = useCallback(() => {
    dragState.current.dragging = false;
    setPos((p) => {
      if (p) {
        try { localStorage.setItem('betxentra_fab_pos', JSON.stringify(p)); } catch { /* ignore */ }
      }
      return p;
    });
  }, []);

  useEffect(() => {
    const onMouseMove = (e) => handleMove(e.clientX, e.clientY);
    const onMouseUp = () => handleEnd();
    const onTouchMove = (e) => { if (dragState.current.dragging) { e.preventDefault(); handleMove(e.touches[0].clientX, e.touches[0].clientY); } };
    const onTouchEnd = () => handleEnd();
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [handleMove, handleEnd]);

  if (!pos) return null;

  const hasSelections = count > 0;

  return (
    <div
      ref={fabRef}
      className={`drag-fab${hasSelections ? '' : ' drag-fab-empty'}`}
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={(e) => { e.preventDefault(); handleStart(e.clientX, e.clientY); }}
      onTouchStart={(e) => handleStart(e.touches[0].clientX, e.touches[0].clientY)}
      onClick={(e) => { if (!dragged) onClick(); else e.stopPropagation(); }}
      role="button"
      aria-label={hasSelections ? `Open betslip – ${count} selections` : 'Open betslip'}
    >
      {hasSelections ? (
        <>
          <div className="drag-fab-ring">
            <OddsGauge odds={totalOdds} size={42} />
          </div>
          <span className="drag-fab-count">{count}</span>
        </>
      ) : (
        <div className="drag-fab-ring">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16v16H4z" />
            <path d="M4 9h16M9 4v16" />
          </svg>
        </div>
      )}
    </div>
  );
}

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

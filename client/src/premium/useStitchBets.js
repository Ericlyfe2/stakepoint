import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchBetHistory, fetchCashoutOffer, executeCashout } from '../api/betApi.js';
import { useAccount } from '../providers/AccountProvider.jsx';

/* ---------------------------------------------------------------------------
   useStitchBets
   ---------------------------------------------------------------------------
   Backs the premium "My Bets" centre with the REAL bet history.

   It reads the signed-in user's tickets from /bet/history, splits them into
   open and settled, and reports guest / loading / ready / error so the screen
   can show the truth. It never fabricates a ticket, and an empty history is a
   real empty state — not the design's sample acca.

   Status values:
     guest    — not signed in
     loading  · fetching the history
     ready    — list loaded (may be empty)
     error    — the API could not be reached
   ------------------------------------------------------------------------- */

const POLL_MS = 30000;

const isSettled = (b) => b.status && b.status !== 'open' && b.status !== 'booked';

export default function useStitchBets() {
  const acct = useAccount() || {};
  const account = acct.account;
  const userId = account?.id || account?.userId;

  const [bets, setBets] = useState([]);
  const [status, setStatus] = useState(userId ? 'loading' : 'guest');
  const [error, setError] = useState('');
  const mounted = useRef(true);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetchBetHistory();
      if (!mounted.current) return;
      setBets(res?.bets || []);
      setError('');
      setStatus('ready');
    } catch (e) {
      if (!mounted.current) return;
      setError(e?.message || 'Could not load your bets.');
      // Keep showing a list we already have; only surface the error otherwise.
      setStatus((cur) => (cur === 'ready' ? 'ready' : 'error'));
    }
  }, [userId]);

  useEffect(() => {
    mounted.current = true;
    if (!userId) {
      setBets([]);
      setStatus('guest');
      return () => { mounted.current = false; };
    }
    setStatus((cur) => (cur === 'ready' ? 'ready' : 'loading'));
    load();
    const id = setInterval(load, POLL_MS);
    return () => { mounted.current = false; clearInterval(id); };
  }, [userId, load]);

  const openBets = useMemo(() => bets.filter((b) => b.status === 'open'), [bets]);
  const settledBets = useMemo(() => bets.filter(isSettled), [bets]);

  const totals = useMemo(() => {
    const activeStake = openBets.reduce((s, b) => s + Number(b.stake || 0), 0);
    const activeReturns = openBets.reduce(
      (s, b) => s + Number(b.potentialWin || (Number(b.stake || 0) * Number(b.totalOdds || 0)) || 0),
      0,
    );
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const netProfit = settledBets.reduce((s, b) => {
      const when = Date.parse(b.settledAt || b.placedAt || '') || 0;
      if (when && when < cutoff) return s;
      const stake = Number(b.stake || 0);
      const back = b.status === 'won'
        ? Number(b.totalReturn || b.potentialWin || 0)
        : b.status === 'cashed_out'
          ? Number(b.cashOut || 0)
          : b.status === 'void'
            ? stake
            : 0;
      return s + (back - stake);
    }, 0);
    return { activeStake, activeReturns, netProfit };
  }, [openBets, settledBets]);

  return { bets, openBets, settledBets, totals, status, error, refresh: load };
}

/* ---------------------------------------------------------------------------
   useStitchBetOffers
   ---------------------------------------------------------------------------
   Resolves the REAL cash-out offer for each open ticket and executes the real
   cash-out. It never invents a value: a ticket with no live offer reports that
   honestly, and a locked ticket stays locked.
   ------------------------------------------------------------------------- */

export function useStitchBetOffers(openBets = []) {
  const acct = useAccount() || {};
  const [offers, setOffers] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  // Keep the latest list reachable from the interval without re-subscribing.
  const listRef = useRef(openBets);
  listRef.current = openBets;
  const key = openBets.map((b) => b.id).join('|');

  const loadAll = useCallback(async () => {
    const list = listRef.current;
    if (!list.length) { setOffers({}); return; }
    const entries = await Promise.all(list.map(async (b) => {
      try {
        const res = await fetchCashoutOffer(b.id);
        const amt = Number(res?.offer);
        return [b.id, {
          amount: amt > 0 ? amt : 0,
          locked: !!res?.locked,
          state: res?.locked ? 'locked' : amt > 0 ? 'available' : 'unavailable',
        }];
      } catch {
        return [b.id, { amount: 0, locked: false, state: 'error' }];
      }
    }));
    setOffers(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    if (!openBets.length) { setOffers({}); return undefined; }
    loadAll();
    const id = setInterval(loadAll, 20000);
    return () => clearInterval(id);
    // Re-resolve whenever the set of open tickets changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, loadAll]);

  const cashOut = useCallback(async (bet, fraction = 1) => {
    const amount = Number(offers[bet?.id]?.amount || 0);
    if (!bet || !(amount > 0)) return { ok: false };
    setBusyId(bet.id);
    setError('');
    try {
      const res = await executeCashout(bet.id, amount, fraction);
      const credited = Number(res?.cashOut ?? res?.bet?.cashOut ?? amount);
      acct.showWin?.({ ...bet, cashOut: credited, status: 'cashed_out', settledAt: new Date().toISOString() });
      acct.refresh?.();
      await loadAll();
      return { ok: true, amount: credited };
    } catch (e) {
      setError(e?.message || 'Cash-out could not be completed.');
      // Odds moved — pull the fresh offer for review instead of retrying blind.
      if (e?.status === 409) loadAll();
      return { ok: false };
    } finally {
      setBusyId(null);
    }
  }, [offers, loadAll, acct]);

  return { offers, busyId, error, reload: loadAll, cashOut };
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchBetHistory, fetchCashoutOffer, executeCashout, setAutoCashout,
} from '../api/betApi.js';
import { useAccount } from '../providers/AccountProvider.jsx';

/* ---------------------------------------------------------------------------
   useStitchCashout
   ---------------------------------------------------------------------------
   Binds the Stitch live cash-out panel to the REAL cash-out API.

   It never invents an offer: it looks up the signed-in user's open bet on the
   given fixture, asks the server for the current offer, and exposes the actual
   stake / offer / profit. When there is no eligible bet — guest, no open bet,
   a locked match, or an unavailable offer — it reports that state honestly so
   the panel can show why cash-out isn't available instead of a fake value.

   Status values:
     guest        — not signed in
     loading      · resolving the open bet
     none         — signed in, but no open bet on this fixture
     locked       — bet exists but the admin locked cash-out for the match
     unavailable  — open bet exists but the server has no offer (suspended/0)
     available    →[offer] real offer is executable
     error        — couldn't reach the API (never fabricates a fallback offer)
   ------------------------------------------------------------------------- */

const POLL_MS = 15000;

export default function useStitchCashout(matchId) {
  const acct = useAccount() || {};
  const account = acct.account;
  const userId = account?.id || account?.userId;

  const [status, setStatus] = useState(userId ? 'loading' : 'guest');
  const [bet, setBet] = useState(null);
  const [offer, setOffer] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    if (!userId || !matchId) return;
    try {
      const { bets } = await fetchBetHistory();
      const open = (bets || []).filter(
        (b) => b.status === 'open' && (b.legs || []).some((l) => l.matchId === matchId),
      );
      if (!open.length) {
        if (!aliveRef.current) return;
        setBet(null);
        setOffer(null);
        setStatus('none');
        return;
      }
      const target = open[0];
      const res = await fetchCashoutOffer(target.id);
      if (!aliveRef.current) return;
      setBet(target);
      setOffer(res);
      if (res?.locked) setStatus('locked');
      else if (!(Number(res?.offer) > 0)) setStatus('unavailable');
      else setStatus('available');
    } catch {
      // Network / session failure — stay honest, never fabricate a value.
      if (!aliveRef.current) return;
      setStatus((cur) => (cur === 'available' ? cur : 'error'));
    }
  }, [userId, matchId]);

  useEffect(() => {
    aliveRef.current = true;
    if (!userId || !matchId) {
      setBet(null);
      setOffer(null);
      setStatus('guest');
      return () => { aliveRef.current = false; };
    }
    setStatus((cur) => (cur === 'available' ? cur : 'loading'));
    load();
    const id = setInterval(load, POLL_MS);
    return () => { aliveRef.current = false; clearInterval(id); };
  }, [userId, matchId, load]);

  const execute = useCallback(async (fraction = 1) => {
    const amount = Number(offer?.offer);
    if (!bet || !(amount > 0)) return { ok: false };
    setError('');
    setBusy(true);
    try {
      const res = await executeCashout(bet.id, amount, fraction);
      const credited = Number(res?.cashOut ?? res?.bet?.cashOut ?? amount);
      acct.showWin?.({ ...bet, cashOut: credited, status: 'cashed_out' });
      acct.refresh?.();
      await load();
      return { ok: true, amount: credited };
    } catch (e) {
      setError(e?.message || 'Cash-out could not be completed.');
      // Odds moved or the offer changed — pull the fresh offer for review.
      if (e?.status === 409) load();
      return { ok: false };
    } finally {
      setBusy(false);
    }
  }, [bet, offer, load, acct]);

  const setAuto = useCallback(async (target) => {
    if (!bet) return { ok: false };
    setError('');
    try {
      await setAutoCashout(bet.id, target);
      await load();
      return { ok: true };
    } catch (e) {
      setError(e?.message || 'Could not set auto cash-out.');
      return { ok: false };
    }
  }, [bet, load]);

  const value = useMemo(() => ({
    status,
    bet,
    offer,
    currentOffer: Number(offer?.offer) > 0 ? Number(offer.offer) : 0,
    autoCashoutTarget: Number(offer?.autoCashoutTarget) > 0 ? Number(offer.autoCashoutTarget) : 0,
    busy,
    error,
    execute,
    setAuto,
    reload: load,
  }), [status, bet, offer, busy, error, execute, setAuto, load]);

  return value;
}

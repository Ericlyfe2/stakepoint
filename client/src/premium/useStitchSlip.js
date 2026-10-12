import { useCallback, useEffect, useMemo, useState } from 'react';
import { placeBet } from '../api/betApi.js';
import useBetslip from '../hooks/useBetslip.js';
import { useAccount } from '../providers/AccountProvider.jsx';
import { BONUS_RATE, formatAmt, validateBetSlip } from '../lib/betslipEngine.js';

/* ---------------------------------------------------------------------------
   useStitchSlip
   ---------------------------------------------------------------------------
   Wraps the app's real betslip hook so all four Stitch ports place real bets
   through /bet/place with the same validation, balance guard and
   account-refresh the production home page uses.

   Returns the slip plus `place()` and a transient `notice` for the ports' own
   toast (the production Home surfaces these inline in the slip instead).
   ------------------------------------------------------------------------- */

export default function useStitchSlip({ minStake = 300, snapshot = null } = {}) {
  const { account, setAccount, openDeposit } = useAccount();
  const slip = useBetslip('multiple');
  const [placing, setPlacing] = useState(false);
  const [notice, setNotice] = useState(null);
  const [nonce, setNonce] = useState(0);

  /* Keep slip odds in step with the board. Home.jsx does this at page level
     (syncOdds(snapshot)); doing it here means every port gets it for free and
     a leg whose market suspends is marked stale instead of silently holding
     its old price. */
  useEffect(() => {
    slip.syncOdds(snapshot);
  }, [snapshot, slip.syncOdds]);

  const flash = useCallback((message, tone = 'ok') => {
    setNonce((n) => n + 1);
    setNotice({ message, tone, id: nonce + 1 });
  }, [nonce]);

  const clearNotice = useCallback(() => setNotice(null), []);

  /* The engine already folds the backend's boost into `slip.payout` for
     multiples (computeMultiplePayout), so the potential return IS the boosted
     figure — we must NOT add a second percentage on top. This just exposes the
     boost portion of that same number for the slip's "Boosted Extra" line. */
  const bonusPct = slip.betMode === 'multiple' && slip.selectionCount >= 2 ? BONUS_RATE : 0;
  const bonusAmount = useMemo(() => {
    if (bonusPct <= 0) return 0;
    const gross = slip.totalStake * slip.totalOdds;
    return Math.max(0, slip.payout - gross);
  }, [bonusPct, slip.totalStake, slip.totalOdds, slip.payout]);
  const boostedPayout = slip.payout;

  const balance = Number(account?.balance || 0);
  const insufficient = slip.totalStake > balance;

  const hasStale = useMemo(
    () => slip.selections.some((s) => s.stale),
    [slip.selections],
  );

  const problems = useMemo(() => {
    if (!slip.selectionCount) return [];
    if (hasStale) {
      return ['One or more selections have been suspended/updated — remove or reselect them.'];
    }
    return validateBetSlip({
      selections: slip.selections,
      betMode: slip.betMode,
      stakes: slip.stakes,
      account,
      minStake,
    });
  }, [slip.selectionCount, hasStale, slip.selections, slip.betMode, slip.stakes, account, minStake]);

  const canPlace =
    slip.selectionCount > 0 &&
    !placing &&
    !insufficient &&
    !hasStale &&
    problems.length === 0;

  const place = useCallback(async () => {
    if (!account) {
      flash('Sign in to place your bet.', 'err');
      return { ok: false };
    }
    if (insufficient) {
      flash('Insufficient balance. Top up to place this bet.', 'err');
      return { ok: false };
    }
    if (problems.length) {
      flash(problems[0], 'err');
      return { ok: false };
    }

    setPlacing(true);
    try {
      const payload = {
        mode: slip.betMode,
        stake: slip.totalStake,
        selections: slip.selections.map((s) => ({
          matchId: s.matchId,
          market: s.market,
          outcome: s.outcome,
          odds: s.odds,
        })),
      };
      const res = await placeBet(payload);
      if (!res?.success) throw new Error(res?.error || 'Could not place bet.');
      if (res.account) setAccount(res.account);
      const won = res.bet?.potentialReturn ?? boostedPayout;
      flash(`Bet placed — GHS ${formatAmt(won)} potential return.`, 'ok');
      slip.clearSlip();
      return { ok: true, bet: res.bet };
    } catch (e) {
      flash(e?.message || 'Could not place bet.', 'err');
      return { ok: false };
    } finally {
      setPlacing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, insufficient, problems, slip, boostedPayout]);

  return {
    ...slip,
    account,
    openDeposit,
    balance,
    insufficient,
    problems,
    bonusPct,
    bonusAmount,
    boostedPayout,
    canPlace,
    placing,
    place,
    notice,
    clearNotice,
  };
}

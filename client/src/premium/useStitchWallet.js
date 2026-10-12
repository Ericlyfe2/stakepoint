import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchTransactions, fetchWalletRules, withdraw as requestWithdraw } from '../api/betApi.js';
import { useAccount } from '../providers/AccountProvider.jsx';
import { appendTxCache, mergeTxLists, readTxCache, writeTxCache } from '../lib/txCache.js';

/* ---------------------------------------------------------------------------
   useStitchWallet
   ---------------------------------------------------------------------------
   Backs the premium Wallet and Withdraw screens with the REAL wallet APIs:
   /wallet/transactions, /wallet/rules and /wallet/withdraw.

   It never invents a balance, a transaction or a limit — when the API can't be
   reached the screen reports the error, and an account with no history shows an
   honest empty state. The deposit flow itself lives in AccountProvider (Paybill
   dialog) and is reached through useStitchSlip().openDeposit.

   Status values: guest · loading · ready · error
   ------------------------------------------------------------------------- */

const POLL_MS = 30000;

const isWithdrawal = (t) => t?.kind === 'withdraw' || t?.kind === 'withdrawal';

export default function useStitchWallet() {
  const acct = useAccount() || {};
  const account = acct.account;
  const userId = account?.id || account?.userId;

  const [transactions, setTransactions] = useState([]);
  const [rules, setRules] = useState(null);
  const [status, setStatus] = useState(userId ? 'loading' : 'guest');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    if (!userId) return;
    const [txRes, rulesRes] = await Promise.allSettled([
      fetchTransactions(),
      fetchWalletRules(),
    ]);
    if (!mounted.current) return;
    if (rulesRes.status === 'fulfilled' && rulesRes.value) setRules(rulesRes.value);
    if (txRes.status === 'fulfilled') {
      const server = txRes.value?.transactions || [];
      const merged = mergeTxLists(server, readTxCache(userId));
      writeTxCache(userId, merged);
      setTransactions(merged);
      setError('');
      setStatus('ready');
    } else {
      setError(txRes.reason?.message || 'Could not load your transactions.');
      // Keep an already-loaded list on screen; only surface the error otherwise.
      setStatus((cur) => (cur === 'ready' ? 'ready' : 'error'));
    }
  }, [userId]);

  useEffect(() => {
    mounted.current = true;
    if (!userId) {
      setTransactions([]);
      setStatus('guest');
      return () => { mounted.current = false; };
    }
    // Prime from the local cache so the list is never blank between fetches.
    setTransactions(readTxCache(userId));
    setStatus((cur) => (cur === 'ready' ? 'ready' : 'loading'));
    load();
    const id = setInterval(load, POLL_MS);
    return () => { mounted.current = false; clearInterval(id); };
  }, [userId, load]);

  const withdrawals = useMemo(() => transactions.filter(isWithdrawal), [transactions]);
  const deposits = useMemo(() => transactions.filter((t) => t?.kind === 'deposit'), [transactions]);

  const withdraw = useCallback(async (amount, method) => {
    setBusy(true);
    try {
      const res = await requestWithdraw(amount, method);
      if (res?.account) acct.setAccount?.(res.account);
      if (res?.transaction) {
        setTransactions((cur) => mergeTxLists([res.transaction], cur));
        if (userId) appendTxCache(userId, res.transaction);
      }
      return { ok: true, transaction: res?.transaction, account: res?.account };
    } catch (e) {
      return { ok: false, error: e?.body?.message || e?.message || 'Withdrawal failed.' };
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [userId, acct]);

  return {
    account,
    transactions,
    withdrawals,
    deposits,
    rules,
    status,
    error,
    refresh: load,
    withdraw,
    busy,
  };
}

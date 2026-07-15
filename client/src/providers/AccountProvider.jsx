import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  setTokens, clearTokens, getAccess,
  fetchMe, logout as apiLogout,
  deposit as apiDeposit,
  fetchTransactions,
  fetchUnacknowledgedWins, acknowledgeBet,
} from '../api/betApi.js';
import { onLive, refreshAuth, disconnectSocket } from '../api/socketClient.js';
import WinTrophyModal from '../components/WinTrophyModal.jsx';
import WinCelebrationModal from '../components/WinCelebrationModal.jsx';
import DepositResultModal from '../components/DepositResultModal.jsx';
import TxHeader from '../components/TxHeader.jsx';
import PaybillInstructions from '../components/PaybillInstructions.jsx';
import { appendTxCache } from '../lib/txCache.js';
import { requestNotificationPermission, notify as osNotify } from '../lib/browserNotify.js';

export const AccountCtx = React.createContext(null);
export const ToastCtx   = React.createContext(null);

const EMPTY_ACCOUNT = {
  account: null, loading: false,
  signIn: () => {}, signOut: () => {}, adjustBalance: () => {},
  setAccount: () => {}, openDeposit: () => {}, openWithdraw: () => {},
  refresh: () => {}, showWin: () => {},
  notifications: [], unreadCount: 0, clearNotifications: () => {}, markNotificationRead: () => {},
};
const EMPTY_TOAST = { toast: () => {} };

const DEPOSIT_NETWORKS = {
  momo:       { label: 'MTN Mobile Money', tag: 'MTN', bg: '#ffcc00' },
  vodafone:   { label: 'Telecel Cash',     tag: 'TLC', bg: '#e60000' },
  airteltigo: { label: 'AT Money',         tag: 'AT',  bg: '#0055ff' },
};
const DEPOSIT_NETWORK_ORDER = ['momo', 'vodafone', 'airteltigo'];

export const useAccount = () => React.useContext(AccountCtx) || EMPTY_ACCOUNT;
export const useToast   = () => React.useContext(ToastCtx)   || EMPTY_TOAST;

function formatAmt(n) {
  return Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Some accounts only have a phone-like value stored in `email` (users who
// registered with a phone number instead of an email address).
function accountPhoneRef(account) {
  if (account?.phone) return account.phone;
  if (account?.email && !account.email.includes('@')) return account.email;
  return '';
}

// ---------- session cache helpers ----------
// Persist the last known account to localStorage so the user stays
// visually logged in across page reloads and brief server hibernation.
const ACCOUNT_CACHE_KEY = 'sp_account_v1';
function readAccountCache() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(ACCOUNT_CACHE_KEY) : null;
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function writeAccountCache(acct) {
  try {
    if (typeof localStorage !== 'undefined') {
      if (acct) localStorage.setItem(ACCOUNT_CACHE_KEY, JSON.stringify(acct));
      else localStorage.removeItem(ACCOUNT_CACHE_KEY);
    }
  } catch { /* storage quota */ }
}

export default function AppProviders({ children }) {
  const navigate = useNavigate();

  // Seed state from cache so the UI renders the user as logged-in
  // immediately on page load, before the /auth/me response comes back.
  const [account, setAccountRaw] = useState(() => {
    if (!getAccess()) return null;   // no token → definitely logged out
    return readAccountCache();       // may be null if first ever visit
  });

  const setAccount = useCallback((acct) => {
    setAccountRaw(acct);
    writeAccountCache(acct);          // keep cache in sync
  }, []);

  const [loading, setLoading] = useState(!!getAccess());

  const [toasts, setToasts] = useState([]);

  const depositDlg  = useRef(null);
  const MIN_DEPOSIT  = 300;
  const MAX_DEPOSIT  = 50000;
  const [depositAmt,  setDepositAmt]   = useState(String(MIN_DEPOSIT));
  const [depositMethod, setDepositMethod] = useState('paybill');
  const [depositTab, setDepositTab]   = useState('paybill'); // 'paybill' | 'card'
  const [depositNetwork, setDepositNetwork] = useState('momo');
  const [showPaybillInstructions, setShowPaybillInstructions] = useState(false);
  const [paybillMeta, setPaybillMeta] = useState(() => ({
    reference: String(Math.floor(100000000 + Math.random() * 900000000)),
    depositId: String(Math.floor(1000 + Math.random() * 9000)),
  }));
  // The paybill deposit actually submitted to the backend for admin review.
  // `status` mirrors the transaction: 'pending' | 'completed' | 'rejected'.
  const [paybillTx, setPaybillTx] = useState(null);
  const [paybillSubmitting, setPaybillSubmitting] = useState(false);
  const [paybillRefreshing, setPaybillRefreshing] = useState(false);
  const [paybillJustResolved, setPaybillJustResolved] = useState(false);
  const paybillTxRef = useRef(null);
  useEffect(() => { paybillTxRef.current = paybillTx; }, [paybillTx]);

  // The PayBill details card is a live "Pending" status display, not a
  // permanent record — once the admin resolves it, drop back to "Pending"
  // after a minute so the card always reflects an in-flight-looking request.
  useEffect(() => {
    if (paybillTx?.status !== 'completed' && paybillTx?.status !== 'rejected') return;
    const timer = setTimeout(() => {
      setPaybillTx((prev) => (prev && prev.status !== 'pending') ? { ...prev, status: 'pending' } : prev);
      setPaybillJustResolved(false);
    }, 60_000);
    return () => clearTimeout(timer);
  }, [paybillTx?.status, paybillTx?.id]);
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState('');
  const [wins, setWins] = useState([]);
  const [celebration, setCelebration] = useState(null); // single bet for WinCelebrationModal
  // Queue of deposit decisions still to show. Approve/reject events push into
  // it; the modal pops the head when dismissed. A queue (not a single value)
  // means a burst of admin decisions never silently overwrites an unread
  // popup the user hasn't acknowledged yet.
  const [depositResults, setDepositResults] = useState([]);
  const [notifications, setNotifications] = useState(() => {
    try {
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('sp_notifications') : null;
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const unreadCount = notifications.filter((n) => !n.read).length;

  // Functional updaters so concurrent socket pushes never lose entries to a
  // stale closure (live + poll + websocket can all arrive within one tick).
  const updateNotifications = useCallback((updater) => {
    setNotifications((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try { localStorage.setItem('sp_notifications', JSON.stringify(next.slice(0, 200))); } catch {}
      return next;
    });
  }, []);

  const addNotification = useCallback((n) => {
    updateNotifications((prev) => {
      const entry = { ...n, read: false, receivedAt: new Date().toISOString() };
      // De-dupe by id so a poll arriving after a socket push doesn't double-list.
      if (n.id && prev.some((x) => x.id === n.id)) return prev;
      return [entry, ...prev].slice(0, 200);
    });
  }, [updateNotifications]);

  const clearNotifications = useCallback(() => {
    updateNotifications([]);
  }, [updateNotifications]);

  const markNotificationRead = useCallback((id) => {
    updateNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, [updateNotifications]);

  const dismissToast = useCallback((id) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((msg, kind = 'info', opts = {}) => {
    if (!msg) return null;
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const ttl = typeof opts.ttl === 'number' ? opts.ttl : 3500;
    setToasts((cur) => [...cur.slice(-3), { id, message: msg, kind }]);
    if (ttl > 0) setTimeout(() => dismissToast(id), ttl);
    return id;
  }, [dismissToast]);

  const refresh = useCallback(async () => {
    // No access token at all → user is genuinely logged out
    if (!getAccess()) { setAccount(null); setLoading(false); return null; }
    try {
      const data = await fetchMe();
      setAccount(data.account);
      return data.account;
    } catch (err) {
      const status = err?.status;
      // ─── Only clear the session when we are 100% certain the token is dead.
      //
      // The backend runs on Render's free tier which hibernates. On wake it
      // can return 5xx, 0 (AbortError/network), or a garbled response before
      // it is ready. We must NOT treat those as "logged out" — the refresh
      // token is still valid and the user should stay logged in.
      //
      // We sign out ONLY when:
      //   • The server explicitly returns 401 (token invalid/expired)
      //   • AND there is no refresh token that could be used to get a new one
      //     (if there IS a refresh token, betApi already attempted the token
      //      swap inside rawFetch — a 401 here means even the refresh token
      //      was rejected, i.e. a definitive "end of session").
      if (status === 401 || status === 403) {
        // betApi already consumed the refresh token in rawFetch before
        // re-throwing. If tokens are gone, the session is truly dead.
        if (!getAccess()) {
          setAccount(null);
        }
        // If somehow an access token survived, leave account intact and let
        // the next background refresh sort it out.
      }
      // For 0 (network/timeout), 5xx, or any other transient failure:
      // keep the cached account state — the user stays visually logged in.
      return null;
    } finally {
      setLoading(false);
    }
  }, [setAccount]);

  useEffect(() => { refresh(); }, [refresh]);

  // Re-hydrate when the tab returns from being hidden (laptop wake, mobile
  // switch). Add a short debounce so rapid focus/blur cycles don't spam the
  // server, and silently swallow failures — a failed rehydration should
  // NEVER log the user out.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    let debounceTimer = null;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (!getAccess()) return;          // definitely logged out, skip
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        refresh().catch(() => { /* ignore — session stays intact */ });
      }, 800);  // 800 ms debounce to avoid hammering on rapid tab switches
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearTimeout(debounceTimer);
    };
  }, [refresh]);

  // Listen for definitive force-logout events dispatched by betApi when the
  // refresh token is explicitly rejected by the server (401/403 on /auth/refresh).
  // This is the ONLY time we clear the account in-memory based on an API signal.
  useEffect(() => {
    const onForceLogout = () => {
      setAccount(null);
    };
    window.addEventListener('betxentra:force-logout', onForceLogout);
    return () => window.removeEventListener('betxentra:force-logout', onForceLogout);
  }, [setAccount]);

  // Poll for freshly-settled wins the user hasn't seen.
  // (Realtime socket also pushes bet:won — poll is the safety net.)
  //
  // IMPORTANT: depend on `account?.id` (user identity), NOT on the whole
  // `account` object. Every deposit approval / balance update produces a new
  // account reference; if we depended on `account` we'd tear down and
  // re-handshake the socket on every wallet change, racing the very modal
  // we just queued. Identity-only deps mean the socket stays connected for
  // the entire session.
  const accountId = account?.id;
  useEffect(() => {
    if (!accountId) { setWins([]); disconnectSocket(); return; }
    let alive = true;

    refreshAuth(); // re-handshake the socket with the now-current access token

    const tick = async () => {
      try {
        const { bets } = await fetchUnacknowledgedWins();
        if (!alive || !Array.isArray(bets) || !bets.length) return;
        // Merge instead of replace so a concurrent cash-out modal entry
        // isn't clobbered by a polled win batch.
        let newWins = null;
        setWins((prev) => {
          const seen = new Set(prev.map((b) => b.id));
          const merged = [...prev];
          for (const b of bets) if (!seen.has(b.id)) merged.push({ ...b, id: b.id });
          return merged;
        });
        // Trigger celebration for the first new win (if no active celebration)
        setCelebration((cur) => {
          if (cur) return cur; // don't clobber active celebration
          const first = bets[0];
          if (!first) return cur;
          return { id: first.id, winAmount: first.cashOut ?? first.potentialWin ?? 0, currency: 'GHS', ticketId: first.bookingCode || first.id, bet: first };
        });
      } catch { /* ignore */ }
    };
    tick();
    const id = setInterval(tick, 60_000);

    // Live updates pushed by the server.
    const offWallet = onLive('wallet:update', ({ balance }) => {
      if (typeof balance === 'number') {
        setAccount((prev) => prev ? { ...prev, balance } : prev);
      }
    });
    const offPending = onLive('wallet:pending', ({ transaction, amount }) => {
      toast(`Deposit of GHS ${formatAmt(amount)} is pending admin approval.`, 'info', { ttl: 5000 });
      if (accountId && transaction) appendTxCache(accountId, transaction);
    });
    const offApproved = onLive('deposit:approved', ({ transaction, account: updatedAccount }) => {
      if (updatedAccount) setAccount(updatedAccount);
      const txId = transaction?.id;
      const amt  = transaction?.amount;
      if (paybillTxRef.current?.id === txId) {
        setPaybillTx((prev) => prev ? { ...prev, status: 'completed' } : prev);
        setPaybillJustResolved(true);
      }
      const title = 'Deposit approved';
      const body  = `GHS ${formatAmt(amt)} has been credited to your wallet.`;
      toast(`Deposit approved! GHS ${formatAmt(amt)} credited.`, 'success');
      // Persistent inbox entry — survives reload, de-duped by tx id.
      addNotification({
        id: `deposit-approved-${txId || Date.now()}`,
        title,
        body,
        severity: 'info',
        kind: 'deposit_approved',
      });
      // OS-level push — fires even when the tab is hidden / app is in the
      // background. No-ops when permission isn't granted.
      osNotify({
        title,
        body,
        tag: `deposit-${txId || 'approved'}`,
      });
      // In-app centered modal — guaranteed visible, no permission required.
      setDepositResults((prev) => {
        if (txId && prev.some((r) => r.txId === txId)) return prev;
        return [...prev, { kind: 'approved', amount: amt, txId, at: Date.now() }];
      });
    });
    const offRejected = onLive('deposit:rejected', ({ transaction, reason }) => {
      const txId = transaction?.id;
      const amt  = transaction?.amount;
      if (paybillTxRef.current?.id === txId) {
        setPaybillTx((prev) => prev ? { ...prev, status: 'rejected' } : prev);
        setPaybillJustResolved(true);
      }
      const title = 'Deposit rejected';
      const body  = `Your GHS ${formatAmt(amt)} deposit was rejected${reason ? ': ' + reason : '.'}`;
      toast(`Deposit of GHS ${formatAmt(amt)} rejected${reason ? ': ' + reason : ''}.`, 'warn');
      addNotification({
        id: `deposit-rejected-${txId || Date.now()}`,
        title,
        body,
        severity: 'critical',
        kind: 'deposit_rejected',
      });
      osNotify({
        title,
        body,
        tag: `deposit-${txId || 'rejected'}`,
      });
      setDepositResults((prev) => {
        if (txId && prev.some((r) => r.txId === txId)) return prev;
        return [...prev, { kind: 'rejected', amount: amt, reason, txId, at: Date.now() }];
      });
    });
    const offWin = onLive('bet:won', async () => { try { await tick(); } catch {} });
    const offNotif = onLive('notification:new', (payload) => {
      if (payload?.title) {
        addNotification(payload);
        toast(`${payload.title}${payload.body ? ': ' + payload.body : ''}`, payload.severity === 'critical' ? 'warn' : 'info', { ttl: 6000 });
      }
    });
    const offSettled = onLive('bet:settled', async () => { try { await tick(); } catch {} });
    const offStatus = onLive('account:status-changed', ({ accountStatus }) => {
      setAccount((prev) => prev ? { ...prev, accountStatus } : prev);
    });
    // Verification-stage move or block/unblock from the admin panel — the
    // withdraw page reads account.stage / account.blocked live.
    const offStage = onLive('account:stage-changed', ({ stage, blocked }) => {
      setAccount((prev) => prev ? { ...prev, stage: stage === undefined ? prev.stage : stage, blocked: !!blocked } : prev);
    });
    const offAutoCashout = onLive('cashout:auto-triggered', ({ betId, amount, bet }) => {
      toast(`Auto cash-out triggered! GHS ${formatAmt(amount)} credited.`, 'success');
      if (bet) showWin({ ...bet, cashOut: amount, status: 'cashed_out' });
      refresh();
    });
    const offSuspended = onLive('cashout:suspended', ({ betId, reason }) => {
      toast(`Cash-out suspended for bet #${betId}${reason ? ': ' + reason : ''}.`, 'warn');
    });

    return () => {
      alive = false;
      clearInterval(id);
      offWallet?.(); offPending?.(); offApproved?.(); offRejected?.(); offNotif?.(); offWin?.(); offSettled?.(); offStatus?.(); offStage?.(); offAutoCashout?.(); offSuspended?.();
    };
  }, [accountId]);

  const dismissWins = useCallback(async () => {
    const toAck = [...wins];
    setWins([]);
    for (const b of toAck) {
      try { await acknowledgeBet(b.id); } catch { /* swallow */ }
    }
    // Refresh balance in case settlement credited the wallet between calls.
    try { await refresh(); } catch { /* ignore */ }
  }, [wins, refresh]);

  /** Persist tokens + load account from a successful auth response. */
  const signIn = useCallback((authResponse) => {
    if (authResponse?.accessToken) setTokens(authResponse.accessToken, authResponse.refreshToken);
    if (authResponse?.account) setAccount(authResponse.account);
    if (authResponse?.account) toast(`Signed in as ${authResponse.account.displayName || authResponse.account.email}`);
    // Sign-in is a user gesture, so this is a good moment to ask for browser
    // notification permission. Fire-and-forget — the helper no-ops on refusal
    // or unsupported platforms, and never re-prompts once decided.
    requestNotificationPermission().catch(() => {});
  }, [toast]);

  const signOut = useCallback(async () => {
    try { await apiLogout(); } catch { /* ignore network */ }
    clearTokens();
    writeAccountCache(null);   // clear the localStorage account cache
    setAccount(null);
    toast('Logged out.');
    navigate('/', { replace: true });
  }, [toast, navigate, setAccount]);

  const adjustBalance = useCallback((delta, label) => {
    setAccount((prev) => prev ? { ...prev, balance: Number((prev.balance + delta).toFixed(2)) } : prev);
    if (label) toast(label);
  }, [toast]);

  const openDeposit = useCallback(() => {
    if (!account) { toast('Sign in to deposit.'); navigate('/login'); return; }
    setErr(''); setDepositAmt(String(MIN_DEPOSIT)); setDepositMethod('paybill'); setDepositTab('paybill'); setShowPaybillInstructions(false);
    setPaybillTx(null); setPaybillSubmitting(false); setPaybillRefreshing(false); setPaybillJustResolved(false);
    setPaybillMeta({
      reference: accountPhoneRef(account) || String(Math.floor(100000000 + Math.random() * 900000000)),
      depositId: String(Math.floor(1000 + Math.random() * 9000)),
    });
    depositDlg.current?.showModal();
  }, [account, toast, navigate]);

  const openWithdraw = useCallback(() => {
    if (!account) { toast('Sign in to withdraw.'); navigate('/login'); return; }
    navigate('/withdraw');
  }, [account, toast, navigate]);

  const submitDeposit = async (e) => {
    e.preventDefault();
    // Paybill tab uses a manual flow — show instructions instead of submitting
    if (depositTab === 'paybill') {
      setShowPaybillInstructions(true);
      return;
    }
    setErr('');
    const amt = parseFloat(String(depositAmt).replace(/,/g, ''));
    if (!Number.isFinite(amt) || amt <= 0) { setErr('Enter a valid amount.'); return; }
    if (amt < MIN_DEPOSIT) { setErr(`Minimum deposit is GHS ${MIN_DEPOSIT}.`); return; }
    // Submitting a deposit is the moment the user most wants notified about
    // its outcome — request browser permission here so the approve/reject
    // socket event can surface even when the tab is backgrounded.
    requestNotificationPermission().catch(() => {});
    try {
      setBusy(true);
      const data = await apiDeposit(amt, depositMethod);
      if (data?.transaction) {
        if (account?.id) appendTxCache(account.id, data.transaction);
      }
      depositDlg.current?.close();
      const labels = { momo: 'MoMo', vodafone: 'Vodafone Cash', airteltigo: 'AirtelTigo Money', paybill: 'Paybill', card: 'Card' };
      toast(`Deposit of GHS ${formatAmt(amt)} via ${labels[depositMethod] || depositMethod} submitted for admin approval.`, 'info');
    } catch (e) {
      setErr(e.message || 'Deposit failed.');
    } finally { setBusy(false); }
  };

  // Submits the paybill deposit the user just confirmed they've paid — this
  // is what actually creates the pending transaction admins see/approve on
  // /admin/deposits (the instructions screen up to this point is local-only).
  const submitPaybillTopUp = async () => {
    if (paybillSubmitting || paybillTx) return;
    const amt = parseFloat(String(depositAmt).replace(/,/g, ''));
    if (!Number.isFinite(amt) || amt < MIN_DEPOSIT) { setErr(`Minimum deposit is GHS ${MIN_DEPOSIT}.`); return; }
    setErr('');
    requestNotificationPermission().catch(() => {});
    try {
      setPaybillSubmitting(true);
      const data = await apiDeposit(amt, 'paybill');
      if (data?.transaction) {
        if (account?.id) appendTxCache(account.id, data.transaction);
        const initialStatus = data.transaction.status === 'completed' ? 'completed'
          : data.transaction.status === 'rejected' ? 'rejected' : 'pending';
        setPaybillTx({ id: data.transaction.id, status: initialStatus, amount: amt });
        if (initialStatus !== 'pending') setPaybillJustResolved(true);
      }
      toast('Payment submitted — waiting for admin confirmation.', 'info');
    } catch (e) {
      setErr(e.message || 'Could not submit deposit.');
    } finally {
      setPaybillSubmitting(false);
    }
  };

  const refreshPaybillStatus = async () => {
    if (!paybillTx || paybillRefreshing) return;
    try {
      setPaybillRefreshing(true);
      const data = await fetchTransactions();
      const match = (data?.transactions || []).find((t) => t.id === paybillTx.id);
      if (match) {
        const nextStatus = match.status === 'completed' ? 'completed' : match.status === 'rejected' ? 'rejected' : 'pending';
        if (nextStatus !== paybillTx.status && (nextStatus === 'completed' || nextStatus === 'rejected')) {
          setPaybillJustResolved(true);
        }
        setPaybillTx((prev) => prev ? { ...prev, status: nextStatus } : prev);
      }
    } catch {
      /* refresh is best-effort — live socket events cover the common case */
    } finally {
      setPaybillRefreshing(false);
    }
  };

  // Public callback so cash-outs (and any other "instant payout" flow) can
  // trigger the trophy modal without re-implementing the timer/animation.
  const showWin = useCallback((bet) => {
    if (!bet) return;
    const id = bet.id || `synthetic-${Date.now()}`;
    setWins((prev) => {
      if (prev.some((b) => b.id === id)) return prev;
      return [...prev, { ...bet, id }];
    });
    // Trigger the new celebration modal for single win/cashout
    setCelebration({
      id,
      winAmount: bet.cashOut ?? bet.potentialWin ?? 0,
      currency: 'GHS',
      ticketId: bet.bookingCode || id,
      bet,
    });
  }, []);

  const accountValue = useMemo(() => ({
    account, loading,
    signIn, signOut, adjustBalance, setAccount,
    openDeposit, openWithdraw, refresh,
    showWin,
    notifications, unreadCount, clearNotifications, markNotificationRead,
  }), [account, loading, signIn, signOut, adjustBalance, openDeposit, openWithdraw, refresh, showWin, notifications, unreadCount, clearNotifications, markNotificationRead]);

  const balance = account?.balance ?? 0;

  return (
    <AccountCtx.Provider value={accountValue}>
      <ToastCtx.Provider value={{ toast }}>
        {children}

        {/* Celebration modal for single win / cash-out */}
        <WinCelebrationModal
          isOpen={!!celebration}
          winAmount={celebration?.winAmount ?? 0}
          currency={celebration?.currency || 'GHS'}
          ticketId={celebration?.ticketId ?? ''}
          markets={(() => {
            const legs = celebration?.bet?.legs || [];
            const seen = new Set();
            return legs.map((l) => l.market).filter((m) => m && !seen.has(m) && seen.add(m));
          })()}
          onClose={() => { setCelebration(null); dismissWins(); }}
          onDetails={() => { setCelebration(null); navigate('/my-bets'); }}
          onShowOff={() => {
            const code = celebration?.bet?.bookingCode;
            if (code) {
              const url = `${window.location.origin}/ticket/${code}`;
              if (navigator.share) { navigator.share({ title: 'BetXentra Win', text: `I just won GHS ${celebration?.winAmount ?? 0} on BetXentra!`, url }).catch(() => {}); }
              else { navigator.clipboard?.writeText(url).catch(() => {}); }
            }
            setCelebration(null);
          }}
        />

        <WinTrophyModal
          wins={wins}
          onClose={dismissWins}
          onViewSlip={() => navigate('/my-bets')}
        />

        <DepositResultModal
          result={depositResults[0] || null}
          onClose={() => setDepositResults((prev) => prev.slice(1))}
        />

        <div className="toast-stack" role="status" aria-live="polite">
          {toasts.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`toast toast-${t.kind}`}
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss notification"
            >
              <span className="toast-icon" aria-hidden="true">
                {t.kind === 'success' ? '✓' :
                 t.kind === 'error'   ? '!' :
                 t.kind === 'warn'    ? '⚠' : 'ℹ'}
              </span>
              <span className="toast-body">{t.message}</span>
            </button>
          ))}
        </div>

        <dialog ref={depositDlg} className="deposit-dlg">
          {(() => {
            const amtNum = parseFloat(String(depositAmt).replace(/,/g, '')) || 0;
            const canSubmit = amtNum >= MIN_DEPOSIT && amtNum <= MAX_DEPOSIT && !busy;
            const accountPhone = accountPhoneRef(account) || account?.email || '+233 59****943';
            const depositNet = DEPOSIT_NETWORKS[depositNetwork] || DEPOSIT_NETWORKS.momo;
            const cycleDepositNetwork = () => {
              const nextIdx = (DEPOSIT_NETWORK_ORDER.indexOf(depositNetwork) + 1) % DEPOSIT_NETWORK_ORDER.length;
              setDepositNetwork(DEPOSIT_NETWORK_ORDER[nextIdx]);
            };

            const closeDlg = () => { try { depositDlg.current?.close(); } catch { /* ignore */ } };
            return (
              <>
                <TxHeader
                  asDialog
                  title="Deposit"
                  onBack={closeDlg}
                  onForward={() => { closeDlg(); navigate(1); }}
                  onHelp={() => { closeDlg(); navigate('/help'); }}
                  onHome={() => { closeDlg(); navigate('/'); }}
                />

                <div className="tx-tabs">
                  {[['paybill', 'Paybill'], ['card', 'Card']].map(([k, lbl]) => (
                    <button
                      key={k}
                      type="button"
                      className="tx-tab"
                      aria-selected={depositTab === k}
                      onClick={() => { setDepositTab(k); if (k !== 'paybill') setShowPaybillInstructions(false); }}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>

                <form onSubmit={submitDeposit} style={{ padding: 16, background: 'var(--bg)' }}>
                  {depositTab === 'paybill' && (() => {
                    const sectionLabel = (text) => (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{ width: 3, height: 14, borderRadius: 2, background: 'var(--accent-warm)' }} />
                        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>{text}</span>
                      </div>
                    );
                    const quickAmounts = [400, 500, 2000, 5000, 10000];
                    return (
                      <>
                        {!showPaybillInstructions && (
                          <>
                            {sectionLabel('Deposit from')}
                            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, padding: '14px 14px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                              <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-soft)' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                              </div>
                              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{accountPhone}</div>
                            </div>

                            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                              <div style={{ width: 32, height: 32, borderRadius: 6, background: depositNet.bg, color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 10, lineHeight: 1 }}>{depositNet.tag}</div>
                              <div style={{ flex: 1, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{depositNet.label}</div>
                              <button
                                type="button"
                                onClick={cycleDepositNetwork}
                                style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 2 }}
                              >
                                Switch <span style={{ fontSize: 13 }}>›</span>
                              </button>
                            </div>

                            {sectionLabel('Amount')}
                            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, padding: '14px 14px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                              <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>GHS</span>
                              <input
                                id="dep-amt"
                                type="number"
                                min={MIN_DEPOSIT}
                                max={MAX_DEPOSIT}
                                step="1"
                                inputMode="decimal"
                                value={depositAmt}
                                onChange={(e) => setDepositAmt(e.target.value)}
                                placeholder="0"
                                autoFocus
                                style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 20, fontWeight: 800, outline: 'none', padding: 0, textAlign: 'left' }}
                              />
                              <span style={{ fontSize: 13, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>min.{MIN_DEPOSIT}</span>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 8 }}>
                              {quickAmounts.slice(0, 3).map((n) => (
                                <button
                                  key={n}
                                  type="button"
                                  onClick={() => setDepositAmt(String(n))}
                                  style={{ padding: '12px 0', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                                >
                                  {n.toLocaleString('en-US')}
                                </button>
                              ))}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 20 }}>
                              {quickAmounts.slice(3).map((n) => (
                                <button
                                  key={n}
                                  type="button"
                                  onClick={() => setDepositAmt(String(n))}
                                  style={{ padding: '12px 0', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                                >
                                  {n.toLocaleString('en-US')}
                                </button>
                              ))}
                            </div>

                            {err && <div className="err" style={{ marginBottom: 12, color: 'var(--danger, #ff5d5d)', fontSize: 13, fontWeight: 600 }}>{err}</div>}

                            <button
                              type="button"
                              disabled={!canSubmit}
                              onClick={() => setShowPaybillInstructions(true)}
                              style={{
                                width: '100%', padding: '14px 0', borderRadius: 10, border: 'none',
                                background: canSubmit ? 'linear-gradient(135deg, var(--accent), var(--accent-soft))' : 'var(--surface-2)',
                                color: canSubmit ? 'var(--text-inv)' : 'var(--text-dim)',
                                fontWeight: 800, fontSize: 16, cursor: canSubmit ? 'pointer' : 'not-allowed', marginBottom: 18,
                              }}
                            >
                              Top Up Now
                            </button>
                          </>
                        )}

                        {showPaybillInstructions && (
                          <>
                            {!paybillTx && (
                              <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <button
                                  type="button"
                                  onClick={() => setShowPaybillInstructions(false)}
                                  style={{ background: 'transparent', border: 'none', color: 'var(--accent)', fontWeight: 700, fontSize: 14, cursor: 'pointer', padding: '4px 0' }}
                                >
                                  ← Change Amount
                                </button>
                              </div>
                            )}
                            <PaybillInstructions
                              paybillId="963024"
                              merchantName="NOVENTRA TECHNOLOGIES"
                              accountRef={accountPhoneRef(account) || account?.email || ''}
                              amount={formatAmt(amtNum)}
                              reference={paybillMeta.reference}
                              depositId={paybillTx?.id ? paybillTx.id.replace(/^tx-/, '') : paybillMeta.depositId}
                              status={paybillTx?.status === 'completed' ? 'Approved' : paybillTx?.status === 'rejected' ? 'Rejected' : 'Pending'}
                              context="deposit"
                              submitted={!!paybillTx}
                              submitting={paybillSubmitting}
                              onSubmit={submitPaybillTopUp}
                              refreshing={paybillRefreshing}
                              onRefreshStatus={refreshPaybillStatus}
                              justResolved={paybillJustResolved}
                              onGoBack={() => setShowPaybillInstructions(false)}
                            />
                          </>
                        )}
                      </>
                    );
                  })()}

                  {depositTab === 'card' && (
                    <div style={{ padding: '32px 8px', textAlign: 'center', color: 'var(--text-soft)' }}>
                      <p style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Card deposits coming soon</p>
                      <p style={{ fontSize: 13 }}>Use Paybill for instant top-ups.</p>
                    </div>
                  )}
                </form>
              </>
            );
          })()}
        </dialog>
      </ToastCtx.Provider>
    </AccountCtx.Provider>
  );
}

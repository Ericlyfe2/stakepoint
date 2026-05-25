import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  setTokens, clearTokens, getAccess,
  fetchMe, logout as apiLogout,
  deposit as apiDeposit,
  fetchUnacknowledgedWins, acknowledgeBet,
} from '../api/betApi.js';
import { onLive, refreshAuth, disconnectSocket } from '../api/socketClient.js';
import WinTrophyModal from '../components/WinTrophyModal.jsx';
import TxHeader from '../components/TxHeader.jsx';
import PaybillInstructions from '../components/PaybillInstructions.jsx';
import { appendTxCache } from '../lib/txCache.js';

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

export const useAccount = () => React.useContext(AccountCtx) || EMPTY_ACCOUNT;
export const useToast   = () => React.useContext(ToastCtx)   || EMPTY_TOAST;

function formatAmt(n) {
  return Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AppProviders({ children }) {
  const navigate = useNavigate();
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(!!getAccess());

  const [toasts, setToasts] = useState([]);

  const depositDlg  = useRef(null);
  const MIN_DEPOSIT  = 300;
  const MAX_DEPOSIT  = 50000;
  const [depositAmt,  setDepositAmt]   = useState(String(MIN_DEPOSIT));
  const [depositMethod, setDepositMethod] = useState('momo');
  const [depositTab, setDepositTab]   = useState('momo'); // 'momo' | 'paybill' | 'card'
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState('');
  const [wins, setWins] = useState([]);
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
    if (!getAccess()) { setAccount(null); setLoading(false); return null; }
    try {
      const data = await fetchMe();
      setAccount(data.account);
      return data.account;
    } catch (err) {
      // Only sign the user out when the server actually rejects the token.
      // Network glitches / 5xx leave the existing account state in place so
      // the next tick (or the visibilitychange rehydrate below) can retry.
      if (err?.status === 401 || err?.status === 403) {
        clearTokens();
        setAccount(null);
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Re-hydrate when the tab returns from being hidden (laptop wake, mobile
  // app switch). The access token may have expired silently while we were
  // backgrounded; this fetch will trigger the refresh dance in betApi.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onVisible = () => { if (document.visibilityState === 'visible' && getAccess()) refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  // Poll for freshly-settled wins the user hasn't seen.
  // (Realtime socket also pushes bet:won — poll is the safety net.)
  useEffect(() => {
    if (!account) { setWins([]); disconnectSocket(); return; }
    let alive = true;

    refreshAuth(); // re-handshake the socket with the now-current access token

    const tick = async () => {
      try {
        const { bets } = await fetchUnacknowledgedWins();
        if (!alive || !Array.isArray(bets) || !bets.length) return;
        // Merge instead of replace so a concurrent cash-out modal entry
        // isn't clobbered by a polled win batch.
        setWins((prev) => {
          const seen = new Set(prev.map((b) => b.id));
          const merged = [...prev];
          for (const b of bets) if (!seen.has(b.id)) merged.push(b);
          return merged;
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
      if (account?.id && transaction) appendTxCache(account.id, transaction);
    });
    const offApproved = onLive('deposit:approved', ({ transaction, account: updatedAccount }) => {
      if (updatedAccount) setAccount(updatedAccount);
      toast(`Deposit approved! GHS ${formatAmt(transaction?.amount)} credited.`, 'success');
    });
    const offRejected = onLive('deposit:rejected', ({ transaction, reason }) => {
      toast(`Deposit of GHS ${formatAmt(transaction?.amount)} rejected${reason ? ': ' + reason : ''}.`, 'warn');
    });
    const offWin = onLive('bet:won', async () => { try { await tick(); } catch {} });
    const offNotif = onLive('notification:new', (payload) => {
      if (payload?.title) {
        addNotification(payload);
        toast(`${payload.title}${payload.body ? ': ' + payload.body : ''}`, payload.severity === 'critical' ? 'warn' : 'info', { ttl: 6000 });
      }
    });
    const offSettled = onLive('bet:settled', async () => { try { await tick(); } catch {} });

    return () => {
      alive = false;
      clearInterval(id);
      offWallet?.(); offPending?.(); offApproved?.(); offRejected?.(); offNotif?.(); offWin?.(); offSettled?.();
    };
  }, [account]);

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
  }, [toast]);

  const signOut = useCallback(async () => {
    try { await apiLogout(); } catch { /* ignore network */ }
    clearTokens();
    setAccount(null);
    toast('Logged out.');
    navigate('/', { replace: true });
  }, [toast, navigate]);

  const adjustBalance = useCallback((delta, label) => {
    setAccount((prev) => prev ? { ...prev, balance: Number((prev.balance + delta).toFixed(2)) } : prev);
    if (label) toast(label);
  }, [toast]);

  const openDeposit = useCallback(() => {
    if (!account) { toast('Sign in to deposit.'); navigate('/login'); return; }
    setErr(''); setDepositAmt(String(MIN_DEPOSIT)); setDepositMethod('momo');
    depositDlg.current?.showModal();
  }, [account, toast, navigate]);

  const openWithdraw = useCallback(() => {
    if (!account) { toast('Sign in to withdraw.'); navigate('/login'); return; }
    navigate('/withdraw');
  }, [account, toast, navigate]);

  const submitDeposit = async (e) => {
    e.preventDefault();
    setErr('');
    const amt = parseFloat(String(depositAmt).replace(/,/g, ''));
    if (!Number.isFinite(amt) || amt <= 0) { setErr('Enter a valid amount.'); return; }
    if (amt < MIN_DEPOSIT) { setErr(`Minimum deposit is GHS ${MIN_DEPOSIT}.`); return; }
    try {
      setBusy(true);
      const data = await apiDeposit(amt, depositMethod);
      if (data?.transaction) {
        if (account?.id) appendTxCache(account.id, data.transaction);
      }
      depositDlg.current?.close();
      const labels = { momo: 'MoMo', vodafone: 'Vodafone Cash', airteltigo: 'AirtelTigo Money', card: 'Card' };
      toast(`Deposit of GHS ${formatAmt(amt)} via ${labels[depositMethod] || depositMethod} submitted for admin approval.`, 'info');
    } catch (e) {
      setErr(e.message || 'Deposit failed.');
    } finally { setBusy(false); }
  };

  // Public callback so cash-outs (and any other "instant payout" flow) can
  // trigger the trophy modal without re-implementing the timer/animation.
  const showWin = useCallback((bet) => {
    if (!bet) return;
    setWins((prev) => {
      const id = bet.id || `synthetic-${Date.now()}`;
      if (prev.some((b) => b.id === id)) return prev;
      return [...prev, { ...bet, id }];
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

        <WinTrophyModal
          wins={wins}
          onClose={dismissWins}
          onViewSlip={() => navigate('/my-bets')}
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
            const networks = {
              momo:       { label: 'MTN Mobile Money', short: 'MTN', tag: 'MTN' },
              vodafone:   { label: 'Telecel Cash',     short: 'Telecel', tag: 'TLC' },
              airteltigo: { label: 'AT Money',         short: 'AT',  tag: 'AT'  },
            };
            const net = networks[depositMethod] || networks.momo;
            const amtNum = parseFloat(String(depositAmt).replace(/,/g, '')) || 0;
            const canSubmit = amtNum >= MIN_DEPOSIT && amtNum <= MAX_DEPOSIT && !busy;
            const accountPhone = account?.phone || account?.email || '+233 59****943';
            const bump = (n) => setDepositAmt(String(Math.min(MAX_DEPOSIT, Math.round(amtNum + n))));

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
                  {[['momo', 'Mobile Money'], ['paybill', 'Paybill'], ['card', 'Card']].map(([k, lbl]) => (
                    <button
                      key={k}
                      type="button"
                      className="tx-tab"
                      aria-selected={depositTab === k}
                      onClick={() => setDepositTab(k)}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>

                <form onSubmit={submitDeposit} style={{ padding: 16, background: 'var(--bg)' }}>
                  {depositTab === 'momo' && (
                    <>
                      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, padding: '14px 14px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-soft)' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{accountPhone}</div>
                      </div>

                      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 6, background: '#ffcc00', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 10, lineHeight: 1 }}>{net.tag}</div>
                        <div style={{ flex: 1, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{net.label}</div>
                        <button
                          type="button"
                          onClick={() => {
                            const order = ['momo', 'vodafone', 'airteltigo'];
                            const nextIdx = (order.indexOf(depositMethod) + 1) % order.length;
                            setDepositMethod(order[nextIdx]);
                          }}
                          style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 2 }}
                        >
                          Switch <span style={{ fontSize: 13 }}>›</span>
                        </button>
                      </div>

                      <div style={{ textAlign: 'right', fontSize: 13, color: 'var(--text-soft)', marginBottom: 6 }}>
                        Balance (GHS) {formatAmt(balance)}
                      </div>

                      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, padding: '14px 14px', marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <label htmlFor="dep-amt" style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Amount (GHS)</label>
                          <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>min. {MIN_DEPOSIT}.00</span>
                        </div>
                        <input
                          id="dep-amt"
                          type="number"
                          min={MIN_DEPOSIT}
                          max={MAX_DEPOSIT}
                          step="1"
                          inputMode="decimal"
                          value={depositAmt}
                          onChange={(e) => setDepositAmt(e.target.value)}
                          placeholder={`min. ${MIN_DEPOSIT}`}
                          autoFocus
                          style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 24, fontWeight: 800, outline: 'none', padding: 0 }}
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 16 }}>
                        {[2, 5, 10, 50, 100].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => bump(n)}
                            style={{ padding: '12px 0', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
                          >
                            +{n}
                          </button>
                        ))}
                      </div>

                      {err && <div className="err" style={{ marginBottom: 12, color: 'var(--danger, #ff5d5d)', fontSize: 13, fontWeight: 600 }}>{err}</div>}

                      <button
                        type="submit"
                        disabled={!canSubmit}
                        style={{
                          width: '100%', padding: '14px 0', borderRadius: 10, border: 'none',
                          background: canSubmit ? 'linear-gradient(135deg, var(--accent), #b0e82d)' : 'var(--surface-2)',
                          color: canSubmit ? '#0a0d0c' : 'var(--text-dim)',
                          fontWeight: 800, fontSize: 16, cursor: canSubmit ? 'pointer' : 'not-allowed', marginBottom: 18,
                        }}
                      >
                        {busy ? 'Processing…' : 'Top Up Now'}
                      </button>

                      <ol style={{ paddingLeft: 18, margin: 0, fontSize: 13, color: 'var(--text-soft)', lineHeight: 1.7 }}>
                        <li>Maximum per transaction is GHS {MAX_DEPOSIT.toLocaleString('en-US')}.00</li>
                        <li>Minimum per transaction is {MIN_DEPOSIT}.00</li>
                        <li>Deposit is free, no transaction fees.</li>
                        <li>Your balance can only be withdrawn to the mobile number that&rsquo;s registered with.</li>
                      </ol>
                    </>
                  )}

                  {depositTab === 'paybill' && (
                    <div style={{ padding: '8px 0 4px' }}>
                      <PaybillInstructions
                        paybillId="222000"
                        accountRef={account?.phone || account?.email || ''}
                        context="deposit"
                      />
                    </div>
                  )}

                  {depositTab === 'card' && (
                    <div style={{ padding: '32px 8px', textAlign: 'center', color: 'var(--text-soft)' }}>
                      <p style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Card deposits coming soon</p>
                      <p style={{ fontSize: 13 }}>Use Mobile Money for instant top-ups.</p>
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

import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  setTokens, clearTokens, getAccess,
  fetchMe, logout as apiLogout,
  deposit as apiDeposit, withdraw as apiWithdraw,
  fetchUnacknowledgedWins, acknowledgeBet,
} from '../api/betApi.js';
import { onLive, refreshAuth, disconnectSocket } from '../api/socketClient.js';
import WinTrophyModal from '../components/WinTrophyModal.jsx';

export const AccountCtx = React.createContext(null);
export const ToastCtx   = React.createContext(null);

const EMPTY_ACCOUNT = {
  account: null, loading: false,
  signIn: () => {}, signOut: () => {}, adjustBalance: () => {},
  setAccount: () => {}, openDeposit: () => {}, openWithdraw: () => {},
  refresh: () => {},
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
  const withdrawDlg = useRef(null);
  const MIN_DEPOSIT  = 300;
  const MAX_DEPOSIT  = 50000;
  const MIN_WITHDRAW = 550;
  const WITHDRAW_DEPOSIT_RATIO = 0.10;
  const [depositAmt,  setDepositAmt]   = useState(String(MIN_DEPOSIT));
  const [withdrawAmt, setWithdrawAmt]  = useState(String(MIN_WITHDRAW));
  const [depositMethod, setDepositMethod] = useState('momo');
  const [depositTab, setDepositTab]   = useState('momo'); // 'momo' | 'paybill' | 'card'
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState('');
  const [wins, setWins] = useState([]);

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
    } catch {
      clearTokens();
      setAccount(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Poll for freshly-settled wins the user hasn't seen.
  // (Realtime socket also pushes bet:won — poll is the safety net.)
  useEffect(() => {
    if (!account) { setWins([]); disconnectSocket(); return; }
    let alive = true;

    refreshAuth(); // re-handshake the socket with the now-current access token

    const tick = async () => {
      try {
        const { bets } = await fetchUnacknowledgedWins();
        if (alive && Array.isArray(bets) && bets.length) setWins(bets);
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
    const offWin = onLive('bet:won', async () => { try { await tick(); } catch {} });
    const offSettled = onLive('bet:settled', async () => { try { await tick(); } catch {} });

    return () => {
      alive = false;
      clearInterval(id);
      offWallet?.(); offWin?.(); offSettled?.();
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
      setAccount(data.account);
      depositDlg.current?.close();
      const labels = { momo: 'MoMo', vodafone: 'Vodafone Cash', airteltigo: 'AirtelTigo Money', card: 'Card' };
      toast(`Deposited GHS ${formatAmt(amt)} via ${labels[depositMethod] || depositMethod}.`);
    } catch (e) {
      setErr(e.message || 'Deposit failed.');
    } finally { setBusy(false); }
  };

  const submitWithdraw = async (e) => {
    e.preventDefault();
    setErr('');
    const amt = parseFloat(String(withdrawAmt).replace(/,/g, ''));
    if (!Number.isFinite(amt) || amt <= 0) { setErr('Enter a valid amount.'); return; }
    if (amt < MIN_WITHDRAW) { setErr(`Minimum withdrawal is GHS ${MIN_WITHDRAW.toLocaleString('en-US')}.`); return; }
    const totalDeposited = Number(account?.totalDeposited || 0);
    const required = Number((amt * WITHDRAW_DEPOSIT_RATIO).toFixed(2));
    if (totalDeposited < required) {
      setErr(`Deposit at least GHS ${required.toLocaleString('en-US')} before withdrawing GHS ${amt.toLocaleString('en-US')}. You've deposited GHS ${totalDeposited.toLocaleString('en-US')}.`);
      return;
    }
    if (amt > (account?.balance ?? 0)) { setErr('Insufficient balance.'); return; }
    try {
      setBusy(true);
      const data = await apiWithdraw(amt, 'momo');
      setAccount(data.account);
      withdrawDlg.current?.close();
      toast(`Withdrew GHS ${formatAmt(amt)} to your wallet.`);
    } catch (e) {
      setErr(e.message || 'Withdrawal failed.');
    } finally { setBusy(false); }
  };

  const accountValue = useMemo(() => ({
    account, loading,
    signIn, signOut, adjustBalance, setAccount,
    openDeposit, openWithdraw, refresh,
  }), [account, loading, signIn, signOut, adjustBalance, openDeposit, openWithdraw, refresh]);

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

        <dialog ref={depositDlg} className="bv-dialog deposit-dlg" style={{ padding: 0, maxWidth: 480, width: '100%', overflow: 'hidden', borderRadius: 0, background: 'var(--bg)', border: 'none' }}>
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

            return (
              <>
                <header style={{
                  background: 'linear-gradient(135deg, #116f43 0%, #0a5a37 100%)',
                  color: '#fff',
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}>
                  <button
                    type="button"
                    onClick={() => depositDlg.current?.close()}
                    aria-label="Back"
                    style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: 6, display: 'inline-flex' }}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => { try { navigate(1); } catch { /* ignore */ } try { window.history.forward(); } catch { /* ignore */ } }}
                    aria-label="Forward"
                    style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: 6, display: 'inline-flex' }}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                  </button>
                  <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, flex: 1, color: '#fff' }}>Deposit</h3>
                  <button type="button" aria-label="Help" onClick={() => { depositDlg.current?.close(); navigate('/help'); }} style={{ background: 'rgba(255,255,255,0.18)', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: '50%', width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>?</button>
                  <button type="button" aria-label="Home" onClick={() => { depositDlg.current?.close(); navigate('/'); }} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: 6, display: 'inline-flex' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                  </button>
                </header>

                <div style={{ display: 'flex', borderBottom: '1px solid var(--line)' }}>
                  {[['momo', 'Mobile Money'], ['paybill', 'Paybill'], ['card', 'Card']].map(([k, lbl]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setDepositTab(k)}
                      style={{
                        flex: 1, padding: '14px 8px', background: 'transparent',
                        border: 'none', color: depositTab === k ? 'var(--accent)' : 'var(--text-soft)',
                        fontWeight: depositTab === k ? 800 : 600, fontSize: 14, cursor: 'pointer',
                        borderBottom: depositTab === k ? '3px solid var(--accent)' : '3px solid transparent',
                      }}
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
                    <div style={{ padding: '32px 8px', textAlign: 'center', color: 'var(--text-soft)' }}>
                      <p style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Pay via *711#</p>
                      <p style={{ fontSize: 13, lineHeight: 1.7 }}>Dial <strong>*711*222#</strong> on your phone, choose <strong>Xenbet</strong>, enter your account number, and complete the prompt.</p>
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

        <dialog ref={withdrawDlg} className="bv-dialog">
          <h3>Withdraw funds</h3>
          <form onSubmit={submitWithdraw}>
            {(() => {
              const amtNum = parseFloat(String(withdrawAmt).replace(/,/g, '')) || 0;
              const totalDeposited = Number(account?.totalDeposited || 0);
              const required = Number((amtNum * WITHDRAW_DEPOSIT_RATIO).toFixed(2));
              const belowMin = amtNum > 0 && amtNum < MIN_WITHDRAW;
              const failsRatio = amtNum >= MIN_WITHDRAW && totalDeposited < required;
              const overBalance = amtNum > balance;
              const invalid = !amtNum || belowMin || failsRatio || overBalance;
              return (
                <>
                  <p style={{ fontSize: 13, color: 'var(--text-soft)', marginBottom: 6 }}>
                    Available: <strong>GHS {formatAmt(balance)}</strong>
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
                    Total deposited so far: <strong>GHS {formatAmt(totalDeposited)}</strong> · You can withdraw up to <strong>GHS {formatAmt(Math.floor(totalDeposited / WITHDRAW_DEPOSIT_RATIO))}</strong> based on your deposit history.
                  </p>
                  <label className="dlg-label" htmlFor="wd-amt">
                    Amount (GHS) <small style={{ color: 'var(--text-dim)', marginLeft: 6 }}>min {MIN_WITHDRAW.toLocaleString('en-US')}</small>
                  </label>
                  <input id="wd-amt" type="number" min={MIN_WITHDRAW} step="1" inputMode="decimal"
                         value={withdrawAmt} onChange={(e) => setWithdrawAmt(e.target.value)} autoFocus />
                  <div className="quick-stakes" style={{ marginTop: 8 }}>
                    {[10_000, 25_000, 50_000].map((n) => (
                      <button key={n} type="button" className="quick-stake" onClick={() => setWithdrawAmt(String(n))}>GHS {n.toLocaleString('en-US')}</button>
                    ))}
                    <button type="button" className="quick-stake" onClick={() => setWithdrawAmt(String(Math.max(MIN_WITHDRAW, Math.floor(balance))))}>MAX</button>
                  </div>
                  <p style={{ fontSize: 12, color: failsRatio ? 'var(--danger, #ff5d5d)' : 'var(--text-dim)', marginTop: 10 }}>
                    To withdraw GHS {amtNum ? amtNum.toLocaleString('en-US') : '—'}, you need at least <strong>GHS {required ? required.toLocaleString('en-US') : '—'}</strong> in lifetime deposits (10%).
                  </p>
                  {err && <div className="err" style={{ marginTop: 10 }}>{err}</div>}
                  <div className="bv-dialog-actions" style={{ marginTop: 14 }}>
                    <button type="button" className="btn btn-ghost" onClick={() => withdrawDlg.current?.close()}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={busy || invalid}>{busy ? 'Processing…' : 'Withdraw'}</button>
                  </div>
                </>
              );
            })()}
          </form>
        </dialog>
      </ToastCtx.Provider>
    </AccountCtx.Provider>
  );
}

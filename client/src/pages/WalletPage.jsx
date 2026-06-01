import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount, useToast } from '../providers/AccountProvider.jsx';
import { fetchTransactions } from '../api/betApi.js';
import PageBack from '../components/PageBack.jsx';
import { readTxCache, writeTxCache, mergeTxLists } from '../lib/txCache.js';

function fmt(n) {
  return Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function relTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return d.toLocaleDateString('en-GH', { day: '2-digit', month: 'short' });
}

const txLabel = {
  deposit:       'Deposit',
  withdraw:      'Withdrawal',
  withdrawal:    'Withdrawal',
  bet_placed:    'Bet placed',
  bet_won:       'Bet won',
  bet_lost:      'Bet lost',
  cash_out:      'Cash-out',
  jackpot_entry: 'Jackpot entry',
};

export default function WalletPage() {
  const navigate = useNavigate();
  const { account, openDeposit, openWithdraw } = useAccount();
  const { toast } = useToast();
  const [txs, setTxs]   = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!account) { navigate('/login?next=/wallet'); return; }
    let alive = true;
    // Prime from local cache so the list is never blank between fetches.
    setTxs(readTxCache(account.id));
    (async () => {
      try {
        setBusy(true);
        const data = await fetchTransactions();
        if (!alive) return;
        const serverList = data.transactions || [];
        const merged = mergeTxLists(serverList, readTxCache(account.id));
        setTxs(merged);
        writeTxCache(account.id, merged);
      } catch (e) {
        if (alive) toast(e.message || 'Could not load transactions.', 'error');
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => { alive = false; };
  }, [account, navigate, toast]);

  if (!account) return null;

  const balance        = account.balance ?? 0;
  const totalDeposited = Number(account.totalDeposited || 0);
  const withdrawCap    = Math.floor(totalDeposited / 0.10);

  const stage = (() => {
    const n = Number(account?.stage);
    if (!Number.isFinite(n)) return 0;
    return Math.min(4, Math.max(0, n));
  })();
  const isUnverified = stage === 0;
  // Per-stage minimum withdrawal — keep in sync with WithdrawPage.jsx.
  //   Stage 0/1 → GHS 550 (default)
  //   Stage 2   → GHS 10,000 (+ 10% extra-deposit credit rule)
  //   Stage 3   → GHS 40,000
  //   Stage 4   → GHS 50,000 (VIP)
  const stageMinWithdraw =
    stage === 2 ? 10000 :
    stage === 3 ? 40000 :
    stage === 4 ? 50000 :
    550;

  return (
    <main className="wallet-page">
      <div className="wallet-shell">
        <PageBack />

        {isUnverified && (
          <div className="wallet-verify-banner" role="status" aria-live="polite">
            <div className="wallet-verify-icon" aria-hidden>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 2 4 6v6c0 5 3.4 8.9 8 10 4.6-1.1 8-5 8-10V6l-8-4z" fill="#facc15" opacity="0.92" />
                <path d="M12 8v5M12 16v.01" stroke="#0f1d10" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </div>
            <div className="wallet-verify-text">
              <div className="t">Account not verified</div>
              <p>Complete deposit to unlock premium</p>
            </div>
            <button type="button" className="wallet-verify-cta" onClick={openDeposit}>
              Deposit
            </button>
          </div>
        )}

        <header className="wallet-hero fade-up">
          <div className="wallet-hero-grain" aria-hidden />
          <div className="wallet-hero-inner">
            <div className="wallet-hero-label">Available balance</div>
            <div className="wallet-hero-amt">
              <span className="cur">GHS</span>
              <span className="amt">{fmt(balance)}</span>
            </div>
            <div className="wallet-hero-meta">
              <span>Lifetime deposits <strong>GHS {fmt(totalDeposited)}</strong></span>
              <span className="dot" />
              <span>Withdraw cap <strong>GHS {fmt(withdrawCap)}</strong></span>
            </div>
            <div className="wallet-hero-actions">
              <button type="button" className="btn btn-primary wallet-cta" onClick={openDeposit}>
                + Deposit
              </button>
              <button type="button" className="btn btn-ghost wallet-cta" onClick={openWithdraw}>
                Withdraw
              </button>
            </div>
          </div>
        </header>

        <section className="wallet-split fade-up" style={{ animationDelay: '0.05s' }}>
          <article className="wallet-split-panel wallet-split-deposit">
            <div className="wallet-split-bg" />
            <div className="wallet-split-inner">
              <header className="wallet-split-head">
                <h3>Deposit Funds</h3>
                <span className="wallet-pill wallet-pill-good">Instant</span>
              </header>
              <p className="wallet-split-desc">Add money to your wallet and start betting instantly.</p>
              <ul className="wallet-list">
                <li><span>Minimum deposit</span><strong>GHS 300</strong></li>
                <li><span>Methods</span><strong>MoMo · Vodafone · AirtelTigo · Card</strong></li>
                <li><span>Fees</span><strong>0%</strong></li>
                <li><span>Processing</span><strong>Instant</strong></li>
              </ul>
              <button type="button" className="wallet-split-cta" onClick={openDeposit}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                Deposit Now
              </button>
            </div>
          </article>

          <article className="wallet-split-panel wallet-split-withdraw">
            <div className="wallet-split-bg" />
            <div className="wallet-split-inner">
              <header className="wallet-split-head">
                <h3>Withdraw Funds</h3>
              </header>
              <p className="wallet-split-desc">Cash out your winnings directly to your mobile money.</p>
              <ul className="wallet-list">
                <li><span>Minimum withdrawal</span><strong>GHS {fmt(stageMinWithdraw)}</strong></li>
                <li><span>Processing</span><strong>Within 24 hours</strong></li>
                <li><span>Methods</span><strong>MoMo to phone on file</strong></li>
              </ul>
              <button type="button" className="wallet-split-cta wallet-split-cta-out" onClick={openWithdraw}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 7l-5 5-5-5M12 17V5"/></svg>
                Withdraw
              </button>
              <ol className="wallet-withdraw-rules">
                <li>Maximum per transaction is GHS 95,000.00</li>
                <li>Minimum per transaction is GHS {fmt(stageMinWithdraw)}</li>
                <li>Withdrawal is free, no fee transaction.</li>
              </ol>
            </div>
          </article>
        </section>

        <section className="wallet-history fade-up" style={{ animationDelay: '0.1s' }}>
          <header className="wallet-history-head">
            <h3>Recent transactions</h3>
            <span className="wallet-history-count">{txs.length} entries</span>
          </header>

          {busy && !txs.length ? (
            <p className="wallet-empty">Loading…</p>
          ) : !txs.length ? (
            <p className="wallet-empty">No transactions yet — make your first deposit to get started.</p>
          ) : (
            <ul className="wallet-tx-list">
              {txs.slice(0, 20).map((t) => {
                const isCredit = (t.amount ?? 0) > 0;
                return (
                    <li key={t.id} className="wallet-tx">
                    <div className={`wallet-tx-icon ${isCredit ? 'credit' : 'debit'}`} aria-hidden>
                      {isCredit ? '↓' : '↑'}
                    </div>
                    <div className="wallet-tx-body">
                      <div className="wallet-tx-title">{txLabel[t.kind] || t.kind}</div>
                      <div className="wallet-tx-meta">
                        {relTime(t.at || t.createdAt)}
                        {t.status === 'pending' && <span className="wallet-tx-pill pending">Pending</span>}
                        {t.status === 'rejected' && <span className="wallet-tx-pill rejected">Rejected</span>}
                        {/* "Approved" only applies to deposits the admin queue has cleared. */}
                        {t.kind === 'deposit' && t.status === 'completed' && (
                          <span className="wallet-tx-pill approved">Approved</span>
                        )}
                      </div>
                    </div>
                    <div className={`wallet-tx-amt ${isCredit ? 'credit' : 'debit'}`}>
                      {isCredit ? '+' : ''}{fmt(t.amount)} <em>GHS</em>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <style>{WALLET_CSS}</style>
    </main>
  );
}

const WALLET_CSS = `
.wallet-page {
  padding: 28px 0 60px;
  min-height: calc(100vh - 200px);
}

/* "Account not verified" banner — Stage 0 players only */
.wallet-verify-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 16px;
  background:
    linear-gradient(135deg, rgba(250, 204, 21, .14), rgba(250, 204, 21, .04));
  border: 1px solid rgba(250, 204, 21, .35);
  box-shadow: 0 10px 30px rgba(0, 0, 0, .25);
  color: var(--text);
}
.wallet-verify-icon {
  flex-shrink: 0;
  width: 38px; height: 38px;
  border-radius: 12px;
  background: rgba(250, 204, 21, .14);
  display: grid; place-items: center;
}
.wallet-verify-text { flex: 1; min-width: 0; }
.wallet-verify-text .t {
  font-weight: 800;
  font-size: 14.5px;
  color: #facc15;
  margin-bottom: 2px;
}
.wallet-verify-text p {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-soft);
}
.wallet-verify-text p strong {
  color: var(--text);
  font-weight: 700;
}
.wallet-verify-text p em {
  font-style: normal;
  color: #facc15;
  font-weight: 700;
}
.wallet-verify-cta {
  flex-shrink: 0;
  padding: 10px 16px;
  border-radius: 10px;
  border: none;
  background: linear-gradient(135deg, #facc15, #f59e0b);
  color: #1a1500;
  font-weight: 800;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: transform .15s, box-shadow .15s;
  font-family: inherit;
  letter-spacing: .01em;
}
.wallet-verify-cta:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(245, 158, 11, .35);
}
@media (max-width: 480px) {
  .wallet-verify-banner { padding: 12px; gap: 10px; }
  .wallet-verify-icon { width: 32px; height: 32px; border-radius: 10px; }
  .wallet-verify-text .t { font-size: 13.5px; }
  .wallet-verify-text p { font-size: 12px; }
  .wallet-verify-cta { padding: 9px 12px; font-size: 12px; }
}
.wallet-shell {
  max-width: 980px;
  margin: 0 auto;
  padding: 0 20px;
  display: flex; flex-direction: column; gap: 20px;
}
.wallet-hero {
  position: relative;
  overflow: hidden;
  border-radius: 22px;
  padding: 28px;
  background: linear-gradient(135deg, var(--surface) 0%, var(--surface-2) 100%);
  border: 1px solid rgba(197, 255, 61, .18);
  box-shadow: 0 16px 50px rgba(0, 0, 0, .35);
}
.wallet-hero-grain {
  position: absolute; inset: -10%;
  background: radial-gradient(600px 300px at 80% -10%, rgba(197, 255, 61, .18), transparent 60%),
              radial-gradient(500px 320px at -10% 110%, rgba(106, 208, 255, .14), transparent 60%);
  pointer-events: none;
}
.wallet-hero-inner { position: relative; z-index: 1; }
.wallet-hero-label {
  font-size: 12px; letter-spacing: .14em;
  text-transform: uppercase; color: var(--text-dim);
  font-weight: 700;
}
.wallet-hero-amt {
  margin: 8px 0 12px;
  display: flex; align-items: baseline; gap: 10px;
  font-variant-numeric: tabular-nums;
}
.wallet-hero-amt .cur { color: var(--text-soft); font-size: 16px; font-weight: 700; }
.wallet-hero-amt .amt {
  font-size: 44px; font-weight: 900; letter-spacing: -.02em;
  background: linear-gradient(120deg, var(--accent), var(--accent-cool));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.wallet-hero-meta {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  font-size: 13px; color: var(--text-soft);
  margin-bottom: 18px;
}
.wallet-hero-meta .dot {
  display: inline-block; width: 4px; height: 4px; border-radius: 50%;
  background: var(--text-dim);
}
.wallet-hero-actions {
  display: flex; gap: 10px; flex-wrap: wrap;
}
.wallet-cta { min-width: 140px; padding: 12px 18px; font-weight: 700; }

/* deposit / withdraw split panels */
.wallet-split {
  display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
}
.wallet-split-panel {
  position: relative;
  overflow: hidden;
  border-radius: 18px;
  padding: 24px;
  border: 1px solid var(--surface-2);
  transition: transform .2s ease, border-color .2s ease;
}
.wallet-split-panel:hover { transform: translateY(-2px); }
.wallet-split-deposit {
  background: linear-gradient(135deg, var(--surface) 0%, #0f1a14 100%);
  border-color: rgba(197, 255, 61, .15);
}
.wallet-split-withdraw {
  background: linear-gradient(135deg, var(--surface) 0%, #1a1010 100%);
  border-color: rgba(255, 77, 61, .12);
}
.wallet-split-bg {
  position: absolute; inset: -10%;
  pointer-events: none;
}
.wallet-split-deposit .wallet-split-bg {
  background: radial-gradient(500px 350px at 20% -30%, rgba(197, 255, 61, .08), transparent 60%);
}
.wallet-split-withdraw .wallet-split-bg {
  background: radial-gradient(500px 350px at 80% -30%, rgba(255, 77, 61, .07), transparent 60%);
}
.wallet-split-inner { position: relative; z-index: 1; }
.wallet-split-head {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 4px;
}
.wallet-split-head h3 { margin: 0; font-size: 18px; font-weight: 800; }
.wallet-split-desc {
  margin: 4px 0 14px;
  font-size: 13px;
  color: var(--text-soft);
  line-height: 1.5;
}
.wallet-split-cta {
  display: inline-flex; align-items: center; gap: 8px;
  margin-top: 16px;
  width: 100%;
  padding: 14px 18px;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
  transition: opacity .2s ease, transform .15s ease;
  justify-content: center;
}
.wallet-split-cta:hover { opacity: .85; transform: scale(1.01); }
.wallet-split-cta:active { transform: scale(.98); }
.wallet-split-deposit .wallet-split-cta {
  background: linear-gradient(135deg, var(--accent), #b0e82d);
  color: #0a0d0c;
}
.wallet-split-withdraw .wallet-split-cta {
  background: linear-gradient(135deg, #ff4d3d, #cc3a2e);
  color: #fff;
}
.wallet-note-section { margin-top: -4px; }

.wallet-withdraw-rules {
  margin: 14px 0 0;
  padding-left: 20px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-soft);
  list-style: decimal;
}
.wallet-withdraw-rules li { padding-left: 2px; }

.wallet-cards {
  display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
}
.wallet-card {
  background: var(--surface);
  border: 1px solid var(--surface-2);
  border-radius: 18px;
  padding: 20px;
  transition: border-color .2s ease, transform .2s ease;
}
.wallet-card:hover { border-color: rgba(197, 255, 61, .25); transform: translateY(-2px); }
.wallet-card-head {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 12px;
}
.wallet-card-head h3 { margin: 0; font-size: 16px; font-weight: 800; }
.wallet-pill {
  font-size: 10px; font-weight: 800;
  letter-spacing: .1em; text-transform: uppercase;
  padding: 4px 10px; border-radius: 999px;
}
.wallet-pill-good { background: rgba(197, 255, 61, .12); color: var(--accent); }
.wallet-pill-warn { background: rgba(255, 181, 71, .12); color: var(--accent-warm); }

.wallet-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.wallet-list li {
  display: flex; justify-content: space-between; gap: 10px;
  padding: 8px 0;
  border-bottom: 1px dashed var(--surface-2);
  font-size: 13px;
}
.wallet-list li:last-child { border-bottom: none; }
.wallet-list li span { color: var(--text-soft); }
.wallet-list li strong { color: var(--text); font-weight: 700; text-align: right; }

.wallet-note {
  margin: 10px 0 0;
  padding: 10px 12px;
  font-size: 12px;
  color: var(--text-soft);
  background: rgba(106, 208, 255, .06);
  border: 1px solid rgba(106, 208, 255, .14);
  border-radius: 10px;
}
.wallet-note strong { color: var(--accent-cool); font-weight: 700; }

.wallet-history {
  background: var(--surface);
  border: 1px solid var(--surface-2);
  border-radius: 18px;
  padding: 20px;
}
.wallet-history-head {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 12px;
}
.wallet-history-head h3 { margin: 0; font-size: 16px; font-weight: 800; }
.wallet-history-count { font-size: 12px; color: var(--text-dim); }

.wallet-empty { color: var(--text-dim); font-size: 13px; padding: 16px 0; }

.wallet-tx-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
.wallet-tx {
  display: grid; grid-template-columns: 36px 1fr auto;
  align-items: center; gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--surface-2);
}
.wallet-tx:last-child { border-bottom: none; }
.wallet-tx-icon {
  width: 36px; height: 36px; border-radius: 50%;
  display: grid; place-items: center;
  font-size: 14px; font-weight: 800;
}
.wallet-tx-icon.credit { background: rgba(197, 255, 61, .12); color: var(--accent); }
.wallet-tx-icon.debit  { background: rgba(255, 77, 61,  .12); color: var(--accent-hot); }
.wallet-tx-title { font-size: 14px; font-weight: 700; }
.wallet-tx-meta { font-size: 11.5px; color: var(--text-dim); }
.wallet-tx-amt {
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  font-size: 14px;
}
.wallet-tx-amt em { font-style: normal; font-size: 11px; color: var(--text-dim); margin-left: 2px; }
.wallet-tx-amt.credit { color: var(--accent); }
.wallet-tx-amt.debit  { color: var(--accent-hot); }
.wallet-tx-pill { display: inline-block; font-size: 9px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; padding: 2px 7px; border-radius: 999px; margin-left: 6px; }
.wallet-tx-pill.pending { background: rgba(245,158,11,0.15); color: #f59e0b; }
.wallet-tx-pill.rejected { background: rgba(239,68,68,0.15); color: #ef4444; }
.wallet-tx-pill.approved { background: rgba(34,197,94,0.15); color: #22c55e; }

.fade-up {
  animation: walletFadeUp .45s ease both;
}
@keyframes walletFadeUp {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

@media (max-width: 720px) {
  .wallet-shell { padding: 0 12px; }
  .wallet-hero { padding: 22px 18px; }
  .wallet-hero-amt .amt { font-size: 36px; }
  .wallet-cards { grid-template-columns: 1fr; }
  .wallet-split { grid-template-columns: 1fr; }
  .wallet-card { padding: 16px; }
  .wallet-split-panel { padding: 18px; }
  .wallet-history { padding: 16px; }
  .wallet-cta { flex: 1; min-width: 0; }
}
`;

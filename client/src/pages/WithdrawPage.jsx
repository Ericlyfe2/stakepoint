import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount } from '../providers/AccountProvider.jsx';
import { fetchTransactions } from '../api/betApi.js';
import TxHeader from '../components/TxHeader.jsx';
import PaybillInstructions from '../components/PaybillInstructions.jsx';
import { readTxCache, writeTxCache, mergeTxLists } from '../lib/txCache.js';

function fmt(n) {
  return Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatTxDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const hrs = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${hrs}:${mins}`;
}

const NETWORKS = {
  momo:       { label: 'MTN Mobile Money', tag: 'MTN', bg: '#ffcc00' },
  vodafone:   { label: 'Telecel Cash',     tag: 'TLC', bg: '#e60000' },
  airteltigo: { label: 'AT Money',         tag: 'AT',  bg: '#0055ff' },
};

export default function WithdrawPage() {
  const navigate = useNavigate();
  const { account, openDeposit } = useAccount();
  const [txs, setTxs] = useState([]);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('momo');
  const [tab, setTab] = useState('momo'); // 'momo' | 'paybill' | 'card'
  const [err, setErr] = useState('');
  const [showDepositReq, setShowDepositReq] = useState(false);

  const MIN_WITHDRAW = 550;
  const MAX_WITHDRAW = 95_000;
  const WITHDRAW_DEPOSIT_RATIO = 0.10;

  useEffect(() => {
    if (!account) {
      navigate('/login?next=/withdraw');
      return;
    }
    let alive = true;
    // Prime from local cache so the section is never blank between fetches.
    setTxs((readTxCache(account.id) || []).filter((t) => t.kind === 'withdraw' || t.kind === 'withdrawal'));
    (async () => {
      try {
        const data = await fetchTransactions();
        if (!alive) return;
        const serverList = data.transactions || [];
        const merged = mergeTxLists(serverList, readTxCache(account.id));
        writeTxCache(account.id, merged);
        setTxs(merged.filter((t) => t.kind === 'withdraw' || t.kind === 'withdrawal'));
      } catch {
        /* transactions optional — silent fail OK, cache still in state */
      }
    })();
    return () => { alive = false; };
  }, [account, navigate]);

  if (!account) return null;

  const balance = account.balance ?? 0;
  const totalDeposited = Number(account.totalDeposited || 0);
  const amtNum = parseFloat(String(amount).replace(/,/g, '')) || 0;
  const required = Number((amtNum * WITHDRAW_DEPOSIT_RATIO).toFixed(2));
  const failsRatio = amtNum >= MIN_WITHDRAW && totalDeposited < required;
  const overBalance = amtNum > balance;
  const isAmountValid = amtNum >= MIN_WITHDRAW && amtNum <= MAX_WITHDRAW && !failsRatio && !overBalance;
  const net = NETWORKS[method] || NETWORKS.momo;
  const accountPhone = account.phone || account.email || '+233 59****943';

  const bump = (n) => setAmount(String(Math.min(MAX_WITHDRAW, Math.round(amtNum + n))));

  const cycleNetwork = () => {
    const order = ['momo', 'vodafone', 'airteltigo'];
    const nextIdx = (order.indexOf(method) + 1) % order.length;
    setMethod(order[nextIdx]);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setErr('');
    if (!isAmountValid) return;
    // Gate every withdrawal behind the deposit-requirement modal — the user
    // must complete the verifying deposit before any withdrawal is processed.
    setShowDepositReq(true);
  };

  const REQUIRED_DEPOSIT = 1000;
  const goDeposit = () => { setShowDepositReq(false); openDeposit(); };

  return (
    <main style={{ minHeight: 'calc(100vh - 120px)', background: 'var(--bg)', padding: '0 0 80px' }}>
      {showDepositReq && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="deposit-req-title"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16, zIndex: 1000,
          }}
          onClick={() => setShowDepositReq(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 360, background: '#fff', color: '#111',
              borderRadius: 14, padding: '20px 20px 18px', boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
              <h2 id="deposit-req-title" style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#111' }}>
                Deposit requirement
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setShowDepositReq(false)}
                style={{
                  width: 28, height: 28, borderRadius: 6, border: '1px solid #e5e7eb',
                  background: '#f3f4f6', color: '#374151', fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                ×
              </button>
            </div>
            <p style={{ margin: '6px 0 12px', fontSize: 14, color: '#374151', lineHeight: 1.5 }}>
              You need to deposit GHS {REQUIRED_DEPOSIT.toLocaleString('en-US')}.00 to your account to verify your account.
            </p>
            <ul style={{ margin: '0 0 16px', paddingLeft: 18, fontSize: 14, color: '#111' }}>
              <li>Required amount: <strong>GHS {REQUIRED_DEPOSIT.toLocaleString('en-US')}.00</strong></li>
            </ul>
            <button
              type="button"
              onClick={goDeposit}
              style={{
                width: '100%', padding: '12px 0', borderRadius: 8, border: 'none',
                background: '#2f6bff', color: '#fff', fontWeight: 800, fontSize: 15,
                cursor: 'pointer',
              }}
            >
              Go to Deposit
            </button>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 480, margin: '0 auto', background: 'var(--bg)' }}>

        <TxHeader title="Withdraw" />

        <div className="tx-tabs">
          {[['momo', 'Mobile Money'], ['paybill', 'Paybill'], ['card', 'Card']].map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              className="tx-tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
            >
              {lbl}
            </button>
          ))}
        </div>

        <div style={{ padding: 16 }}>

          {tab === 'momo' && (
            <form onSubmit={handleSubmit}>

              {/* Phone card */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, padding: '14px 14px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-soft)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{accountPhone}</div>
              </div>

              {/* Network card */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ width: 32, height: 32, borderRadius: 6, background: net.bg, color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 10, lineHeight: 1 }}>{net.tag}</div>
                <div style={{ flex: 1, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{net.label}</div>
                <button
                  type="button"
                  onClick={cycleNetwork}
                  style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 2 }}
                >
                  Switch <span style={{ fontSize: 13 }}>›</span>
                </button>
              </div>

              {/* Balance row */}
              <div style={{ textAlign: 'right', fontSize: 13, color: 'var(--text-soft)', marginBottom: 6 }}>
                Balance (GHS) {fmt(balance)}
              </div>

              {/* Amount card */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, padding: '14px 14px', marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label htmlFor="wd-amt" style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Amount (GHS)</label>
                  <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>min. {MIN_WITHDRAW}.00</span>
                </div>
                <input
                  id="wd-amt"
                  type="number"
                  min={MIN_WITHDRAW}
                  max={MAX_WITHDRAW}
                  step="1"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={`min. ${MIN_WITHDRAW}`}
                                    autoFocus
                  style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 24, fontWeight: 800, outline: 'none', padding: 0 }}
                />
              </div>

              {/* Quick chips */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 16 }}>
                {[10, 50, 100, 500, 1000].map((n) => (
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

              {failsRatio && (
                <div style={{ background: 'rgba(255,77,61,0.08)', border: '1px solid rgba(255,77,61,0.2)', color: 'var(--danger, #ff5d5d)', padding: '10px 14px', borderRadius: 10, fontSize: 12, lineHeight: 1.4, marginBottom: 12 }}>
                  To withdraw GHS {amtNum.toLocaleString('en-US')}, deposit at least <strong>GHS {required.toLocaleString('en-US')}</strong> first (10% of withdrawal). Current deposits: GHS {totalDeposited.toLocaleString('en-US')}.
                  <button type="button" onClick={openDeposit} style={{ display: 'block', marginTop: 8, background: 'transparent', border: '1px solid var(--danger, #ff5d5d)', color: 'var(--danger, #ff5d5d)', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                    Go to Deposit
                  </button>
                </div>
              )}

              {overBalance && !failsRatio && (
                <div style={{ background: 'rgba(255,77,61,0.08)', border: '1px solid rgba(255,77,61,0.2)', color: 'var(--danger, #ff5d5d)', padding: '10px 14px', borderRadius: 10, fontSize: 12, marginBottom: 12 }}>
                  Insufficient balance — you have GHS {fmt(balance)}.
                </div>
              )}

              {err && (
                <div style={{ background: 'rgba(255,77,61,0.08)', border: '1px solid rgba(255,77,61,0.2)', color: 'var(--danger, #ff5d5d)', padding: '10px 14px', borderRadius: 10, fontSize: 12, marginBottom: 12 }}>
                  {err}
                </div>
              )}

              <button
                type="submit"
                disabled={!isAmountValid}
                style={{
                  width: '100%', padding: '14px 0', borderRadius: 10, border: 'none',
                  background: isAmountValid ? 'linear-gradient(135deg, var(--accent), #b0e82d)' : 'var(--surface-2)',
                  color: isAmountValid ? '#0a0d0c' : 'var(--text-dim)',
                  fontWeight: 800, fontSize: 16, cursor: isAmountValid ? 'pointer' : 'not-allowed', marginBottom: 18,
                }}
              >
                Withdraw Now
              </button>

              <ol style={{ paddingLeft: 18, margin: 0, fontSize: 13, color: 'var(--text-soft)', lineHeight: 1.7 }}>
                <li>Maximum transaction is GHS {MAX_WITHDRAW.toLocaleString('en-US')}.00</li>
                <li>Minimum per transaction is GHS {MIN_WITHDRAW}.00</li>
                <li>Withdrawal is free, no fee transaction.</li>
              </ol>
            </form>
          )}

          {tab === 'paybill' && (
            <PaybillInstructions
              paybillId="222000"
              accountRef={accountPhone}
              context="withdraw"
            />
          )}

          {tab === 'card' && (
            <div style={{ padding: '32px 8px', textAlign: 'center', color: 'var(--text-soft)' }}>
              <p style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Card withdrawals unavailable</p>
              <p style={{ fontSize: 13 }}>Switch to Mobile Money to withdraw to your MoMo wallet.</p>
            </div>
          )}

          {/* Recent withdrawals */}
          {tab === 'momo' && (
            <section style={{ marginTop: 24, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '16px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0, color: 'var(--text)' }}>Recent Withdrawals</h2>
                <button type="button" onClick={() => navigate('/wallet')}
                        style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                  See more
                </button>
              </div>
              {txs.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-dim)', textAlign: 'center', padding: '12px 0' }}>No withdrawals yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {txs.slice(0, 5).map((t) => (
                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, borderBottom: '1px solid var(--line)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-2)', color: 'var(--text-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Withdrawal</div>
                          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{t.method ? (NETWORKS[t.method]?.label || t.method) : accountPhone}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>GHS {fmt(t.amount)}</div>
                        <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {t.status === 'completed' ? 'Approved' : (t.status || 'Approved')}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{formatTxDate(t.at || t.createdAt)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

        </div>
      </div>
    </main>
  );
}

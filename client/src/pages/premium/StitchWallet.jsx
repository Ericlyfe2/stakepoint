import { Link, useNavigate } from 'react-router-dom';
import useMediaQuery from '../../premium/useMediaQuery.js';
import useStitchWallet from '../../premium/useStitchWallet.js';
import { useAccount } from '../../providers/AccountProvider.jsx';
import { StitchFooter, StitchTopNav } from '../../premium/StitchChrome.jsx';
import StitchTxList from '../../premium/StitchTxList.jsx';
import { TabBar } from './StitchMobile.jsx';
import { formatAmt } from '../../lib/betslipEngine.js';

/* ---------------------------------------------------------------------------
   Stitch — Wallet

   A premium port of the legacy wallet page. Everything shown is real: the
   balance / lifetime deposits come from the account, the limits from
   /wallet/rules, and the history from /wallet/transactions (merged with the
   local cache). An account with no history gets an honest empty state.
   Deposits use the existing Paybill dialog via openDeposit.
   ------------------------------------------------------------------------- */

const DEPOSIT_MIN_FALLBACK = 300;
const WITHDRAW_MIN_FALLBACK = 550;
const WITHDRAW_RATIO = 0.10;

export default function StitchWallet() {
  const isMobile = useMediaQuery('(max-width: 1023px)');
  const navigate = useNavigate();
  const { account, openDeposit } = useAccount();
  const { transactions, rules, status, error, refresh } = useStitchWallet();

  const balance = Number(account?.balance || 0);
  const totalDeposited = Number(rules?.totalDeposited ?? account?.totalDeposited ?? 0);
  const withdrawCap = Math.floor(totalDeposited / WITHDRAW_RATIO);
  const minDeposit = Number(rules?.minDeposit ?? DEPOSIT_MIN_FALLBACK);
  const minWithdraw = Number(rules?.minWithdraw ?? WITHDRAW_MIN_FALLBACK);

  const hero = (
    <section className="stx-whero">
      <span className="stx-whero-label">Available balance</span>
      <div className="stx-whero-amt">
        <span className="cur">GHS</span>
        <span className="amt">{formatAmt(balance)}</span>
      </div>
      <div className="stx-whero-meta">
        <span>Lifetime deposits <b>GHS {formatAmt(totalDeposited)}</b></span>
        <span className="dot" />
        <span>Withdraw cap <b>GHS {formatAmt(withdrawCap)}</b></span>
      </div>
      <div className="stx-whero-actions">
        <button type="button" className="stx-cta" onClick={openDeposit}>+ Deposit</button>
        <button type="button" className="stx-cta stx-cta--ghost" onClick={() => navigate('/withdraw')}>
          Withdraw
        </button>
      </div>
    </section>
  );

  const panels = (
    <section className="stx-wpanels">
      <article className="stx-wpanel stx-wpanel--deposit">
        <header className="stx-wpanel-head">
          <h3 className="stx-h4">Deposit funds</h3>
          <span className="stx-chip">Instant</span>
        </header>
        <p className="stx-wpanel-desc">Add money to your wallet and start betting instantly.</p>
        <ul className="stx-wlist">
          <li><span>Minimum deposit</span><b>GHS {formatAmt(minDeposit)}</b></li>
          <li><span>Methods</span><b>MoMo · Telecel · AT · Card</b></li>
          <li><span>Processing</span><b>Instant</b></li>
        </ul>
        <button type="button" className="stx-cta" onClick={openDeposit}>Deposit Now</button>
      </article>

      <article className="stx-wpanel stx-wpanel--withdraw">
        <header className="stx-wpanel-head">
          <h3 className="stx-h4">Withdraw funds</h3>
        </header>
        <p className="stx-wpanel-desc">Cash out your winnings directly to your mobile money.</p>
        <ul className="stx-wlist">
          <li><span>Minimum withdrawal</span><b>GHS {formatAmt(minWithdraw)}</b></li>
          <li><span>Processing</span><b>Within 24 hours</b></li>
          <li><span>Methods</span><b>MoMo to phone on file</b></li>
        </ul>
        <button type="button" className="stx-cta stx-cta--ghost" onClick={() => navigate('/withdraw')}>
          Withdraw
        </button>
      </article>
    </section>
  );

  let history;
  if (status === 'guest') {
    history = (
      <div className="stx-bets-empty">
        <p className="stx-body-md">Sign in to view your transactions and balance.</p>
        <Link to="/login" className="stx-cta" style={{ justifyContent: 'center' }}>Sign in</Link>
      </div>
    );
  } else if (status === 'loading') {
    history = <p className="stx-body-md stx-muted">Loading transactions…</p>;
  } else if (status === 'error') {
    history = (
      <div className="stx-bets-empty">
        <p className="stx-body-md">{error || 'Could not load your transactions.'}</p>
        <button type="button" className="stx-cta" onClick={refresh}>Try again</button>
      </div>
    );
  } else {
    history = (
      <StitchTxList
        txs={transactions}
        limit={20}
        empty="No transactions yet — make your first deposit to get started."
      />
    );
  }

  const content = (
    <div className="stx-walletpage">
      <div className="stx-sectionhead">
        <div>
          <h1 className="stx-h1">Wallet</h1>
          <p className="stx-sub">Deposit, withdraw and review every transaction.</p>
        </div>
      </div>

      {hero}
      {panels}

      <section className="stx-wtx">
        <header className="stx-wtx-head">
          <h3 className="stx-h3">Recent transactions</h3>
          {status === 'ready' && transactions.length > 0 && (
            <span className="stx-wtx-count">{transactions.length} entries</span>
          )}
        </header>
        {history}
      </section>
    </div>
  );

  if (isMobile) {
    return (
      <div className="stx">
        <div className="stx-mob">
          <header className="stx-mob-head">
            <Link to="/" className="stx-brand" style={{ fontSize: 17 }}>
              <span className="stx-brand-mark" style={{ width: 26, height: 26 }}>
                <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 15, height: 15 }} aria-hidden="true">
                  <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" />
                </svg>
              </span>
              BetXentra
            </Link>
            <div className="stx-right">
              <span className="stx-mob-bal"><span>BAL</span> GHS {formatAmt(balance)}</span>
              <button type="button" className="stx-depbtn" onClick={openDeposit}>+ ADD</button>
            </div>
          </header>
          <div className="stx-mob-body">{content}</div>
        </div>
        <TabBar current="/wallet" />
      </div>
    );
  }

  return (
    <div className="stx">
      <StitchTopNav slip={{ account, openDeposit }} current="/wallet" />
      {content}
      <StitchFooter current="/wallet" />
    </div>
  );
}

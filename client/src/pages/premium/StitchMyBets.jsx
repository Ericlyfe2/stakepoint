import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useMediaQuery from '../../premium/useMediaQuery.js';
import useStitchSlip from '../../premium/useStitchSlip.js';
import useStitchBets, { useStitchBetOffers } from '../../premium/useStitchBets.js';
import { BetslipDock, SlipToast } from '../../premium/StitchBetslip.jsx';
import { StitchFooter, StitchTopNav } from '../../premium/StitchChrome.jsx';
import { TabBar } from './StitchMobile.jsx';
import { formatAmt, marketName, pickLabel } from '../../lib/betslipEngine.js';

/* ---------------------------------------------------------------------------
   Stitch — My Bets & Bet History Centre

   Ports the desktop (bx-my-bets-desktop) and mobile (bx-my-bets-mobile) BetXentra
   references onto the premium shell, but every ticket, leg and cash-out value is
   read from the REAL bet history. The references' sample acca (#BX-89420, +170%,
   GHS 540) is design placeholder data and is deliberately NOT reproduced: an
   account with no bets shows an honest empty state, and a ticket with no live
   offer reports cash-out unavailable rather than inventing a figure.
   ------------------------------------------------------------------------- */

const MODE_LABEL = { single: 'Single', multiple: 'Accumulator', system: 'System' };

const STATUS_META = {
  open: { label: 'OPEN', tone: 'open' },
  won: { label: 'WON', tone: 'won' },
  lost: { label: 'LOST', tone: 'lost' },
  cashed_out: { label: 'CASHED OUT', tone: 'cashout' },
  void: { label: 'VOID', tone: 'void' },
};

const TABS = [
  { id: 'active', label: 'Active' },
  { id: 'settled', label: 'Settled' },
  { id: 'all', label: 'All' },
];

function whenLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GH', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

const legName = (leg) => (leg?.home && leg?.away
  ? `${leg.home} vs ${leg.away}`
  : leg?.match || leg?.event || 'Match');

/** The amount credited if the ticket ends now, per real bet status. */
function returnOf(bet) {
  const stake = Number(bet?.stake || 0);
  switch (bet?.status) {
    case 'won': return Number(bet.totalReturn || bet.potentialWin || 0);
    case 'cashed_out': return Number(bet.cashOut || 0);
    case 'void': return stake;
    case 'lost': return 0;
    default: return Number(bet?.potentialWin || stake * Number(bet?.totalOdds || 0) || 0);
  }
}

function BetCard({ bet, offer, busy, onCashOut }) {
  const meta = STATUS_META[bet.status] || STATUS_META.open;
  const legs = bet.legs || [];
  const isOpen = bet.status === 'open';
  const stake = Number(bet.stake || 0);
  const odds = Number(bet.totalOdds || 0);
  const returning = returnOf(bet);

  const [fraction, setFraction] = useState(1);
  const offerAmount = Number(offer?.amount || 0);
  const payout = fraction < 1 ? offerAmount * fraction : offerAmount;
  const profitPct = stake > 0 ? Math.round(((offerAmount - stake) / stake) * 100) : 0;
  const offerState = offer?.state || 'loading';

  return (
    <article className="stx-bet">
      <header className="stx-bet-head">
        <span className="stx-bet-mode">
          {MODE_LABEL[bet.mode] || 'Bet'} · {legs.length || 1} {legs.length === 1 ? 'Pick' : 'Legs'}
        </span>
        <span className={`stx-bet-status stx-bet-status--${meta.tone}`}>{meta.label}</span>
      </header>

      <div className="stx-bet-when">
        {bet.id && <span>#{bet.id}</span>}
        {whenLabel(bet.placedAt) && <span>Placed {whenLabel(bet.placedAt)}</span>}
        {!isOpen && whenLabel(bet.settledAt) && <span>Settled {whenLabel(bet.settledAt)}</span>}
      </div>

      <div className="stx-bet-legs">
        {legs.map((leg, i) => {
          const r = bet.legsResolved?.[i];
          const tone = r?.status === 'won' ? 'won' : r?.status === 'lost' ? 'lost' : 'open';
          const label = r?.status === 'won' ? 'WON' : r?.status === 'lost' ? 'LOST'
            : r?.scoreHome != null && r?.scoreAway != null ? `${r.scoreHome}-${r.scoreAway}` : 'OPEN';
          return (
            <div className="stx-bet-leg" key={`${bet.id}-${i}`}>
              <div className="stx-bet-leg-top">
                <span className="stx-bet-leg-match">{legName(leg)}</span>
                {r && <span className={`stx-bet-leg-res stx-bet-leg-res--${tone}`}>{label}</span>}
              </div>
              <div className="stx-bet-leg-pick">
                {pickLabel(leg.market, leg.outcome || leg.pick || leg.selection, leg)}
                {leg.odds != null && <b>@ {Number(leg.odds).toFixed(2)}</b>}
              </div>
              <div className="stx-bet-leg-mkt">{marketName(leg.market)}</div>
            </div>
          );
        })}
      </div>

      <div className="stx-bet-sum">
        <div><span>Stake</span><b>GHS {formatAmt(stake)}</b></div>
        <div><span>Total Odds</span><b>{odds ? odds.toFixed(2) : '—'}</b></div>
        <div>
          <span>{isOpen ? 'Potential' : 'Returns'}</span>
          <b>GHS {formatAmt(returning)}</b>
        </div>
      </div>

      {isOpen && (
        <div className="stx-bet-cashout">
          {offerState === 'available' ? (
            <>
              <div className="stx-bet-cashout-big">
                <span>
                  Cash Out Offer
                  <span className="stx-bet-profit">
                    {profitPct >= 0 ? '+' : ''}{profitPct}% {profitPct >= 0 ? 'PROFIT' : 'LOSS'}
                  </span>
                </span>
                <b>GHS {formatAmt(offerAmount)}</b>
              </div>
              <div className="stx-bet-fracs" role="group" aria-label="Cash out percentage">
                {[0.25, 0.5, 0.75, 1].map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`stx-chip${fraction === f ? ' stx-chip--on' : ''}`}
                    aria-pressed={fraction === f}
                    onClick={() => setFraction(f)}
                  >
                    {Math.round(f * 100)}%
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="stx-cta"
                style={{ height: 42 }}
                disabled={busy}
                onClick={() => onCashOut(bet, fraction)}
              >
                {busy ? 'Cashing out…' : `Cash Out GHS ${formatAmt(payout)}`}
              </button>
            </>
          ) : (
            <p className="stx-bet-cashout-note">
              {offerState === 'loading' ? 'Checking cash-out offer…'
                : offerState === 'locked' ? 'Cash-out is locked for this bet.'
                  : offerState === 'error' ? 'Cash-out value is temporarily unavailable.'
                    : "Cash-out isn't available for this bet right now."}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

export default function StitchMyBets() {
  const isMobile = useMediaQuery('(max-width: 1023px)');
  const slip = useStitchSlip();
  const { bets, openBets, settledBets, totals, status, error, refresh } = useStitchBets();
  const { offers, busyId, cashOut } = useStitchBetOffers(openBets);
  const [tab, setTab] = useState('active');
  const [q, setQ] = useState('');

  const cashOutBet = async (bet, fraction) => {
    const res = await cashOut(bet, fraction);
    if (res?.ok) refresh();
    return res;
  };

  const source = tab === 'active' ? openBets : tab === 'settled' ? settledBets : bets;
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return source;
    return source.filter((b) => {
      if (String(b.id || '').toLowerCase().includes(term)) return true;
      return (b.legs || []).some((l) =>
        `${l.home || ''} ${l.away || ''} ${l.league || ''}`.toLowerCase().includes(term));
    });
  }, [source, q]);

  const liveCashOut = openBets.reduce((s, b) => s + Number(offers[b.id]?.amount || 0), 0);

  let body;
  if (status === 'guest') {
    body = (
      <div className="stx-bets-empty">
        <p className="stx-body-md">Sign in to view your bets and cash-out offers.</p>
        <Link to="/login" className="stx-cta" style={{ justifyContent: 'center' }}>Sign in</Link>
      </div>
    );
  } else if (status === 'loading') {
    body = <p className="stx-body-md stx-muted">Loading your bets…</p>;
  } else if (status === 'error') {
    body = (
      <div className="stx-bets-empty">
        <p className="stx-body-md">{error || 'Could not load your bets.'}</p>
        <button type="button" className="stx-cta" onClick={refresh}>Try again</button>
      </div>
    );
  } else if (!list.length) {
    const emptyMsg = q.trim()
      ? 'No bets match your search.'
      : tab === 'active' ? 'You have no open bets. Place one from the sportsbook or live tracker.'
        : tab === 'settled' ? 'No settled bets yet.'
          : "You haven't placed any bets yet.";
    body = (
      <div className="stx-bets-empty">
        <p className="stx-body-md stx-muted">{emptyMsg}</p>
        {!q.trim() && <Link to="/" className="stx-promo-cta">Browse the sportsbook</Link>}
      </div>
    );
  } else {
    body = (
      <div className="stx-bets-list">
        {list.map((b) => (
          <BetCard
            key={b.id}
            bet={b}
            offer={offers[b.id]}
            busy={busyId === b.id}
            onCashOut={cashOutBet}
          />
        ))}
      </div>
    );
  }

  const content = (
    <div className="stx-bets">
      <div className="stx-sectionhead">
        <div>
          <h1 className="stx-h1">My Bets</h1>
          <p className="stx-sub">Open and settled tickets, with live cash-out.</p>
        </div>
        {openBets.length > 0 && (
          <span className="stx-chip">
            <span className="stx-live-dot" /> {openBets.length} ACTIVE
          </span>
        )}
      </div>

      {status === 'ready' && bets.length > 0 && (
        <div className="stx-bets-kpis">
          <div className="stx-kpi">
            <span>Active Stake</span>
            <b>GHS {formatAmt(totals.activeStake)}</b>
            <small>{openBets.length} open</small>
          </div>
          <div className="stx-kpi">
            <span>Potential Returns</span>
            <b>GHS {formatAmt(totals.activeReturns)}</b>
            <small>if all win</small>
          </div>
          <div className="stx-kpi">
            <span>Live Cash Out</span>
            <b>GHS {formatAmt(liveCashOut)}</b>
            <small>available now</small>
          </div>
          <div className="stx-kpi">
            <span>Net P/L (30d)</span>
            <b className={totals.netProfit >= 0 ? 'stx-gold' : ''}>
              {totals.netProfit >= 0 ? '+' : '-'}GHS {formatAmt(Math.abs(totals.netProfit))}
            </b>
            <small>settled</small>
          </div>
        </div>
      )}

      <div className="stx-bets-toolbar">
        <div className="stx-bets-tabs" role="tablist" aria-label="Bet status">
          {TABS.map((t) => {
            const count = t.id === 'active' ? openBets.length
              : t.id === 'settled' ? settledBets.length : bets.length;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`stx-chip${tab === t.id ? ' stx-chip--on' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label} {count > 0 ? `(${count})` : ''}
              </button>
            );
          })}
        </div>

        <form className="stx-search" role="search" onSubmit={(e) => e.preventDefault()}>
          <input
            className="stx-search-input"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search bets…"
            aria-label="Search your bets"
          />
        </form>
      </div>

      {body}
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
              <span className="stx-mob-bal">
                <span>BAL</span> GHS {formatAmt(slip.account?.balance || 0)}
              </span>
              <button type="button" className="stx-depbtn" onClick={slip.openDeposit}>+ ADD</button>
            </div>
          </header>
          <div className="stx-mob-body">{content}</div>
        </div>
        <BetslipDock slip={slip} />
        <TabBar betCount={slip.selectionCount} current="/my-bets" />
        <SlipToast slip={slip} />
      </div>
    );
  }

  return (
    <div className="stx">
      <StitchTopNav slip={slip} current="/my-bets" />
      {content}
      <StitchFooter current="/my-bets" />
      <SlipToast slip={slip} />
    </div>
  );
}

import { useEffect } from 'react';
import { formatAmt } from '../lib/betslipEngine.js';
import { Ic } from './parts.jsx';

/* ---------------------------------------------------------------------------
   StitchBetslip
   ---------------------------------------------------------------------------
   Renders the slip for both the desktop right rail (screen 1 & 3) and the
   mobile thumb-accessible dock (screens 2 & 4), matching the Stitch layouts:
   rail = full card with Single/Multi/System tabs; dock = condensed summary
   with horizontal pick chips.

   `cashoutSlot` lets the live tracker (screen 3) inject its cash-out panel
   above the stake block.
   ------------------------------------------------------------------------- */

function Picker({ sel, onRemove }) {
  return (
    <div className={`stx-pick${sel.stale ? ' stx-pick--stale' : ''}`}>
      <span className="stx-pick-market">{sel.marketLabel || sel.market}</span>
      <span className="stx-pick-label">{sel.pickLabel}</span>
      <span className="stx-pick-meta">
        {sel.meta} <span className="stx-pick-odds">@ {sel.odds?.toFixed(2)}</span>
        {sel.stale && <span style={{ color: 'var(--stx-odds-down)' }}>· SUSPENDED</span>}
        {sel.trend && (
          <span style={{ color: sel.trend === 'up' ? 'var(--stx-odds-up)' : 'var(--stx-odds-down)' }}>
            {sel.trend === 'up' ? '▲' : '▼'}
          </span>
        )}
      </span>
      <button type="button" className="stx-pick-x" onClick={() => onRemove(sel.id)} aria-label={`Remove ${sel.pickLabel}`}>
        ×
      </button>
    </div>
  );
}

function ProblemNote({ slip }) {
  // Home.jsx surfaces validateBetSlip()'s first error as slipErr; the Stitch
  // slip has to do the same or a disabled CTA looks broken for no reason
  // (e.g. one pick in Multi mode still needs a second leg).
  const msg = slip.problems?.[0];
  if (!msg) return null;
  return (
    <p className="stx-problem" role="alert">
      <Ic name="!" size="sm" /> {msg}
    </p>
  );
}

function StakeBlock({ slip, quickAdds, maxLabel }) {
  return (
    <>
      <div className="stx-quickadd">
        {quickAdds.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => slip.setMultipleStake(Number(slip.stakes.multiple || 0) + a)}
          >
            +{a}
          </button>
        ))}
        <button type="button" onClick={() => slip.setMultipleStake(slip.balance)}>
          {maxLabel}
        </button>
      </div>

      <label className="stx-inputwrap">
        <span className="stx-prefix">GHS</span>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="10"
          value={slip.stakes.multiple || ''}
          placeholder="0.00"
          onChange={(e) => slip.setMultipleStake(e.target.value)}
          aria-label="Stake amount"
        />
        <button type="button" className="stx-maxbtn" onClick={() => slip.setMultipleStake(slip.balance)}>
          MAX
        </button>
      </label>
    </>
  );
}

function Recap({ slip, ctaLabel }) {
  return (
    <div className="stx-recap">
      <div className="stx-recap-row">
        <span>Total Odds</span>
        <b>{slip.totalOdds ? slip.totalOdds.toFixed(2) : '—'}</b>
      </div>
      {slip.bonusPct > 0 && (
        <div className="stx-recap-row stx-recap-row--gold">
          <span>Boosted Extra ({Math.round(slip.bonusPct * 100)}%)</span>
          <b>+GHS {formatAmt(slip.bonusAmount)}</b>
        </div>
      )}
      <div className="stx-recap-row stx-recap-row--payout">
        <span>Potential Payout</span>
        <b>GHS {formatAmt(slip.boostedPayout)}</b>
      </div>
    </div>
  );
}

/* ---------------- desktop right rail ------------------------------------- */

export function BetslipRail({ slip, quickAdds = [10, 50, 100, 500], cashoutSlot }) {
  return (
    <aside className="stx-slip" aria-label="Bet slip">
      <header className="stx-slip-head">
        <Ic name="▤" />
        <h2>Bet Slip</h2>
        {slip.selectionCount > 0 && <span className="stx-count">{slip.selectionCount}</span>}
        <div className="stx-right">
          {slip.selectionCount > 0 && (
            <button type="button" className="stx-textbtn stx-textbtn--danger" onClick={slip.clearSlip}>
              <Ic name="⌫" size="sm" /> Clear
            </button>
          )}
        </div>
      </header>

      <div className="stx-slip-tabs">
        <div className="stx-seg" role="group" aria-label="Bet mode">
          {['single', 'multiple', 'system'].map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={slip.betMode === m}
              onClick={() => slip.setBetMode(m)}
            >
              {m === 'multiple' ? 'Multi' : m === 'single' ? 'Single' : 'System'}
              {m === 'multiple' && slip.selectionCount > 0 ? ` (${slip.selectionCount})` : ''}
            </button>
          ))}
        </div>
      </div>

      {/* Rendered unconditionally: on the live tracker the cash-out panel is a
          primary module for an already-placed bet and must stay visible even
          when the betslip itself is empty. */}
      {cashoutSlot && <div className="stx-slip-cashout">{cashoutSlot}</div>}

      {slip.selectionCount === 0 ? (
        <div className="stx-slip-empty">
          <Ic name="▤" />
          Tap any odds to build your slip.
        </div>
      ) : (
        <>
          {slip.bonusPct > 0 && (
            <div className="stx-bonus">
              <Ic name="★" size="sm" />
              <span>Accumulator Bonus</span>
              <span className="stx-right">+{Math.round(slip.bonusPct * 100)}% BOOST</span>
            </div>
          )}

          <div className="stx-slip-body stx-scroll">
            {slip.selections.map((s) => (
              <Picker key={s.id} sel={s} onRemove={slip.removeSelection} />
            ))}
          </div>

          <div className="stx-stake">
            <StakeBlock slip={slip} quickAdds={quickAdds} maxLabel="GHS" />
            {slip.insufficient && (
              <p className="stx-body-sm" style={{ margin: 0, color: 'var(--stx-odds-down)' }}>
                Insufficient balance —{' '}
                <button
                  type="button"
                  className="stx-textbtn"
                  style={{ color: 'inherit' }}
                  onClick={slip.openDeposit}
                >
                  Deposit
                </button>
              </p>
            )}
            <ProblemNote slip={slip} />
            <Recap slip={slip} />
            <button type="button" className="stx-cta" onClick={slip.place} disabled={!slip.canPlace}>
              <Ic name="🔒" size="sm" />
              {slip.placing
                ? 'Placing…'
                : slip.selectionCount
                  ? `Place Bet (GHS ${formatAmt(slip.totalStake)})`
                  : 'Place Bet'}
            </button>
          </div>
        </>
      )}
    </aside>
  );
}

/* ---------------- mobile bottom dock -------------------------------------- */

export function BetslipDock({ slip, quickAdds = [10, 50, 100] }) {
  if (slip.selectionCount === 0) return null;

  return (
    <div className="stx-dock">
      <div className="stx-dock-inner">
        <div className="stx-dock-head">
          <Ic name="⚡" size="sm" />
          {slip.selectionCount} Active Selection{slip.selectionCount > 1 ? 's' : ''}
          <div className="stx-right">
            {slip.bonusPct > 0 && (
              <span style={{ color: 'var(--stx-tertiary-container)' }}>
                +{Math.round(slip.bonusPct * 100)}% BOOST
              </span>
            )}
            <button
              type="button"
              className="stx-textbtn stx-textbtn--danger"
              onClick={slip.clearSlip}
              aria-label="Clear slip"
            >
              <Ic name="⌫" size="sm" />
            </button>
          </div>
        </div>

        <div className="stx-dock-chips">
          {slip.selections.map((s) => (
            <span key={s.id} className="stx-dock-chip">
              {s.pickLabel} <b>@{s.odds?.toFixed(2)}</b>
              <button
                type="button"
                className="stx-pick-x"
                style={{ position: 'static' }}
                onClick={() => slip.removeSelection(s.id)}
                aria-label={`Remove ${s.pickLabel}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>

        <div className="stx-dock-grid">
          <div className="stx-dock-summary">
            <span>Total Odds</span>
            <b>{slip.totalOdds ? slip.totalOdds.toFixed(2) : '—'}</b>
          </div>
          <div className="stx-dock-summary">
            <span>Payout</span>
            <b className="stx-gold">GHS {formatAmt(slip.boostedPayout)}</b>
          </div>

          <div className="stx-grid-2" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <StakeBlock slip={slip} quickAdds={quickAdds} maxLabel="MAX" />
            <ProblemNote slip={slip} />
            <Recap slip={slip} />
            <button type="button" className="stx-cta" onClick={slip.place} disabled={!slip.canPlace}>
              <Ic name="🔒" size="sm" />
              {slip.placing ? 'Placing…' : `Place Bet (GHS ${formatAmt(slip.totalStake)})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- toast --------------------------------------------------- */

export function SlipToast({ slip }) {
  useEffect(() => {
    if (!slip.notice) return undefined;
    const t = setTimeout(slip.clearNotice, 4200);
    return () => clearTimeout(t);
  }, [slip.notice, slip.clearNotice]);

  if (!slip.notice) return null;
  return (
    <div className={`stx-toast stx-toast--${slip.notice.tone}`} role="status">
      {slip.notice.message}
    </div>
  );
}

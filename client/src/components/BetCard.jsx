import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ───────────────────────────────────────────────
   Inline SVG icons
   ─────────────────────────────────────────────── */
function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    </svg>
  );
}

function TrendingUpIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

function PenIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/* ───────────────────────────────────────────────
   Single bet leg row
   ─────────────────────────────────────────────── */
function BetLegRow({ leg, index }) {
  return (
    <div className="bc-leg">
      <span className="bc-leg-clock"><ClockIcon /></span>
      <div className="bc-leg-body">
        <div className="bc-leg-selection">
          <strong>{leg.selection || `${leg.teamHome || ''} @ ${leg.odds || ''}`}</strong>
          <span className="bc-leg-market">{leg.market}</span>
        </div>
        <div className="bc-leg-teams">
          {leg.teamHome} vs {leg.teamAway}
        </div>
        <div className="bc-leg-time">{leg.matchTime}</div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────
   Main BetCard component
   ─────────────────────────────────────────────── */
export default function BetCard({
  activeTab = 'open',
  onTabSwitch,
  bets = [],
  stake = 0,
  potentialWin = 0,
  cashoutAmount = 0,
  currency = 'GHS',
  isDetailsVisible = false,
  onToggleDetails,
  onCashout,
  onRebet,
  onSim,
  onEdit,
  openCount = 0,
  historyCount = 0,
}) {
  const [filter, setFilter] = useState('all');

  function fmt(n) {
    return Number(n || 0).toFixed(2);
  }

  return (
    <div className="bc-root">
      {/* ── Tab bar ── */}
      <div className="bc-tabs">
        <button
          type="button"
          className={`bc-tab${activeTab === 'open' ? ' active' : ''}`}
          onClick={() => onTabSwitch?.('open')}
        >
          Open Bets <span className="bc-tab-count">{openCount}</span>
        </button>
        <button
          type="button"
          className={`bc-tab${activeTab === 'history' ? ' active' : ''}`}
          onClick={() => onTabSwitch?.('history')}
        >
          Bet History <span className="bc-tab-count">{historyCount}</span>
        </button>
      </div>

      {/* ── Sub-filter row ── */}
      <div className="bc-filters">
        {['All', 'Cashout Available', 'Live Games'].map((lbl) => {
          const key = lbl.toLowerCase().replace(/\s+/g, '_');
          return (
            <button
              key={key}
              type="button"
              className={`bc-pill${filter === key ? ' active' : ''}`}
              onClick={() => setFilter(key)}
            >
              {lbl}
            </button>
          );
        })}
        <button type="button" className="bc-grid-btn" aria-label="Toggle view">
          <GridIcon />
        </button>
      </div>

      {/* ── Bet card ── */}
      <div className="bc-card">
        {/* Header */}
        <div className="bc-card-head">
          <span className="bc-mode">Multiple</span>
          <div className="bc-actions">
            <button type="button" className="bc-action-btn" onClick={onRebet} title="Rebet" aria-label="Rebet">
              <RefreshIcon /> <span>Rebet</span>
            </button>
            <button type="button" className="bc-action-btn" onClick={onSim} title="SIM" aria-label="SIM">
              <TrendingUpIcon /> <span>SIM</span>
            </button>
            <button type="button" className="bc-action-btn" onClick={onEdit} title="Edit Bet" aria-label="Edit Bet">
              <PenIcon /> <span>Edit Bet</span>
            </button>
          </div>
        </div>

        {/* Bet legs */}
        <div className="bc-legs">
          {bets.map((leg, i) => (
            <BetLegRow key={leg.id || i} leg={leg} index={i} />
          ))}
        </div>

        {/* Divider */}
        <div className="bc-divider" />

        {/* Toggle details */}
        <button type="button" className="bc-toggle-details" onClick={onToggleDetails}>
          <span>{isDetailsVisible ? 'Hide' : 'View'} Match Details</span>
          {isDetailsVisible ? <ChevronUpIcon /> : <ChevronDownIcon />}
        </button>

        {/* Expandable details */}
        <AnimatePresence initial={false}>
          {isDetailsVisible && (
            <motion.div
              className="bc-details"
              key="details"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
            >
              <div className="bc-details-inner">
                {bets.map((leg, i) => (
                  <div key={leg.id || i} className="bc-detail-leg">
                    <span className="bc-detail-idx">{(i + 1).toString().padStart(2, '0')}</span>
                    <div className="bc-detail-info">
                      <span className="bc-detail-teams">{leg.teamHome} vs {leg.teamAway}</span>
                      <span className="bc-detail-pick">{leg.selection || `${leg.teamHome || ''}`} @ {leg.odds}</span>
                      <span className="bc-detail-mkt">{leg.market}</span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Divider */}
        <div className="bc-divider" />

        {/* Summary row */}
        <div className="bc-summary">
          <div className="bc-summary-col">
            <span className="bc-summary-lbl">Stake</span>
            <span className="bc-summary-lbl">Pot. Win</span>
          </div>
          <div className="bc-summary-col bc-summary-vals">
            <span className="bc-summary-val">{fmt(stake)}</span>
            <span className="bc-summary-val">{fmt(potentialWin)}</span>
          </div>
        </div>

        {/* Cashout CTA */}
        <button type="button" className="bc-cashout-btn" onClick={onCashout}>
          Cashout {currency} {fmt(cashoutAmount)}
        </button>
      </div>

      <style>{STYLES}</style>
    </div>
  );
}

/* ───────────────────────────────────────────────
   Styles
   ─────────────────────────────────────────────── */
const STYLES = `
/* ── Root ── */
.bc-root {
  font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
  max-width: 480px;
  margin: 0 auto;
  color: var(--text);
}

/* ── Tab bar ── */
.bc-tabs {
  display: flex;
  width: 100%;
}
.bc-tab {
  flex: 1;
  padding: 14px 12px;
  border: none;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  font-family: inherit;
  background: var(--surface-2);
  color: var(--text-soft);
}
.bc-tab:first-child {
  border-radius: 10px 0 0 0;
}
.bc-tab:last-child {
  border-radius: 0 10px 0 0;
}
.bc-tab.active {
  background: var(--surface);
  color: var(--text);
}
.bc-tab-count {
  display: inline-block;
  margin-left: 6px;
  font-size: 12px;
  opacity: 0.7;
}

/* ── Sub-filters ── */
.bc-filters {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 0;
  overflow-x: auto;
}
.bc-pill {
  flex-shrink: 0;
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text-dim);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  font-family: inherit;
}
.bc-pill:hover {
  background: var(--surface-2);
  color: var(--text);
}
.bc-pill.active {
  background: var(--surface-2);
  color: var(--text);
  border-color: var(--surface-2);
}
.bc-grid-btn {
  margin-left: auto;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text-dim);
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: background 0.15s, color 0.15s;
}
.bc-grid-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}

/* ── Card ── */
.bc-card {
  background: var(--surface);
  border-radius: 14px;
  padding: 16px 18px;
  border: 1px solid var(--line);
  color: var(--text);
}

/* ── Card head ── */
.bc-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.bc-mode {
  font-size: 16px;
  font-weight: 700;
}
.bc-actions {
  display: flex;
  gap: 6px;
}
.bc-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border: none;
  background: rgba(0,122,69,0.15);
  color: var(--accent);
  font-size: 11px;
  font-weight: 700;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  font-family: inherit;
}
.bc-action-btn:hover {
  background: rgba(0,122,69,0.25);
}
.bc-action-btn span {
  display: none;
}
@media (min-width: 400px) {
  .bc-action-btn span {
    display: inline;
  }
}

/* ── Legs ── */
.bc-legs {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.bc-leg {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.bc-leg-clock {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--surface-2);
  display: grid;
  place-items: center;
  color: var(--text-dim);
  margin-top: 1px;
}
.bc-leg-body {
  flex: 1;
  min-width: 0;
}
.bc-leg-selection {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  display: flex;
  gap: 6px;
  align-items: baseline;
  flex-wrap: wrap;
}
.bc-leg-market {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-dim);
}
.bc-leg-teams {
  font-size: 13px;
  color: var(--text-soft);
  margin-top: 1px;
}
.bc-leg-time {
  font-size: 11.5px;
  color: var(--text-dim);
  margin-top: 1px;
}

/* ── Divider ── */
.bc-divider {
  height: 1px;
  background: var(--line);
  margin: 12px 0;
}

/* ── Toggle details ── */
.bc-toggle-details {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-dim);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: color 0.15s;
}
.bc-toggle-details:hover {
  color: var(--text-soft);
}

/* ── Expandable details ── */
.bc-details {
  overflow: hidden;
}
.bc-details-inner {
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.bc-detail-leg {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 8px 10px;
  background: var(--bg-soft);
  border-radius: 8px;
}
.bc-detail-idx {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
  min-width: 20px;
}
.bc-detail-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.bc-detail-teams {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.bc-detail-pick {
  font-size: 12px;
  color: var(--accent);
  font-weight: 600;
}
.bc-detail-mkt {
  font-size: 11px;
  color: var(--text-dim);
}

/* ── Summary ── */
.bc-summary {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.bc-summary-col {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.bc-summary-vals {
  text-align: right;
}
.bc-summary-lbl {
  font-size: 12px;
  color: var(--text-dim);
  font-weight: 500;
}
.bc-summary-val {
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

/* ── Cashout button ── */
.bc-cashout-btn {
  display: block;
  width: 100%;
  margin-top: 14px;
  padding: 14px 16px;
  border: none;
  border-radius: 10px;
  background: var(--accent);
  color: #fff;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
  font-family: inherit;
}
.bc-cashout-btn:hover {
  filter: brightness(1.15);
  transform: translateY(-1px);
  box-shadow: 0 8px 20px rgba(0,122,69,0.35);
}
.bc-cashout-btn:active {
  transform: translateY(0);
}

@media (max-width: 400px) {
  .bc-card {
    padding: 14px 14px;
    border-radius: 12px;
  }
  .bc-mode {
    font-size: 14px;
  }
  .bc-leg-selection {
    font-size: 13px;
  }
  .bc-leg-teams {
    font-size: 12px;
  }
  .bc-cashout-btn {
    font-size: 14px;
    padding: 13px 14px;
  }
}
`;

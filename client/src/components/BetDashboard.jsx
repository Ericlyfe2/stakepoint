import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/*
 * BetStatus  : 'pending' | 'won' | 'lost' | 'cashed_out' | 'void'
 * BetType    : 'single' | 'multiple' | 'system'
 *
 * BetLeg     : { id, selection, market, homeTeam, awayTeam, matchTime, odds, isLive }
 * BetTicket  : { ticketId, status, type, legs, stake, currency, potentialWin,
 *                cashoutAvailable, cashoutAmount, placedAt }
 */

/* ───────────────────────────────────────────────
   Inline SVG icons
   ─────────────────────────────────────────────── */
function SvgClock({ size = 16 }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>);
}
function SvgRefresh({ size = 15 }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>);
}
function SvgTrendingUp({ size = 15 }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>);
}
function SvgPen({ size = 15 }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>);
}
function SvgGrid({ size = 16 }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>);
}
function SvgChevronUp({ size = 14 }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="18 15 12 9 6 15"/></svg>);
}
function SvgChevronDown({ size = 14 }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="6 9 12 15 18 9"/></svg>);
}
function SvgInbox({ size = 48 }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>);
}
function SvgClockLive({ size = 14 }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="2" fill="#ef4444"/></svg>);
}

/* ───────────────────────────────────────────────
   Status label helpers
   ─────────────────────────────────────────────── */
const STATUS_LABEL = { pending: 'Pending', won: 'Won', lost: 'Lost', cashed_out: 'Cashed Out', void: 'Void' };
const STATUS_CLASS = { pending: 'bd-status-pending', won: 'bd-status-won', lost: 'bd-status-lost', cashed_out: 'bd-status-cashed', void: 'bd-status-void' };

function fmtNum(n) {
  return Number(n || 0).toFixed(2);
}
function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${mi}`;
}

/* ───────────────────────────────────────────────
   Skeleton shimmer card
   ─────────────────────────────────────────────── */
function SkeletonCard() {
  return (
    <div className="bd-skeleton" aria-hidden>
      <div className="bd-sk-head">
        <div className="bd-sk-line w-24" />
        <div className="bd-sk-line w-32" />
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="bd-sk-leg">
          <div className="bd-sk-circle" />
          <div className="bd-sk-leg-body">
            <div className="bd-sk-line w-48" />
            <div className="bd-sk-line w-36" />
            <div className="bd-sk-line w-20" />
          </div>
        </div>
      ))}
      <div className="bd-sk-actions">
        <div className="bd-sk-line w-full" />
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────
   Empty state
   ─────────────────────────────────────────────── */
function EmptyState({ tab }) {
  return (
    <motion.div
      className="bd-empty"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <div className="bd-empty-icon"><SvgInbox size={48} /></div>
      <h3 className="bd-empty-title">No {tab === 'open' ? 'open' : ''} bets found</h3>
      <p className="bd-empty-sub">
        {tab === 'open'
          ? 'Pick a market on the home page to place your first ticket.'
          : 'Once your open bets settle, they\'ll show up here.'}
      </p>
    </motion.div>
  );
}

/* ───────────────────────────────────────────────
   Single bet leg row
   ─────────────────────────────────────────────── */
function LegRow({ leg, showLiveDot }) {
  return (
    <div className="bd-leg">
      <span className="bd-leg-clock">
        {showLiveDot && leg.isLive ? <SvgClockLive size={16} /> : <SvgClock size={16} />}
      </span>
      <div className="bd-leg-body">
        <div className="bd-leg-sel-line">
          <strong>{leg.selection || `${leg.homeTeam || ''} @ ${leg.odds || ''}`}</strong>
          <span className="bd-leg-mkt">{leg.market}</span>
        </div>
        <div className="bd-leg-teams">{leg.homeTeam} vs {leg.awayTeam}</div>
        <div className="bd-leg-time">{leg.matchTime || (leg.placedAt ? fmtDateTime(leg.placedAt) : '')}</div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────
   Bet card — renders a single BetTicket
   ─────────────────────────────────────────────── */
function BetCardItem({ ticket, index, isExpanded, onToggle, onCashout, onRebet, onSim, onEdit }) {
  const cashable = ticket.status === 'pending' && ticket.cashoutAvailable;

  return (
    <motion.div
      className="bd-card"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04, ease: 'easeOut' }}
    >
      {/* ── Card header ── */}
      <div className="bd-card-head">
        <div className="bd-card-headline">
          <span className={`bd-status ${STATUS_CLASS[ticket.status] || ''}`}>{STATUS_LABEL[ticket.status] || ticket.status}</span>
          <span className="bd-card-meta">{ticket.legs?.length || 1} selection{(ticket.legs?.length || 1) > 1 ? 's' : ''} · {ticket.placedAt ? fmtDateTime(ticket.placedAt) : ''}</span>
        </div>
        <span className="bd-card-type">{ticket.type === 'multiple' ? 'Multiple' : ticket.type === 'single' ? 'Single' : 'System'}</span>
      </div>

      {/* ── Legs ── */}
      <div className="bd-legs">
        {ticket.legs?.slice(0, isExpanded ? undefined : 2).map((leg) => (
          <LegRow key={leg.id} leg={leg} showLiveDot={ticket.status === 'pending'} />
        ))}
        {!isExpanded && ticket.legs?.length > 2 && (
          <div className="bd-legs-more">+{ticket.legs.length - 2} more</div>
        )}
      </div>

      {/* ── Expand/collapse ── */}
      {ticket.legs?.length > 2 && (
        <button type="button" className="bd-toggle" onClick={() => onToggle?.()}>
          <span>{isExpanded ? 'Hide' : 'View'} Match Details</span>
          {isExpanded ? <SvgChevronUp size={14} /> : <SvgChevronDown size={14} />}
        </button>
      )}

      {/* ── Expanded legs (AnimatePresence slide) ── */}
      <AnimatePresence initial={false}>
        {isExpanded && ticket.legs?.length > 2 && (
          <motion.div
            className="bd-legs-expand"
            key="expand"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
          >
            <div className="bd-legs-expand-inner">
              {ticket.legs.slice(2).map((leg, i) => (
                <LegRow key={leg.id} leg={leg} showLiveDot={ticket.status === 'pending'} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bd-divider" />

      {/* ── Summary row ── */}
      <div className="bd-summary">
        <div className="bd-summary-labels">
          <span>Stake</span>
          <span>Pot. Win</span>
        </div>
        <div className="bd-summary-vals">
          <span>{ticket.currency || 'GHS'} {fmtNum(ticket.stake)}</span>
          <span>{ticket.currency || 'GHS'} {fmtNum(ticket.potentialWin)}</span>
        </div>
      </div>

      {/* ── Cashout CTA ── */}
      {cashable ? (
        <button type="button" className="bd-cashout-btn" onClick={() => onCashout?.()}>
          Cashout {ticket.currency || 'GHS'} {fmtNum(ticket.cashoutAmount)}
        </button>
      ) : ticket.status === 'cashed_out' ? (
        <div className="bd-cashed-note">
          Cashed out for {ticket.currency || 'GHS'} {fmtNum(ticket.cashoutAmount)}
        </div>
      ) : null}

      {/* ── Actions row (Rebet / SIM / Edit) ── */}
      {ticket.status === 'pending' && (
        <div className="bd-actions-row">
          <button type="button" className="bd-action-btn" onClick={() => onRebet?.()}><SvgRefresh size={13} /> Rebet</button>
          <button type="button" className="bd-action-btn" onClick={() => onSim?.()}><SvgTrendingUp size={13} /> SIM</button>
          <button type="button" className="bd-action-btn" onClick={() => onEdit?.()}><SvgPen size={13} /> Edit</button>
        </div>
      )}
      {ticket.status !== 'pending' && (
        <div className="bd-actions-row">
          <button type="button" className="bd-action-btn" onClick={() => onRebet?.()}><SvgRefresh size={13} /> Rebet</button>
        </div>
      )}
    </motion.div>
  );
}

/* ───────────────────────────────────────────────
   Main BetDashboard component
   ─────────────────────────────────────────────── */
export default function BetDashboard({
  tickets = [],
  isLoading = false,
  activeTab = 'open',
  hideTabs = false,
  onTabSwitch,
  onCashout,
  onRebet,
  onSim,
  onEdit,
  openCount,
  historyCount,
}) {
  const [filter, setFilter] = useState('all');
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [viewMode, setViewMode] = useState('grid'); // grid | list

  const toggleExpanded = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Filter logic
  const filtered = useMemo(() => {
    let items = tickets;
    if (filter === 'cashout') items = items.filter((t) => t.cashoutAvailable);
    if (filter === 'live') items = items.filter((t) => t.legs?.some((l) => l.isLive));
    if (filter === 'settled') items = items.filter((t) => t.status !== 'pending');
    return items;
  }, [tickets, filter]);

  const filterPills = [
    { key: 'all', label: 'All' },
    { key: 'cashout', label: 'Cashout Available' },
    { key: 'live', label: 'Live Games' },
    { key: 'settled', label: 'Settled' },
  ];

  return (
    <div className="bd-root">
      {!hideTabs && (
        <>
          <div className="bd-tabs">
            <button type="button" className={`bd-tab${activeTab === 'open' ? ' active' : ''}`} onClick={() => onTabSwitch?.('open')}>
              Open Bets <span className="bd-tab-count">{openCount ?? tickets.filter((t) => t.status === 'pending').length}</span>
            </button>
            <button type="button" className={`bd-tab${activeTab === 'history' ? ' active' : ''}`} onClick={() => onTabSwitch?.('history')}>
              Bet History <span className="bd-tab-count">{historyCount ?? tickets.filter((t) => t.status !== 'pending').length}</span>
            </button>
          </div>

          <div className="bd-filters">
            {filterPills.map((p) => (
              <button key={p.key} type="button" className={`bd-pill${filter === p.key ? ' active' : ''}`} onClick={() => setFilter(p.key)}>
                {p.label}
              </button>
            ))}
            <button type="button" className="bd-grid-btn" onClick={() => setViewMode((v) => (v === 'grid' ? 'list' : 'grid'))} aria-label="Toggle view">
              <SvgGrid size={16} />
            </button>
          </div>
        </>
      )}

      {/* ── Content ── */}
      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div key="skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </motion.div>
        ) : filtered.length === 0 ? (
          <motion.div key={`empty-${activeTab}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <EmptyState tab={activeTab} />
          </motion.div>
        ) : (
          <motion.div
            key={`list-${activeTab}-${filter}`}
            className={`bd-list ${viewMode === 'grid' ? 'bd-list-grid' : 'bd-list-stack'}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            {filtered.map((ticket, i) => (
              <BetCardItem
                key={ticket.ticketId}
                ticket={ticket}
                index={i}
                isExpanded={expandedIds.has(ticket.ticketId)}
                onToggle={() => toggleExpanded(ticket.ticketId)}
                onCashout={() => onCashout?.(ticket)}
                onRebet={() => onRebet?.(ticket)}
                onSim={() => onSim?.(ticket)}
                onEdit={() => onEdit?.(ticket)}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <style>{STYLES}</style>
    </div>
  );
}

/* ───────────────────────────────────────────────
   Styles
   ─────────────────────────────────────────────── */
const STYLES = `
/* ── Root ── */
.bd-root {
  font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
  max-width: 520px;
  margin: 0 auto;
  color: #ffffff;
}

/* ── Tab bar ── */
.bd-tabs {
  display: flex;
  width: 100%;
  background: linear-gradient(90deg, #3b82f6, #2563eb);
  border-radius: 10px 10px 0 0;
  overflow: hidden;
}
.bd-tab {
  flex: 1;
  padding: 14px 12px;
  border: none;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
  font-family: inherit;
  background: transparent;
  color: rgba(255,255,255,0.8);
  position: relative;
}
.bd-tab.active {
  background: #374151;
  color: #ffffff;
}
.bd-tab.active::after {
  content: '';
  position: absolute;
  bottom: 0; left: 20%; right: 20%;
  height: 3px;
  background: #00D26A;
  border-radius: 3px 3px 0 0;
}
.bd-tab-count {
  display: inline-block;
  margin-left: 6px;
  font-size: 12px;
  opacity: 0.65;
}

/* ── Filters ── */
.bd-filters {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 0;
  overflow-x: auto;
  flex-wrap: nowrap;
}
.bd-pill {
  flex-shrink: 0;
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.06);
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.5);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  font-family: inherit;
  white-space: nowrap;
}
.bd-pill:hover {
  background: rgba(255,255,255,0.08);
  color: #ffffff;
}
.bd-pill.active {
  background: #111111;
  color: #ffffff;
  border-color: #111111;
}
.bd-grid-btn {
  margin-left: auto;
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.06);
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.5);
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: background 0.15s, color 0.15s;
}
.bd-grid-btn:hover {
  background: rgba(255,255,255,0.08);
  color: #ffffff;
}

/* ── List ── */
.bd-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.bd-list-grid .bd-card {
  break-inside: avoid;
}

/* ── Card ── */
.bd-card {
  background: #ffffff;
  border-radius: 14px;
  padding: 16px 18px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.07);
  color: #111827;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ── Card head ── */
.bd-card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}
.bd-card-headline {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.bd-card-meta {
  font-size: 11.5px;
  color: #6b7280;
}
.bd-card-type {
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  background: #f3f4f6;
  color: #6b7280;
  padding: 4px 8px;
  border-radius: 6px;
  font-weight: 700;
  flex-shrink: 0;
}

/* ── Status badges ── */
.bd-status {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
  padding: 3px 9px;
  border-radius: 999px;
  text-transform: uppercase;
  align-self: flex-start;
}
.bd-status-pending   { color: #3b82f6; background: rgba(59,130,246,0.10); }
.bd-status-won       { color: #0E8A4A; background: rgba(14,138,74,0.10); }
.bd-status-lost      { color: #dc2626; background: rgba(220,38,38,0.08); }
.bd-status-cashed    { color: #d97706; background: rgba(217,119,6,0.10); }
.bd-status-void      { color: #6b7280; background: #f3f4f6; }

/* ── Legs ── */
.bd-legs {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bd-leg {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.bd-leg-clock {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #f3f4f6;
  display: grid;
  place-items: center;
  color: #9ca3af;
  margin-top: 1px;
}
.bd-leg-body {
  flex: 1;
  min-width: 0;
}
.bd-leg-sel-line {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  display: flex;
  gap: 6px;
  align-items: baseline;
  flex-wrap: wrap;
}
.bd-leg-mkt {
  font-size: 11px;
  font-weight: 500;
  color: #6b7280;
}
.bd-leg-teams {
  font-size: 13px;
  color: #4b5563;
  margin-top: 1px;
}
.bd-leg-time {
  font-size: 11.5px;
  color: #9ca3af;
  margin-top: 1px;
}
.bd-legs-more {
  font-size: 12px;
  font-weight: 600;
  color: #00D26A;
  text-align: center;
  padding: 4px 0;
}

/* ── Toggle ── */
.bd-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 0;
  border: none;
  background: transparent;
  color: #9ca3af;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: color 0.15s;
}
.bd-toggle:hover {
  color: #00D26A;
}

/* ── Expanded legs ── */
.bd-legs-expand {
  overflow: hidden;
}
.bd-legs-expand-inner {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 4px;
}

/* ── Divider ── */
.bd-divider {
  height: 1px;
  background: #e5e7eb;
}

/* ── Summary ── */
.bd-summary {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.bd-summary-labels {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #9ca3af;
  font-weight: 500;
}
.bd-summary-vals {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: right;
  font-size: 14px;
  font-weight: 700;
  color: #111827;
  font-variant-numeric: tabular-nums;
}

/* ── Cashout ── */
.bd-cashout-btn {
  display: block;
  width: 100%;
  padding: 14px 16px;
  border: none;
  border-radius: 10px;
  background: #00D26A;
  color: #ffffff;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
  font-family: inherit;
}
.bd-cashout-btn:hover {
  background: #00b85c;
  transform: translateY(-1px);
  box-shadow: 0 8px 20px rgba(0,210,106,0.35);
}
.bd-cashout-btn:active {
  transform: scale(0.97);
}
.bd-cashed-note {
  font-size: 12.5px;
  color: #6b7280;
  padding: 8px 10px;
  background: rgba(217,119,6,0.06);
  border-radius: 8px;
  text-align: center;
  font-weight: 600;
}

/* ── Actions row ── */
.bd-actions-row {
  display: flex;
  gap: 6px;
}
.bd-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border: 1px solid rgba(0,210,106,0.2);
  background: rgba(0,210,106,0.06);
  color: #00D26A;
  font-size: 12px;
  font-weight: 700;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
  font-family: inherit;
}
.bd-action-btn:hover {
  background: rgba(0,210,106,0.12);
}

/* ── Skeleton ── */
.bd-skeleton {
  background: #ffffff;
  border-radius: 14px;
  padding: 16px 18px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.07);
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 14px;
}
.bd-sk-head {
  display: flex;
  gap: 12px;
}
.bd-sk-leg {
  display: flex;
  gap: 10px;
}
.bd-sk-circle {
  width: 28px; height: 28px; border-radius: 50%;
  background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
  background-size: 200% 100%;
  animation: bd-shimmer 1.6s ease-in-out infinite;
  flex-shrink: 0;
}
.bd-sk-leg-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bd-sk-line {
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
  background-size: 200% 100%;
  animation: bd-shimmer 1.6s ease-in-out infinite;
}
.bd-sk-actions {
  padding-top: 6px;
}
.w-20 { width: 20%; }
.w-24 { width: 24%; }
.w-36 { width: 36%; }
.w-48 { width: 48%; }

@keyframes bd-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* ── Empty state ── */
.bd-empty {
  text-align: center;
  padding: 48px 20px;
}
.bd-empty-icon {
  display: inline-flex;
  color: #d1d5db;
  margin-bottom: 12px;
}
.bd-empty-title {
  font-size: 18px;
  font-weight: 700;
  color: #ffffff;
  margin: 0 0 6px;
}
.bd-empty-sub {
  font-size: 13px;
  color: rgba(255,255,255,0.5);
  margin: 0;
  max-width: 260px;
  margin: 0 auto;
}

/* ── Responsive ── */
@media (max-width: 400px) {
  .bd-card { padding: 14px 14px; border-radius: 12px; }
  .bd-leg-sel-line { font-size: 13px; }
  .bd-leg-teams { font-size: 12px; }
  .bd-cashout-btn { font-size: 14px; padding: 13px 14px; }
  .bd-tab { font-size: 13px; padding: 12px 10px; }
}
`;

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchBetHistory, fetchBetByCode, fetchCashoutOffer, executeCashout, setAutoCashout as apiSetAutoCashout } from '../api/betApi.js';
import { useAccount, useToast } from '../providers/AccountProvider.jsx';
import CashoutModal from '../components/CashoutModal.jsx';
import AutoCashoutPanel from '../components/AutoCashoutPanel.jsx';
import { toBookingCode } from '../components/BetSuccessModal.jsx';

const AUTO_TARGETS_KEY = 'bv_auto_cashout_targets';
const PAGE_SIZE = 20;

function loadAutoTargets() {
  if (typeof localStorage === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(AUTO_TARGETS_KEY) || '{}'); } catch { return {}; }
}
function saveAutoTargets(map) {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(AUTO_TARGETS_KEY, JSON.stringify(map)); } catch {}
}

function fmt(n) {
  return Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function placedAtLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const dt = d.toLocaleDateString('en-GH', { day: '2-digit', month: 'short' });
  const tm = d.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' });
  return `${dt}, ${tm}`;
}

function computeOffer(b) {
  if (b.status !== 'open') return 0;
  const stake = Number(b.stake || 0);

  // Fair value of an open ticket whose legs are all still pending: a touch under
  // the stake, scaled down a little more as the combined odds (and so the risk)
  // climb. e.g. stake 300 @ 12.32 odds → ~274.13.
  const logOdds = Math.log2(Math.max(1.01, b.totalOdds || 1));
  const factor = Math.min(0.98, Math.max(0.90, 0.95 - 0.01 * logOdds));
  const fair = Number((stake * factor).toFixed(2));

  // Honour a server-provided offer only when it is plausible. Before any leg has
  // resolved a cash-out can never be worth more than the stake, so reject bogus
  // values (e.g. a percentage of the potential win) and fall back to fair value.
  const serverOffer = b.lastCashOutOffer?.amount > 0
    ? Number(b.lastCashOutOffer.amount)
    : b.cashoutOffer > 0 ? Number(b.cashoutOffer) : 0;
  if (serverOffer > 0 && serverOffer <= stake * 1.01) {
    return Number(serverOffer.toFixed(2));
  }
  return fair;
}

function stableHash(key) {
  let x = 0;
  const s = String(key || '');
  for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  return Math.abs(x);
}

function ticketTimeFull(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mn = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mn}`;
}

const PICK_LABEL = {
  '1': 'Home', 'X': 'Draw', '2': 'Away',
  'Over': 'Over', 'Under': 'Under', 'Yes': 'Yes', 'No': 'No',
  '1X': 'Home or Draw', 'X2': 'Draw or Away', '12': 'Home or Away',
  'H-1': 'Home -1', 'A+1': 'Away +1',
  '1H': 'Home Handicap', '2H': 'Away Handicap',
  '1Y': 'Home & Yes', '1N': 'Home & No',
  'XY': 'Draw & Yes', 'XN': 'Draw & No',
  '2Y': 'Away & Yes', '2N': 'Away & No',
  '1O': 'Home & Over 2.5', '1U': 'Home & Under 2.5',
  'XO': 'Draw & Over 2.5', 'XU': 'Draw & Under 2.5',
  '2O': 'Away & Over 2.5', '2U': 'Away & Under 2.5',
  'YO': 'Yes & Over 2.5', 'YU': 'Yes & Under 2.5',
  'NO': 'No & Over 2.5', 'NU': 'No & Under 2.5',
  '1/1': 'Home / Home', '1/X': 'Home / Draw', '1/2': 'Home / Away',
  'X/1': 'Draw / Home', 'X/X': 'Draw / Draw', 'X/2': 'Draw / Away',
  '2/1': 'Away / Home', '2/X': 'Away / Draw', '2/2': 'Away / Away',
};

const MARKET_LABEL = {
  '1X2': 'Match Result', 'OU25': 'Over/Under 2.5 Goals', 'OU15': 'Over/Under 1.5 Goals',
  'OU35': 'Over/Under 3.5 Goals', 'BTTS': 'Both Teams To Score',
  'DC': 'Double Chance', 'DNB': 'Draw No Bet', 'AH1': 'Asian Handicap (±1)',
  'CS': 'Correct Score', '1H1X2': '1st Half Result', '1HOU05': '1st Half Goals (O/U 0.5)',
  '1HBTTS': '1st Half BTTS', 'HTFT': 'Half-Time / Full-Time',
  'WINBTTS': 'Result & Both Teams To Score', 'WINOU25': 'Result & Total Goals (2.5)',
  'BTTSOU25': 'BTTS & Total Goals (2.5)', 'ML': 'Money Line',
  'TP': 'Total Points', 'HCAP': 'Handicap',
};

function getMarketName(m) {
  return MARKET_LABEL[m] || m?.replace(/_/g, ' ') || '—';
}

function getPickName(p) {
  return PICK_LABEL[p] || p || '—';
}

const STATUS_CONFIG = {
  won:        { label: 'BET WON',        cls: 'won',    color: '#0E8A4A', bg: 'rgba(14,138,74,0.15)', border: 'rgba(14,138,74,0.4)', icon: '✓' },
  lost:       { label: 'BET LOST',       cls: 'lost',   color: '#e53935', bg: 'rgba(229,57,53,0.15)', border: 'rgba(229,57,53,0.4)', icon: '✕' },
  cashed_out: { label: 'CASHED OUT',     cls: 'cashed', color: '#14b8a6', bg: 'rgba(20,184,166,0.15)', border: 'rgba(20,184,166,0.4)', icon: '⟳' },
  void:       { label: 'BET VOID',       cls: 'void',   color: '#f5a623', bg: 'rgba(245,166,35,0.15)', border: 'rgba(245,166,35,0.4)', icon: '⚪' },
  open:       { label: 'BET PENDING',    cls: 'open',   color: '#4f8bff', bg: 'rgba(79,139,255,0.15)', border: 'rgba(79,139,255,0.4)', icon: '⏳' },
};

const TABS = [
  { key: 'open', label: 'Open Bets' },
  { key: 'history', label: 'Bet History' },
];

/* ─────────── SVG Icons ─────────── */
function SvgChevronDown({ size = 16 }) { return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="6 9 12 15 18 9"/></svg>); }
function SvgChevronUp({ size = 16 }) { return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="18 15 12 9 6 15"/></svg>); }
function SvgCopy({ size = 14 }) { return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>); }
function SvgShare({ size = 14 }) { return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>); }
function SvgSearch({ size = 16 }) { return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>); }
function SvgTrendUp({ size = 12 }) { return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>); }
function SvgTrendDown({ size = 12 }) { return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>); }

/* ─────────── Ticket Details Overlay (SportyBet style) ─────────── */
function TicketDetails({ bet, onClose, onRemix, onShare }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const status = bet.status || 'open';
  const head = STATUS_CONFIG[status] || STATUS_CONFIG.open;
  const modeLabel = bet.mode === 'single' ? 'Singles' : bet.mode === 'multiple' ? 'Multiple' : bet.mode === 'system' ? 'System' : (bet.mode || 'Bet');
  const totalReturn = bet.status === 'won' ? Number(bet.totalReturn || bet.potentialWin || 0) : bet.status === 'cashed_out' ? Number(bet.cashOut || 0) : 0;
  const totalOdds = Number(bet.totalOdds || 0);
  const code = bet.bookingCode || toBookingCode(bet.id);
  const ticketId = String(stableHash(bet?.id || '')).slice(0, 7).padStart(7, '0');
  const legs = bet.legs || [];
  const isWon = status === 'won';
  const isCashed = status === 'cashed_out';
  const totalBonus = Number(bet.bonus || (totalReturn > 0 ? (totalReturn - Number(bet.stake || 0) * totalOdds).toFixed(2) : 0));

  const wonPillStyle = { background: '#0E8A4A', color: '#fff', borderRadius: 4, padding: '2px 10px', fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 };
  const lostPillStyle = { background: '#e53935', color: '#fff', borderRadius: 4, padding: '2px 10px', fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 };
  const openPillStyle = { background: '#3b82f6', color: '#fff', borderRadius: 4, padding: '2px 10px', fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 };
  const pillStyle = isWon ? wonPillStyle : status === 'lost' ? lostPillStyle : status === 'open' ? openPillStyle : lostPillStyle;

  const returnColor = isWon ? '#0E8A4A' : isCashed ? '#14b8a6' : '#333';

  const legResult = (i) => {
    if (bet.status === 'open') return 'pending';
    if (bet.legsResolved && bet.legsResolved[i]) return bet.legsResolved[i].won ? 'won' : 'lost';
    if (bet.status === 'won') return 'won';
    if (bet.status === 'cashed_out') return (stableHash(`${bet.id}-${i}-co`) % 100) < 55 ? 'lost' : 'won';
    if (bet.status === 'void') return 'void';
    const total = legs.length || 1;
    const loserIdx = stableHash(bet.id) % total;
    return i === loserIdx ? 'lost' : 'won';
  };

  const resolvedScore = (i) => {
    if (bet.legsResolved && bet.legsResolved[i]) {
      const r = bet.legsResolved[i];
      if (r.scoreHome != null && r.scoreAway != null) return `${r.scoreHome} : ${r.scoreAway}`;
    }
    return null;
  };

  const legGameId = (l, i) => String(stableHash(`${bet?.id}-${l?.matchId || i}`)).slice(0, 5).padStart(5, '0');

  const legDate = () => {
    const d = new Date(bet.placedAt || Date.now());
    return ticketTimeFull(bet.placedAt);
  };

  return (
    <div className="td-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="td-sheet" onClick={e => e.stopPropagation()}>
        {/* ── Red Header ── */}
        <header className="td-header">
          <button type="button" className="td-header-back" onClick={onClose}>
            <span style={{ fontSize: '18px', lineHeight: 1, marginRight: 4 }}>‹</span>
            <span>Back</span>
          </button>
          <span className="td-header-title">Ticket Details</span>
          <div style={{ width: 50 }} />
        </header>

        <div className="td-scroll">
          {/* ── Ticket ID row ── */}
          <div className="td-ticket-id-row">
            <span>Ticket ID: {ticketId}</span>
            <span>{ticketTimeFull(bet.placedAt)}</span>
          </div>

          {/* ── Summary section (white bg) ── */}
          <div className="td-summary">
            <div className="td-summary-top">
              <span className="td-summary-type">{modeLabel}</span>
              <span style={pillStyle}>
                {isWon ? '✓' : head.icon} {head.label.replace('BET ', '')}
              </span>
            </div>

            <div className="td-summary-return">
              <span className="td-summary-return-label">Total BetXentra Return</span>
              <span className="td-summary-return-value" style={{ color: returnColor }}>
                {isWon || isCashed ? fmt(totalReturn) : status === 'lost' ? '0.00' : fmt(bet.potentialWin)}
              </span>
            </div>

            <div className="td-summary-details">
              <div className="td-summary-row"><span>Total Stake</span><span className="td-summary-row-val">{fmt(bet.stake)}</span></div>
              <div className="td-summary-row"><span>Total Odds</span><span className="td-summary-row-val">{bet.mode === 'system' ? 'System' : totalOdds.toFixed(2)}</span></div>
              <div className="td-summary-row"><span>Total Bonus</span><span className="td-summary-row-val">{fmt(Math.max(0, totalBonus))}</span></div>
            </div>
          </div>

          {/* ── Action buttons ── */}
          <div className="td-actions">
            <button type="button" className="td-action-showoff" onClick={() => onShare?.(bet)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              Show Off
            </button>
            <button type="button" className="td-action-remix" onClick={onRemix}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
              Remix Bet
            </button>
          </div>

          {/* ── Verify code ── */}
          <div className="td-verify">
            <span className="td-verify-label">Verify Code:</span>
            <span className="td-verify-value">{code}</span>
          </div>

          {/* ── Match list ── */}
          <div className="td-matches">
            {legs.map((leg, i) => {
              const res = legResult(i);
              const score = resolvedScore(i);
              const won = res === 'won';
              const league = leg.league || getMarketName(leg.market);
              return (
                <div key={i} className="td-match">
                  <div className="td-match-meta">
                    <span>Game ID: {legGameId(leg, i)}</span>
                    <span>{legDate()}</span>
                  </div>
                  <div className="td-match-teams">{leg.home} v {leg.away}</div>
                  <div className="td-match-tracker-row">
                    <span className="td-match-tracker">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                      Match Tracker
                    </span>
                  </div>
                  {score && (
                    <div className="td-match-ft-row">
                      <span className="td-match-ft-label">FT Score:</span>
                      <span className="td-match-ft">{score}</span>
                    </div>
                  )}
                  <div className="td-match-pick-section">
                    <div className="td-match-pick-icon" style={{ background: won ? '#0E8A4A' : '#e53935' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        {won ? <polyline points="20 6 9 17 4 12"/> : <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>}
                      </svg>
                    </div>
                    <div className="td-match-pick-details">
                      <div className="td-match-pick-row">
                        <span className="td-match-pick-label">Pick</span>
                        <span className="td-match-pick-value">{getPickName(leg.outcome)}</span>
                      </div>
                      <div className="td-match-pick-row">
                        <span className="td-match-pick-label">Market</span>
                        <span className="td-match-pick-value">{getMarketName(leg.market)}</span>
                      </div>
                      <div className="td-match-pick-row">
                        <span className="td-match-pick-label">Outcome</span>
                        <span className="td-match-pick-value" style={{ color: won ? '#0E8A4A' : '#e53935', fontWeight: 800 }}>{getPickName(leg.outcome)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Footer ── */}
          <div className="td-footer">
            <span className="td-footer-count">Number of Bets: <strong>{legs.length}</strong></span>
            <span className="td-footer-link">Bet Details ›</span>
          </div>

          <div className="td-footer-links">
            <button type="button" className="td-footer-action" onClick={() => {}}>Check Transaction History <span>›</span></button>
            <button type="button" className="td-footer-delete" onClick={onClose}>Delete Ticket</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────── BetCard (SportyBet Open Bets style) ─────────── */
function BetCardView({ bet, onCashout, onRemix, onDetails, copiedCode, onCopy, autoTarget, onAutoTargetChange, onAutoClear, cashoutBusy }) {
  const code = bet.bookingCode || toBookingCode(bet.id);
  const isOpen = bet.status === 'open';
  const cashOutAmount = isOpen ? computeOffer(bet) : 0;
  const head = STATUS_CONFIG[bet.status] || STATUS_CONFIG.lost;
  const modeLabel = bet.mode === 'single' ? 'Single' : bet.mode === 'multiple' ? 'Multiple' : bet.mode === 'system' ? 'System' : 'Bet';
  const legs = bet.legs || [];
  const totalReturn = bet.status === 'won' ? Number(bet.totalReturn || bet.potentialWin || 0) : bet.status === 'cashed_out' ? Number(bet.cashOut || 0) : 0;
  const returnColor = bet.status === 'won' ? '#0E8A4A' : bet.status === 'cashed_out' ? '#14b8a6' : '#8a98a3';
  const statusLabel = (STATUS_CONFIG[bet.status] || STATUS_CONFIG.lost).label.replace('BET ', '');
  const firstLeg = legs[0] || {};
  const matchName = legs.length === 1 ? `${firstLeg.home} vs ${firstLeg.away}` : legs.length > 1 ? `${firstLeg.home} vs ${firstLeg.away}` : 'No selections';
  const league = firstLeg.league || getMarketName(firstLeg.market) || 'League';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12, scale: 0.98 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="xh-card"
      onClick={() => onDetails?.(bet)}
    >
      {/* ── Card header with mode + actions ── */}
      <div className="xh-card-header">
        <span className="xh-card-header-mode">{modeLabel}</span>
        {!isOpen && (
          <div className="xh-card-header-status">
            <span className="xh-card-header-label" style={{ color: head.color }}>{statusLabel}</span>
          </div>
        )}
      </div>

      {/* ── Action buttons row (Rebet / Share / Edit Bet) ── */}
      <div className="xh-card-actions-row" onClick={e => e.stopPropagation()}>
        <button type="button" className="xh-action-chip" onClick={() => onRemix?.(bet)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15A9 9 0 1 0 5.64 5.64L1 10"/></svg>
          Rebet
        </button>
        <button type="button" className="xh-action-chip xh-action-sm" onClick={() => onCopy?.(code)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          SM
        </button>
        <button type="button" className="xh-action-chip" onClick={() => onDetails?.(bet)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Edit Bet
        </button>
      </div>

      {/* ── Match info ── */}
      <div className="xh-card-body">
        <div className="xh-match-name">{matchName}</div>
        {legs.length > 1 && <div className="xh-match-extra">+{legs.length - 1} more selection{legs.length > 2 ? 's' : ''}</div>}
        <div className="xh-card-row">
          <span className="xh-card-row-label">Stake</span>
          <span className="xh-card-row-value">{fmt(bet.stake)}</span>
        </div>
      </div>

      {/* ── Cashout button (open bets only) ── */}
      {isOpen && cashOutAmount > 0 && (
        <div className="xh-cashout-wrap" onClick={e => e.stopPropagation()}>
          <button type="button" className="xh-cashout-btn" onClick={() => onCashout?.(bet)}>
            Cashout<br/><span style={{ fontWeight: 800 }}>GHS {fmt(cashOutAmount)}</span>
          </button>
        </div>
      )}

      {/* ── League badge ── */}
      <div className="xh-league-badge-wrap">
        <span className="xh-league-badge">{league}</span>
      </div>

      {/* ── Settled bets: show return ── */}
      {!isOpen && (
        <div className="xh-card-body" style={{ paddingTop: 0 }}>
          <div className="xh-card-row">
            <span className="xh-card-row-label">Total Return</span>
            <span className="xh-card-row-value" style={{ color: returnColor, fontWeight: 800 }}>
              GHS {bet.status === 'won' || bet.status === 'cashed_out' ? fmt(totalReturn) : '0.00'}
            </span>
          </div>
        </div>
      )}

      {isOpen && cashOutAmount > 0 && (
        <div onClick={e => e.stopPropagation()}>
          <AutoCashoutPanel
            betId={bet.id}
            currentOffer={cashOutAmount}
            target={Number(autoTarget) || 0}
            onSetTarget={(id, v) => onAutoTargetChange(id, v)}
            onClearTarget={(id) => onAutoClear(id)}
            busy={cashoutBusy}
          />
        </div>
      )}
    </motion.div>
  );
}

/* ─────────── Main BetHistoryPage ─────────── */
export default function BetHistoryPage() {
  const navigate = useNavigate();
  const { account, adjustBalance, showWin } = useAccount();
  const { toast } = useToast();

  // Data
  const [bets, setBets] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Tab
  const [tab, setTab] = useState('open');

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Expansion
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const toggleExpanded = useCallback((id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Copy
  const [copiedCode, setCopiedCode] = useState(null);
  const onCopy = async (code) => {
    try {
      await navigator.clipboard?.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(c => c === code ? null : c), 1500);
    } catch {}
  };

  // Trend tracking
  const prevOffersRef = useRef({});
  const [trends, setTrends] = useState({});

  // Auto cashout
  const [autoTargets, setAutoTargets] = useState(() => loadAutoTargets());
  const autoFiredRef = useRef({});

  // Cashout confirm dialog
  const [confirmCashOut, setConfirmCashOut] = useState(null);
  const [confirmFraction, setConfirmFraction] = useState(1);
  const [cashoutBusy, setCashoutBusy] = useState(false);
  const [cashoutError, setCashoutError] = useState(null);
  const [cashoutProcessing, setCashoutProcessing] = useState(false);
  const [cashoutProcessingMsg, setCashoutProcessingMsg] = useState('');
  const [cashoutChangedOffer, setCashoutChangedOffer] = useState(null);
  const [cashoutCurrentOffer, setCashoutCurrentOffer] = useState(0);

  // Booking code loader
  const [loadCodeInput, setLoadCodeInput] = useState('');
  const [loadCodeBusy, setLoadCodeBusy] = useState(false);

  // Ticket details overlay
  const [activeTicket, setActiveTicket] = useState(null);

  // Open bets sub-tab
  const [openSubTab, setOpenSubTab] = useState('all');

  // Pagination
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // ── Data Fetching ──
  const refresh = useCallback(async () => {
    try {
      const data = await fetchBetHistory();
      setBets(data.bets || []);
      setError(null);
      return data.bets || [];
    } catch (e) {
      setError(e.message || 'Could not load bets.');
      return null;
    }
  }, []);

  useEffect(() => {
    if (!account) { navigate('/login?next=/my-bets'); return; }
    let alive = true;
    (async () => {
      try {
        setBusy(true);
        const list = await refresh();
        if (alive && list) {
          const seed = {};
          for (const b of list) seed[b.id] = computeOffer(b);
          prevOffersRef.current = seed;
        }
      } catch (e) {
        if (alive) setError(e.message || 'Could not load bets.');
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => { alive = false; };
  }, [account, navigate, toast, refresh]);

  // Live polling
  useEffect(() => {
    if (!account) return undefined;
    const tick = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const list = await refresh();
      if (!list) return;
      const nextTrends = {};
      const nextPrev = {};
      for (const b of list) {
        if (b.status !== 'open') continue;
        const cur = computeOffer(b);
        const prev = prevOffersRef.current[b.id];
        if (prev != null) {
          if (cur > prev + 0.005) nextTrends[b.id] = 'up';
          else if (cur < prev - 0.005) nextTrends[b.id] = 'down';
        }
        nextPrev[b.id] = cur;
      }
      prevOffersRef.current = nextPrev;
      setTrends(nextTrends);
    };
    const id = setInterval(tick, 4000);
    return () => clearInterval(id);
  }, [account, refresh]);

  // ── Derived Data ──
  const openBets = useMemo(() => bets.filter(b => b.status === 'open'), [bets]);
  const settledBets = useMemo(() => bets.filter(b => b.status !== 'open'), [bets]);
  const cashoutableBets = useMemo(() => openBets.filter(b => computeOffer(b) > 0), [openBets]);

  const filteredBets = useMemo(() => {
    let result = [];
    if (tab === 'open') {
      if (openSubTab === 'cashout') result = cashoutableBets;
      else result = openBets;
    } else {
      result = settledBets;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(b => {
        if (b.bookingCode?.toLowerCase().includes(q)) return true;
        if ((b.bookingCode || toBookingCode(b.id)).toLowerCase().includes(q)) return true;
        if ((b.legs || []).some(l => l.home?.toLowerCase().includes(q) || l.away?.toLowerCase().includes(q))) return true;
        return false;
      });
    }

    return result;
  }, [tab, openSubTab, openBets, settledBets, cashoutableBets, searchQuery]);

  const paginated = useMemo(() => filteredBets.slice(0, visibleCount), [filteredBets, visibleCount]);

  const groupedByDate = useMemo(() => {
    const groups = [];
    let currentKey = '';
    for (const b of paginated) {
      const d = new Date(b.placedAt || Date.now());
      const key = `${String(d.getDate()).padStart(2, '0')}-${d.getMonth()}-${d.getFullYear()}`;
      if (key !== currentKey) {
        currentKey = key;
        groups.push({
          dateLabel: String(d.getDate()).padStart(2, '0'),
          monthLabel: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
          bets: [b],
        });
      } else {
        groups[groups.length - 1].bets.push(b);
      }
    }
    return groups;
  }, [paginated]);
  const hasMore = filteredBets.length > visibleCount;

  const totals = useMemo(() => ({
    openCount: openBets.length,
    openStake: openBets.reduce((s, b) => s + Number(b.stake || 0), 0),
    openWin: openBets.reduce((s, b) => s + Number(b.potentialWin || 0), 0),
    settledCount: settledBets.length,
    cashoutableCount: cashoutableBets.length,
  }), [openBets, settledBets, cashoutableBets]);

  // ── Cashout ──
  const onCashOut = async (b) => {
    let amount = computeOffer(b);
    if (amount <= 0) { toast('Cash-out is not available for this bet.', 'warn'); return; }
    try {
      const res = await fetchCashoutOffer(b.id);
      // Only accept the server offer when it is plausible for a pending ticket
      // (never worth more than the stake); otherwise keep the fair-value offer.
      if (res.offer > 0 && res.offer <= Number(b.stake || 0) * 1.01) amount = res.offer;
    } catch {
      // use client-side fallback if server is unreachable
    }
    const code = b.bookingCode || toBookingCode(b.id);
    setCashoutCurrentOffer(amount);
    setCashoutError(null);
    setCashoutChangedOffer(null);
    setCashoutProcessing(false);
    setConfirmCashOut({ id: b.id, amount, code, bet: b });
    setConfirmFraction(1);
  };

  const closeCashout = () => {
    setConfirmCashOut(null);
    setCashoutBusy(false);
    setCashoutError(null);
    setCashoutProcessing(false);
    setCashoutChangedOffer(null);
  };

  const confirmAndCashOut = async (fraction) => {
    if (!confirmCashOut) return;
    const { id, amount } = confirmCashOut;
    const f = fraction || confirmFraction;

    setCashoutProcessing(true);
    setCashoutBusy(true);
    setCashoutError(null);
    setCashoutProcessingMsg('Processing Cashout...');

    try {
      const res = await executeCashout(id, cashoutCurrentOffer, f);
      const cash = res.bet.cashOut || 0;
      const partial = f > 0 && f < 1;
      adjustBalance(cash, partial ? `Partial cash-out: GHS ${fmt(cash)}. Remainder still in play.` : `Cashed out: GHS ${fmt(cash)}.`);
      showWin({ ...res.bet, status: 'cashed_out', settledAt: res.bet.settledAt || new Date().toISOString() });
      setAutoTargets(prev => {
        if (prev[id] == null) return prev;
        const { [id]: _, ...rest } = prev;
        saveAutoTargets(rest);
        return rest;
      });
      closeCashout();
      await refresh();
      toast(`Cash-out successful! GHS ${fmt(cash)} credited.`, 'success');
    } catch (e) {
      setCashoutProcessing(false);
      setCashoutBusy(false);
      if (e.body?.code === 'OFFER_CHANGED' && e.body?.currentOffer) {
        setCashoutChangedOffer(e.body.currentOffer);
        setCashoutCurrentOffer(e.body.currentOffer);
      } else if (e.body?.code === 'OFFER_UNAVAILABLE') {
        setCashoutError('Cash-out is no longer available. Market may be suspended.');
      } else if (e.body?.code === 'OFFER_STALE') {
        setCashoutError('The offer changed. Close and try again.');
        setCashoutCurrentOffer(e.body?.currentOffer || cashoutCurrentOffer);
      } else {
        setCashoutError(e.message || 'Cash-out failed. Please try again.');
      }
    }
  };

  const onAcceptChanged = async (newOffer) => {
    setCashoutChangedOffer(null);
    setCashoutCurrentOffer(newOffer);
    setCashoutProcessing(true);
    setCashoutBusy(true);
    setCashoutError(null);

    try {
      const f = confirmFraction;
      const res = await executeCashout(confirmCashOut.id, newOffer, f);
      const cash = res.bet.cashOut || 0;
      const partial = f > 0 && f < 1;
      adjustBalance(cash, partial ? `Partial cash-out: GHS ${fmt(cash)}. Remainder still in play.` : `Cashed out: GHS ${fmt(cash)}.`);
      showWin({ ...res.bet, status: 'cashed_out', settledAt: res.bet.settledAt || new Date().toISOString() });
      closeCashout();
      await refresh();
      toast(`Cash-out successful! GHS ${fmt(cash)} credited.`, 'success');
    } catch (e) {
      setCashoutProcessing(false);
      setCashoutBusy(false);
      setCashoutError(e.message || 'Cash-out failed on retry.');
    }
  };

  const setAutoTarget = async (betId, raw) => {
    const v = Number(String(raw).replace(/,/g, ''));
    try {
      await apiSetAutoCashout(betId, v > 0 ? v : 0);
      setAutoTargets(prev => {
        const next = { ...prev };
        if (!Number.isFinite(v) || v <= 0) delete next[betId];
        else next[betId] = v;
        saveAutoTargets(next);
        return next;
      });
      autoFiredRef.current[betId] = false;
    } catch (e) {
      toast(e.message || 'Could not set auto cash-out.', 'error');
    }
  };

  // ── Remix ──
  const onRemixBet = useCallback((bet) => {
    if (!bet?.legs?.length) { toast('No selections to remix.', 'warn'); return; }
    try {
      const selections = bet.legs.map(l => ({
        matchId: l.matchId, market: l.market, outcome: l.outcome, odds: l.odds,
        home: l.home, away: l.away,
        marketName: l.marketName || MARKET_LABEL[l.market] || l.market,
      }));
      localStorage.setItem('bv_remix_selections', JSON.stringify(selections));
      toast('Selections saved! Building your betslip…', 'success');
    } catch {}
    navigate('/');
  }, [navigate, toast]);

  if (!account) return null;

  return (
    <main className="xh-page">
      <div className="xh-shell">
        {/* ── Top tab bar ── */}
        <div className="xh-top-tabs" role="tablist">
          {TABS.map(t => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`xh-top-tab${tab === t.key ? ' active' : ''}`} onClick={() => { setTab(t.key); setVisibleCount(PAGE_SIZE); }}>
              {t.key === 'open' ? `Open Bets${totals.openCount > 0 ? ` (${totals.openCount})` : ''}` : t.label}
            </button>
          ))}
        </div>

        {/* ── Sub-tabs (Open Bets only) ── */}
        {tab === 'open' && (
          <div className="xh-sub-tabs">
            <div className="xh-sub-tabs-left">
              {[
                { key: 'all', label: 'All' },
                { key: 'cashout', label: 'Cashout Available' },
                { key: 'live', label: 'Live Games' },
              ].map(st => (
                <button key={st.key} type="button" className={`xh-sub-tab${openSubTab === st.key ? ' active' : ''}`} onClick={() => setOpenSubTab(st.key)}>
                  {st.label}
                </button>
              ))}
            </div>
            <div className="xh-sub-tabs-right">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7d8b97" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7d8b97" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            </div>
          </div>
        )}

        {/* ── Content ── */}
        <AnimatePresence mode="wait">
          {error && !busy && filteredBets.length === 0 ? (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="xh-state-card">
              <div className="xh-state-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#e53935" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <h3 className="xh-state-title">Something went wrong</h3>
              <p className="xh-state-desc">{error}</p>
              <button type="button" className="xh-state-btn" onClick={() => { setBusy(true); setError(null); refresh().finally(() => setBusy(false)); }}>Try Again</button>
            </motion.div>
          ) : busy && bets.length === 0 ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="xh-skeleton-wrap">
              {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
            </motion.div>
          ) : filteredBets.length === 0 ? (
            <motion.div key="empty" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="xh-state-card">
              <div className="xh-state-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
              </div>
              <h3 className="xh-state-title">
                {searchQuery ? 'No matches found' : tab === 'open' ? 'No open bets' : tab === 'cashout' ? 'No cashout available' : 'No settled bets yet'}
              </h3>
              <p className="xh-state-desc">
                {searchQuery ? 'Try a different search term.' : tab === 'open' || tab === 'cashout' ? 'Pick a market on the home page to place your first ticket.' : 'Once your bets settle, they\'ll show up here.'}
              </p>
              <button type="button" className="xh-state-btn" onClick={() => navigate('/')}>Browse Markets</button>
            </motion.div>
          ) : (
            <motion.div key={`list-${tab}-${searchQuery}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="xh-list">
              <AnimatePresence>
                {groupedByDate.map((group, gi) => (
                  <div key={`${group.dateLabel}-${group.monthLabel}-${gi}`}>
                    {group.bets.map(b => (
                      <BetCardView
                        key={b.id}
                        bet={b}
                        onCashout={onCashOut}
                        onRemix={onRemixBet}
                        onDetails={setActiveTicket}
                        copiedCode={copiedCode}
                        onCopy={onCopy}
                        autoTarget={autoTargets[b.id] || ''}
                        onAutoTargetChange={setAutoTarget}
                        onAutoClear={(id) => setAutoTarget(id, '')}
                        cashoutBusy={cashoutBusy}
                      />
                    ))}
                  </div>
                ))}
              </AnimatePresence>

              {hasMore && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="xh-load-more-wrap">
                  <button type="button" className="xh-load-more" onClick={() => setVisibleCount(c => c + PAGE_SIZE)}>
                    Show {Math.min(PAGE_SIZE, filteredBets.length - visibleCount)} more of {filteredBets.length - visibleCount}
                  </button>
                </motion.div>
              )}

              {!hasMore && filteredBets.length > PAGE_SIZE && (
                <p className="xh-end-note">Showing all {filteredBets.length} bets</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {busy && bets.length > 0 && (
          <div className="xh-refresh-indicator">
            <div className="xh-spinner" />
            <span>Refreshing…</span>
          </div>
        )}
      </div>

      {/* ── Cashout modal ── */}
      {confirmCashOut && (
        <CashoutModal
          isOpen={!!confirmCashOut}
          bet={confirmCashOut.bet}
          currentOffer={cashoutCurrentOffer}
          busy={cashoutBusy}
          error={cashoutError}
          processing={cashoutProcessing}
          processingMessage={cashoutProcessingMsg}
          changedOffer={cashoutChangedOffer}
          onConfirm={confirmAndCashOut}
          onCancel={closeCashout}
          onAcceptChanged={onAcceptChanged}
        />
      )}

      {/* ── Ticket details overlay ── */}
      {activeTicket && (
        <TicketDetails
          bet={activeTicket}
          onClose={() => setActiveTicket(null)}
          onRemix={() => { const bet = activeTicket; setActiveTicket(null); if (bet) onRemixBet(bet); }}
          onShare={(bet) => {
            const code = bet.bookingCode || toBookingCode(bet.id);
            if (navigator.share) {
              navigator.share({ title: 'My BetXentra Ticket', text: `Check out my bet ticket on BetXentra!\n\nBooking Code: ${code}\nStake: GHS ${fmt(bet.stake)}\nPotential Win: GHS ${fmt(bet.potentialWin)}\nStatus: ${(bet.status || '').toUpperCase()}` }).catch(() => {});
            } else {
              navigator.clipboard?.writeText(code).then(() => toast('Booking code copied! Share it with friends.', 'success')).catch(() => toast('Share your booking code: ' + code, 'info'));
            }
          }}
        />
      )}

      <style>{XH_CSS}</style>
    </main>
  );
}

function SkeletonCard() {
  return (
    <div className="xh-skeleton">
      <div className="xh-skel-head" />
      <div className="xh-skel-body">
        <div className="xh-skel-line" style={{ width: '60%' }} />
        <div className="xh-skel-line" style={{ width: '80%' }} />
        <div className="xh-skel-line" style={{ width: '40%' }} />
      </div>
      <div className="xh-skel-footer" />
    </div>
  );
}

/* ═══════════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════════ */
const XH_CSS = `
/* ── Layout ── */
.xh-page { padding: 0 0 60px; min-height: calc(100vh - 200px); }
.xh-shell { max-width: 560px; margin: 0 auto; padding: 0; display: flex; flex-direction: column; }

/* ── Top tabs ── */
.xh-top-tabs { display: flex; background: #161f27; border-bottom: 1px solid #222e38; }
.xh-top-tab { flex: 1; padding: 14px 0; border: none; background: transparent; color: #7d8b97; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; text-align: center; position: relative; }
.xh-top-tab.active { color: #fff; font-weight: 800; }
.xh-top-tab.active::after { content: ''; position: absolute; bottom: -1px; left: 0; right: 0; height: 3px; background: #c8102e; }

/* ── Sub-tabs ── */
.xh-sub-tabs { display: flex; align-items: center; justify-content: space-between; padding: 10px 13px 6px; background: #10171d; }
.xh-sub-tabs-left { display: flex; gap: 0; }
.xh-sub-tab { padding: 7px 14px; border: 1px solid #2a3640; background: transparent; color: #7d8b97; font-size: 11.5px; font-weight: 700; cursor: pointer; font-family: inherit; }
.xh-sub-tab:first-child { border-radius: 6px 0 0 6px; }
.xh-sub-tab:last-child { border-radius: 0 6px 6px 0; }
.xh-sub-tab:not(:first-child) { border-left: none; }
.xh-sub-tab.active { background: #2a3640; color: #fff; border-color: #3a4a56; }
.xh-sub-tabs-right { display: flex; gap: 10px; align-items: center; }

/* ── Bet list ── */
.xh-list { display: flex; flex-direction: column; gap: 10px; padding: 10px 13px; }

/* ── Bet card ── */
.xh-card { background: #19222b; border: 1px solid #222e38; border-radius: 10px; overflow: hidden; cursor: pointer; }

/* ── Card header ── */
.xh-card-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 13px 6px; }
.xh-card-header-mode { font-size: 14px; font-weight: 800; color: #fff; }
.xh-card-header-status { display: flex; align-items: center; gap: 7px; }
.xh-card-header-label { font-size: 12.5px; font-weight: 800; }

/* ── Action chips row ── */
.xh-card-actions-row { display: flex; gap: 8px; padding: 0 13px 8px; }
.xh-action-chip { display: inline-flex; align-items: center; gap: 5px; padding: 5px 12px; border-radius: 5px; border: 1px solid #2a3640; background: transparent; color: #7d8b97; font-size: 11px; font-weight: 700; cursor: pointer; font-family: inherit; transition: all .15s; }
.xh-action-chip:hover { background: #222e38; color: #fff; }
.xh-action-sm { color: #3b82f6; border-color: rgba(59,130,246,.3); }

/* ── Card body ── */
.xh-card-body { padding: 4px 13px 10px; display: flex; flex-direction: column; gap: 6px; }
.xh-match-name { font-size: 14px; font-weight: 700; color: #e8eef3; }
.xh-match-extra { font-size: 11px; color: #56636d; margin-bottom: 2px; }
.xh-card-row { display: flex; justify-content: space-between; align-items: center; }
.xh-card-row-label { font-size: 12px; color: #7d8b97; }
.xh-card-row-value { font-size: 13px; font-weight: 700; color: #e8eef3; font-variant-numeric: tabular-nums; }

/* ── Cashout button ── */
.xh-cashout-wrap { padding: 6px 13px 8px; }
.xh-cashout-btn { width: auto; display: inline-flex; flex-direction: column; align-items: center; padding: 8px 20px; border: none; border-radius: 6px; background: #0E8A4A; color: #fff; font-weight: 700; font-size: 12px; font-family: inherit; cursor: pointer; transition: opacity .15s; line-height: 1.3; }
.xh-cashout-btn:hover { opacity: .9; }

/* ── League badge ── */
.xh-league-badge-wrap { padding: 4px 13px 10px; }
.xh-league-badge { display: inline-block; padding: 4px 12px; border-radius: 5px; background: #0E8A4A; color: #fff; font-size: 11px; font-weight: 700; }

/* ── Skeleton ── */
.xh-skeleton-wrap { display: flex; flex-direction: column; gap: 8px; padding: 8px 14px; }
.xh-skeleton { background: #19222b; border: 1px solid #222e38; border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.xh-skel-head { height: 20px; width: 40%; background: #222e38; border-radius: 4px; animation: xhShimmer 1.5s infinite; }
.xh-skel-body { display: flex; flex-direction: column; gap: 8px; }
.xh-skel-line { height: 14px; background: #222e38; border-radius: 4px; animation: xhShimmer 1.5s infinite; }
.xh-skel-footer { height: 40px; background: #222e38; border-radius: 8px; animation: xhShimmer 1.5s infinite; }
@keyframes xhShimmer { 0% { opacity: .6; } 50% { opacity: 1; } 100% { opacity: .6; } }

/* ── State cards ── */
.xh-state-card { background: #19222b; border: 1px solid #222e38; border-radius: 10px; padding: 48px 24px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 12px; margin: 14px; }
.xh-state-icon { opacity: .5; }
.xh-state-title { margin: 0; font-size: 18px; font-weight: 800; color: #e8eef3; }
.xh-state-desc { margin: 0; color: #7d8b97; font-size: 14px; max-width: 360px; line-height: 1.5; }
.xh-state-btn { padding: 10px 24px; border-radius: 9px; border: none; background: #0E8A4A; color: #fff; font-weight: 800; font-size: 13px; cursor: pointer; font-family: inherit; }

/* ── Load more ── */
.xh-load-more-wrap { display: flex; justify-content: center; padding: 12px; }
.xh-load-more { padding: 12px 32px; border-radius: 8px; border: 1px solid #222e38; background: #19222b; color: #aeb9c2; font-weight: 700; font-size: 13px; cursor: pointer; font-family: inherit; }
.xh-end-note { text-align: center; color: #56636d; font-size: 12px; padding: 8px 0; }

/* ── Refresh indicator ── */
.xh-refresh-indicator { display: flex; align-items: center; justify-content: center; gap: 8px; color: #7d8b97; font-size: 12px; padding: 4px 0; }
.xh-spinner { width: 14px; height: 14px; border: 2px solid #222e38; border-top-color: #c8102e; border-radius: 50%; animation: xhSpin .6s linear infinite; }
@keyframes xhSpin { to { transform: rotate(360deg); } }

/* ═══════════════════════════════════════════
   TICKET DETAILS OVERLAY (SportyBet style)
   ═══════════════════════════════════════════ */
@keyframes xhFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes tdSlideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

.td-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.7); z-index: 9999; display: flex; justify-content: center; animation: xhFade .18s ease-out both; }
.td-sheet { width: 100%; max-width: 560px; height: 100%; background: #f5f5f5; display: flex; flex-direction: column; animation: tdSlideUp .28s cubic-bezier(.2,1,.3,1) both; overflow: hidden; }

.td-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px 11px; background: #c8102e; flex-shrink: 0; }
.td-header-back { display: flex; align-items: center; gap: 3px; background: none; border: none; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; }
.td-header-title { font-size: 17px; font-weight: 800; color: #fff; letter-spacing: -.3px; }
.td-scroll { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; background: #f5f5f5; }

/* ── Ticket ID row ── */
.td-ticket-id-row { display: flex; justify-content: space-between; padding: 8px 16px; background: #fff; border-bottom: 1px solid #e8e8e8; font-size: 11px; color: #888; }

/* ── Summary (white card) ── */
.td-summary { background: #fff; padding: 14px 16px; border-bottom: 1px solid #e8e8e8; }
.td-summary-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.td-summary-type { color: #222; font-size: 15px; font-weight: 800; }
.td-summary-return { margin-bottom: 14px; }
.td-summary-return-label { display: block; color: #888; font-size: 12px; font-weight: 600; margin-bottom: 4px; }
.td-summary-return-value { font-size: 32px; font-weight: 900; line-height: 1; letter-spacing: -.5px; font-variant-numeric: tabular-nums; }
.td-summary-details { display: flex; flex-direction: column; gap: 8px; border-top: 1px solid #e8e8e8; padding-top: 12px; }
.td-summary-row { display: flex; justify-content: space-between; color: #666; font-size: 13px; }
.td-summary-row-val { color: #222; font-size: 13px; font-weight: 700; }

/* ── Action buttons (green) ── */
.td-actions { display: flex; gap: 10px; padding: 12px 16px 8px; }
.td-action-showoff { flex: 1; background: #0E8A4A; color: #fff; font-size: 13px; font-weight: 800; text-align: center; padding: 11px; border-radius: 8px; border: none; cursor: pointer; font-family: inherit; display: flex; align-items: center; justify-content: center; gap: 6px; }
.td-action-remix { flex: 1; background: #0E8A4A; color: #fff; font-size: 13px; font-weight: 800; text-align: center; padding: 11px; border-radius: 8px; border: none; cursor: pointer; font-family: inherit; display: flex; align-items: center; justify-content: center; gap: 6px; }

/* ── Verify code ── */
.td-verify { padding: 4px 16px 10px; display: flex; align-items: center; gap: 6px; }
.td-verify-label { color: #888; font-size: 12px; }
.td-verify-value { color: #555; font-size: 12px; font-weight: 700; letter-spacing: .5px; }

/* ── Match cards (white) ── */
.td-matches { padding: 0 16px; display: flex; flex-direction: column; gap: 10px; }
.td-match { background: #fff; border: 1px solid #e8e8e8; border-radius: 10px; padding: 12px 14px; }
.td-match-meta { display: flex; justify-content: space-between; color: #999; font-size: 10.5px; font-weight: 600; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #f0f0f0; }
.td-match-teams { color: #222; font-size: 14px; font-weight: 700; margin-bottom: 6px; }
.td-match-tracker-row { display: flex; align-items: center; gap: 7px; margin-bottom: 6px; }
.td-match-tracker { display: inline-flex; align-items: center; gap: 4px; background: #e8f5e9; color: #0E8A4A; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 5px; }
.td-match-ft-row { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
.td-match-ft-label { color: #888; font-size: 12px; font-weight: 600; }
.td-match-ft { color: #222; font-size: 13px; font-weight: 800; }

/* ── Pick section ── */
.td-match-pick-section { display: flex; gap: 10px; padding-top: 8px; border-top: 1px solid #f0f0f0; }
.td-match-pick-icon { width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; margin-top: 2px; }
.td-match-pick-details { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.td-match-pick-row { display: flex; justify-content: space-between; font-size: 12px; }
.td-match-pick-label { color: #888; }
.td-match-pick-value { color: #333; font-weight: 600; }

/* ── Footer ── */
.td-footer { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px 8px; }
.td-footer-count { color: #666; font-size: 13px; }
.td-footer-count strong { color: #222; font-weight: 700; }
.td-footer-link { color: #3b82f6; font-size: 13px; font-weight: 700; cursor: pointer; }

/* ── Footer links ── */
.td-footer-links { padding: 0 16px 24px; display: flex; flex-direction: column; gap: 0; }
.td-footer-action { display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 14px 0; border: none; border-bottom: 1px solid #e8e8e8; background: transparent; color: #222; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; text-align: left; }
.td-footer-action span { color: #888; font-size: 16px; }
.td-footer-delete { width: 100%; padding: 14px 0; border: none; background: transparent; color: #e53935; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; text-align: center; margin-top: 8px; }

/* ── Cashout confirm ── */
.xh-confirm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: grid; place-items: center; z-index: 9999; padding: 16px; animation: xhFade .18s ease-out both; }
.xh-confirm-card { background: #19222b; border: 1px solid #222e38; border-radius: 12px; padding: 24px; max-width: 380px; width: 100%; animation: xhPop .22s cubic-bezier(.2,1.3,.4,1) both; }
@keyframes xhPop { from { transform: scale(.92); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.xh-confirm-card h3 { margin: 0 0 4px; font-size: 20px; font-weight: 800; color: #e8eef3; }
.xh-confirm-sub { margin: 0 0 16px; font-size: 13px; color: #7d8b97; }
.xh-confirm-sub code { background: #10171d; padding: 2px 6px; border-radius: 6px; font-size: 12px; }
.xh-confirm-amount { padding: 14px 16px; background: #10171d; border-radius: 10px; border: 1px solid #222e38; display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
.xh-confirm-amount-label { font-size: 12px; color: #7d8b97; }
.xh-confirm-amount-value { font-size: 20px; font-weight: 800; color: #c8102e; }
.xh-confirm-note { font-size: 11.5px; color: #7d8b97; margin: 0 0 18px; line-height: 1.5; }
.xh-confirm-actions { display: flex; gap: 10px; }
.xh-confirm-cancel, .xh-confirm-go { flex: 1; padding: 12px 0; border-radius: 8px; border: none; font: inherit; font-size: 13.5px; font-weight: 800; cursor: pointer; }
.xh-confirm-cancel { background: #10171d; color: #e8eef3; border: 1px solid #222e38; }
.xh-confirm-go { background: #0E8A4A; color: #fff; }
.xh-fraction-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 14px; }
.xh-fraction-chip { padding: 9px 0; border-radius: 8px; border: 1px solid #222e38; background: #10171d; color: #e8eef3; font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; }
.xh-fraction-chip.active { background: #c8102e; color: #fff; border-color: #c8102e; }
.xh-confirm-residual { padding: 12px 14px; border-radius: 10px; border: 1px solid #222e38; background: #10171d; display: flex; justify-content: space-between; align-items: center; font-size: 12px; margin-bottom: 12px; gap: 12px; }
.xh-confirm-residual-label { color: #7d8b97; font-weight: 600; }
.xh-confirm-residual > div { text-align: right; }
.xh-confirm-residual strong { font-variant-numeric: tabular-nums; color: #e8eef3; }
`;

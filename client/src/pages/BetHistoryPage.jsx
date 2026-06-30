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

/* ─────────── Ticket Details Overlay (SportyBet-style) ─────────── */
function TicketDetails({ bet, onClose, onRemix, onShare }) {
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const status = bet.status || 'open';
  const modeLabel = bet.mode === 'single' ? 'Singles' : bet.mode === 'multiple' ? 'Multiple' : bet.mode === 'system' ? 'System' : (bet.mode || 'Bet');
  const totalReturn = bet.status === 'won' ? Number(bet.totalReturn || bet.potentialWin || 0) : bet.status === 'cashed_out' ? Number(bet.cashOut || 0) : 0;
  const totalOdds = Number(bet.totalOdds || 0);
  const code = bet.bookingCode || toBookingCode(bet.id);
  const ticketId = String(stableHash(bet?.id || '')).slice(0, 6).padStart(6, '0');
  const legs = bet.legs || [];
  const isWon = status === 'won';
  const isCashed = status === 'cashed_out';

  const statusLabel = isWon ? 'Won' : isCashed ? 'Cashed Out' : status === 'void' ? 'Void' : status === 'open' ? 'Pending' : 'Lost';
  const statusColor = isWon ? '#22c66e' : isCashed ? '#14b8a6' : status === 'void' ? '#f5a623' : status === 'open' ? '#4f8bff' : '#e53935';
  const returnVal = isWon || isCashed ? fmt(totalReturn) : status === 'lost' ? '0.00' : fmt(bet.potentialWin);

  const headerDate = (() => {
    if (!bet.placedAt) return '';
    const d = new Date(bet.placedAt);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mn = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm} ${hh}:${mn}`;
  })();

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

  const legDate = (l) => {
    const d = new Date(l.kickoff || bet.placedAt || Date.now());
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mn = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm} ${hh}:${mn}`;
  };

  const handleCopy = () => {
    navigator.clipboard?.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1500);
  };

  return (
    <div className="td-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="td-sheet" onClick={e => e.stopPropagation()}>
        {/* ── Header ── */}
        <header className="td-header">
          <button type="button" className="td-header-back" onClick={onClose} aria-label="Go back">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            <span>Ticket Details</span>
          </button>
          <span className="td-header-date">{headerDate}</span>
        </header>

        <div className="td-scroll">
          {/* ── Info rows ── */}
          <div className="td-info">
            <div className="td-info-row">
              <span className="td-info-label">Ticket ID: {ticketId}</span>
              <span className="td-info-val">{modeLabel}</span>
              <span className="td-info-status" style={{ color: statusColor }}>{statusLabel}</span>
            </div>
            <div className="td-info-row">
              <span className="td-info-label">Total BetXentra Return</span>
              <span className="td-info-val td-info-return" style={{ color: isWon || isCashed ? '#22c66e' : 'var(--text)' }}>{returnVal}</span>
            </div>
            <div className="td-info-row">
              <span className="td-info-label">Total Stake</span>
              <span className="td-info-val">{fmt(bet.stake)}</span>
            </div>
            <div className="td-info-row">
              <span className="td-info-label">Total Odds</span>
              <span className="td-info-val">{bet.mode === 'system' ? 'System' : totalOdds.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* ── Booking Code ── */}
          <div className="td-booking">
            <span className="td-booking-label">Booking Code</span>
            <div className="td-booking-row">
              <span className="td-booking-code">{code}</span>
              <div className="td-booking-actions">
                <button type="button" className="td-booking-icon-btn" onClick={handleCopy} aria-label="Copy code">
                  {copiedCode ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c66e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  ) : (
                    <SvgCopy size={16} />
                  )}
                </button>
                <button type="button" className="td-booking-icon-btn" onClick={() => onShare?.(bet)} aria-label="Share">
                  <SvgShare size={16} />
                </button>
                <button type="button" className="td-booking-rebet" onClick={onRemix}>Rebet</button>
              </div>
            </div>
          </div>

          {/* ── Celebration banner (won only) ── */}
          {isWon && (
            <div className="td-cheer">
              <div>
                <span className="td-cheer-title">Congratulations!</span>
                <span className="td-cheer-sub">You are Amazing!</span>
              </div>
              <button type="button" className="td-cheer-btn" onClick={() => onShare?.(bet)}>Show Off</button>
            </div>
          )}

          {/* ── Match list ── */}
          <div className="td-matches">
            {legs.map((leg, i) => {
              const res = legResult(i);
              const score = resolvedScore(i);
              const won = res === 'won';
              const lost = res === 'lost';
              const pick = leg.outcome || leg.pick || leg.selection || '—';
              const borderColor = won ? '#22c66e' : lost ? '#e53935' : '#4f8bff';
              const odds = leg.odds ? `@${Number(leg.odds).toFixed(2)}` : '';

              let actualOutcome = pick;
              if (lost) {
                if (bet.legsResolved?.[i]?.actualOutcome) {
                  actualOutcome = bet.legsResolved[i].actualOutcome;
                } else {
                  const m = leg.market || '1X2';
                  const alts1X2 = { '1': ['X', '2'], 'X': ['1', '2'], '2': ['1', 'X'] };
                  const altsOU = { 'Over': ['Under'], 'Under': ['Over'] };
                  const altsBTTS = { 'Yes': ['No'], 'No': ['Yes'] };
                  const altsDC = { '1X': ['2'], 'X2': ['1'], '12': ['X'] };
                  let pool;
                  if (m === 'OU25' || m === 'OU15' || m === 'OU35' || m === '1HOU05') pool = altsOU[pick];
                  else if (m === 'BTTS' || m === '1HBTTS') pool = altsBTTS[pick];
                  else if (m === 'DC') pool = altsDC[pick];
                  else pool = alts1X2[pick];
                  if (pool && pool.length) {
                    actualOutcome = pool[stableHash(`${bet.id}-${i}-out`) % pool.length];
                  }
                }
              }

              return (
                <div key={i} className="td-leg" style={{ borderLeftColor: borderColor }}>
                  <div className="td-leg-header">
                    <span>Game ID: {legGameId(leg, i)} | {legDate(leg)}</span>
                  </div>
                  <div className="td-leg-body">
                    <div className="td-leg-body-inner">
                      {(won || lost) && (
                        <span className={`td-leg-icon ${won ? 'td-leg-icon-won' : 'td-leg-icon-lost'}`}>
                          {won ? (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          ) : (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          )}
                        </span>
                      )}
                      <div className="td-leg-content">
                        <div className="td-leg-teams">{leg.home} : {leg.away}</div>
                        {score && (
                          <div className="td-leg-score-row">
                            <span className="td-leg-ft">FT Score: <strong>{score}</strong></span>
                            <span className="td-leg-divider">|</span>
                            <span className="td-leg-tracker">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
                              Match Tracker
                            </span>
                          </div>
                        )}
                        <div className="td-leg-details">
                          <div className="td-leg-detail"><span>Pick:</span> <span className="td-leg-detail-val">{getPickName(pick)} {odds}</span></div>
                          <div className="td-leg-detail"><span>Market:</span> <span className="td-leg-detail-val">{getMarketName(leg.market)}</span></div>
                          <div className="td-leg-detail"><span>Outcome:</span> <span className="td-leg-detail-val" style={{ color: won ? '#22c66e' : lost ? '#e53935' : 'var(--text)' }}>{getPickName(actualOutcome)}</span></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────── BetCard (design-handoff: colored header bar) ─────────── */
function BetCardView({ bet, onCashout, onRemix, onDetails, copiedCode, onCopy, autoTarget, onAutoTargetChange, onAutoClear, cashoutBusy }) {
  const [expanded, setExpanded] = useState(false);
  const isOpen = bet.status === 'open';
  const cashOutAmount = isOpen ? computeOffer(bet) : 0;
  const modeLabel = bet.mode === 'single' ? 'Singles' : bet.mode === 'multiple' ? 'Multiple' : bet.mode === 'system' ? 'System' : 'Bet';
  const legs = bet.legs || [];
  const ticketNo = String(stableHash(bet?.id || '')).slice(0, 6).padStart(6, '0');
  const totalReturn = bet.status === 'won' ? Number(bet.totalReturn || bet.potentialWin || 0) : bet.status === 'cashed_out' ? Number(bet.cashOut || 0) : 0;
  const selectionLabel = legs.length <= 1 ? 'QuickGame' : `${legs.length} selections`;

  const green = '#22c66e';
  const gray = '#8a98a3';
  const isWon = bet.status === 'won';
  const barBg = isWon ? '#064e1e' : bet.status === 'cashed_out' ? '#14b8a6' : bet.status === 'void' ? '#f5a623' : '#9aa6af';
  const returnColor = isWon ? green : bet.status === 'cashed_out' ? '#14b8a6' : gray;
  const pillIcon = isWon ? '🏆' : bet.status === 'cashed_out' ? '⟳' : bet.status === 'void' ? '⚪' : '✕';
  const statusLabel = isWon ? 'Won' : bet.status === 'cashed_out' ? 'Cashed Out' : bet.status === 'void' ? 'Void' : 'Lost';

  /* ── Open Bets card (SportyBet style: compact + expandable) ── */
  if (isOpen) {
    const firstLeg = legs[0] || {};
    const matchName = firstLeg.home && firstLeg.away ? `${firstLeg.home} vs ${firstLeg.away}` : firstLeg.match || firstLeg.event || (legs.length > 1 ? `${legs.length} selections` : 'Bet');
    const league = firstLeg.league || firstLeg.competition || '';
    const legDate = (() => {
      const d = new Date(firstLeg.kickoff || bet.placedAt || Date.now());
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      const hh = String(d.getHours()).padStart(2, '0');
      const mn = String(d.getMinutes()).padStart(2, '0');
      return `${dd}/${mm} ${hh}:${mn}`;
    })();

    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12, scale: 0.98 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="xh-card xh-card-open"
      >
        {/* Auto cashout banner */}
        {cashOutAmount > 0 && (
          <div className="xh-auto-banner" onClick={e => e.stopPropagation()}>
            <span className="xh-auto-banner-text">Set a rule to <strong>Auto Cashout</strong> your bet.</span>
            <span className="xh-auto-banner-info">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            </span>
          </div>
        )}

        {/* Mode header with actions */}
        <div className="xh-open-mode-row" onClick={() => setExpanded(!expanded)}>
          <span className="xh-open-mode">{modeLabel}</span>
          <div className="xh-open-actions">
            <button type="button" className="xh-open-action" onClick={e => { e.stopPropagation(); onRemix?.(bet); }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
              Reset
            </button>
            <button type="button" className="xh-open-action xh-open-action-sim" onClick={e => { e.stopPropagation(); }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
              SIM
            </button>
            <button type="button" className="xh-open-action" onClick={e => { e.stopPropagation(); }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
              Edit Bet
            </button>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {expanded ? (
            /* ── Expanded view ── */
            <motion.div
              key="expanded"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{ overflow: 'hidden' }}
            >
              <div className="xh-open-expanded">
                {legs.map((leg, i) => {
                  const pick = leg.outcome || leg.pick || leg.selection || '—';
                  const odds = leg.odds ? `@ ${Number(leg.odds).toFixed(2)}` : '';
                  const lgName = leg.league || leg.competition || '';
                  const matchLabel = leg.home && leg.away ? `${leg.home} vs ${leg.away}` : leg.match || leg.event || 'Match';
                  return (
                    <div key={i} className="xh-open-leg">
                      <div className="xh-open-leg-pick">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                        <span><strong>{getPickName(pick)} {odds}</strong> <span className="xh-open-leg-mkt">{getMarketName(leg.market)}</span></span>
                      </div>
                      <div className="xh-open-leg-match">{matchLabel}</div>
                      <div className="xh-open-leg-date">{legDate}</div>
                      {lgName && <div className="xh-open-leg-league-row">
                        <span className="xh-open-league-badge">{lgName}</span>
                        <button type="button" className="xh-open-hide-details" onClick={e => { e.stopPropagation(); setExpanded(false); }}>Hide Match Details</button>
                      </div>}
                    </div>
                  );
                })}

                {/* Stake / Pot. Win */}
                <div className="xh-open-summary">
                  <div className="xh-open-summary-row">
                    <span>Stake</span>
                    <span className="xh-open-summary-val">{fmt(bet.stake)}</span>
                  </div>
                  <div className="xh-open-summary-row">
                    <span>Pot. Win</span>
                    <span className="xh-open-summary-val">{fmt(bet.potentialWin)}</span>
                  </div>
                </div>

                {/* Cashout button */}
                {cashOutAmount > 0 && (
                  <div className="xh-open-cashout-wrap">
                    <button
                      type="button"
                      className="xh-open-cashout-btn-full"
                      onClick={e => { e.stopPropagation(); onCashout?.(bet); }}
                    >
                      Cashout GHS {fmt(cashOutAmount)}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            /* ── Compact view ── */
            <motion.div key="compact" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="xh-open-compact" onClick={() => setExpanded(true)}>
                <div className="xh-open-compact-info">
                  <span className="xh-open-match">{matchName}</span>
                  <span className="xh-open-stake">Stake: {fmt(bet.stake)}</span>
                  {league && <span className="xh-open-league-badge">{league}</span>}
                </div>
                {cashOutAmount > 0 && (
                  <button
                    type="button"
                    className="xh-open-cashout-btn"
                    onClick={e => { e.stopPropagation(); onCashout?.(bet); }}
                  >
                    Cashout<br />GHS {fmt(cashOutAmount)}
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  /* ── Bet History card (no cashout) ── */
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
      <div className="xh-card-header" style={{ background: barBg }}>
        <span className="xh-card-header-mode">{modeLabel}</span>
        <div className="xh-card-header-status">
          <span className="xh-card-header-icon">{pillIcon}</span>
          <span className="xh-card-header-label">{statusLabel}</span>
          <span className="xh-card-header-chevron">›</span>
        </div>
      </div>

      <div className="xh-card-body">
        <div className="xh-card-row">
          <span className="xh-card-row-label">Total Return</span>
          <span className="xh-card-row-value" style={{ color: returnColor, fontWeight: 800 }}>
            GHS {isWon || bet.status === 'cashed_out' ? fmt(totalReturn) : bet.status === 'lost' ? '0.00' : fmt(bet.potentialWin)}
          </span>
        </div>
        <div className="xh-card-row">
          <span className="xh-card-row-label">Total Stake</span>
          <span className="xh-card-row-value xh-val-stake">GHS {fmt(bet.stake)}</span>
        </div>
        <div className="xh-card-row xh-card-row-bottom">
          <span className="xh-card-row-dim">{selectionLabel}</span>
          <span className="xh-card-row-dim">No. {ticketNo}</span>
        </div>
      </div>
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

  // History filter chips
  const historyFilter = 'settled';

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
      result = openBets;
    } else {
      if (historyFilter === 'settled') result = settledBets;
      else if (historyFilter === 'unsettled') result = openBets;
      else result = bets;
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
  }, [tab, historyFilter, openBets, settledBets, bets, searchQuery]);

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
            <motion.div key="empty" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="xh-empty-card">
              <div className="xh-empty-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="#7d8b97" stroke="none"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 15c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1s1 .45 1 1v4c0 .55-.45 1-1 1zm1-8h-2V7h2v2z"/></svg>
              </div>
              <p className="xh-empty-text">
                {searchQuery ? 'No matches found.' : tab === 'open' ? 'You currently have no Open Bets.' : 'No settled bets yet.'}
              </p>
              {tab === 'open' && !searchQuery && (
                <button type="button" className="xh-empty-link" onClick={() => {}}>What is Cashout?</button>
              )}
            </motion.div>
          ) : (
            <motion.div key={`list-${tab}-${searchQuery}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="xh-list">
              <AnimatePresence>
                {groupedByDate.map((group, gi) => (
                  <div key={`${group.dateLabel}-${group.monthLabel}-${gi}`} className={tab === 'open' ? 'xh-date-group-flat' : 'xh-date-group'}>
                    {tab !== 'open' && (
                      <div className="xh-date-rail">
                        <span className="xh-date-day">{group.dateLabel}</span>
                        <span className="xh-date-mon">{group.monthLabel}</span>
                      </div>
                    )}
                    <div className={tab === 'open' ? 'xh-date-cards-flat' : 'xh-date-cards'}>
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
.xh-top-tabs { display: flex; background: var(--bg-soft); border-bottom: 1px solid var(--line); }
.xh-top-tab { flex: 1; padding: 14px 0; border: none; background: transparent; color: var(--text-dim); font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; text-align: center; position: relative; }
.xh-top-tab.active { color: var(--text); font-weight: 800; }
.xh-top-tab.active::after { content: ''; position: absolute; bottom: -1px; left: 0; right: 0; height: 3px; background: var(--accent); }

/* ── Filter chips ── */

/* ── Bet list ── */
.xh-list { display: flex; flex-direction: column; gap: 0; padding: 0; }

/* ── Date group with rail ── */
.xh-date-group { display: flex; align-items: stretch; gap: 0; }
.xh-date-rail { width: 50px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; padding-top: 16px; background: var(--bg); }
.xh-date-day { color: var(--text); font-size: 18px; font-weight: 800; line-height: 1; }
.xh-date-mon { color: var(--text-dim); font-size: 10px; font-weight: 700; letter-spacing: 1px; margin-top: 2px; }
.xh-date-cards { flex: 1; padding: 10px 12px 4px; display: flex; flex-direction: column; gap: 10px; }
.xh-date-group-flat { display: flex; flex-direction: column; }
.xh-date-cards-flat { padding: 6px 14px; display: flex; flex-direction: column; gap: 10px; }

/* ── Bet card ── */
.xh-card { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; cursor: pointer; }

/* ── Card header bar ── */
.xh-card-header { display: flex; justify-content: space-between; align-items: center; padding: 9px 13px; }
.xh-card-header-mode { font-size: 13px; font-weight: 800; color: var(--text-inv); }
.xh-card-header-status { display: flex; align-items: center; gap: 7px; }
.xh-card-header-icon { font-size: 12px; }
.xh-card-header-label { color: var(--text-inv); font-size: 12.5px; font-weight: 800; }
.xh-card-header-chevron { color: var(--text-inv); font-size: 14px; opacity: .85; }

/* ── Card body ── */
.xh-card-body { padding: 0 13px 11px; display: flex; flex-direction: column; gap: 5px; }
.xh-card-row { display: flex; justify-content: space-between; align-items: center; }
.xh-card-row-label { font-size: 12px; color: var(--text-soft); }
.xh-card-row-value { font-size: 13px; font-weight: 800; color: var(--text); font-variant-numeric: tabular-nums; }
.xh-val-stake { color: var(--text-soft); font-weight: 700; }
.xh-card-row-bottom { margin-top: 3px; }
.xh-card-row-dim { font-size: 11px; color: var(--text-dim); font-weight: 600; }
.xh-card-row-dim:last-child { font-size: 10.5px; font-weight: 400; }

/* ── Open bet card ── */
.xh-card-open { padding: 0; overflow: hidden; }

/* Auto cashout banner */
.xh-auto-banner { display: flex; align-items: center; gap: 6px; padding: 9px 13px; background: var(--surface-2); border-bottom: 1px solid var(--line); }
.xh-auto-banner-text { color: var(--text-soft); font-size: 11.5px; }
.xh-auto-banner-text strong { color: var(--text); }
.xh-auto-banner-info { color: var(--text-dim); display: flex; cursor: pointer; }

/* Mode header row */
.xh-open-mode-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 13px 6px; cursor: pointer; }
.xh-open-mode { color: var(--text); font-size: 14px; font-weight: 800; }
.xh-open-actions { display: flex; align-items: center; gap: 10px; }
.xh-open-action { display: inline-flex; align-items: center; gap: 4px; background: none; border: none; color: var(--text-dim); font-size: 11px; font-weight: 600; cursor: pointer; font-family: inherit; padding: 0; }
.xh-open-action:hover { color: var(--text-soft); }
.xh-open-action-sim { color: var(--accent); }

/* Compact view */
.xh-open-compact { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 13px 12px; cursor: pointer; }
.xh-open-compact-info { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
.xh-open-match { color: var(--text); font-size: 13.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.xh-open-stake { color: var(--text-soft); font-size: 12px; font-weight: 600; }
.xh-open-cashout-btn { flex-shrink: 0; padding: 10px 16px; border: none; border-radius: 8px; background: var(--accent); color: #fff; font-weight: 800; font-size: 12px; font-family: inherit; cursor: pointer; transition: opacity .15s; line-height: 1.35; text-align: center; }
.xh-open-cashout-btn:hover { opacity: .9; }

/* League badge */
.xh-open-league-badge { display: inline-block; padding: 3px 10px; border-radius: 5px; border: 1px solid var(--accent); color: var(--accent); font-size: 10.5px; font-weight: 700; margin-top: 2px; }

/* Expanded view */
.xh-open-expanded { padding: 0 13px 12px; }
.xh-open-leg { padding: 10px 0; border-bottom: 1px solid var(--line); }
.xh-open-leg:last-of-type { border-bottom: none; }
.xh-open-leg-pick { display: flex; align-items: center; gap: 7px; color: var(--text-soft); font-size: 12.5px; margin-bottom: 4px; }
.xh-open-leg-pick strong { color: var(--text); font-weight: 700; }
.xh-open-leg-mkt { color: var(--text-dim); font-size: 11px; font-weight: 500; }
.xh-open-leg-match { color: var(--text); font-size: 13.5px; font-weight: 700; margin-bottom: 3px; }
.xh-open-leg-date { color: var(--text-dim); font-size: 11px; margin-bottom: 6px; }
.xh-open-leg-league-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.xh-open-hide-details { background: none; border: none; color: var(--text-dim); font-size: 11px; font-weight: 600; cursor: pointer; font-family: inherit; padding: 0; }
.xh-open-hide-details:hover { color: var(--text-soft); }

/* Stake / Pot Win summary */
.xh-open-summary { display: flex; flex-direction: column; gap: 5px; padding: 10px 0 8px; border-top: 1px solid var(--line); }
.xh-open-summary-row { display: flex; justify-content: space-between; color: var(--text-soft); font-size: 12px; }
.xh-open-summary-val { color: var(--text); font-weight: 700; font-variant-numeric: tabular-nums; }

/* Full-width cashout button */
.xh-open-cashout-wrap { padding: 4px 0 2px; }
.xh-open-cashout-btn-full { width: 100%; padding: 13px 0; border: none; border-radius: 8px; background: var(--accent); color: #fff; font-size: 14px; font-weight: 800; cursor: pointer; font-family: inherit; transition: opacity .15s; }
.xh-open-cashout-btn-full:hover { opacity: .9; }

/* ── Skeleton ── */
.xh-skeleton-wrap { display: flex; flex-direction: column; gap: 8px; padding: 8px 14px; }
.xh-skeleton { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.xh-skel-head { height: 20px; width: 40%; background: var(--surface-2); border-radius: 4px; animation: xhShimmer 1.5s infinite; }
.xh-skel-body { display: flex; flex-direction: column; gap: 8px; }
.xh-skel-line { height: 14px; background: var(--surface-2); border-radius: 4px; animation: xhShimmer 1.5s infinite; }
.xh-skel-footer { height: 40px; background: var(--surface-2); border-radius: 8px; animation: xhShimmer 1.5s infinite; }
@keyframes xhShimmer { 0% { opacity: .6; } 50% { opacity: 1; } 100% { opacity: .6; } }

/* ── State cards ── */
.xh-state-card { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 48px 24px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 12px; margin: 14px; }
.xh-state-icon { opacity: .5; }
.xh-state-title { margin: 0; font-size: 18px; font-weight: 800; color: var(--text); }
.xh-state-desc { margin: 0; color: var(--text-soft); font-size: 14px; max-width: 360px; line-height: 1.5; }
.xh-state-btn { padding: 10px 24px; border-radius: 9px; border: none; background: var(--accent); color: #fff; font-weight: 800; font-size: 13px; cursor: pointer; font-family: inherit; }

/* ── Empty state (SportyBet style) ── */
.xh-empty-card { display: flex; flex-direction: column; align-items: center; padding: 60px 24px 48px; text-align: center; }
.xh-empty-icon { margin-bottom: 16px; opacity: .7; }
.xh-empty-text { margin: 0; color: var(--text-soft); font-size: 14px; font-weight: 500; }
.xh-empty-link { margin-top: 16px; background: none; border: none; color: var(--accent); font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; }

/* ── Load more ── */
.xh-load-more-wrap { display: flex; justify-content: center; padding: 12px; }
.xh-load-more { padding: 12px 32px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--text-soft); font-weight: 700; font-size: 13px; cursor: pointer; font-family: inherit; }
.xh-end-note { text-align: center; color: var(--text-dim); font-size: 12px; padding: 8px 0; }

/* ── Refresh indicator ── */
.xh-refresh-indicator { display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--text-soft); font-size: 12px; padding: 4px 0; }
.xh-spinner { width: 14px; height: 14px; border: 2px solid var(--line); border-top-color: var(--accent); border-radius: 50%; animation: xhSpin .6s linear infinite; }
@keyframes xhSpin { to { transform: rotate(360deg); } }

/* ═══════════════════════════════════════════
   TICKET DETAILS OVERLAY
   ═══════════════════════════════════════════ */
@keyframes xhFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes tdSlideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

.td-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.7); z-index: 9999; display: flex; justify-content: center; animation: xhFade .18s ease-out both; }
.td-sheet { width: 100%; max-width: 560px; height: 100%; background: var(--bg); display: flex; flex-direction: column; animation: tdSlideUp .28s cubic-bezier(.2,1,.3,1) both; overflow: hidden; }

/* ── Header ── */
.td-header { display: flex; align-items: center; justify-content: space-between; padding: 13px 14px; background: var(--accent); flex-shrink: 0; }
.td-header-back { display: flex; align-items: center; gap: 6px; background: none; border: none; color: #fff; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; }
.td-header-date { font-size: 12px; color: rgba(255,255,255,.75); font-weight: 500; }
.td-scroll { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; background: var(--bg); }

/* ── Info rows ── */
.td-info { background: var(--surface); border-bottom: 1px solid var(--line); }
.td-info-row { display: flex; justify-content: space-between; align-items: center; padding: 11px 14px; border-bottom: 1px solid var(--line); }
.td-info-row:last-child { border-bottom: none; }
.td-info-label { color: var(--text-soft); font-size: 12.5px; font-weight: 500; }
.td-info-val { color: var(--text); font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
.td-info-return { font-size: 18px; font-weight: 800; }
.td-info-status { font-size: 12.5px; font-weight: 800; }

/* ── Booking code ── */
.td-booking { background: var(--surface); border-bottom: 1px solid var(--line); padding: 12px 14px; }
.td-booking-label { display: block; color: var(--text-dim); font-size: 11px; font-weight: 600; margin-bottom: 8px; }
.td-booking-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.td-booking-code { color: var(--text); font-size: 18px; font-weight: 800; letter-spacing: 1px; }
.td-booking-actions { display: flex; align-items: center; gap: 8px; }
.td-booking-icon-btn { width: 34px; height: 34px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface-2); color: var(--text-soft); display: grid; place-items: center; cursor: pointer; }
.td-booking-rebet { padding: 9px 22px; border-radius: 8px; border: none; background: var(--accent); color: #fff; font-size: 13px; font-weight: 800; cursor: pointer; font-family: inherit; }

/* ── Celebration banner ── */
.td-cheer { margin: 12px 14px 0; background: linear-gradient(90deg, #ffd23f, #ffb800); border-radius: 10px; padding: 11px 14px; display: flex; align-items: center; justify-content: space-between; }
.td-cheer-title { display: block; color: #5c3d00; font-size: 13px; font-weight: 800; }
.td-cheer-sub { display: block; color: #7a5400; font-size: 11px; font-weight: 600; }
.td-cheer-btn { background: var(--bg); color: #ffd23f; font-size: 12px; font-weight: 800; padding: 8px 16px; border-radius: 7px; border: none; cursor: pointer; font-family: inherit; }

/* ── Match legs ── */
.td-matches { padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
.td-leg { background: var(--surface); border-radius: 8px; overflow: hidden; border-left: 3px solid #22c66e; }
.td-leg-header { background: var(--surface-2); padding: 8px 12px; color: var(--text-dim); font-size: 11px; font-weight: 600; }
.td-leg-body { padding: 10px 12px; }
.td-leg-body-inner { display: flex; align-items: flex-start; gap: 12px; }
.td-leg-content { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.td-leg-icon { flex-shrink: 0; display: grid; place-items: center; margin-top: 4px; }
.td-leg-icon-won { color: #22c66e; }
.td-leg-icon-lost { color: #e53935; }
.td-leg-teams { color: var(--text); font-size: 13.5px; font-weight: 700; }
.td-leg-score-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.td-leg-ft { color: var(--text-soft); font-size: 12px; }
.td-leg-ft strong { color: var(--text); font-weight: 800; }
.td-leg-divider { color: var(--text-dim); font-size: 12px; }
.td-leg-tracker { display: inline-flex; align-items: center; gap: 4px; color: var(--accent); font-size: 11px; font-weight: 700; cursor: pointer; }
.td-leg-details { display: flex; flex-direction: column; gap: 2px; margin-top: 4px; }
.td-leg-detail { color: var(--text-soft); font-size: 12px; display: flex; gap: 5px; }
.td-leg-detail-val { color: var(--text); font-weight: 600; }

/* ── Cashout confirm ── */
.xh-confirm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: grid; place-items: center; z-index: 9999; padding: 16px; animation: xhFade .18s ease-out both; }
.xh-confirm-card { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 24px; max-width: 380px; width: 100%; animation: xhPop .22s cubic-bezier(.2,1.3,.4,1) both; }
@keyframes xhPop { from { transform: scale(.92); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.xh-confirm-card h3 { margin: 0 0 4px; font-size: 20px; font-weight: 800; color: var(--text); }
.xh-confirm-sub { margin: 0 0 16px; font-size: 13px; color: var(--text-soft); }
.xh-confirm-sub code { background: var(--bg); padding: 2px 6px; border-radius: 6px; font-size: 12px; }
.xh-confirm-amount { padding: 14px 16px; background: var(--bg); border-radius: 10px; border: 1px solid var(--line); display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
.xh-confirm-amount-label { font-size: 12px; color: var(--text-soft); }
.xh-confirm-amount-value { font-size: 20px; font-weight: 800; color: var(--accent); }
.xh-confirm-note { font-size: 11.5px; color: var(--text-soft); margin: 0 0 18px; line-height: 1.5; }
.xh-confirm-actions { display: flex; gap: 10px; }
.xh-confirm-cancel, .xh-confirm-go { flex: 1; padding: 12px 0; border-radius: 8px; border: none; font: inherit; font-size: 13.5px; font-weight: 800; cursor: pointer; }
.xh-confirm-cancel { background: var(--bg); color: var(--text); border: 1px solid var(--line); }
.xh-confirm-go { background: var(--accent); color: #fff; }
.xh-fraction-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 14px; }
.xh-fraction-chip { padding: 9px 0; border-radius: 8px; border: 1px solid var(--line); background: var(--bg); color: var(--text); font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; }
.xh-fraction-chip.active { background: var(--accent); color: #fff; border-color: var(--accent); }
.xh-confirm-residual { padding: 12px 14px; border-radius: 10px; border: 1px solid var(--line); background: var(--bg); display: flex; justify-content: space-between; align-items: center; font-size: 12px; margin-bottom: 12px; gap: 12px; }
.xh-confirm-residual-label { color: var(--text-soft); font-weight: 600; }
.xh-confirm-residual > div { text-align: right; }
.xh-confirm-residual strong { font-variant-numeric: tabular-nums; color: var(--text); }
`;

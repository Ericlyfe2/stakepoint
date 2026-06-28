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

/* ─────────── Ticket Details Overlay (design-handoff) ─────────── */
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
  const totalBonus = Number(bet.bonus || (totalReturn > 0 ? Math.max(0, totalReturn - Number(bet.stake || 0) * totalOdds) : 0));
  const hasBonus = totalBonus > 0.01;

  const green = '#22c66e';
  const gray = '#8a98a3';

  const pillBg = isWon ? 'rgba(34,198,110,.16)' : isCashed ? 'rgba(20,184,166,.16)' : status === 'void' ? 'rgba(245,166,35,.16)' : status === 'open' ? 'rgba(79,139,255,.16)' : 'rgba(138,152,163,.14)';
  const pillFg = isWon ? green : isCashed ? '#14b8a6' : status === 'void' ? '#f5a623' : status === 'open' ? '#4f8bff' : '#9aa6af';
  const pillIcon = isWon ? '🏆' : isCashed ? '⟳' : status === 'void' ? '⚪' : status === 'open' ? '⏳' : '✕';
  const statusLabel = isWon ? 'Won' : isCashed ? 'Cashed Out' : status === 'void' ? 'Void' : status === 'open' ? 'Pending' : 'Lost';
  const returnColor = isWon ? green : isCashed ? '#14b8a6' : gray;
  const returnLabel = 'Total BetXentra Return';

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

  const legMeta = (l, i) => {
    const gameId = String(stableHash(`${bet?.id}-${l?.matchId || i}`)).slice(0, 4).padStart(4, '0');
    const d = new Date(bet.placedAt || Date.now());
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mn = String(d.getMinutes()).padStart(2, '0');
    const league = l.league || l.market || '1X2';
    return `Game ID: ${gameId} · ${dd}/${mm} ${hh}:${mn} · ${league}`;
  };

  return (
    <div className="td-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="td-sheet" onClick={e => e.stopPropagation()}>
        {/* ── Red Header ── */}
        <header className="td-header">
          <button type="button" className="td-header-back" onClick={onClose}>
            <span style={{ fontSize: '17px', lineHeight: 1 }}>‹</span>
            <span>Back</span>
          </button>
          <span className="td-header-title">Bet<span style={{ color: '#ffd23f' }}>Xentra</span></span>
          <div style={{ width: 50 }} />
        </header>

        <div className="td-scroll">
          {/* ── Summary card (teal) ── */}
          <div className="td-summary">
            <div className="td-summary-top">
              <div className="td-summary-left">
                <span className="td-summary-ticket">Ticket No. {ticketId}</span>
                <span className="td-summary-date">{placedAtLabel(bet.placedAt)}</span>
              </div>
              <div className="td-summary-right">
                <span className="td-summary-type">{modeLabel}</span>
                <div className="td-summary-pill" style={{ background: pillBg }}>
                  <span style={{ fontSize: 12 }}>{pillIcon}</span>
                  <span style={{ color: pillFg, fontSize: 12, fontWeight: 800 }}>{statusLabel}</span>
                </div>
              </div>
            </div>
            <div className="td-summary-return">
              <span className="td-summary-return-label">{returnLabel}</span>
              <span className="td-summary-return-value" style={{ color: returnColor }}>
                {isWon || isCashed ? fmt(totalReturn) : status === 'lost' ? '0.00' : fmt(bet.potentialWin)}
              </span>
            </div>
            <div className="td-summary-details">
              <div className="td-summary-row"><span>Total Stake</span><span className="td-summary-row-val">{fmt(bet.stake)}</span></div>
              <div className="td-summary-row"><span>Total Odds</span><span className="td-summary-row-val">{bet.mode === 'system' ? 'System' : totalOdds.toFixed(2)}</span></div>
              {hasBonus && (
                <div className="td-summary-row"><span>Total Bonus</span><span className="td-summary-row-val" style={{ color: '#7fe0a8' }}>{fmt(totalBonus)}</span></div>
              )}
            </div>
          </div>

          {/* ── Celebration banner (won only) ── */}
          {isWon && (
            <div className="td-cheer">
              <div>
                <span className="td-cheer-title">Congratulations!</span>
                <span className="td-cheer-sub">You are Amazing! 🎉</span>
              </div>
              <button type="button" className="td-cheer-btn" onClick={() => onShare?.(bet)}>Show Off</button>
            </div>
          )}

          {/* ── Action buttons ── */}
          <div className="td-actions">
            <button type="button" className="td-action-showoff" onClick={() => onShare?.(bet)}>Show Off</button>
            <button type="button" className="td-action-remix" onClick={onRemix}>Remix Bet</button>
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
              const markBg = won ? 'rgba(34,198,110,.16)' : 'rgba(138,152,163,.16)';
              const markFg = won ? green : gray;
              const outcomeColor = won ? green : gray;
              return (
                <div key={i} className="td-match">
                  <div className="td-match-meta">{legMeta(leg, i)}</div>
                  <div className="td-match-body">
                    <div className="td-match-mark" style={{ background: markBg, color: markFg }}>
                      {won ? '✓' : '✕'}
                    </div>
                    <div className="td-match-info">
                      <span className="td-match-teams">{leg.home} vs {leg.away}</span>
                      <div className="td-match-tracker-row">
                        <span className="td-match-tracker">⟲ Match Tracker</span>
                        <span className="td-match-ft-label">FT</span>
                        <span className="td-match-ft">{score || '—'}</span>
                      </div>
                      <div className="td-match-details">
                        <div className="td-match-detail-row"><span>Market</span><span className="td-match-detail-val">{getMarketName(leg.market)}</span></div>
                        <div className="td-match-detail-row"><span>Outcome</span><span style={{ color: outcomeColor, fontWeight: 800, fontSize: '11.5px' }}>{getPickName(leg.outcome)}</span></div>
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
        </div>
      </div>
    </div>
  );
}

/* ─────────── BetCard (design-handoff: colored header bar) ─────────── */
function BetCardView({ bet, onCashout, onRemix, onDetails, copiedCode, onCopy, autoTarget, onAutoTargetChange, onAutoClear, cashoutBusy }) {
  const code = bet.bookingCode || toBookingCode(bet.id);
  const isOpen = bet.status === 'open';
  const cashOutAmount = isOpen ? computeOffer(bet) : 0;
  const head = STATUS_CONFIG[bet.status] || STATUS_CONFIG.lost;
  const modeLabel = bet.mode === 'single' ? 'Single' : bet.mode === 'multiple' ? 'Multiple' : bet.mode === 'system' ? 'System' : 'Bet';
  const legs = bet.legs || [];
  const ticketNo = String(stableHash(bet?.id || '')).slice(0, 6).padStart(6, '0');
  const totalReturn = bet.status === 'won' ? Number(bet.totalReturn || bet.potentialWin || 0) : bet.status === 'cashed_out' ? Number(bet.cashOut || 0) : 0;
  const selectionLabel = legs.length <= 1 ? 'QuickGame' : `${legs.length} selections`;

  const green = '#22c66e';
  const gray = '#8a98a3';
  const isWon = bet.status === 'won';
  const barBg = isWon ? '#1aa64f' : bet.status === 'cashed_out' ? '#14b8a6' : bet.status === 'void' ? '#f5a623' : bet.status === 'open' ? '#3b82f6' : '#9aa6af';
  const returnColor = isWon ? green : bet.status === 'cashed_out' ? '#14b8a6' : gray;
  const pillIcon = isWon ? '🏆' : bet.status === 'cashed_out' ? '⟳' : bet.status === 'void' ? '⚪' : bet.status === 'open' ? '⏳' : '✕';
  const statusLabel = isWon ? 'Won' : bet.status === 'cashed_out' ? 'Cashed Out' : bet.status === 'void' ? 'Void' : bet.status === 'open' ? 'Pending' : 'Lost';

  const firstLeg = legs[0] || {};
  const matchName = firstLeg.match || firstLeg.event || (legs.length > 1 ? `${legs.length} selections` : 'Bet');
  const league = firstLeg.league || firstLeg.competition || '';

  if (isOpen) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12, scale: 0.98 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="xh-card xh-card-open"
        onClick={() => onDetails?.(bet)}
      >
        <div className="xh-open-body">
          <div className="xh-open-info">
            <span className="xh-open-match">{matchName}</span>
            <span className="xh-open-stake">Stake {fmt(bet.stake)}</span>
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
        {league && <div className="xh-open-league">{league}</div>}

        {cashOutAmount > 0 && (
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
      {/* ── Solid colored header bar ── */}
      <div className="xh-card-header" style={{ background: barBg }}>
        <span className="xh-card-header-mode">{modeLabel}</span>
        <div className="xh-card-header-status">
          <span className="xh-card-header-icon">{pillIcon}</span>
          <span className="xh-card-header-label">{statusLabel}</span>
          <span className="xh-card-header-chevron">›</span>
        </div>
      </div>

      {/* ── Card body ── */}
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
  const [historyFilter, setHistoryFilter] = useState('settled');

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

        {/* ── Filter chips (Bet History only) ── */}
        {tab === 'history' && (
          <div className="xh-filter-chips">
            {[
              { key: 'settled', label: 'Settled' },
              { key: 'unsettled', label: 'Unsettled' },
              { key: 'all', label: 'All' },
            ].map(f => (
              <button key={f.key} type="button" className={`xh-filter-chip${historyFilter === f.key ? ' active' : ''}`} onClick={() => setHistoryFilter(f.key)}>
                {f.label}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <div className="xh-filter-dropdown">All Casino <span style={{ fontSize: 9 }}>▼</span></div>
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
                  <div key={`${group.dateLabel}-${group.monthLabel}-${gi}`} className="xh-date-group">
                    {/* ── Date rail ── */}
                    <div className="xh-date-rail">
                      <span className="xh-date-day">{group.dateLabel}</span>
                      <span className="xh-date-mon">{group.monthLabel}</span>
                    </div>
                    {/* ── Cards ── */}
                    <div className="xh-date-cards">
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
.xh-top-tabs { display: flex; background: #161f27; border-bottom: 1px solid #222e38; }
.xh-top-tab { flex: 1; padding: 14px 0; border: none; background: transparent; color: #7d8b97; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; text-align: center; position: relative; }
.xh-top-tab.active { color: #fff; font-weight: 800; }
.xh-top-tab.active::after { content: ''; position: absolute; bottom: -1px; left: 0; right: 0; height: 3px; background: #c8102e; }

/* ── Filter chips ── */
.xh-filter-chips { display: flex; align-items: center; gap: 8px; padding: 12px 14px; overflow-x: auto; }
.xh-filter-chip { padding: 7px 16px; border-radius: 20px; font-size: 12px; font-weight: 700; white-space: nowrap; background: #1b252d; color: #aeb9c2; border: 1px solid #2a3742; cursor: pointer; font-family: inherit; }
.xh-filter-chip.active { background: #c8102e; color: #fff; border-color: #c8102e; }
.xh-filter-dropdown { display: flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 8px; background: #1b252d; color: #aeb9c2; font-size: 12px; font-weight: 700; white-space: nowrap; }

/* ── Bet list ── */
.xh-list { display: flex; flex-direction: column; gap: 0; padding: 0; }

/* ── Date group with rail ── */
.xh-date-group { display: flex; align-items: stretch; gap: 0; }
.xh-date-rail { width: 50px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; padding-top: 16px; background: #0c1217; }
.xh-date-day { color: #fff; font-size: 18px; font-weight: 800; line-height: 1; }
.xh-date-mon { color: #6b7883; font-size: 10px; font-weight: 700; letter-spacing: 1px; margin-top: 2px; }
.xh-date-cards { flex: 1; padding: 10px 12px 4px; display: flex; flex-direction: column; gap: 10px; }

/* ── Bet card ── */
.xh-card { background: #19222b; border: 1px solid #222e38; border-radius: 10px; overflow: hidden; cursor: pointer; }

/* ── Card header bar ── */
.xh-card-header { display: flex; justify-content: space-between; align-items: center; padding: 9px 13px; }
.xh-card-header-mode { font-size: 13px; font-weight: 800; color: #fff; }
.xh-card-header-status { display: flex; align-items: center; gap: 7px; }
.xh-card-header-icon { font-size: 12px; }
.xh-card-header-label { color: #fff; font-size: 12.5px; font-weight: 800; }
.xh-card-header-chevron { color: #fff; font-size: 14px; opacity: .85; }

/* ── Card body ── */
.xh-card-body { padding: 0 13px 11px; display: flex; flex-direction: column; gap: 5px; }
.xh-card-row { display: flex; justify-content: space-between; align-items: center; }
.xh-card-row-label { font-size: 12px; color: #7d8b97; }
.xh-card-row-value { font-size: 13px; font-weight: 800; color: #e8eef3; font-variant-numeric: tabular-nums; }
.xh-val-stake { color: #c2ccd4; font-weight: 700; }
.xh-card-row-bottom { margin-top: 3px; }
.xh-card-row-dim { font-size: 11px; color: #56636d; font-weight: 600; }
.xh-card-row-dim:last-child { font-size: 10.5px; font-weight: 400; }

/* ── Open bet card ── */
.xh-card-open { padding: 12px 13px 10px; }
.xh-open-body { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.xh-open-info { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; }
.xh-open-match { color: #e8eef3; font-size: 13.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.xh-open-stake { color: #7d8b97; font-size: 12px; font-weight: 600; }
.xh-open-cashout-btn { flex-shrink: 0; padding: 8px 14px; border: none; border-radius: 8px; background: #1aa64f; color: #fff; font-weight: 800; font-size: 11.5px; font-family: inherit; cursor: pointer; transition: opacity .15s; line-height: 1.35; text-align: center; }
.xh-open-cashout-btn:hover { opacity: .9; }
.xh-open-league { display: inline-block; margin-top: 8px; padding: 4px 10px; border-radius: 5px; border: 1px solid #1aa64f; color: #1aa64f; font-size: 10.5px; font-weight: 700; }

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
.xh-state-btn { padding: 10px 24px; border-radius: 9px; border: none; background: #1aa64f; color: #fff; font-weight: 800; font-size: 13px; cursor: pointer; font-family: inherit; }

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
.td-sheet { width: 100%; max-width: 560px; height: 100%; background: #10171d; display: flex; flex-direction: column; animation: tdSlideUp .28s cubic-bezier(.2,1,.3,1) both; overflow: hidden; }

.td-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px 11px; background: #c8102e; flex-shrink: 0; }
.td-header-back { display: flex; align-items: center; gap: 5px; background: none; border: none; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }
.td-header-title { font-size: 18px; font-weight: 800; color: #fff; letter-spacing: -.3px; }
.td-scroll { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; background: #10171d; }

/* ── Summary card (teal) ── */
.td-summary { background: #13343a; padding: 16px 16px 14px; }
.td-summary-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.td-summary-left { display: flex; flex-direction: column; gap: 3px; }
.td-summary-ticket { color: #8fb3b0; font-size: 11px; }
.td-summary-date { color: #6e928f; font-size: 10.5px; }
.td-summary-right { display: flex; align-items: center; gap: 8px; }
.td-summary-type { color: #fff; font-size: 15px; font-weight: 800; }
.td-summary-pill { display: flex; align-items: center; gap: 5px; padding: 4px 11px; border-radius: 6px; font-size: 12px; font-weight: 800; }
.td-summary-return { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 14px; }
.td-summary-return-label { color: #bcd6d3; font-size: 13px; font-weight: 600; }
.td-summary-return-value { font-size: 28px; font-weight: 800; line-height: 1; letter-spacing: -.5px; font-variant-numeric: tabular-nums; }
.td-summary-details { display: flex; flex-direction: column; gap: 9px; border-top: 1px solid rgba(255,255,255,.08); padding-top: 12px; }
.td-summary-row { display: flex; justify-content: space-between; color: #88aca9; font-size: 12.5px; }
.td-summary-row-val { color: #eaf2f1; font-size: 13px; font-weight: 700; }

/* ── Celebration banner ── */
.td-cheer { margin: 12px 14px 0; background: linear-gradient(90deg, #ffd23f, #ffb800); border-radius: 10px; padding: 11px 14px; display: flex; align-items: center; justify-content: space-between; }
.td-cheer-title { display: block; color: #5c3d00; font-size: 13px; font-weight: 800; }
.td-cheer-sub { display: block; color: #7a5400; font-size: 11px; font-weight: 600; }
.td-cheer-btn { background: #10171d; color: #ffd23f; font-size: 12px; font-weight: 800; padding: 8px 16px; border-radius: 7px; border: none; cursor: pointer; font-family: inherit; }

/* ── Action buttons ── */
.td-actions { display: flex; gap: 10px; padding: 12px 14px 8px; }
.td-action-showoff { flex: 1; background: #ffc107; color: #3a2a00; font-size: 13px; font-weight: 800; text-align: center; padding: 12px; border-radius: 9px; border: none; cursor: pointer; font-family: inherit; }
.td-action-remix { flex: 1; background: #16a05a; color: #fff; font-size: 13px; font-weight: 800; text-align: center; padding: 12px; border-radius: 9px; border: none; cursor: pointer; font-family: inherit; }

/* ── Verify code ── */
.td-verify { padding: 2px 16px 10px; display: flex; align-items: center; gap: 6px; }
.td-verify-label { color: #5b6770; font-size: 11px; }
.td-verify-value { color: #8b97a0; font-size: 11px; font-weight: 700; letter-spacing: .5px; }

/* ── Match cards ── */
.td-matches { padding: 0 14px; display: flex; flex-direction: column; gap: 10px; }
.td-match { background: #19222b; border: 1px solid #222e38; border-radius: 10px; padding: 12px 13px; }
.td-match-meta { color: #56636d; font-size: 10.5px; font-weight: 600; margin-bottom: 8px; }
.td-match-body { display: flex; gap: 11px; }
.td-match-mark { width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800; }
.td-match-info { flex: 1; display: flex; flex-direction: column; gap: 7px; }
.td-match-teams { color: #e8eef3; font-size: 13px; font-weight: 700; }
.td-match-tracker-row { display: flex; align-items: center; gap: 7px; }
.td-match-tracker { background: #222e38; color: #7fe0a8; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 5px; }
.td-match-ft-label { color: #7d8b97; font-size: 11px; }
.td-match-ft { color: #e8eef3; font-size: 12px; font-weight: 800; }
.td-match-details { display: flex; flex-direction: column; gap: 3px; border-top: 1px solid #222e38; padding-top: 7px; }
.td-match-detail-row { display: flex; justify-content: space-between; color: #7d8b97; font-size: 11.5px; }
.td-match-detail-val { color: #c2ccd4; font-size: 11.5px; font-weight: 600; }

/* ── Footer ── */
.td-footer { display: flex; justify-content: space-between; align-items: center; padding: 16px 16px 20px; }
.td-footer-count { color: #7d8b97; font-size: 12px; }
.td-footer-count strong { color: #e8eef3; font-weight: 700; }
.td-footer-link { color: #ffc107; font-size: 12px; font-weight: 800; cursor: pointer; }

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
.xh-confirm-go { background: #1aa64f; color: #fff; }
.xh-fraction-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 14px; }
.xh-fraction-chip { padding: 9px 0; border-radius: 8px; border: 1px solid #222e38; background: #10171d; color: #e8eef3; font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; }
.xh-fraction-chip.active { background: #c8102e; color: #fff; border-color: #c8102e; }
.xh-confirm-residual { padding: 12px 14px; border-radius: 10px; border: 1px solid #222e38; background: #10171d; display: flex; justify-content: space-between; align-items: center; font-size: 12px; margin-bottom: 12px; gap: 12px; }
.xh-confirm-residual-label { color: #7d8b97; font-weight: 600; }
.xh-confirm-residual > div { text-align: right; }
.xh-confirm-residual strong { font-variant-numeric: tabular-nums; color: #e8eef3; }
`;

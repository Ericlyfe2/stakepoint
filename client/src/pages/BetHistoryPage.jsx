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
  return b.lastCashOutOffer?.amount ?? b.cashoutOffer ?? Number((b.stake * 0.95).toFixed(2));
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
  won:        { label: 'BET WON',        cls: 'won',    color: '#16a34a', bg: 'rgba(22,163,74,0.15)', border: 'rgba(22,163,74,0.4)', icon: '✓' },
  lost:       { label: 'BET LOST',       cls: 'lost',   color: '#e53935', bg: 'rgba(229,57,53,0.15)', border: 'rgba(229,57,53,0.4)', icon: '✕' },
  cashed_out: { label: 'CASHED OUT',     cls: 'cashed', color: '#14b8a6', bg: 'rgba(20,184,166,0.15)', border: 'rgba(20,184,166,0.4)', icon: '⟳' },
  void:       { label: 'BET VOID',       cls: 'void',   color: '#f5a623', bg: 'rgba(245,166,35,0.15)', border: 'rgba(245,166,35,0.4)', icon: '⚪' },
  open:       { label: 'BET PENDING',    cls: 'open',   color: '#4f8bff', bg: 'rgba(79,139,255,0.15)', border: 'rgba(79,139,255,0.4)', icon: '⏳' },
};

const STATUS_FILTERS = [
  { key: 'all', label: 'All Bets' },
  { key: 'open', label: 'Open' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
  { key: 'cashed_out', label: 'Cashed Out' },
  { key: 'void', label: 'Void' },
];

const TABS = [
  { key: 'open', label: 'Open Bets' },
  { key: 'cashout', label: 'Cashout Available' },
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

/* ─────────── Ticket Details Overlay ─────────── */
function TicketDetails({ bet, onClose, onRemix, onShare }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const status = bet.status || 'open';
  const head = STATUS_CONFIG[status] || STATUS_CONFIG.open;
  const modeLabel = bet.mode === 'single' ? 'Single' : bet.mode === 'multiple' ? 'Multiple' : bet.mode === 'system' ? 'System' : (bet.mode || 'Bet');
  const totalReturn = bet.status === 'won' ? Number(bet.totalReturn || bet.potentialWin || 0) : bet.status === 'cashed_out' ? Number(bet.cashOut || 0) : 0;
  const totalOdds = Number(bet.totalOdds || 0);
  const profit = totalReturn > 0 && bet.stake > 0 ? totalReturn - Number(bet.stake) : 0;

  const legResult = (i) => {
    if (bet.status === 'open') return 'pending';
    if (bet.legsResolved && bet.legsResolved[i]) return bet.legsResolved[i].won ? 'won' : 'lost';
    if (bet.status === 'won') return 'won';
    if (bet.status === 'cashed_out') return (stableHash(`${bet.id}-${i}-co`) % 100) < 55 ? 'lost' : 'won';
    if (bet.status === 'void') return 'void';
    const total = bet.legs?.length || 1;
    const loserIdx = stableHash(bet.id) % total;
    return i === loserIdx ? 'lost' : 'won';
  };

  const resolvedScore = (i) => {
    if (bet.legsResolved && bet.legsResolved[i]) {
      const r = bet.legsResolved[i];
      if (r.scoreHome != null && r.scoreAway != null) return { home: r.scoreHome, away: r.scoreAway, str: `${r.scoreHome}:${r.scoreAway}` };
    }
    return null;
  };

  return (
    <div className="td-overlay" role="dialog" aria-modal="true" aria-labelledby="td-title">
      <div className="td-sheet">
        <header className="td-top">
          <button type="button" className="td-back" onClick={onClose} aria-label="Back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h2 id="td-title">Ticket Details</h2>
          <div className="td-top-actions">
            <button type="button" className="td-icon-btn" aria-label="Share" onClick={() => onShare?.(bet)}>
              <SvgShare size={18} />
            </button>
            <button type="button" className="td-icon-btn" aria-label="Close" onClick={onClose}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </header>

        <div className="td-body">
          <section className={`td-banner td-banner-${head.cls}`}>
            <span className="td-banner-icon">{head.icon}</span>
            <span className="td-banner-label">{head.label}</span>
          </section>

          <section className="td-summary">
            <div className="td-summary-row td-summary-ticket">
              <span className="td-summary-label">Bet ID:</span>
              <span className="td-summary-value">{String(stableHash(bet?.id || '')).slice(0, 6).padStart(6, '0')}</span>
              <span className="td-summary-dot" />
              <span className="td-summary-time">{ticketTimeFull(bet.placedAt)}</span>
            </div>
            {bet.bookingCode && (
              <div className="td-summary-row td-summary-code">
                <span className="td-summary-label">Booking Code:</span>
                <span className="td-summary-value td-summary-code-value">{bet.bookingCode}</span>
              </div>
            )}
            <div className="td-summary-row td-summary-mode">
              <span className="td-mode">{modeLabel}</span>
              <span className={`td-badge td-badge-${head.cls}`}>{head.label.replace('BET ', '')}</span>
            </div>
            <div className="td-summary-divider" />

            <div className="td-summary-grid">
              <div className="td-summary-item">
                <span className="td-summary-item-label">Stake</span>
                <strong className="td-summary-item-value">GHS {fmt(bet.stake)}</strong>
              </div>
              <div className="td-summary-item">
                <span className="td-summary-item-label">Total Odds</span>
                <strong className="td-summary-item-value td-summary-odds">{bet.mode === 'system' ? 'System' : totalOdds.toFixed(2)}</strong>
              </div>
              <div className="td-summary-item">
                <span className="td-summary-item-label">Potential Win</span>
                <strong className="td-summary-item-value td-summary-pot">GHS {fmt(bet.potentialWin)}</strong>
              </div>
              {(status === 'won' || status === 'cashed_out') && (
                <div className="td-summary-item td-summary-item-highlight">
                  <span className="td-summary-item-label">Total Return</span>
                  <strong className="td-summary-item-value is-positive">GHS {fmt(totalReturn)}</strong>
                </div>
              )}
              {status === 'won' && profit > 0 && (
                <div className="td-summary-item td-summary-item-profit">
                  <span className="td-summary-item-label">Profit</span>
                  <strong className="td-summary-item-value is-positive">+GHS {fmt(profit)}</strong>
                </div>
              )}
              {status === 'cashed_out' && (
                <>
                  <div className="td-summary-item td-summary-item-profit">
                    <span className="td-summary-item-label">Cashout Amount</span>
                    <strong className="td-summary-item-value is-positive">GHS {fmt(bet.cashOut)}</strong>
                  </div>
                  <div className="td-summary-item td-summary-item-profit">
                    <span className="td-summary-item-label">P&amp;L</span>
                    <strong className={`td-summary-item-value ${profit >= 0 ? 'is-positive' : 'is-negative'}`}>{profit >= 0 ? '+' : ''}GHS {fmt(Math.abs(profit))}</strong>
                  </div>
                </>
              )}
              {status === 'lost' && (
                <div className="td-summary-item td-summary-item-loss">
                  <span className="td-summary-item-label">Total Return</span>
                  <strong className="td-summary-item-value is-negative">GHS 0.00</strong>
                </div>
              )}
            </div>

            {bet.settledAt && (
              <div className="td-summary-settled">
                <span className="td-summary-label">Settled:</span>
                <span className="td-summary-time">{ticketTimeFull(bet.settledAt)}</span>
              </div>
            )}
          </section>

          <section className="td-legs">
            {(bet.legs || []).map((leg, i) => {
              const res = legResult(i);
              const resolved = resolvedScore(i);
              const score = resolved || null;
              const pick = getPickName(leg.outcome);
              const market = getMarketName(leg.market);
              return (
                <article key={i} className={`td-leg td-leg-${res}`}>
                  <div className="td-leg-head">
                    <span className="td-leg-game">
                      Game ID: <strong>{String(stableHash(`${bet?.id}-${leg?.matchId || i}`)).slice(0, 5).padStart(5, '0')}</strong>
                    </span>
                    <span className={`td-leg-status td-leg-status-${res}`}>
                      {res === 'won' && <><span className="td-leg-status-icon">✓</span> WON</>}
                      {res === 'lost' && <><span className="td-leg-status-icon">✕</span> LOST</>}
                      {res === 'void' && <><span className="td-leg-status-icon">⚪</span> VOID</>}
                      {res === 'pending' && <><span className="td-leg-status-icon">⏳</span> Pending</>}
                    </span>
                  </div>
                  <div className="td-leg-body">
                    <div className="td-leg-teams-wrapper">
                      <span className="td-leg-home">{leg.home}</span>
                      <span className="td-leg-vs">vs</span>
                      <span className="td-leg-away">{leg.away}</span>
                    </div>
                    {score && (
                      <div className="td-leg-score">
                        <span className="td-leg-score-label">Final Score:</span>
                        <span className="td-leg-score-value">{score.str}</span>
                      </div>
                    )}
                    <div className="td-leg-details">
                      <div className="td-leg-detail">
                        <span className="td-leg-detail-label">Pick</span>
                        <span className="td-leg-detail-value">{pick}</span>
                      </div>
                      <div className="td-leg-detail">
                        <span className="td-leg-detail-label">Market</span>
                        <span className="td-leg-detail-value td-leg-detail-market">{market}</span>
                      </div>
                      <div className="td-leg-detail">
                        <span className="td-leg-detail-label">Selection</span>
                        <span className="td-leg-detail-value">{pick}</span>
                      </div>
                      <div className="td-leg-detail">
                        <span className="td-leg-detail-label">Odds</span>
                        <span className="td-leg-detail-value td-leg-detail-odds">@{Number(leg.odds).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>

          <section className="td-actions">
            {onRemix && (
              <button type="button" className="td-action-btn td-action-remix" onClick={onRemix}>
                <span className="td-action-icon">↺</span>
                <span className="td-action-text">
                  <span className="td-action-title">Remix Bet</span>
                  <span className="td-action-sub">Rebuild with same selections</span>
                </span>
              </button>
            )}
            {onShare && (
              <button type="button" className="td-action-btn td-action-share" onClick={() => onShare(bet)}>
                <span className="td-action-icon">⟳</span>
                <span className="td-action-text">
                  <span className="td-action-title">Show Off</span>
                  <span className="td-action-sub">Share your ticket</span>
                </span>
              </button>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/* ─────────── BetCard (SportyBet-style compact card) ─────────── */
function BetCardView({ bet, expanded, onToggle, onCashout, onRemix, onDetails, trend, copiedCode, onCopy, autoTarget, onAutoTargetChange, onAutoClear, cashoutBusy }) {
  const code = bet.bookingCode || toBookingCode(bet.id);
  const isOpen = bet.status === 'open';
  const cashOutAmount = isOpen ? computeOffer(bet) : 0;
  const head = STATUS_CONFIG[bet.status] || STATUS_CONFIG.open;
  const modeLabel = bet.mode === 'single' ? 'Single' : bet.mode === 'multiple' ? 'Multiple' : bet.mode === 'system' ? 'System' : 'Bet';
  const legs = bet.legs || [];
  const [showLegs, setShowLegs] = useState(true);

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

  const legDate = (l) => {
    if (l.matchTime) return l.matchTime;
    const d = new Date(bet.placedAt || Date.now());
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mn = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm} ${hh}:${mn}`;
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12, scale: 0.98 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={`xh-card xh-card-${head.cls}`}
    >
      {/* ── Card header: mode + action chips ── */}
      <div className="xh-card-top">
        <span className="xh-mode-label">{modeLabel}</span>
        <div className="xh-card-chips">
          <button type="button" className="xh-chip" onClick={(e) => { e.stopPropagation(); onCopy?.(code); }}>
            {copiedCode === code ? '✓ Copied' : code}
          </button>
          {navigator.share && (
            <button type="button" className="xh-chip" onClick={(e) => { e.stopPropagation(); navigator.share({ title: 'My Xenbet Slip', text: `Check out my bet slip on Xenbet! Booking Code: ${code}` }).catch(() => {}); }}>
              Share
            </button>
          )}
          <button type="button" className="xh-chip" onClick={(e) => { e.stopPropagation(); onRemix?.(bet); }}>
            Edit Bet
          </button>
        </div>
      </div>

      {/* ── Status banner (for settled bets) ── */}
      {bet.status !== 'open' && (
        <div className={`xh-status-bar xh-status-bar-${head.cls}`}>
          <span>{head.icon} {head.label}</span>
          {bet.status === 'won' && <span>+GHS {fmt(bet.totalReturn || bet.potentialWin || 0)}</span>}
          {bet.status === 'cashed_out' && <span>GHS {fmt(bet.cashOut || 0)}</span>}
        </div>
      )}

      {/* ── Legs timeline ── */}
      {showLegs && legs.length > 0 && (
        <div className="xh-legs">
          {legs.map((l, i) => {
            const res = legResult(i);
            const pick = getPickName(l.outcome);
            const market = getMarketName(l.market);
            return (
              <div key={i} className="xh-leg" onClick={(e) => { e.stopPropagation(); onDetails?.(bet); }}>
                <div className="xh-leg-timeline">
                  <span className={`xh-leg-dot xh-leg-dot-${res}`}>
                    {res === 'won' && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                    {res === 'lost' && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
                    {res === 'pending' && <span className="xh-leg-dot-inner" />}
                  </span>
                  {i < legs.length - 1 && <span className={`xh-leg-line xh-leg-line-${res}`} />}
                </div>
                <div className="xh-leg-content">
                  <div className="xh-leg-pick-row">
                    <span className="xh-leg-pick-label">{pick}</span>
                    <span className="xh-leg-odds-badge">@ {Number(l.odds).toFixed(2)}</span>
                    <span className="xh-leg-market">{l.market || '1X2'}</span>
                  </div>
                  <div className="xh-leg-match">{l.home} vs {l.away}</div>
                  <div className="xh-leg-date">{legDate(l)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Show/Hide Match Details ── */}
      {legs.length > 0 && (
        <button type="button" className="xh-toggle-details" onClick={() => setShowLegs(!showLegs)}>
          {showLegs ? 'Hide' : 'Show'} Match Details
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showLegs ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
      )}

      {/* ── Stake / Pot. Win row ── */}
      <div className="xh-stake-row">
        <div className="xh-stake-item">
          <span className="xh-stake-label">Stake</span>
          <span className="xh-stake-value">{fmt(bet.stake)}</span>
        </div>
        <div className="xh-stake-item">
          <span className="xh-stake-label">Pot. Win</span>
          <span className="xh-stake-value xh-stake-pot">{fmt(bet.potentialWin)}</span>
        </div>
      </div>

      {/* ── Cashout button ── */}
      {isOpen && cashOutAmount > 0 && (
        <div className="xh-cashout-wrap">
          <button type="button" className="xh-cashout-btn" onClick={(e) => { e.stopPropagation(); onCashout?.(bet); }}>
            Cashout GHS {fmt(cashOutAmount)}
          </button>
        </div>
      )}

      {/* ── Auto-cashout panel ── */}
      {isOpen && cashOutAmount > 0 && (
        <AutoCashoutPanel
          betId={bet.id}
          currentOffer={cashOutAmount}
          target={Number(autoTarget) || 0}
          onSetTarget={(id, v) => onAutoTargetChange(id, v)}
          onClearTarget={(id) => onAutoClear(id)}
          busy={cashoutBusy}
        />
      )}

      {/* ── Cashed out / void note ── */}
      {bet.status === 'cashed_out' && (
        <div className="xh-result-note xh-result-cashed">
          ⟳ Cashed out for <strong>GHS {fmt(bet.cashOut)}</strong>
        </div>
      )}
      {bet.status === 'void' && (
        <div className="xh-result-note xh-result-void">
          This bet was voided. Stake has been refunded.
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

  // Tab & filter
  const [tab, setTab] = useState('open');
  const [statusFilter, setStatusFilter] = useState('all');

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
    if (tab === 'open') result = openBets;
    else if (tab === 'cashout') result = cashoutableBets;
    else result = settledBets;

    if (statusFilter !== 'all') result = result.filter(b => b.status === statusFilter);

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
  }, [tab, openBets, cashoutableBets, settledBets, statusFilter, searchQuery]);

  const paginated = useMemo(() => filteredBets.slice(0, visibleCount), [filteredBets, visibleCount]);
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
      if (res.offer > 0) amount = res.offer;
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
        {/* ── Top tab bar (SportyBet style) ── */}
        <div className="xh-top-tabs" role="tablist">
          {TABS.map(t => {
            const count = t.key === 'open' ? totals.openCount : t.key === 'cashout' ? totals.cashoutableCount : totals.settledCount;
            return (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`xh-top-tab${tab === t.key ? ' active' : ''}`} onClick={() => { setTab(t.key); setStatusFilter('all'); setVisibleCount(PAGE_SIZE); }}>
                {t.label}{t.key === 'open' && count > 0 ? ` (${count})` : ''}
              </button>
            );
          })}
        </div>

        {/* ── Filter row ── */}
        <div className="xh-filter-row">
          {STATUS_FILTERS.map(f => {
            const hidden = (tab === 'open' && f.key !== 'all' && f.key !== 'open') || (tab === 'cashout' && f.key !== 'all');
            if (hidden) return null;
            return (
              <button key={f.key} type="button" className={`xh-filter${statusFilter === f.key ? ' active' : ''}`} onClick={() => { setStatusFilter(f.key); setVisibleCount(PAGE_SIZE); }}>
                {f.label}
              </button>
            );
          })}
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
            <motion.div key={`list-${tab}-${statusFilter}-${searchQuery}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="xh-list">
              <AnimatePresence>
                {paginated.map((b, i) => (
                  <BetCardView
                    key={b.id}
                    bet={b}
                    expanded={expandedIds.has(b.id)}
                    onToggle={() => toggleExpanded(b.id)}
                    onCashout={onCashOut}
                    onRemix={onRemixBet}
                    onDetails={setActiveTicket}
                    trend={trends[b.id]}
                    copiedCode={copiedCode}
                    onCopy={onCopy}
                    autoTarget={autoTargets[b.id] || ''}
                    onAutoTargetChange={setAutoTarget}
                    onAutoClear={(id) => setAutoTarget(id, '')}
                    cashoutBusy={cashoutBusy}
                  />
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
              navigator.share({ title: 'My Xenbet Ticket', text: `Check out my bet ticket on Xenbet!\n\nBooking Code: ${code}\nStake: GHS ${fmt(bet.stake)}\nPotential Win: GHS ${fmt(bet.potentialWin)}\nStatus: ${(bet.status || '').toUpperCase()}` }).catch(() => {});
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
.xh-shell { max-width: 560px; margin: 0 auto; padding: 0; display: flex; flex-direction: column; gap: 0; }

/* ── Top tabs (SportyBet style) ── */
.xh-top-tabs { display: flex; background: linear-gradient(135deg, #0a4a2e, #116f43); border-bottom: 2px solid var(--accent); }
.xh-top-tab { flex: 1; padding: 14px 10px; border: none; background: transparent; color: rgba(255,255,255,.65); font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; text-align: center; transition: all .15s; position: relative; white-space: nowrap; }
.xh-top-tab.active { color: #fff; background: rgba(255,255,255,.08); }
.xh-top-tab.active::after { content: ''; position: absolute; bottom: -2px; left: 0; right: 0; height: 3px; background: var(--accent); }

/* ── Filter row ── */
.xh-filter-row { display: flex; gap: 0; border-bottom: 1px solid var(--line); background: var(--surface); }
.xh-filter { flex: 1; padding: 10px 8px; border: none; background: transparent; color: var(--text-dim); font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; text-align: center; transition: all .15s; border-bottom: 2px solid transparent; white-space: nowrap; }
.xh-filter:hover { color: var(--text); }
.xh-filter.active { color: var(--accent); border-bottom-color: var(--accent); }

/* ── Bet list ── */
.xh-list { display: flex; flex-direction: column; gap: 8px; padding: 8px; }

/* ── Bet card (SportyBet compact style) ── */
.xh-card { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.xh-card-won { border-left: 3px solid #16a34a; }
.xh-card-lost { border-left: 3px solid #e53935; }
.xh-card-cashed { border-left: 3px solid #14b8a6; }
.xh-card-void { border-left: 3px solid #f5a623; }
.xh-card-open { border-left: 3px solid var(--accent); }

/* ── Card top: mode + chips ── */
.xh-card-top { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,.06); }
.xh-mode-label { font-size: 14px; font-weight: 800; color: var(--text); }
.xh-card-chips { display: flex; gap: 6px; }
.xh-chip { padding: 4px 10px; border-radius: 4px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.05); color: var(--text-soft); font-size: 11px; font-weight: 600; cursor: pointer; font-family: inherit; transition: all .15s; white-space: nowrap; }
.xh-chip:hover { border-color: var(--accent); color: var(--accent); }

/* ── Status bar (settled bets) ── */
.xh-status-bar { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; font-size: 12px; font-weight: 800; letter-spacing: .03em; }
.xh-status-bar-won { background: rgba(22,163,74,.12); color: #16a34a; }
.xh-status-bar-lost { background: rgba(229,57,53,.12); color: #e53935; }
.xh-status-bar-cashed { background: rgba(20,184,166,.12); color: #14b8a6; }
.xh-status-bar-void { background: rgba(245,166,35,.12); color: #f5a623; }
.xh-status-bar-open { background: rgba(79,139,255,.12); color: #4f8bff; }

/* ── Legs timeline ── */
.xh-legs { padding: 8px 12px 4px; }
.xh-leg { display: flex; gap: 12px; cursor: pointer; min-height: 60px; }
.xh-leg-timeline { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; width: 24px; padding-top: 2px; }
.xh-leg-dot { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0; }
.xh-leg-dot-won { background: #16a34a; }
.xh-leg-dot-lost { background: #e53935; }
.xh-leg-dot-void { background: #f5a623; }
.xh-leg-dot-pending { background: transparent; border: 2px solid var(--accent); }
.xh-leg-dot-inner { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
.xh-leg-line { flex: 1; width: 2px; background: rgba(255,255,255,.08); margin: 4px 0; min-height: 20px; }
.xh-leg-line-won { background: #16a34a; }
.xh-leg-line-lost { background: rgba(229,57,53,.3); }
.xh-leg-content { flex: 1; min-width: 0; padding-bottom: 12px; }
.xh-leg-pick-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.xh-leg-pick-label { font-size: 13px; font-weight: 700; color: var(--text); }
.xh-leg-odds-badge { font-size: 12px; font-weight: 700; color: var(--accent); }
.xh-leg-market { font-size: 11px; color: var(--text-dim); font-weight: 600; }
.xh-leg-match { font-size: 12px; color: var(--text-soft); margin-top: 2px; }
.xh-leg-date { font-size: 11px; color: var(--text-dim); margin-top: 1px; }

/* ── Toggle match details ── */
.xh-toggle-details { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; padding: 8px; border: none; border-top: 1px solid rgba(255,255,255,.06); background: rgba(255,255,255,.02); color: var(--text-soft); font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; transition: all .15s; }
.xh-toggle-details:hover { color: var(--accent); background: rgba(255,255,255,.04); }

/* ── Stake / Pot. Win row ── */
.xh-stake-row { display: flex; justify-content: space-between; padding: 10px 12px; border-top: 1px solid rgba(255,255,255,.06); }
.xh-stake-item { display: flex; flex-direction: column; gap: 1px; }
.xh-stake-label { font-size: 11px; color: var(--text-dim); font-weight: 600; }
.xh-stake-value { font-size: 14px; font-weight: 800; font-variant-numeric: tabular-nums; color: var(--text); }
.xh-stake-pot { color: var(--accent); }

/* ── Cashout button ── */
.xh-cashout-wrap { padding: 0 12px 12px; }
.xh-cashout-btn { width: 100%; padding: 13px; border: none; border-radius: 8px; background: linear-gradient(135deg, #116f43, #1aa46a); color: #fff; font-weight: 800; font-size: 14px; font-family: inherit; cursor: pointer; transition: transform .15s, box-shadow .15s; letter-spacing: .02em; }
.xh-cashout-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(26,164,106,.4); }
.xh-cashout-btn:active { transform: translateY(0); }

/* ── Result notes ── */
.xh-result-note { margin: 0 12px 12px; padding: 8px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; }
.xh-result-cashed { background: rgba(20,184,166,.08); color: var(--text-soft); }
.xh-result-cashed strong { color: #14b8a6; }
.xh-result-void { background: rgba(245,166,35,.08); color: var(--text-dim); }

/* ── Skeleton ── */
.xh-skeleton-wrap { display: flex; flex-direction: column; gap: 8px; padding: 8px; }
.xh-skeleton { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.xh-skel-head { height: 20px; width: 40%; background: var(--surface-2); border-radius: 4px; animation: xhShimmer 1.5s infinite; }
.xh-skel-body { display: flex; flex-direction: column; gap: 8px; }
.xh-skel-line { height: 14px; background: var(--surface-2); border-radius: 4px; animation: xhShimmer 1.5s infinite; }
.xh-skel-footer { height: 40px; background: var(--surface-2); border-radius: 8px; animation: xhShimmer 1.5s infinite; }
@keyframes xhShimmer { 0% { opacity: .6; } 50% { opacity: 1; } 100% { opacity: .6; } }

/* ── State cards ── */
.xh-state-card { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 48px 24px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 12px; margin: 8px; }
.xh-state-icon { opacity: .5; }
.xh-state-title { margin: 0; font-size: 18px; font-weight: 800; }
.xh-state-desc { margin: 0; color: var(--text-soft); font-size: 14px; max-width: 360px; line-height: 1.5; }
.xh-state-btn { padding: 10px 24px; border-radius: 8px; border: none; background: linear-gradient(135deg, #116f43, #1aa46a); color: #fff; font-weight: 800; font-size: 13px; cursor: pointer; font-family: inherit; transition: opacity .15s; }
.xh-state-btn:hover { opacity: .85; }

/* ── Load more ── */
.xh-load-more-wrap { display: flex; justify-content: center; padding: 8px; }
.xh-load-more { padding: 12px 32px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--text); font-weight: 700; font-size: 13px; cursor: pointer; font-family: inherit; transition: all .15s; }
.xh-load-more:hover { border-color: var(--accent); color: var(--accent); }
.xh-end-note { text-align: center; color: var(--text-dim); font-size: 12px; padding: 8px 0; }

/* ── Refresh indicator ── */
.xh-refresh-indicator { display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--text-dim); font-size: 12px; padding: 4px 0; }
.xh-spinner { width: 14px; height: 14px; border: 2px solid var(--surface-2); border-top-color: var(--accent); border-radius: 50%; animation: xhSpin .6s linear infinite; }
@keyframes xhSpin { to { transform: rotate(360deg); } }

/* ── Cashout confirm ── */
.xh-confirm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: grid; place-items: center; z-index: 9999; padding: 16px; animation: xhFade .18s ease-out both; }
@keyframes xhFade { from { opacity: 0; } to { opacity: 1; } }
.xh-confirm-card { background: var(--surface); border: 1px solid var(--surface-2); border-radius: 12px; padding: 24px; max-width: 380px; width: 100%; animation: xhPop .22s cubic-bezier(.2,1.3,.4,1) both; }
@keyframes xhPop { from { transform: scale(.92); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.xh-confirm-card h3 { margin: 0 0 4px; font-size: 20px; font-weight: 800; }
.xh-confirm-sub { margin: 0 0 16px; font-size: 13px; color: var(--text-dim); }
.xh-confirm-sub code { background: var(--bg); padding: 2px 6px; border-radius: 6px; font-size: 12px; }
.xh-confirm-amount { padding: 14px 16px; background: var(--bg); border-radius: 10px; border: 1px solid var(--surface-2); display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
.xh-confirm-amount-label { font-size: 12px; color: var(--text-dim); }
.xh-confirm-amount-value { font-size: 20px; font-weight: 800; color: var(--accent); }
.xh-confirm-note { font-size: 11.5px; color: var(--text-dim); margin: 0 0 18px; line-height: 1.5; }
.xh-confirm-actions { display: flex; gap: 10px; }
.xh-confirm-cancel, .xh-confirm-go { flex: 1; padding: 12px 0; border-radius: 8px; border: none; font: inherit; font-size: 13.5px; font-weight: 800; cursor: pointer; }
.xh-confirm-cancel { background: var(--bg); color: var(--text); border: 1px solid var(--surface-2); }
.xh-confirm-cancel:hover { background: var(--surface-2); }
.xh-confirm-go { background: linear-gradient(135deg, #116f43, #1aa46a); color: #fff; }
.xh-confirm-go:hover { opacity: .9; }
.xh-fraction-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 14px; }
.xh-fraction-chip { padding: 9px 0; border-radius: 8px; border: 1px solid var(--surface-2); background: var(--bg); color: var(--text); font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; transition: all .15s; }
.xh-fraction-chip:hover { border-color: var(--accent); }
.xh-fraction-chip.active { background: var(--accent); color: var(--bg); border-color: var(--accent); }
.xh-confirm-residual { padding: 12px 14px; border-radius: 10px; border: 1px solid var(--surface-2); background: var(--bg); display: flex; justify-content: space-between; align-items: center; font-size: 12px; margin-bottom: 12px; gap: 12px; }
.xh-confirm-residual-label { color: var(--text-dim); font-weight: 600; }
.xh-confirm-residual > div { text-align: right; }
.xh-confirm-residual strong { font-variant-numeric: tabular-nums; }
`;

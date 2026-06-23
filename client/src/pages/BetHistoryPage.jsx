import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchBetHistory, cashOutBet, fetchBetByCode } from '../api/betApi.js';
import { useAccount, useToast } from '../providers/AccountProvider.jsx';
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
  return b.lastCashOutOffer?.amount ?? b.cashoutOffer ?? Number((b.stake * b.totalOdds * 0.95).toFixed(2));
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

/* ─────────── BetCard (single expandable card) ─────────── */
function BetCardView({ bet, expanded, onToggle, onCashout, onRemix, onDetails, trend, copiedCode, onCopy, autoTarget, onAutoTargetChange, onAutoClear }) {
  const code = bet.bookingCode || toBookingCode(bet.id);
  const isOpen = bet.status === 'open';
  const cashOutAmount = isOpen ? computeOffer(bet) : 0;
  const head = STATUS_CONFIG[bet.status] || STATUS_CONFIG.open;
  const modeLabel = bet.mode === 'single' ? 'Single' : bet.mode === 'multiple' ? 'Multiple' : bet.mode === 'system' ? 'System' : 'Bet';
  const totalReturn = bet.status === 'won' ? Number(bet.totalReturn || bet.potentialWin || 0) : bet.status === 'cashed_out' ? Number(bet.cashOut || 0) : 0;
  const legs = bet.legs || [];
  const hasLegs = legs.length > 0;
  const isSystem = bet.mode === 'system';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12, scale: 0.98 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={`xh-card xh-card-${head.cls}${expanded ? ' is-expanded' : ''}`}
    >
      {/* ── Status bar ── */}
      <button type="button" className="xh-card-head" onClick={onToggle} aria-expanded={expanded} aria-label={`Bet ${code} - ${head.label}`}>
        <div className="xh-head-left">
          <span className="xh-status-badge" style={{ background: head.bg, color: head.color, borderColor: head.border }}>
            {head.icon} {STATUS_CONFIG[bet.status]?.label.replace('BET ', '') || bet.status?.toUpperCase()}
          </span>
          <span className="xh-mode-tag">{modeLabel}</span>
        </div>
        <div className="xh-head-right">
          <span className="xh-date">{placedAtLabel(bet.placedAt)}</span>
          <span className={`xh-chevron${expanded ? ' open' : ''}`}>
            <SvgChevronDown size={18} />
          </span>
        </div>
      </button>

      {/* ── Compact summary ── */}
      <div className="xh-card-body" onClick={onToggle}>
        {/* Booking code row */}
        <div className="xh-code-row">
          <span className="xh-code-label">Booking Code</span>
          <span className="xh-code-value">{code}</span>
          <button type="button" className="xh-code-action" onClick={(e) => { e.stopPropagation(); onCopy?.(code); }} aria-label="Copy booking code">
            {copiedCode === code ? <span className="xh-copied-tick">✓</span> : <SvgCopy size={14} />}
            <span>{copiedCode === code ? 'Copied' : 'Copy'}</span>
          </button>
          {navigator.share && (
            <button type="button" className="xh-code-action" onClick={(e) => { e.stopPropagation(); navigator.share({ title: 'My Xenbet Slip', text: `Check out my bet slip on Xenbet! Booking Code: ${code}` }).catch(() => {}); }} aria-label="Share">
              <SvgShare size={14} /> <span>Share</span>
            </button>
          )}
        </div>

        {/* Teams preview */}
        {hasLegs && (
          <div className="xh-teams-preview">
            {legs.slice(0, 3).map((l, i) => (
              <span key={i} className="xh-team-line">
                <span className="xh-team-home">{l.home}</span>
                <span className="xh-team-vs">vs</span>
                <span className="xh-team-away">{l.away}</span>
                {i < legs.length - 1 && i < 2 && <span className="xh-team-sep">|</span>}
              </span>
            ))}
            {legs.length > 3 && <span className="xh-team-more">+{legs.length - 3} more</span>}
          </div>
        )}

        {/* Stats grid */}
        <div className="xh-stats-grid">
          <div className="xh-stat">
            <span className="xh-stat-label">Stake</span>
            <span className="xh-stat-value">GHS {fmt(bet.stake)}</span>
          </div>
          <div className="xh-stat">
            <span className="xh-stat-label">Odds</span>
            <span className="xh-stat-value xh-stat-odds">{isSystem ? 'System' : Number(bet.totalOdds || 0).toFixed(2)}</span>
          </div>
          <div className="xh-stat">
            <span className="xh-stat-label">Potential Win</span>
            <span className="xh-stat-value xh-stat-pot">GHS {fmt(bet.potentialWin)}</span>
          </div>
          <div className="xh-stat">
            <span className="xh-stat-label">Selections</span>
            <span className="xh-stat-value">{legs.length}</span>
          </div>
          {(totalReturn > 0) && (
            <div className="xh-stat xh-stat-return">
              <span className="xh-stat-label">Return</span>
              <span className="xh-stat-value" style={{ color: '#16a34a' }}>GHS {fmt(totalReturn)}</span>
            </div>
          )}
        </div>

        {isSystem && (
          <div className="xh-system-row">
            <span className="xh-system-badge">{bet.systemLabel || bet.systemType || 'System'}</span>
            <span>{bet.linesCount} lines · GHS {fmt(bet.stakePerLine || 0)}/line</span>
          </div>
        )}

        {bet.status === 'cashed_out' && (
          <div className="xh-cashed-note">
            <span className="xh-cashed-icon">⟳</span>
            Cashed out for <strong>GHS {fmt(bet.cashOut)}</strong>
          </div>
        )}

        {bet.status === 'void' && (
          <div className="xh-void-note">
            This bet was voided. Stake has been refunded.
          </div>
        )}
      </div>

      {/* ── Cashout CTA ── */}
      {isOpen && cashOutAmount > 0 && (
        <div className="xh-cashout-section">
          <div className="xh-cashout-info">
            <span className="xh-cashout-label">Cashout Value</span>
            <span className="xh-cashout-amount">
              GHS {fmt(cashOutAmount)}
              {trend === 'up' && <span className="xh-trend xh-trend-up"><SvgTrendUp /> {Math.round((cashOutAmount / (bet.stake * bet.totalOdds * 0.95 || 1) - 1) * 100)}%</span>}
              {trend === 'down' && <span className="xh-trend xh-trend-down"><SvgTrendDown /> {Math.round((1 - cashOutAmount / (bet.stake * bet.totalOdds * 0.95 || 1)) * 100)}%</span>}
            </span>
          </div>
          <button type="button" className="xh-cashout-btn" onClick={(e) => { e.stopPropagation(); onCashout?.(bet); }}>
            Cash Out
          </button>
        </div>
      )}

      {/* ── Auto cash-out ── */}
      {isOpen && (
        <div className="xh-auto-row">
          <label className="xh-auto-label">Auto cash-out at</label>
          <span className="xh-auto-prefix">GHS</span>
          <input type="number" inputMode="decimal" min="0" step="1" placeholder="e.g. 400" value={autoTarget || ''} onChange={(e) => onAutoTargetChange?.(bet.id, e.target.value)} className="xh-auto-input" aria-label="Auto cash-out target" />
          {autoTarget ? <button type="button" className="xh-auto-clear" onClick={(e) => { e.stopPropagation(); onAutoClear?.(bet.id); }}>Clear</button> : null}
        </div>
      )}

      {/* ── Expanded legs ── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="legs"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="xh-expand-wrap"
          >
            <div className="xh-expand-inner">
              {legs.map((l, i) => {
                const pick = getPickName(l.outcome);
                const market = getMarketName(l.market);
                const lr = bet.legsResolved?.[i];
                const resIndicator = lr ? (lr.won === true ? 'Won' : lr.won === false ? 'Lost' : 'Void') : null;
                const scoreStr = lr && lr.scoreHome != null && lr.scoreAway != null ? `${lr.scoreHome}:${lr.scoreAway}` : null;
                return (
                  <div key={i} className="xh-leg-full">
                    <div className="xh-leg-left">
                      <span className="xh-leg-num">{String(i + 1).padStart(2, '0')}</span>
                    </div>
                    <div className="xh-leg-main">
                      <div className="xh-leg-teams">
                        <span className="xh-leg-home">{l.home}</span>
                        <span className="xh-leg-vs-text">vs</span>
                        <span className="xh-leg-away">{l.away}</span>
                        {scoreStr && <span className="xh-leg-score">FT {scoreStr}</span>}
                      </div>
                      <div className="xh-leg-details-row">
                        <span className="xh-leg-market-name">{market}</span>
                        <span className="xh-leg-sep">·</span>
                        <span className="xh-leg-pick">{pick}</span>
                        <span className="xh-leg-sep">·</span>
                        <span className="xh-leg-odds">@{Number(l.odds).toFixed(2)}</span>
                      </div>
                      {resIndicator && (
                        <span className={`xh-leg-result xh-leg-result-${resIndicator.toLowerCase()}`}>
                          {resIndicator === 'Won' ? '✓ Won' : resIndicator === 'Lost' ? '✕ Lost' : '⚪ Void'}
                        </span>
                      )}
                      {bet.status === 'open' && l.matchTime && (
                        <span className="xh-leg-time">{l.matchTime}</span>
                      )}
                    </div>
                  </div>
                );
              })}

              <div className="xh-expand-actions">
                <button type="button" className="xh-action-btn xh-action-rebet" onClick={(e) => { e.stopPropagation(); onRemix?.(bet); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
                  Remix
                </button>
                <button type="button" className="xh-action-btn xh-action-details" onClick={(e) => { e.stopPropagation(); onDetails?.(bet); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                  Full Details
                </button>
                {navigator.share && (
                  <button type="button" className="xh-action-btn xh-action-share" onClick={(e) => { e.stopPropagation(); navigator.share({ title: 'My Xenbet Ticket', text: `Check out my bet on Xenbet!\nCode: ${code}\nStake: GHS ${fmt(bet.stake)}\nPotential Win: GHS ${fmt(bet.potentialWin)}` }).catch(() => {}); }}>
                    <SvgShare size={14} /> Share
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
  const cashingOutRef = useRef({});

  // Cashout confirm dialog
  const [confirmCashOut, setConfirmCashOut] = useState(null);
  const [confirmFraction, setConfirmFraction] = useState(1);

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
  const performCashOut = useCallback(async (id, expectedAmount, fraction = 1) => {
    try {
      const res = await cashOutBet(id, expectedAmount, fraction);
      const cash = res.bet.cashOut || 0;
      const partial = fraction != null && fraction > 0 && fraction < 1;
      adjustBalance(cash, partial ? `Partial cash-out: GHS ${fmt(cash)}. Remainder still in play.` : `Cashed out: GHS ${fmt(cash)}.`);
      showWin({ ...res.bet, status: 'cashed_out', settledAt: res.bet.settledAt || new Date().toISOString() });
      setAutoTargets(prev => {
        if (prev[id] == null) return prev;
        const { [id]: _, ...rest } = prev;
        saveAutoTargets(rest);
        return rest;
      });
      await refresh();
    } catch (e) {
      toast(e.message || 'Cash-out unavailable.', 'error');
    }
  }, [adjustBalance, refresh, toast, showWin]);

  useEffect(() => {
    for (const b of openBets) {
      const target = Number(autoTargets[b.id] || 0);
      if (target <= 0) continue;
      const cur = computeOffer(b);
      if (cur >= target && !autoFiredRef.current[b.id] && !cashingOutRef.current[b.id]) {
        autoFiredRef.current[b.id] = true;
        cashingOutRef.current[b.id] = true;
        toast(`Auto cash-out triggered at GHS ${fmt(cur)}.`);
        performCashOut(b.id, cur).finally(() => { cashingOutRef.current[b.id] = false; });
      }
    }
  }, [openBets, autoTargets, performCashOut, toast]);

  const onCashOut = (b) => {
    const amount = computeOffer(b);
    const code = b.bookingCode || toBookingCode(b.id);
    setConfirmCashOut({ id: b.id, amount, code, bet: b });
    setConfirmFraction(1);
  };

  const confirmAndCashOut = async () => {
    if (!confirmCashOut) return;
    const { id, amount } = confirmCashOut;
    const f = confirmFraction;
    setConfirmCashOut(null);
    await performCashOut(id, amount, f);
  };

  const setAutoTarget = (betId, raw) => {
    const v = Number(String(raw).replace(/,/g, ''));
    setAutoTargets(prev => {
      const next = { ...prev };
      if (!Number.isFinite(v) || v <= 0) delete next[betId];
      else next[betId] = v;
      saveAutoTargets(next);
      return next;
    });
    autoFiredRef.current[betId] = false;
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
        {/* ── Header ── */}
        <header className="xh-header">
          <div>
            <h1 className="xh-title">My Bets</h1>
            <p className="xh-sub">Track your open tickets, cashout opportunities, and full bet history.</p>
          </div>
          <div className="xh-header-actions">
            <div className="xh-load-code">
              <input type="text" placeholder="Enter booking code…" value={loadCodeInput} onChange={e => setLoadCodeInput(e.target.value.toUpperCase())} onKeyDown={e => { if (e.key === 'Enter' && loadCodeInput.trim()) { (async () => { setLoadCodeBusy(true); try { const data = await fetchBetByCode(loadCodeInput.trim()); if (data?.bet) { setActiveTicket(data.bet); setLoadCodeInput(''); toast('Booking code loaded!', 'success'); } else { toast('Bet not found for that code.', 'error'); } } catch (e) { toast(e.message || 'Could not load booking code.', 'error'); } finally { setLoadCodeBusy(false); } })(); } }} className="xh-load-input" disabled={loadCodeBusy} />
              <button type="button" className="xh-load-btn" disabled={loadCodeBusy || !loadCodeInput.trim()} onClick={async () => { setLoadCodeBusy(true); try { const data = await fetchBetByCode(loadCodeInput.trim()); if (data?.bet) { setActiveTicket(data.bet); setLoadCodeInput(''); toast('Booking code loaded!', 'success'); } else { toast('Bet not found for that code.', 'error'); } } catch (e) { toast(e.message || 'Could not load booking code.', 'error'); } finally { setLoadCodeBusy(false); } }}>{loadCodeBusy ? '…' : 'Load'}</button>
            </div>
            <div className="xh-summary-cards">
              <div className="xh-summary-card">
                <span className="xh-summary-label">Open</span>
                <strong className="xh-summary-value">{totals.openCount}</strong>
              </div>
              <div className="xh-summary-card">
                <span className="xh-summary-label">Stake at Risk</span>
                <strong className="xh-summary-value">GHS {fmt(totals.openStake)}</strong>
              </div>
              <div className="xh-summary-card xh-summary-accent">
                <span className="xh-summary-label">Potential Win</span>
                <strong className="xh-summary-value">GHS {fmt(totals.openWin)}</strong>
              </div>
            </div>
          </div>
        </header>

        {/* ── Search bar ── */}
        <div className="xh-search-bar">
          <span className="xh-search-icon"><SvgSearch size={18} /></span>
          <input type="text" className="xh-search-input" placeholder="Search by booking code, team name..." value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setVisibleCount(PAGE_SIZE); }} aria-label="Search bets" />
          {searchQuery && <button type="button" className="xh-search-clear" onClick={() => { setSearchQuery(''); setVisibleCount(PAGE_SIZE); }} aria-label="Clear search">✕</button>}
        </div>

        {/* ── Tab bar ── */}
        <div className="xh-tabs" role="tablist">
          {TABS.map(t => {
            const count = t.key === 'open' ? totals.openCount : t.key === 'cashout' ? totals.cashoutableCount : totals.settledCount;
            return (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`xh-tab${tab === t.key ? ' active' : ''}`} onClick={() => { setTab(t.key); setStatusFilter('all'); setVisibleCount(PAGE_SIZE); }}>
                {t.label}
                <span className="xh-tab-count">{count}</span>
              </button>
            );
          })}
        </div>

        {/* ── Status filter pills ── */}
        <div className="xh-filter-pills">
          {STATUS_FILTERS.map(f => {
            const hidden = (tab === 'open' && f.key !== 'all' && f.key !== 'open') || (tab === 'cashout' && f.key !== 'all');
            if (hidden) return null;
            return (
              <button key={f.key} type="button" className={`xh-pill${statusFilter === f.key ? ' active' : ''}`} onClick={() => { setStatusFilter(f.key); setVisibleCount(PAGE_SIZE); }}>
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

      {/* ── Cashout confirm dialog ── */}
      {confirmCashOut && (() => {
        const isSystem = confirmCashOut.bet?.mode === 'system';
        const payoutNow = Number((confirmCashOut.amount * confirmFraction).toFixed(2));
        const remainStake = Number((confirmCashOut.bet.stake * (1 - confirmFraction)).toFixed(2));
        const remainPotWin = Number((remainStake * confirmCashOut.bet.totalOdds * 1.08).toFixed(2));
        const isPartial = confirmFraction > 0 && confirmFraction < 1;
        const fractionOptions = isSystem ? [1] : [0.25, 0.5, 0.75, 1];
        return (
          <div className="xh-confirm-overlay" role="dialog" aria-modal="true" onClick={() => setConfirmCashOut(null)}>
            <div className="xh-confirm-card" onClick={e => e.stopPropagation()}>
              <h3>Confirm cash-out</h3>
              <p className="xh-confirm-sub">Booking <code>{confirmCashOut.code}</code></p>
              {!isSystem && (
                <div className="xh-fraction-row">
                  {fractionOptions.map(f => (
                    <button key={f} type="button" className={`xh-fraction-chip${confirmFraction === f ? ' active' : ''}`} onClick={() => setConfirmFraction(f)}>
                      {f === 1 ? 'Full' : `${Math.round(f * 100)}%`}
                    </button>
                  ))}
                </div>
              )}
              <div className="xh-confirm-amount">
                <span className="xh-confirm-amount-label">You'll receive</span>
                <strong className="xh-confirm-amount-value">GHS {fmt(payoutNow)}</strong>
              </div>
              {isPartial && (
                <div className="xh-confirm-residual">
                  <span className="xh-confirm-residual-label">Remaining ticket</span>
                  <div>
                    <div>Stake <strong>GHS {fmt(remainStake)}</strong></div>
                    <div>Potential win <strong>GHS {fmt(remainPotWin)}</strong></div>
                  </div>
                </div>
              )}
              <p className="xh-confirm-note">The offer can move between now and submission. We'll reject the cash-out if it drifts more than a few percent.</p>
              <div className="xh-confirm-actions">
                <button type="button" className="xh-confirm-cancel" onClick={() => setConfirmCashOut(null)}>Cancel</button>
                <button type="button" className="xh-confirm-go" onClick={confirmAndCashOut}>
                  {isPartial ? `Cash out ${Math.round(confirmFraction * 100)}%` : 'Confirm cash-out'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
.xh-page { padding: 28px 0 60px; min-height: calc(100vh - 200px); }
.xh-shell { max-width: 980px; margin: 0 auto; padding: 0 20px; display: flex; flex-direction: column; gap: 16px; }

/* ── Header ── */
.xh-header { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; flex-wrap: wrap; }
.xh-title { margin: 0; font-size: 28px; font-weight: 900; letter-spacing: -.02em; }
.xh-sub { margin: 4px 0 0; color: var(--text-soft); font-size: 13.5px; }
.xh-header-actions { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }

/* ── Load code ── */
.xh-load-code { display: flex; gap: 6px; align-items: center; background: var(--surface); border: 1px solid var(--surface-2); border-radius: 12px; padding: 6px 6px 6px 14px; }
.xh-load-input { background: transparent; border: none; color: var(--text); font: inherit; font-size: 13px; font-weight: 600; outline: none; width: 150px; letter-spacing: .05em; }
.xh-load-input::placeholder { color: var(--text-dim); font-weight: 500; letter-spacing: 0; }
.xh-load-input:disabled { opacity: .5; }
.xh-load-btn { padding: 8px 16px; border-radius: 8px; border: none; background: var(--accent); color: var(--text-inv); font-weight: 800; font-size: 12px; cursor: pointer; transition: opacity .15s; font-family: inherit; }
.xh-load-btn:hover { opacity: .85; }
.xh-load-btn:disabled { opacity: .4; cursor: not-allowed; }

/* ── Summary cards ── */
.xh-summary-cards { display: flex; gap: 8px; flex-wrap: wrap; }
.xh-summary-card { background: var(--surface); border: 1px solid var(--surface-2); border-radius: 12px; padding: 10px 14px; min-width: 110px; display: flex; flex-direction: column; gap: 2px; }
.xh-summary-label { font-size: 10px; letter-spacing: .12em; color: var(--text-dim); text-transform: uppercase; }
.xh-summary-value { font-size: 16px; font-weight: 800; font-variant-numeric: tabular-nums; }
.xh-summary-accent .xh-summary-value { color: var(--accent); }

/* ── Search bar ── */
.xh-search-bar { display: flex; align-items: center; gap: 8px; background: var(--surface); border: 1px solid var(--surface-2); border-radius: 12px; padding: 10px 14px; transition: border-color .2s; }
.xh-search-bar:focus-within { border-color: var(--accent); }
.xh-search-icon { color: var(--text-dim); display: flex; flex-shrink: 0; }
.xh-search-input { flex: 1; background: transparent; border: none; color: var(--text); font: inherit; font-size: 14px; outline: none; min-width: 0; }
.xh-search-input::placeholder { color: var(--text-dim); }
.xh-search-clear { background: none; border: none; color: var(--text-dim); cursor: pointer; font-size: 16px; padding: 0 4px; line-height: 1; }
.xh-search-clear:hover { color: var(--text); }

/* ── Tabs ── */
.xh-tabs { display: flex; gap: 4px; background: var(--surface); padding: 4px; border-radius: 12px; border: 1px solid var(--surface-2); align-self: flex-start; flex-wrap: wrap; }
.xh-tab { padding: 10px 16px; border-radius: 8px; background: transparent; border: none; color: var(--text-soft); font-weight: 700; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; transition: background .15s ease, color .15s ease; font-family: inherit; white-space: nowrap; }
.xh-tab:hover { color: var(--text); }
.xh-tab.active { background: var(--surface-2); color: var(--accent); }
.xh-tab-count { font-size: 11px; font-weight: 800; background: var(--surface-2); color: var(--text-soft); padding: 2px 8px; border-radius: 999px; min-width: 20px; text-align: center; }
.xh-tab.active .xh-tab-count { background: var(--surface); color: var(--accent); }

/* ── Filter pills ── */
.xh-filter-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.xh-pill { padding: 6px 14px; border-radius: 999px; border: 1px solid var(--surface-2); background: transparent; color: var(--text-soft); font-size: 12px; font-weight: 600; cursor: pointer; transition: all .15s; font-family: inherit; white-space: nowrap; }
.xh-pill:hover { border-color: var(--accent); color: var(--text); }
.xh-pill.active { background: var(--accent); color: var(--text-inv); border-color: var(--accent); }

/* ── Bet list ── */
.xh-list { display: flex; flex-direction: column; gap: 12px; }

/* ── Bet card ── */
.xh-card { background: var(--surface); border: 1px solid var(--surface-2); border-radius: 16px; overflow: hidden; transition: border-color .2s, box-shadow .2s; }
.xh-card:hover { border-color: var(--accent); }
.xh-card:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
.xh-card-won { border-color: rgba(22,163,74,.3); }
.xh-card-lost { border-color: rgba(229,57,53,.3); }
.xh-card-cashed { border-color: rgba(20,184,166,.3); }
.xh-card-void { border-color: rgba(245,166,35,.2); }
.xh-card-open { border-color: rgba(79,139,255,.2); }
.xh-card.is-expanded { border-color: var(--accent); box-shadow: 0 4px 24px rgba(0,0,0,.12); }

/* ── Card head (status bar) ── */
.xh-card-head { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 12px 16px; border: none; background: transparent; cursor: pointer; font-family: inherit; text-align: left; gap: 12px; transition: background .15s; }
.xh-card-head:hover { background: rgba(255,255,255,.02); }
.xh-head-left { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.xh-head-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.xh-date { font-size: 12px; color: var(--text-dim); font-weight: 500; white-space: nowrap; }
.xh-chevron { display: flex; color: var(--text-dim); transition: transform .25s ease; }
.xh-chevron.open { transform: rotate(180deg); color: var(--accent); }

.xh-status-badge { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; letter-spacing: .03em; border: 1px solid; white-space: nowrap; }
.xh-mode-tag { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; background: var(--surface-2); color: var(--text-soft); padding: 4px 8px; border-radius: 6px; font-weight: 700; }

/* ── Card body ── */
.xh-card-body { padding: 0 16px 12px; cursor: pointer; display: flex; flex-direction: column; gap: 10px; }

/* ── Booking code row ── */
.xh-code-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 12px; border-radius: 10px; background: var(--surface-2); border: 1px dashed rgba(106,208,255,.25); }
.xh-code-label { font-size: 10px; letter-spacing: .12em; color: var(--text-dim); text-transform: uppercase; font-weight: 700; }
.xh-code-value { font-family: 'JetBrains Mono', 'Roboto Mono', monospace; font-size: 14px; letter-spacing: .06em; color: var(--accent-cool); font-weight: 700; }
.xh-code-action { display: inline-flex; align-items: center; gap: 4px; background: var(--surface); border: 1px solid var(--surface-2); border-radius: 6px; color: var(--text-soft); padding: 5px 10px; font-size: 11px; font-weight: 700; cursor: pointer; transition: all .15s; font-family: inherit; }
.xh-code-action:hover { border-color: var(--accent); color: var(--accent); }
.xh-copied-tick { color: var(--accent); font-weight: 800; font-size: 13px; }

/* ── Teams preview ── */
.xh-teams-preview { display: flex; flex-wrap: wrap; gap: 6px 12px; font-size: 13px; color: var(--text); }
.xh-team-line { display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.xh-team-home { font-weight: 600; }
.xh-team-vs { color: var(--text-dim); font-size: 11px; text-transform: uppercase; font-weight: 500; }
.xh-team-away { font-weight: 600; }
.xh-team-sep { color: var(--text-dim); opacity: .3; margin: 0 2px; }
.xh-team-more { color: var(--text-dim); font-size: 12px; font-weight: 600; }

/* ── Stats grid ── */
.xh-stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 6px; background: var(--surface-2); padding: 12px; border-radius: 12px; }
.xh-stat { display: flex; flex-direction: column; gap: 3px; }
.xh-stat-label { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: var(--text-dim); font-weight: 600; }
.xh-stat-value { font-size: 14px; font-weight: 800; font-variant-numeric: tabular-nums; }
.xh-stat-odds { color: var(--accent-cool); }
.xh-stat-pot { color: var(--accent-warm); }
.xh-stat-return { grid-column: 1 / -1; }

/* ── System info ── */
.xh-system-row { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-soft); padding: 6px 10px; background: var(--surface-2); border-radius: 8px; }
.xh-system-badge { font-size: 10px; font-weight: 800; letter-spacing: .08em; padding: 3px 8px; border-radius: 6px; background: rgba(197,255,61,.12); color: var(--accent); }

/* ── Status notes ── */
.xh-cashed-note { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-soft); padding: 8px 12px; background: rgba(20,184,166,.08); border-radius: 8px; }
.xh-cashed-icon { font-size: 14px; }
.xh-cashed-note strong { color: #14b8a6; }
.xh-void-note { font-size: 12.5px; color: var(--text-dim); padding: 8px 12px; background: rgba(245,166,35,.08); border-radius: 8px; }

/* ── Cashout section ── */
.xh-cashout-section { padding: 0 16px 12px; display: flex; flex-direction: column; gap: 8px; }
.xh-cashout-info { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: rgba(255,181,71,.06); border: 1px solid rgba(255,181,71,.15); border-radius: 10px; }
.xh-cashout-label { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--text-dim); font-weight: 700; }
.xh-cashout-amount { font-size: 20px; font-weight: 900; color: var(--accent-warm); display: flex; align-items: center; gap: 8px; font-variant-numeric: tabular-nums; }
.xh-trend { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; font-weight: 800; padding: 2px 6px; border-radius: 6px; }
.xh-trend-up { background: rgba(22,163,74,.15); color: #16a34a; }
.xh-trend-down { background: rgba(229,57,53,.15); color: #e53935; }
.xh-cashout-btn { width: 100%; padding: 14px; border: none; border-radius: 10px; background: linear-gradient(135deg, var(--accent-warm), #f6a200); color: #1a1100; font-weight: 800; font-size: 14px; font-family: inherit; cursor: pointer; transition: transform .15s, box-shadow .15s; }
.xh-cashout-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 18px rgba(255,181,71,.35); }

/* ── Auto cash-out ── */
.xh-auto-row { display: flex; align-items: center; gap: 8px; padding: 0 16px 14px; flex-wrap: wrap; }
.xh-auto-label { font-size: 11px; letter-spacing: .06em; color: var(--text-dim); text-transform: uppercase; font-weight: 700; }
.xh-auto-prefix { font-size: 11px; color: var(--text-dim); font-weight: 600; }
.xh-auto-input { flex: 1; min-width: 80px; padding: 7px 10px; border-radius: 8px; border: 1px solid var(--surface-2); background: var(--bg); color: var(--text); font: inherit; font-size: 13px; font-variant-numeric: tabular-nums; outline: none; }
.xh-auto-input:focus { border-color: var(--accent); }
.xh-auto-clear { padding: 6px 10px; border-radius: 8px; border: none; background: transparent; color: var(--text-dim); font: inherit; font-size: 11px; font-weight: 700; cursor: pointer; }
.xh-auto-clear:hover { color: var(--text); }

/* ── Expanded legs ── */
.xh-expand-wrap { overflow: hidden; }
.xh-expand-inner { border-top: 1px solid var(--surface-2); padding: 4px 16px 14px; display: flex; flex-direction: column; gap: 2px; }
.xh-leg-full { display: flex; gap: 10px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,.04); }
.xh-leg-full:last-child { border-bottom: none; }
.xh-leg-left { flex-shrink: 0; padding-top: 2px; }
.xh-leg-num { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--text-dim); letter-spacing: .1em; font-weight: 700; }
.xh-leg-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.xh-leg-teams { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 14px; font-weight: 700; color: var(--text); line-height: 1.3; }
.xh-leg-home { font-weight: 700; }
.xh-leg-vs-text { color: var(--text-dim); font-size: 12px; font-weight: 500; text-transform: uppercase; }
.xh-leg-away { font-weight: 700; }
.xh-leg-score { font-size: 11px; color: var(--text-soft); font-weight: 600; background: var(--surface-2); padding: 2px 8px; border-radius: 6px; }
.xh-leg-details-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 12.5px; }
.xh-leg-market-name { background: rgba(255,255,255,.05); color: var(--text-soft); padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 11px; }
.xh-leg-sep { color: var(--text-dim); opacity: .3; }
.xh-leg-pick { font-weight: 700; color: var(--text); }
.xh-leg-odds { font-family: 'JetBrains Mono', monospace; color: var(--accent); font-weight: 700; font-variant-numeric: tabular-nums; }
.xh-leg-result { display: inline-block; font-size: 10px; font-weight: 800; letter-spacing: .04em; padding: 2px 10px; border-radius: 10px; align-self: flex-start; }
.xh-leg-result-won { background: rgba(0,200,83,.15); color: #00c853; }
.xh-leg-result-lost { background: rgba(255,23,68,.15); color: #ff1744; }
.xh-leg-result-void { background: rgba(158,158,158,.15); color: #9e9e9e; }
.xh-leg-time { font-size: 11px; color: var(--text-dim); }

/* ── Expanded actions ── */
.xh-expand-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,.04); }
.xh-action-btn { display: inline-flex; align-items: center; gap: 5px; padding: 8px 14px; border-radius: 8px; border: 1px solid var(--surface-2); background: var(--surface); color: var(--text); font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit; transition: all .15s; }
.xh-action-btn:hover { border-color: var(--accent); color: var(--accent); }
.xh-action-rebet:hover { border-color: #16a34a; color: #16a34a; }
.xh-action-details:hover { border-color: var(--accent-cool); color: var(--accent-cool); }
.xh-action-share:hover { border-color: var(--accent-warm); color: var(--accent-warm); }

/* ── Skeleton ── */
.xh-skeleton-wrap { display: flex; flex-direction: column; gap: 12px; }
.xh-skeleton { background: var(--surface); border: 1px solid var(--surface-2); border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.xh-skel-head { height: 20px; width: 40%; background: var(--surface-2); border-radius: 8px; animation: xhShimmer 1.5s infinite; }
.xh-skel-body { display: flex; flex-direction: column; gap: 8px; }
.xh-skel-line { height: 14px; background: var(--surface-2); border-radius: 6px; animation: xhShimmer 1.5s infinite; }
.xh-skel-footer { height: 36px; background: var(--surface-2); border-radius: 10px; animation: xhShimmer 1.5s infinite; }
@keyframes xhShimmer { 0% { opacity: .6; } 50% { opacity: 1; } 100% { opacity: .6; } }

/* ── State cards ── */
.xh-state-card { background: var(--surface); border: 1px solid var(--surface-2); border-radius: 16px; padding: 48px 24px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 12px; }
.xh-state-icon { opacity: .5; }
.xh-state-title { margin: 0; font-size: 18px; font-weight: 800; }
.xh-state-desc { margin: 0; color: var(--text-soft); font-size: 14px; max-width: 360px; line-height: 1.5; }
.xh-state-btn { padding: 10px 24px; border-radius: 10px; border: none; background: var(--accent); color: var(--text-inv); font-weight: 800; font-size: 13px; cursor: pointer; font-family: inherit; transition: opacity .15s; }
.xh-state-btn:hover { opacity: .85; }

/* ── Load more ── */
.xh-load-more-wrap { display: flex; justify-content: center; padding: 8px 0; }
.xh-load-more { padding: 12px 32px; border-radius: 10px; border: 1px solid var(--surface-2); background: var(--surface); color: var(--text); font-weight: 700; font-size: 13px; cursor: pointer; font-family: inherit; transition: all .15s; }
.xh-load-more:hover { border-color: var(--accent); color: var(--accent); }
.xh-end-note { text-align: center; color: var(--text-dim); font-size: 12px; padding: 8px 0; }

/* ── Refresh indicator ── */
.xh-refresh-indicator { display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--text-dim); font-size: 12px; padding: 4px 0; }
.xh-spinner { width: 14px; height: 14px; border: 2px solid var(--surface-2); border-top-color: var(--accent); border-radius: 50%; animation: xhSpin .6s linear infinite; }
@keyframes xhSpin { to { transform: rotate(360deg); } }

/* ── Cashout confirm ── */
.xh-confirm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: grid; place-items: center; z-index: 9999; padding: 16px; animation: xhFade .18s ease-out both; }
@keyframes xhFade { from { opacity: 0; } to { opacity: 1; } }
.xh-confirm-card { background: var(--surface); border: 1px solid var(--surface-2); border-radius: 16px; padding: 24px; max-width: 380px; width: 100%; animation: xhPop .22s cubic-bezier(.2,1.3,.4,1) both; }
@keyframes xhPop { from { transform: scale(.92); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.xh-confirm-card h3 { margin: 0 0 4px; font-size: 20px; font-weight: 800; letter-spacing: -.01em; }
.xh-confirm-sub { margin: 0 0 16px; font-size: 13px; color: var(--text-dim); }
.xh-confirm-sub code { background: var(--bg); padding: 2px 6px; border-radius: 6px; font-size: 12px; }
.xh-confirm-amount { padding: 14px 16px; background: var(--bg); border-radius: 12px; border: 1px solid var(--surface-2); display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
.xh-confirm-amount-label { font-size: 12px; color: var(--text-dim); }
.xh-confirm-amount-value { font-size: 20px; font-weight: 800; color: var(--accent); }
.xh-confirm-note { font-size: 11.5px; color: var(--text-dim); margin: 0 0 18px; line-height: 1.5; }
.xh-confirm-actions { display: flex; gap: 10px; }
.xh-confirm-cancel, .xh-confirm-go { flex: 1; padding: 12px 0; border-radius: 10px; border: none; font: inherit; font-size: 13.5px; font-weight: 800; cursor: pointer; }
.xh-confirm-cancel { background: var(--bg); color: var(--text); border: 1px solid var(--surface-2); }
.xh-confirm-cancel:hover { background: var(--surface-2); }
.xh-confirm-go { background: #116f43; color: #fff; }
.xh-confirm-go:hover { background: #1eaf6a; }
.xh-fraction-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 14px; }
.xh-fraction-chip { padding: 9px 0; border-radius: 9px; border: 1px solid var(--surface-2); background: var(--bg); color: var(--text); font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; transition: all .15s; }
.xh-fraction-chip:hover { border-color: var(--accent); }
.xh-fraction-chip.active { background: var(--accent); color: var(--bg); border-color: var(--accent); }
.xh-confirm-residual { padding: 12px 14px; border-radius: 12px; border: 1px solid var(--surface-2); background: var(--bg); display: flex; justify-content: space-between; align-items: center; font-size: 12px; margin-bottom: 12px; gap: 12px; }
.xh-confirm-residual-label { color: var(--text-dim); font-weight: 600; }
.xh-confirm-residual > div { text-align: right; }
.xh-confirm-residual strong { font-variant-numeric: tabular-nums; }

/* ── Responsive ── */
@media (max-width: 760px) {
  .xh-shell { padding: 0 12px; gap: 12px; }
  .xh-header { flex-direction: column; align-items: stretch; gap: 12px; }
  .xh-title { font-size: 22px; }
  .xh-header-actions { flex-direction: column; align-items: stretch; width: 100%; }
  .xh-load-code { width: 100%; }
  .xh-load-input { flex: 1; width: auto; }
  .xh-summary-cards { display: grid; grid-template-columns: repeat(3, 1fr); }
  .xh-summary-card { min-width: 0; padding: 8px 10px; }
  .xh-summary-value { font-size: 14px; }
  .xh-tabs { align-self: stretch; }
  .xh-tab { flex: 1; justify-content: center; padding: 10px 8px; font-size: 12px; }
  .xh-stats-grid { grid-template-columns: repeat(2, 1fr); }
  .xh-code-row { flex-wrap: wrap; }
  .xh-code-value { font-size: 13px; }
  .xh-teams-preview { font-size: 12px; }
  .xh-card-head { padding: 10px 12px; }
  .xh-card-body { padding: 0 12px 10px; }
  .xh-cashout-section { padding: 0 12px 10px; }
  .xh-auto-row { padding: 0 12px 12px; }
  .xh-expand-inner { padding: 4px 12px 12px; }
  .xh-leg-teams { font-size: 13px; }
}

@media (max-width: 480px) {
  .xh-summary-cards { gap: 6px; }
  .xh-summary-card { padding: 6px 8px; }
  .xh-summary-value { font-size: 13px; }
  .xh-tab { font-size: 11px; padding: 8px 6px; }
  .xh-tab-count { font-size: 10px; padding: 1px 6px; min-width: 16px; }
  .xh-filter-pills { gap: 4px; }
  .xh-pill { padding: 5px 10px; font-size: 11px; }
  .xh-stats-grid { grid-template-columns: repeat(2, 1fr); gap: 4px; padding: 8px; }
  .xh-stat-value { font-size: 13px; }
  .xh-cashout-amount { font-size: 18px; }
}
`;

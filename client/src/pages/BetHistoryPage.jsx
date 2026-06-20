import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchBetHistory, cashOutBet, fetchBetByCode } from '../api/betApi.js';
import { useAccount, useToast } from '../providers/AccountProvider.jsx';
import { toBookingCode } from '../components/BetSuccessModal.jsx';

const AUTO_TARGETS_KEY = 'bv_auto_cashout_targets';

function loadAutoTargets() {
  if (typeof localStorage === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(AUTO_TARGETS_KEY) || '{}');
  } catch { return {}; }
}

function saveAutoTargets(map) {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(AUTO_TARGETS_KEY, JSON.stringify(map)); } catch {/* ignore */}
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

const STATUS_LABEL = {
  open: 'OPEN',
  won: 'WON',
  lost: 'LOST',
  cashed_out: 'CASHED OUT',
  void: 'VOID',
};

function dayMonth(iso) {
  if (!iso) return { day: '—', month: '' };
  const d = new Date(iso);
  return {
    day: String(d.getDate()),
    month: d.toLocaleDateString('en-GH', { month: 'short' }),
  };
}

const HISTORY_HEAD_LABEL = {
  won: { label: 'Won',  cls: 'won',  icon: '🏆' },
  lost: { label: 'Lost', cls: 'lost', icon: '' },
  cashed_out: { label: 'Cashed Out', cls: 'cashed', icon: '✓' },
  void: { label: 'Void', cls: 'void', icon: '' },
  open: { label: 'Open', cls: 'open', icon: '' },
};

function HistoryBetCard({ bet, onRemix, onOpen, expanded, onToggle }) {
  const { day, month } = dayMonth(bet.settledAt || bet.placedAt);
  const head = HISTORY_HEAD_LABEL[bet.status] || HISTORY_HEAD_LABEL.open;
  const modeLabel = bet.mode === 'single' ? 'Single' : bet.mode === 'multiple' ? 'Multiple' : bet.mode === 'system' ? 'System' : (bet.mode || 'Bet');
  const legs = bet.legs || [];
  // When expanded, render every leg with full detail; collapsed keeps the
  // SportyBet-style preview of the first 3 + "(and N other matches)".
  const visibleLegs = expanded ? legs : legs.slice(0, 3);
  const extraLegs = expanded ? 0 : Math.max(0, legs.length - visibleLegs.length);
  const totalReturn = bet.status === 'won'
    ? Number(bet.totalReturn || bet.potentialWin || 0)
    : bet.status === 'cashed_out'
      ? Number(bet.cashOut || 0)
      : 0;
  const totalOdds = Number(bet.totalOdds || 0);

  const handleToggle = () => onToggle?.();

  return (
    <li
      className={`bh-hcard bh-hcard-${head.cls}${expanded ? ' is-expanded' : ''}`}
      onClick={handleToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleToggle(); } }}
      aria-expanded={expanded}
    >
      <aside className="bh-hdate" aria-hidden>
        <span className="bh-hdate-day">{day}</span>
        <span className="bh-hdate-month">{month}</span>
      </aside>

      <div className="bh-hbody">
        <header className={`bh-hhead bh-hhead-${head.cls}`}>
          <span className="bh-hmode">{modeLabel}</span>
          <span className="bh-hstatus">
            {head.icon && <span className="bh-hstatus-icon" aria-hidden>{head.icon}</span>}
            {head.label}
            <span
              className="bh-hstatus-chevron"
              aria-hidden
              style={{
                transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
                display: 'inline-block',
              }}
            >›</span>
          </span>
        </header>

        <dl className="bh-hstats">
          <div>
            <dt>Stake</dt>
            <dd>GHS {fmt(bet.stake)}</dd>
          </div>
          <div>
            <dt>Total Return</dt>
            <dd className={totalReturn > 0 ? 'is-positive' : ''}>GHS {fmt(totalReturn)}</dd>
          </div>
          {expanded && (
            <>
              <div>
                <dt>Total Odds</dt>
                <dd className="bh-hodds">{totalOdds.toFixed(2)}</dd>
              </div>
              {totalReturn > 0 && bet.stake > 0 && (() => {
                const profit = totalReturn - Number(bet.stake);
                const cls = profit >= 0 ? 'is-positive' : 'is-negative';
                const sign = profit >= 0 ? '+' : '';
                return (
                  <div>
                    <dt>Profit</dt>
                    <dd className={cls}>{sign}GHS {fmt(Math.abs(profit))}</dd>
                  </div>
                );
              })()}
            </>
          )}
        </dl>

        {visibleLegs.length > 0 && !expanded && (
          <ul className="bh-hlegs">
            {visibleLegs.map((l, i) => (
              <li key={i}>{l.home} v {l.away}</li>
            ))}
            {extraLegs > 0 && (
              <li className="bh-hlegs-more">…(and {extraLegs} other match{extraLegs === 1 ? '' : 'es'})</li>
            )}
          </ul>
        )}

        {expanded && visibleLegs.length > 0 && (
          <ul className="bh-hlegs-full" onClick={(e) => e.stopPropagation()}>
            {visibleLegs.map((l, i) => {
              const pick   = PICK_LABEL[l.outcome] || l.outcome || '—';
              const market = l.marketName || MARKET_LABEL[l.market] || l.market || '—';
              const lr = bet.legsResolved?.[i];
              const resIndicator = lr
                ? lr.won === true ? 'Won' : lr.won === false ? 'Lost' : 'Void'
                : null;
              const scoreStr = lr ? `${lr.scoreHome ?? '?'}:${lr.scoreAway ?? '?'}` : null;
              return (
                <li key={i} className="bh-hleg-full">
                  <div className="bh-hleg-index">{String(i + 1).padStart(2, '0')}</div>
                  <div className="bh-hleg-content">
                    <div className="bh-hleg-teams">
                      {l.home} <span className="bh-hleg-vs">v</span> {l.away}
                      {scoreStr && <span className="bh-hleg-score">FT {scoreStr}</span>}
                    </div>
                    <div className="bh-hleg-row">
                      <span className="bh-hleg-pick">{pick}</span>
                      <span className="bh-hleg-odds">@{Number(l.odds).toFixed(2)}</span>
                      <span className="bh-hleg-mkt">{market}</span>
                    </div>
                    {resIndicator && (
                      <span className={`bh-hleg-result ${resIndicator.toLowerCase()}`}>
                        {resIndicator === 'Won' ? '✓' : resIndicator === 'Lost' ? '✕' : '⚪'} {resIndicator}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {expanded && (
          <div className="bh-hactions" onClick={(e) => e.stopPropagation()}>
            {bet.status === 'lost' && (
              <button type="button" className="bh-hremix" onClick={onRemix}>
                Remix Bet
              </button>
            )}
            <button
              type="button"
              className="bh-hdetails"
              onClick={() => onOpen?.()}
            >
              View ticket details →
            </button>
          </div>
        )}

        {!expanded && bet.status === 'lost' && (
          <button
            type="button"
            className="bh-hremix"
            onClick={(e) => { e.stopPropagation(); onRemix?.(); }}
          >
            Remix Bet
          </button>
        )}
      </div>
    </li>
  );
}

// Deterministic xorshift hash → stable pseudo-random number for the given key.
function stableHash(key) {
  let x = 0;
  const s = String(key || '');
  for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  return Math.abs(x);
}
// Build a deterministic FT score that *actually matches* the leg's
// won/lost outcome — so the displayed score, pick, outcome label, and
// status icon all agree (no more "0:1, picked Home, marked WON" bugs).
function fakeLegScore(bet, leg, idx, wantedResult) {
  const seed = stableHash(`${bet.id}-${leg.matchId || idx}-${idx}`);
  const a = (seed)            & 0xff;
  const b = (seed >>> 8)      & 0xff;
  const c = (seed >>> 16)     & 0xff;
  // Helpers to pick small numbers from the seed.
  const small = (x, max = 4) => x % max;                 // 0..max-1
  const win   = (x) => 1 + (x % 3);                      // 1..3 (winning side)
  const lose  = (x) => x % 2;                            // 0..1 (losing side)
  let home = small(a), away = small(b);

  const wants = wantedResult || 'won';
  const market = leg.market;
  const pick = leg.outcome;

  if (market === '1X2') {
    if (wants === 'won') {
      if (pick === '1') { home = win(a); away = lose(b); }
      else if (pick === '2') { home = lose(a); away = win(b); }
      else if (pick === 'X') { const v = 1 + small(a, 3); home = v; away = v; }
    } else {
      if (pick === '1') { home = 0; away = win(b); }
      else if (pick === '2') { home = win(a); away = 0; }
      else if (pick === 'X') { home = win(a); away = home + 1 + small(b, 2); }
    }
  } else if (market === 'OU25' || market === 'OU15' || market === 'OU35') {
    if (wants === 'won') {
      if (pick === 'Over')  { home = 2 + small(a, 2); away = 1 + small(b, 2); }
      else if (pick === 'Under') { home = 0; away = small(b, 2); }
    } else {
      if (pick === 'Over')  { home = 0; away = small(b, 2); }
      else if (pick === 'Under') { home = 2 + small(a, 2); away = 1 + small(b, 2); }
    }
  } else if (market === 'BTTS') {
    if (wants === 'won') {
      if (pick === 'Yes') { home = 1 + small(a, 3); away = 1 + small(b, 3); }
      else if (pick === 'No')  { home = small(a, 3); away = 0; }
    } else {
      if (pick === 'Yes') { home = small(a, 3); away = 0; }
      else if (pick === 'No')  { home = 1 + small(a, 3); away = 1 + small(b, 3); }
    }
  } else if (market === 'DC') {
    if (wants === 'won') {
      if (pick === '1X') { home = win(a); away = lose(b); }
      else if (pick === 'X2') { home = lose(a); away = win(b); }
      else if (pick === '12') { home = win(a); away = 0; }
    } else {
      if (pick === '1X') { home = 0; away = win(b); }
      else if (pick === 'X2') { home = win(a); away = 0; }
      else if (pick === '12') { home = 0; away = 0; }
    }
  } else if (market === 'CS') {
    const parts = pick.split('-');
    if (parts.length === 2) {
      const ph = parseInt(parts[0], 10);
      const pa = parseInt(parts[1], 10);
      if (Number.isFinite(ph) && Number.isFinite(pa)) {
        if (wants === 'won') { home = ph; away = pa; }
        else { home = pa; away = ph; }
      }
    }
  }
  return { home, away, str: `${home}:${away}` };
}

// What actually happened on the pitch, derived from the score.
function actualOutcomeOf(score, market) {
  if (!score) return null;
  const m = String(market || '');
  const total = score.home + score.away;
  if (m === '1X2' || m === 'ML') {
    if (score.home > score.away) return 'Home';
    if (score.home < score.away) return 'Away';
    return 'Draw';
  }
  if (m === 'OU25') return total > 2.5 ? 'Over 2.5' : 'Under 2.5';
  if (m === 'OU15') return total > 1.5 ? 'Over 1.5' : 'Under 1.5';
  if (m === 'OU35') return total > 3.5 ? 'Over 3.5' : 'Under 3.5';
  if (m === 'BTTS') return (score.home > 0 && score.away > 0) ? 'Yes' : 'No';
  if (m === 'DC') {
    if (score.home > score.away) return 'Home or Draw';
    if (score.home < score.away) return 'Away or Draw';
    return 'Home or Away';
  }
  if (m === 'CS') return `${score.home}-${score.away}`;
  if (m === 'TP') {
    const line = 220.5;
    return total > line ? `Over ${line}` : `Under ${line}`;
  }
  if (m === 'HCAP') return `${score.home}-${score.away}`;
  if (m === 'DNB') {
    if (score.home > score.away) return 'Home';
    if (score.home < score.away) return 'Away';
    return 'Void';
  }
  if (m === '1H1X2' || m === 'HTFT') return `${score.home}-${score.away}`;
  return null;
}
function ticketTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mn = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${mn}`;
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
function ticketId(bet) {
  return String(stableHash(bet?.id || '')).slice(0, 6).padStart(6, '0');
}
function gameId(bet, leg, idx) {
  return String(stableHash(`${bet?.id}-${leg?.matchId || idx}`)).slice(0, 5).padStart(5, '0');
}
const PICK_LABEL = {
  '1': 'Home',
  'X': 'Draw',
  '2': 'Away',
  'Over':  'Over',
  'Under': 'Under',
  'Yes':   'Yes',
  'No':    'No',
  '1X': 'Home or Draw',
  'X2': 'Draw or Away',
  '12': 'Home or Away',
  'H-1': 'Home -1',
  'A+1': 'Away +1',
  '1H': 'Home Handicap',
  '2H': 'Away Handicap',
  '1Y': 'Home & Yes',
  '1N': 'Home & No',
  'XY': 'Draw & Yes',
  'XN': 'Draw & No',
  '2Y': 'Away & Yes',
  '2N': 'Away & No',
  '1O': 'Home & Over 2.5',
  '1U': 'Home & Under 2.5',
  'XO': 'Draw & Over 2.5',
  'XU': 'Draw & Under 2.5',
  '2O': 'Away & Over 2.5',
  '2U': 'Away & Under 2.5',
  'YO': 'Yes & Over 2.5',
  'YU': 'Yes & Under 2.5',
  'NO': 'No & Over 2.5',
  'NU': 'No & Under 2.5',
  '1/1': 'Home / Home',
  '1/X': 'Home / Draw',
  '1/2': 'Home / Away',
  'X/1': 'Draw / Home',
  'X/X': 'Draw / Draw',
  'X/2': 'Draw / Away',
  '2/1': 'Away / Home',
  '2/X': 'Away / Draw',
  '2/2': 'Away / Away',
};

const MARKET_LABEL = {
  '1X2':  'Match Result',
  'OU25': 'Over/Under 2.5 Goals',
  'OU15': 'Over/Under 1.5 Goals',
  'OU35': 'Over/Under 3.5 Goals',
  'BTTS': 'Both Teams To Score',
  'DC':   'Double Chance',
  'DNB':  'Draw No Bet',
  'AH1':  'Asian Handicap (±1)',
  'CS':   'Correct Score',
  '1H1X2': '1st Half Result',
  '1HOU05': '1st Half Goals (O/U 0.5)',
  '1HBTTS': '1st Half BTTS',
  'HTFT': 'Half-Time / Full-Time',
  'WINBTTS': 'Result & Both Teams To Score',
  'WINOU25': 'Result & Total Goals (2.5)',
  'BTTSOU25': 'BTTS & Total Goals (2.5)',
  'ML':   'Money Line',
  'TP':   'Total Points',
  'HCAP': 'Handicap',
};

function TicketDetails({ bet, onClose, onRemix, onShare }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const status = bet.status || 'open';

  const statusConfig = {
    won:        { label: 'BET WON',        cls: 'won',    color: '#16a34a', icon: '✓' },
    lost:       { label: 'BET LOST',       cls: 'lost',   color: '#e53935', icon: '✕' },
    cashed_out: { label: 'CASHED OUT',     cls: 'cashed', color: '#14b8a6', icon: '⟳' },
    void:       { label: 'BET VOID',       cls: 'void',   color: '#f5a623', icon: '⚪' },
    open:       { label: 'BET PENDING',    cls: 'open',   color: '#4f8bff', icon: '⏳' },
  };
  const head = statusConfig[status] || statusConfig.open;

  const modeLabel =
    bet.mode === 'single'   ? 'Single'
  : bet.mode === 'multiple' ? 'Multiple'
  : bet.mode === 'system'   ? 'System'
  : (bet.mode || 'Bet');

  const totalReturn =
    bet.status === 'won'        ? Number(bet.totalReturn || bet.potentialWin || 0)
  : bet.status === 'cashed_out' ? Number(bet.cashOut || 0)
  : 0;
  const totalOdds = Number(bet.totalOdds || 0);
  const profit = totalReturn > 0 && bet.stake > 0 ? totalReturn - Number(bet.stake) : 0;

  const legResult = (i) => {
    if (bet.status === 'open') return 'pending';
    if (bet.legsResolved && bet.legsResolved[i]) {
      return bet.legsResolved[i].won ? 'won' : 'lost';
    }
    if (bet.status === 'won') return 'won';
    if (bet.status === 'cashed_out') {
      return (stableHash(`${bet.id}-${i}-co`) % 100) < 55 ? 'lost' : 'won';
    }
    if (bet.status === 'void') return 'void';
    const total = bet.legs?.length || 1;
    const loserIdx = stableHash(bet.id) % total;
    return i === loserIdx ? 'lost' : 'won';
  };

  const resolvedScore = (i) => {
    if (bet.legsResolved && bet.legsResolved[i]) {
      const r = bet.legsResolved[i];
      if (r.scoreHome != null && r.scoreAway != null) {
        return { home: r.scoreHome, away: r.scoreAway, str: `${r.scoreHome}:${r.scoreAway}` };
      }
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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            </button>
            <button type="button" className="td-icon-btn" aria-label="Close" onClick={onClose}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </header>

        <div className="td-body">
          {/* ============ STATUS BANNER ============ */}
          <section className={`td-banner td-banner-${head.cls}`}>
            <span className="td-banner-icon">{head.icon}</span>
            <span className="td-banner-label">{head.label}</span>
          </section>

          {/* ============ BET SUMMARY ============ */}
          <section className="td-summary">
            <div className="td-summary-row td-summary-ticket">
              <span className="td-summary-label">Bet ID:</span>
              <span className="td-summary-value">{ticketId(bet)}</span>
              <span className="td-summary-dot" />
              <span className="td-summary-time">{ticketTime(bet.placedAt)}</span>
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
                <strong className="td-summary-item-value td-summary-odds">{totalOdds.toFixed(2)}</strong>
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
              {status === 'cashed_out' && (() => {
                const p = profit;
                const cls = p >= 0 ? 'is-positive' : 'is-negative';
                const sign = p >= 0 ? '+' : '';
                return (
                  <>
                    <div className="td-summary-item td-summary-item-profit">
                      <span className="td-summary-item-label">Cashout Amount</span>
                      <strong className="td-summary-item-value is-positive">GHS {fmt(bet.cashOut)}</strong>
                    </div>
                    <div className="td-summary-item td-summary-item-profit">
                      <span className="td-summary-item-label">P&L</span>
                      <strong className={`td-summary-item-value ${cls}`}>{sign}GHS {fmt(Math.abs(p))}</strong>
                    </div>
                  </>
                );
              })()}
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

          {/* ============ PER-LEG CARDS ============ */}
          <section className="td-legs">
            {(bet.legs || []).map((leg, i) => {
              const res = legResult(i);
              const resolved = resolvedScore(i);
              const score = resolved || (bet.status === 'open' || bet.status === 'void'
                ? null
                : fakeLegScore(bet, leg, i, res));
              const pick = PICK_LABEL[leg.outcome] || leg.outcome || '—';
              const market = leg.marketName || MARKET_LABEL[leg.market] || leg.market || '—';

              return (
                <article key={i} className={`td-leg td-leg-${res}`}>
                  <div className="td-leg-head">
                    <span className="td-leg-game">
                      Game ID: <strong>{gameId(bet, leg, i)}</strong>
                    </span>
                    {res !== 'pending' && (
                      <span className={`td-leg-status td-leg-status-${res}`}>
                        {res === 'won' && <><span className="td-leg-status-icon">✓</span> WON</>}
                        {res === 'lost' && <><span className="td-leg-status-icon">✕</span> LOST</>}
                        {res === 'void' && <><span className="td-leg-status-icon">⚪</span> VOID</>}
                      </span>
                    )}
                    {res === 'pending' && (
                      <span className="td-leg-status td-leg-status-pending">
                        <span className="td-leg-status-icon">⏳</span> Pending
                      </span>
                    )}
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

          {/* ============ ACTIONS ============ */}
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

function computeOffer(b) {
  if (b.status !== 'open') return 0;
  return b.lastCashOutOffer?.amount ?? b.cashoutOffer ?? Number((b.stake * b.totalOdds * 0.95).toFixed(2));
}

export default function BetHistoryPage() {
  const navigate = useNavigate();
  const { account, adjustBalance, showWin } = useAccount();
  const { toast } = useToast();
  const [tab, setTab]         = useState('open');
  const [bets, setBets]       = useState([]);
  const [busy, setBusy]       = useState(false);
  const [copiedCode, setCopiedCode] = useState(null);
  // Bet History tab filters (the "Settled" / "Bet Result" dropdowns)
  const [historyScope, setHistoryScope]   = useState('settled'); // settled | all
  const [historyResult, setHistoryResult] = useState('all');     // all | won | lost | cashed_out | void
  // Ticket detail overlay — holds the bet currently being inspected.
  const [activeTicket, setActiveTicket] = useState(null);
  // Inline expansion — set of bet IDs whose cards are open.
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const toggleExpanded = useCallback((id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Live ticker: map of betId -> previous offer so we can show green/red trend.
  const prevOffersRef = useRef({});
  const [trends, setTrends] = useState({});

  // Auto cash-out targets per bet, persisted to localStorage so the page can
  // reload without losing the user's intent. { [betId]: number }
  const [autoTargets, setAutoTargets] = useState(() => loadAutoTargets());
  const autoFiredRef = useRef({}); // dedupe so we only auto-fire once per bet.

  // Confirmation dialog state for tapped cash-outs.
  const [confirmCashOut, setConfirmCashOut] = useState(null); // { id, amount, code, bet }
  const [confirmFraction, setConfirmFraction] = useState(1);  // 1 = full, 0.25/0.5/0.75 = partial

  // Load Code state
  const [loadCodeInput, setLoadCodeInput] = useState('');
  const [loadCodeBusy, setLoadCodeBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchBetHistory();
      setBets(data.bets || []);
      return data.bets || [];
    } catch {
      return null;
    }
  }, []);

  // Initial load.
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
        if (alive) toast(e.message || 'Could not load bets.', 'error');
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => { alive = false; };
  }, [account, navigate, toast, refresh]);

  // Live polling — refresh every 4s while there are open bets and the tab is
  // visible. Computes trend (up/down/flat) by diffing against previous offers.
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

  const openBets = useMemo(() => bets.filter((b) => b.status === 'open'), [bets]);
  const settled  = useMemo(() => bets.filter((b) => b.status !== 'open'), [bets]);

  // Apply history-tab filters: scope ("settled" vs "all") + bet result.
  const historyVisible = useMemo(() => {
    let rows = historyScope === 'settled' ? settled : bets;
    if (historyResult !== 'all') rows = rows.filter((b) => b.status === historyResult);
    return rows;
  }, [bets, settled, historyScope, historyResult]);

  const visible  = tab === 'open' ? openBets : historyVisible;

  const totals = useMemo(() => ({
    openCount:  openBets.length,
    openStake:  openBets.reduce((s, b) => s + Number(b.stake || 0), 0),
    openWin:    openBets.reduce((s, b) => s + Number(b.potentialWin || 0), 0),
    settledCount: settled.length,
  }), [openBets, settled]);

  const performCashOut = useCallback(async (id, expectedAmount, fraction = 1) => {
    try {
      const res = await cashOutBet(id, expectedAmount, fraction);
      const cash = res.bet.cashOut || 0;
      const partial = fraction != null && fraction > 0 && fraction < 1;
      adjustBalance(cash, partial
        ? `Partial cash-out: GHS ${fmt(cash)}. Remainder still in play.`
        : `Cashed out: GHS ${fmt(cash)}.`);
      // Trigger the celebration overlay (auto-dismisses after 45s).
      showWin({ ...res.bet, status: 'cashed_out', settledAt: res.bet.settledAt || new Date().toISOString() });
      // Drop any auto-target for this ticket (the residual gets a fresh slate).
      setAutoTargets((prev) => {
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

  // Auto cash-out: whenever bets/targets change, check whether any open bet
  // has an offer that has reached its target and hasn't fired yet.
  useEffect(() => {
    for (const b of openBets) {
      const target = Number(autoTargets[b.id] || 0);
      if (target <= 0) continue;
      const cur = computeOffer(b);
      if (cur >= target && !autoFiredRef.current[b.id]) {
        autoFiredRef.current[b.id] = true;
        toast(`Auto cash-out triggered at GHS ${fmt(cur)}.`);
        performCashOut(b.id, cur);
      }
    }
  }, [openBets, autoTargets, performCashOut, toast]);

  // User-tap path: show confirmation dialog with the latest offer.
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
    // The server drift-checks against the FULL offer and then applies the
    // fraction itself, so we pass the full offer as acceptedAmount.
    setConfirmCashOut(null);
    await performCashOut(id, amount, f);
  };

  const setAutoTarget = (betId, raw) => {
    const v = Number(String(raw).replace(/,/g, ''));
    setAutoTargets((prev) => {
      const next = { ...prev };
      if (!Number.isFinite(v) || v <= 0) delete next[betId];
      else next[betId] = v;
      saveAutoTargets(next);
      return next;
    });
    autoFiredRef.current[betId] = false; // re-arm if user changed target
  };

  const onRemixBet = useCallback((bet) => {
    if (!bet?.legs?.length) {
      toast('No selections to remix.', 'warn');
      return;
    }
    try {
      const selections = bet.legs.map((l) => ({
        matchId: l.matchId,
        market: l.market,
        outcome: l.outcome,
        odds: l.odds,
        home: l.home,
        away: l.away,
        marketName: l.marketName || MARKET_LABEL[l.market] || l.market,
      }));
      localStorage.setItem('bv_remix_selections', JSON.stringify(selections));
      toast('Selections saved! Building your betslip…', 'success');
    } catch { /* ignore storage errors */ }
    navigate('/');
  }, [navigate, toast]);

  const onCopy = async (code) => {
    try {
      await navigator.clipboard?.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode((c) => c === code ? null : c), 1500);
    } catch { /* ignore */ }
  };

  if (!account) return null;

  return (
    <main className="bh-page">
      <div className="bh-shell">
        <header className="bh-head fade-up">
          <div>
            <h1>My Bets</h1>
            <p className="bh-sub">Open tickets and your full bet history — all in one place.</p>
          </div>
          <div className="bh-head-actions">
            <div className="bh-load-code">
              <input
                type="text"
                placeholder="Enter booking code…"
                value={loadCodeInput}
                onChange={(e) => setLoadCodeInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && loadCodeInput.trim()) {
                    (async () => {
                      setLoadCodeBusy(true);
                      try {
                        const data = await fetchBetByCode(loadCodeInput.trim());
                        if (data?.bet) {
                          setActiveTicket(data.bet);
                          setLoadCodeInput('');
                          toast('Booking code loaded!', 'success');
                        } else {
                          toast('Bet not found for that code.', 'error');
                        }
                      } catch (e) {
                        toast(e.message || 'Could not load booking code.', 'error');
                      } finally {
                        setLoadCodeBusy(false);
                      }
                    })();
                  }
                }}
                className="bh-load-code-input"
                disabled={loadCodeBusy}
              />
              <button
                type="button"
                className="bh-load-code-btn"
                disabled={loadCodeBusy || !loadCodeInput.trim()}
                onClick={async () => {
                  setLoadCodeBusy(true);
                  try {
                    const data = await fetchBetByCode(loadCodeInput.trim());
                    if (data?.bet) {
                      setActiveTicket(data.bet);
                      setLoadCodeInput('');
                      toast('Booking code loaded!', 'success');
                    } else {
                      toast('Bet not found for that code.', 'error');
                    }
                  } catch (e) {
                    toast(e.message || 'Could not load booking code.', 'error');
                  } finally {
                    setLoadCodeBusy(false);
                  }
                }}
              >
                {loadCodeBusy ? '…' : 'Load'}
              </button>
            </div>
            <div className="bh-summary">
              <div className="bh-summary-card">
                <span className="lbl">Open</span>
                <strong>{totals.openCount}</strong>
              </div>
              <div className="bh-summary-card">
                <span className="lbl">Stake at risk</span>
                <strong>GHS {fmt(totals.openStake)}</strong>
              </div>
              <div className="bh-summary-card accent">
                <span className="lbl">Potential win</span>
                <strong>GHS {fmt(totals.openWin)}</strong>
              </div>
            </div>
          </div>
        </header>

        <div className="bh-tabs fade-up" style={{ animationDelay: '0.04s' }}>
          <button
            type="button"
            className={`bh-tab${tab === 'open' ? ' active' : ''}`}
            onClick={() => setTab('open')}
          >
            Open Bets <span className="bh-tab-count">{openBets.length}</span>
          </button>
          <button
            type="button"
            className={`bh-tab${tab === 'history' ? ' active' : ''}`}
            onClick={() => setTab('history')}
          >
            Bet History <span className="bh-tab-count">{settled.length}</span>
          </button>
        </div>

        {tab === 'history' && (
          <div className="bh-history-filters fade-up" style={{ animationDelay: '0.06s' }}>
            <select
              className="bh-history-select"
              value={historyScope}
              onChange={(e) => setHistoryScope(e.target.value)}
              aria-label="Status scope"
            >
              <option value="settled">Settled</option>
              <option value="all">All</option>
            </select>
            <select
              className="bh-history-select"
              value={historyResult}
              onChange={(e) => setHistoryResult(e.target.value)}
              aria-label="Bet result"
            >
              <option value="all">Bet Result</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
              <option value="cashed_out">Cashed out</option>
              <option value="void">Void</option>
            </select>
            <div className="bh-history-filters-spacer" />
            <button type="button" className="bh-history-icon-btn" title="Date range (coming soon)" aria-label="Date range">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></svg>
            </button>
            <button
              type="button"
              className="bh-history-icon-btn"
              onClick={() => { setHistoryScope('settled'); setHistoryResult('all'); }}
              title="Clear filters"
              aria-label="Clear filters"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M6 18 18 6" /></svg>
            </button>
          </div>
        )}

        {busy && !visible.length ? (
          <p className="bh-empty">Loading bets…</p>
        ) : !visible.length ? (
          <div className="bh-empty-card fade-up">
            <div className="bh-empty-icon" aria-hidden>📋</div>
            <h3>{tab === 'open' ? 'No open bets' : 'No settled bets yet'}</h3>
            <p>
              {tab === 'open'
                ? 'Pick a market on the home page to place your first ticket.'
                : 'Once your open bets settle, they\'ll show up here.'}
            </p>
            <button type="button" className="btn btn-primary" onClick={() => navigate('/')}>
              Browse markets
            </button>
          </div>
        ) : tab === 'history' ? (
          <ul className="bh-hlist">
            {visible.map((b) => (
              <HistoryBetCard
                key={b.id}
                bet={b}
                expanded={expandedIds.has(b.id)}
                onToggle={() => toggleExpanded(b.id)}
                onOpen={() => setActiveTicket(b)}
                onRemix={() => onRemixBet(b)}
              />
            ))}
          </ul>
        ) : (
          <ul className="bh-list">
            {visible.map((b) => {
              const code = b.bookingCode || toBookingCode(b.id);
              const isOpen = b.status === 'open';
              const cashOutAmount = isOpen ? computeOffer(b) : 0;
              const trend = trends[b.id]; // 'up' | 'down' | undefined
              const autoTarget = autoTargets[b.id] || '';
              const hasLegs = b.legs?.length > 0;
              const firstLeg = hasLegs ? b.legs[0] : null;
              return (
                <li key={b.id} className={`bh-card status-${b.status} fade-up`}>
                  <header className="bh-card-head">
                    <div className="bh-card-headline">
                      <span className={`bh-status ${b.status}`}>{STATUS_LABEL[b.status] || b.status?.toUpperCase()}</span>
                      <span className="bh-card-meta">
                        {b.legs?.length || 1} selection{(b.legs?.length || 1) > 1 ? 's' : ''} · {placedAtLabel(b.placedAt)}
                      </span>
                    </div>
                    <span className="bh-card-mode">{b.mode}</span>
                  </header>

                  <div className="bh-stats">
                    <div className="bh-stat">
                      <span className="lbl">Total Odds</span>
                      <strong>{Number(b.totalOdds || 0).toFixed(2)}</strong>
                    </div>
                    <div className="bh-stat">
                      <span className="lbl">Stake</span>
                      <strong>GHS {fmt(b.stake)}</strong>
                    </div>
                    <div className="bh-stat">
                      <span className="lbl">Potential Win</span>
                      <strong className="accent">GHS {fmt(b.potentialWin)}</strong>
                    </div>
                  </div>

                  <div className="bh-code">
                    <span className="bh-code-label">Booking Code</span>
                    <code className="bh-code-value">{code}</code>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" className="bh-copy" onClick={() => onCopy(code)}>
                        {copiedCode === code ? '✓ Copied' : 'Copy'}
                      </button>
                      {navigator.share && (
                        <button 
                          type="button" 
                          className="bh-copy" 
                          onClick={() => {
                            navigator.share({
                              title: 'My Xenbet Slip',
                              text: `Check out my bet slip on Xenbet! Booking Code: ${code}`,
                            }).catch(() => {});
                          }}
                        >
                          Share
                        </button>
                      )}
                    </div>
                  </div>

                  {b.mode === 'system' && (
                    <div className="bh-system-info">
                      <span className="bh-system-badge">{b.systemLabel || b.systemType}</span>
                      <span>{b.linesCount} lines · GHS {fmt(b.stakePerLine || 0)}/line</span>
                    </div>
                  )}

                  {isOpen && (
                    <>
                      <button
                        type="button"
                        className={`bh-cashout trend-${trend || 'flat'}`}
                        onClick={() => onCashOut(b)}
                      >
                        Cash Out · GHS {fmt(cashOutAmount)}
                        {trend === 'up'   && <span className="bh-trend up"   aria-label="offer rose">▲</span>}
                        {trend === 'down' && <span className="bh-trend down" aria-label="offer dropped">▼</span>}
                      </button>
                      <div className="bh-auto-row">
                        <label htmlFor={`auto-${b.id}`} className="bh-auto-lbl">Auto cash-out at</label>
                        <span className="bh-auto-prefix">GHS</span>
                        <input
                          id={`auto-${b.id}`}
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="1"
                          placeholder="e.g. 400"
                          value={autoTarget}
                          onChange={(e) => setAutoTarget(b.id, e.target.value)}
                          className="bh-auto-input"
                        />
                        {autoTarget ? (
                          <button type="button" className="bh-auto-clear" onClick={() => setAutoTarget(b.id, '')}>Clear</button>
                        ) : null}
                      </div>
                    </>
                  )}

                  {!isOpen && b.status === 'cashed_out' && (
                    <p className="bh-cashed-note">Cashed out for <strong>GHS {fmt(b.cashOut)}</strong>.</p>
                  )}

                  {hasLegs && (
                    <details className="bh-legs">
                      <summary>{b.legs.length} selection{b.legs.length > 1 ? 's' : ''} · tap to expand</summary>
                      <ul>
                        {b.legs.map((l, i) => {
                          const lr = b.legsResolved?.[i];
                          const resIndicator = lr
                            ? lr.won === true ? 'Won' : lr.won === false ? 'Lost' : 'Void'
                            : null;
                          const scoreStr = lr ? `${lr.scoreHome ?? '?'}:${lr.scoreAway ?? '?'}` : null;
                          return (
                            <li key={i} className="bh-leg">
                              <div className="bh-leg-teams">
                                {l.home} <span>vs</span> {l.away}
                                {scoreStr && <span className="bh-leg-score">FT {scoreStr}</span>}
                              </div>
                              <div className="bh-leg-pick">
                                <span className="bh-leg-market">{MARKET_LABEL[l.market] || l.marketName || l.market}</span>
                                <span className="bh-leg-odds">{PICK_LABEL[l.outcome] || l.outcome} @ {Number(l.odds).toFixed(2)}</span>
                              </div>
                              {resIndicator && (
                                <span className={`bh-leg-result-tag ${resIndicator.toLowerCase()}`}>
                                  {resIndicator === 'Won' ? '✓' : resIndicator === 'Lost' ? '✕' : '⚪'} {resIndicator}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  )}

                  {firstLeg && !hasLegs && (
                    <p className="bh-leg-summary">{firstLeg.home} vs {firstLeg.away}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {confirmCashOut && (() => {
        const isSystem = confirmCashOut.bet?.mode === 'system';
        const payoutNow = Number((confirmCashOut.amount * confirmFraction).toFixed(2));
        const remainStake = Number((confirmCashOut.bet.stake * (1 - confirmFraction)).toFixed(2));
        const remainPotWin = Number((remainStake * confirmCashOut.bet.totalOdds * 1.08).toFixed(2));
        const isPartial = confirmFraction > 0 && confirmFraction < 1;
        const fractionOptions = isSystem ? [1] : [0.25, 0.5, 0.75, 1];
        return (
          <div className="bh-confirm-overlay" role="dialog" aria-modal="true" onClick={() => setConfirmCashOut(null)}>
            <div className="bh-confirm-card" onClick={(e) => e.stopPropagation()}>
              <h3>Confirm cash-out</h3>
              <p className="bh-confirm-sub">Booking <code>{confirmCashOut.code}</code></p>

              {!isSystem && (
                <div className="bh-fraction-row">
                  {fractionOptions.map((f) => (
                    <button
                      key={f}
                      type="button"
                      className={`bh-fraction-chip${confirmFraction === f ? ' active' : ''}`}
                      onClick={() => setConfirmFraction(f)}
                    >
                      {f === 1 ? 'Full' : `${Math.round(f * 100)}%`}
                    </button>
                  ))}
                </div>
              )}

              <div className="bh-confirm-amount">
                <span className="lbl">You'll receive</span>
                <strong>GHS {fmt(payoutNow)}</strong>
              </div>

              {isPartial && (
                <div className="bh-confirm-residual">
                  <span className="lbl">Remaining ticket</span>
                  <div>
                    <div>Stake <strong>GHS {fmt(remainStake)}</strong></div>
                    <div>Potential win <strong>GHS {fmt(remainPotWin)}</strong></div>
                  </div>
                </div>
              )}

              <p className="bh-confirm-note">
                The offer can move between now and submission. We'll reject the
                cash-out if it drifts more than a few percent.
              </p>
              <div className="bh-confirm-actions">
                <button type="button" className="bh-confirm-cancel" onClick={() => setConfirmCashOut(null)}>Cancel</button>
                <button type="button" className="bh-confirm-go" onClick={confirmAndCashOut}>
                  {isPartial ? `Cash out ${Math.round(confirmFraction * 100)}%` : 'Confirm cash-out'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {activeTicket && (
        <TicketDetails
          bet={activeTicket}
          onClose={() => setActiveTicket(null)}
          onRemix={() => {
            const bet = activeTicket;
            setActiveTicket(null);
            if (bet) onRemixBet(bet);
          }}
          onShare={(bet) => {
            const code = bet.bookingCode || toBookingCode(bet.id);
            if (navigator.share) {
              navigator.share({
                title: 'My Xenbet Ticket',
                text: `Check out my bet ticket on Xenbet!\n\nBooking Code: ${code}\nStake: GHS ${fmt(bet.stake)}\nPotential Win: GHS ${fmt(bet.potentialWin)}\nStatus: ${(bet.status || '').toUpperCase()}`,
              }).catch(() => {});
            } else {
              navigator.clipboard?.writeText(code).then(() => {
                toast('Booking code copied! Share it with friends.', 'success');
              }).catch(() => {
                toast('Share your booking code: ' + code, 'info');
              });
            }
          }}
        />
      )}

      <style>{BH_CSS}</style>
    </main>
  );
}

const BH_CSS = `
.bh-page { padding: 28px 0 60px; min-height: calc(100vh - 200px); }
.bh-shell { max-width: 980px; margin: 0 auto; padding: 0 20px; display: flex; flex-direction: column; gap: 18px; }

.bh-head {
  display: flex; justify-content: space-between; align-items: flex-end; gap: 24px;
  flex-wrap: wrap;
}
.bh-head h1 { margin: 0; font-size: 28px; font-weight: 900; letter-spacing: -.02em; }
.bh-sub { margin: 4px 0 0; color: var(--text-soft); font-size: 13.5px; }
.bh-head-actions {
  display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap;
}
.bh-summary { display: flex; gap: 10px; flex-wrap: wrap; }
.bh-summary-card {
  background: var(--surface);
  border: 1px solid var(--surface-2);
  border-radius: 12px;
  padding: 10px 14px;
  min-width: 130px;
  display: flex; flex-direction: column; gap: 2px;
}
.bh-summary-card .lbl { font-size: 10px; letter-spacing: .12em; color: var(--text-dim); text-transform: uppercase; }
.bh-summary-card strong { font-size: 16px; font-variant-numeric: tabular-nums; }
.bh-summary-card.accent strong { color: var(--accent); }

.bh-load-code {
  display: flex; gap: 6px; align-items: center;
  background: var(--surface);
  border: 1px solid var(--surface-2);
  border-radius: 12px;
  padding: 6px 6px 6px 14px;
}
.bh-load-code-input {
  background: transparent;
  border: none;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  outline: none;
  width: 150px;
  letter-spacing: 0.05em;
}
.bh-load-code-input::placeholder { color: var(--text-dim); font-weight: 500; letter-spacing: 0; }
.bh-load-code-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  background: var(--accent);
  color: #0a0d0c;
  font-weight: 800;
  font-size: 12px;
  cursor: pointer;
  transition: opacity .15s;
  font-family: inherit;
}
.bh-load-code-btn:hover { opacity: 0.85; }
.bh-load-code-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.bh-tabs {
  display: inline-flex; gap: 4px;
  background: var(--surface);
  padding: 4px;
  border-radius: 12px;
  border: 1px solid var(--surface-2);
  align-self: flex-start;
}
.bh-tab {
  padding: 9px 14px; border-radius: 8px;
  background: transparent; border: none;
  color: var(--text-soft);
  font-weight: 700; font-size: 13px;
  cursor: pointer;
  display: inline-flex; align-items: center; gap: 8px;
  transition: background .15s ease, color .15s ease;
}
.bh-tab:hover { color: var(--text); }
.bh-tab.active {
  background: var(--surface-2);
  color: var(--accent);
}
.bh-tab-count {
  font-size: 11px; font-weight: 800;
  background: var(--surface-2);
  color: var(--text-soft);
  padding: 2px 8px;
  border-radius: 999px;
  min-width: 20px; text-align: center;
}
.bh-tab.active .bh-tab-count { background: var(--surface); color: var(--accent); }

/* ============ Bet History — image-matched layout ============ */
.bh-history-filters {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  padding: 0 2px;
}
.bh-history-filters-spacer { flex: 1; }
.bh-history-select {
  background: #1a2724;
  color: #e6f4ec;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 9px 30px 9px 14px;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12' fill='none' stroke='%2390a299' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 4.5l3 3 3-3'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  background-size: 12px;
  transition: border-color .15s;
}
.bh-history-select:hover { border-color: rgba(197, 255, 61, 0.4); }
.bh-history-select:focus { outline: none; border-color: var(--accent, #c5ff3d); }

.bh-history-icon-btn {
  background: #1a2724;
  color: #e6f4ec;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  width: 38px; height: 38px;
  display: grid; place-items: center;
  cursor: pointer;
  transition: border-color .15s, background .15s;
}
.bh-history-icon-btn:hover {
  background: #20312c;
  border-color: rgba(197, 255, 61, 0.4);
}

.bh-hlist {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.bh-hcard {
  display: flex;
  align-items: stretch;
  gap: 0;
  cursor: pointer;
  transition: transform .12s;
}
.bh-hcard:active { transform: scale(0.998); }
.bh-hcard:focus-visible { outline: 2px solid rgba(20, 165, 80, 0.6); outline-offset: 2px; border-radius: 14px; }
.bh-hcard.is-expanded .bh-hhead { border-bottom-left-radius: 0; border-bottom-right-radius: 0; }

.bh-hlegs-full {
  list-style: none;
  margin: 0;
  padding: 8px 14px 4px;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.bh-hleg-full {
  display: grid;
  grid-template-columns: 26px 1fr;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.06);
}
.bh-hleg-full:last-child { border-bottom: none; }
html[data-theme="light"] .bh-hleg-full { border-bottom-color: rgba(0, 0, 0, 0.08); }
.bh-hleg-index {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10.5px;
  color: var(--text-mute, rgba(255, 255, 255, 0.4));
  letter-spacing: 0.1em;
  padding-top: 3px;
}
.bh-hleg-content { min-width: 0; }
.bh-hleg-teams {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 6px;
  line-height: 1.3;
}
.bh-hleg-vs {
  color: var(--text-dim, rgba(255, 255, 255, 0.4));
  font-weight: 400;
  margin: 0 4px;
  font-size: 12px;
}
.bh-hleg-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  align-items: baseline;
  font-size: 12px;
}
.bh-hleg-pick {
  font-weight: 700;
  color: var(--text);
  font-size: 12.5px;
}
.bh-hleg-odds {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--accent, #14a550);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.bh-hleg-mkt {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-soft, rgba(255, 255, 255, 0.7));
  font-size: 10.5px;
  padding: 3px 8px;
  border-radius: 4px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
html[data-theme="light"] .bh-hleg-mkt { background: rgba(0, 0, 0, 0.06); }
.bh-hleg-score { font-size: 10px; color: var(--text-dim); margin-left: 4px; font-weight: 400; }
.bh-hleg-result {
  display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: .04em;
  padding: 2px 8px; border-radius: 10px; margin-top: 4px;
}
.bh-hleg-result.won { background: rgba(0,200,83,.15); color: #00c853; }
.bh-hleg-result.lost { background: rgba(255,23,68,.15); color: #ff1744; }
.bh-hleg-result.void { background: rgba(158,158,158,.15); color: #9e9e9e; }

.bh-hactions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px 14px;
  flex-wrap: wrap;
}
.bh-hactions .bh-hremix { align-self: auto; margin: 0; }
.bh-hdetails {
  background: transparent;
  border: 1px solid rgba(20, 165, 80, 0.4);
  color: var(--accent, #14a550);
  font-family: inherit;
  font-weight: 700;
  font-size: 12.5px;
  padding: 8px 14px;
  border-radius: 8px;
  cursor: pointer;
  transition: background .15s, border-color .15s, color .15s;
  margin-left: auto;
}
.bh-hdetails:hover {
  background: rgba(20, 165, 80, 0.1);
  border-color: var(--accent, #14a550);
}

.bh-hodds {
  font-family: 'JetBrains Mono', monospace;
  color: var(--accent, #14a550) !important;
}

.bh-hdate {
  flex-shrink: 0;
  width: 44px;
  padding-top: 6px;
  text-align: left;
  font-family: 'Inter', system-ui, sans-serif;
  color: rgba(255, 255, 255, 0.78);
}
.bh-hdate-day {
  display: block;
  font-size: 20px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.02em;
  color: #fff;
}
.bh-hdate-month {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.55);
  letter-spacing: 0.04em;
}

.bh-hbody {
  flex: 1;
  min-width: 0;
  background: #16221f;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.bh-hhead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  font-weight: 800;
  font-size: 14.5px;
  color: #fff;
  letter-spacing: 0.005em;
}
.bh-hhead.lost   { background: linear-gradient(90deg, #c81e1e, #8b1212); }
.bh-hhead.won    { background: linear-gradient(90deg, #18a249, #0f6b30); }
.bh-hhead.cashed { background: linear-gradient(90deg, #1aa46a, #0e7c4d); }
.bh-hhead.void   { background: linear-gradient(90deg, #6b7280, #4b5563); }
.bh-hhead.open   { background: linear-gradient(90deg, #4f8bff, #2563eb); }
.bh-hmode { font-weight: 800; }
.bh-hstatus {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 800;
}
.bh-hstatus-icon { font-size: 13px; line-height: 1; }
.bh-hstatus-chevron {
  margin-left: 2px;
  opacity: 0.85;
  font-weight: 700;
  font-size: 18px;
  line-height: 1;
}

.bh-hstats {
  margin: 0;
  padding: 14px 16px 4px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
.bh-hstats > div {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 13.5px;
}
.bh-hstats dt {
  margin: 0;
  color: rgba(255, 255, 255, 0.62);
  font-weight: 600;
}
.bh-hstats dd {
  margin: 0;
  color: #fff;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.005em;
}
.bh-hstats dd.is-positive {
  color: #18f0a1;
  text-shadow: 0 0 12px rgba(24, 240, 161, 0.25);
}
.bh-hstats dd.is-negative {
  color: #ff5d5d;
}

.bh-hlegs {
  list-style: none;
  margin: 0;
  padding: 14px 16px 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.78);
}
.bh-hlegs li { line-height: 1.45; }
.bh-hlegs-more { color: rgba(255, 255, 255, 0.5); font-size: 12.5px; }

.bh-hremix {
  align-self: flex-end;
  margin: 12px 16px 14px;
  padding: 8px 18px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #1aa46a, #0e7c4d);
  color: #fff;
  font-weight: 800;
  font-size: 13.5px;
  cursor: pointer;
  letter-spacing: 0.01em;
  box-shadow: 0 6px 14px rgba(26, 164, 106, 0.32);
  transition: transform .15s, box-shadow .15s;
  font-family: inherit;
}
.bh-hremix:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 22px rgba(26, 164, 106, 0.45);
}

@media (max-width: 480px) {
  .bh-hdate { width: 38px; }
  .bh-hdate-day { font-size: 18px; }
  .bh-hdate-month { font-size: 11px; }
  .bh-hhead { padding: 11px 14px; font-size: 13.5px; }
  .bh-hstats { padding: 12px 14px 4px; }
  .bh-hstats > div { font-size: 13px; }
  .bh-hlegs { padding: 12px 14px 4px; font-size: 12.5px; }
  .bh-hremix { margin: 10px 14px 12px; padding: 7px 16px; font-size: 13px; }
}

.bh-list { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.bh-empty { color: var(--text-dim); font-size: 14px; padding: 32px 0; text-align: center; }
.bh-empty-card {
  background: var(--surface);
  border: 1px solid var(--surface-2);
  border-radius: 16px;
  padding: 40px 24px;
  text-align: center;
}
.bh-empty-card .bh-empty-icon { font-size: 36px; margin-bottom: 8px; }
.bh-empty-card h3 { margin: 0 0 6px; font-size: 18px; }
.bh-empty-card p  { color: var(--text-soft); margin: 0 0 18px; font-size: 13.5px; }

.bh-card {
  background: var(--surface);
  border: 1px solid var(--surface-2);
  border-radius: 16px;
  padding: 16px 18px;
  display: flex; flex-direction: column; gap: 10px;
  transition: border-color .2s ease, transform .2s ease;
}
.bh-card:hover { border-color: rgba(197, 255, 61, .25); transform: translateY(-2px); }
.bh-card.status-won  { border-color: rgba(197, 255, 61, .35); }
.bh-card.status-lost { border-color: rgba(255, 77, 61, .25); }

.bh-card-head {
  display: flex; justify-content: space-between; align-items: center; gap: 10px;
}
.bh-card-headline { display: flex; flex-direction: column; gap: 4px; }
.bh-card-meta { font-size: 11.5px; color: var(--text-dim); }
.bh-card-mode {
  font-size: 10px; letter-spacing: .12em; text-transform: uppercase;
  background: var(--surface-2);
  color: var(--text-soft);
  padding: 4px 8px; border-radius: 6px;
  font-weight: 700;
}

.bh-status {
  font-size: 10px; font-weight: 800; letter-spacing: .12em;
  padding: 3px 9px; border-radius: 999px;
  text-transform: uppercase; align-self: flex-start;
}
.bh-status.open       { color: var(--accent-cool); background: rgba(106,208,255,.12); }
.bh-status.won        { color: var(--accent);      background: rgba(197,255,61,.16); }
.bh-status.cashed_out { color: var(--accent-warm); background: rgba(255,181,71,.12); }
.bh-status.lost       { color: var(--accent-hot);  background: rgba(255,77,61,.12); }
.bh-status.void       { color: var(--text-soft);   background: var(--surface-2); }

.bh-stats {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  background: var(--surface-2);
  padding: 12px;
  border-radius: 12px;
}
.bh-stat { display: flex; flex-direction: column; gap: 4px; }
.bh-stat .lbl { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: var(--text-dim); }
.bh-stat strong { font-size: 15px; font-variant-numeric: tabular-nums; }
.bh-stat strong.accent { color: var(--accent); }

.bh-code {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--surface-2);
  border: 1px dashed rgba(106, 208, 255, .35);
}
.bh-code-label {
  font-size: 10px; letter-spacing: .12em;
  color: var(--text-dim); text-transform: uppercase;
}
.bh-code-value {
  font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
  font-size: 14px;
  letter-spacing: .06em;
  color: var(--accent-cool);
}
.bh-copy {
  background: var(--surface);
  border: 1px solid var(--surface-2);
  border-radius: 6px;
  color: var(--text-soft);
  padding: 6px 12px;
  font-size: 11px; font-weight: 700;
  cursor: pointer;
  transition: border-color .15s ease, color .15s ease;
}
.bh-copy:hover { border-color: var(--accent); color: var(--accent); }

.bh-cashout {
  width: 100%;
  padding: 12px 14px;
  border: none; border-radius: 10px;
  background: linear-gradient(135deg, var(--accent-warm), #f6a200);
  color: #1a1100;
  font-weight: 800; font-size: 14px;
  cursor: pointer;
  transition: transform .15s ease, box-shadow .15s ease;
}
.bh-cashout:hover { transform: translateY(-1px); box-shadow: 0 8px 18px rgba(255, 181, 71, .35); }

.bh-cashed-note {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-soft);
  padding: 8px 10px;
  background: rgba(255, 181, 71, .08);
  border-radius: 8px;
}
.bh-cashed-note strong { color: var(--accent-warm); }

.bh-legs { font-size: 12.5px; }
.bh-legs summary { cursor: pointer; color: var(--text-soft); padding: 6px 0; }
.bh-legs summary:hover { color: var(--text); }
.bh-legs ul { list-style: none; padding: 0; margin: 6px 0 0; display: flex; flex-direction: column; gap: 6px; }
.bh-leg {
  background: var(--surface-2);
  padding: 8px 10px;
  border-radius: 8px;
  display: flex; flex-direction: column; gap: 4px;
}
.bh-leg-teams { font-weight: 600; color: var(--text); }
.bh-leg-teams span { color: var(--text-dim); margin: 0 4px; }
.bh-leg-pick { display: flex; justify-content: space-between; font-size: 11.5px; }
.bh-leg-market { color: var(--text-dim); }
.bh-leg-odds { color: var(--accent-cool); font-variant-numeric: tabular-nums; }
.bh-leg-score { font-size: 10px; color: var(--text-dim); margin-left: 6px; font-weight: 400; }
.bh-leg-result-tag {
  font-size: 10px; font-weight: 700; letter-spacing: .04em;
  padding: 2px 8px; border-radius: 10px; display: inline-block;
  margin-top: 4px; text-align: center;
}
.bh-leg-result-tag.won { background: rgba(0,200,83,.15); color: #00c853; }
.bh-leg-result-tag.lost { background: rgba(255,23,68,.15); color: #ff1744; }
.bh-leg-result-tag.void { background: rgba(158,158,158,.15); color: #9e9e9e; }

.bh-leg-summary { margin: 0; font-size: 12.5px; color: var(--text-soft); }
.bh-system-info {
  display: flex; align-items: center; gap: 8px;
  font-size: 11.5px; color: var(--text-soft);
}
.bh-system-badge {
  font-size: 10px; font-weight: 800; letter-spacing: .08em;
  padding: 3px 8px; border-radius: 6px;
  background: rgba(197, 255, 61, .12);
  color: var(--accent);
}

.fade-up { animation: bhFade .4s ease both; }
@keyframes bhFade {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

@media (max-width: 760px) {
  .bh-shell { padding: 0 12px; }
  .bh-head { flex-direction: column; align-items: stretch; gap: 14px; }
  .bh-head h1 { font-size: 22px; }
  .bh-head-actions { flex-direction: column; align-items: stretch; width: 100%; }
  .bh-load-code { width: 100%; }
  .bh-load-code-input { flex: 1; width: auto; }
  .bh-summary { display: grid; grid-template-columns: repeat(3, 1fr); }
  .bh-summary-card { min-width: 0; padding: 8px 10px; }
  .bh-summary-card strong { font-size: 14px; }
  .bh-list { grid-template-columns: 1fr; gap: 10px; }
  .bh-card { padding: 14px; }
  .bh-stats { padding: 10px; gap: 6px; }
  .bh-stat strong { font-size: 13.5px; }
}

.bh-cashout { position: relative; transition: background .2s, color .2s; }
.bh-cashout.trend-up   { background: #1eaf6a; color: #fff; }
.bh-cashout.trend-down { background: #e54848; color: #fff; }
.bh-cashout .bh-trend {
  display: inline-block;
  margin-left: 8px;
  font-size: 12px;
  font-weight: 800;
  animation: bh-trend-flash 1.6s ease-out 1;
}
.bh-cashout .bh-trend.up   { color: #ddffe7; }
.bh-cashout .bh-trend.down { color: #ffdcdc; }
@keyframes bh-trend-flash {
  0%   { transform: translateY(0); opacity: 0; }
  20%  { transform: translateY(0); opacity: 1; }
  100% { transform: translateY(0); opacity: 1; }
}

.bh-auto-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--surface-2);
  flex-wrap: wrap;
}
.bh-auto-lbl { font-size: 11px; letter-spacing: 0.06em; color: var(--text-dim); text-transform: uppercase; font-weight: 700; }
.bh-auto-prefix { font-size: 11px; color: var(--text-dim); font-weight: 600; }
.bh-auto-input {
  flex: 1;
  min-width: 80px;
  padding: 7px 10px;
  border-radius: 8px;
  border: 1px solid var(--surface-2);
  background: var(--bg);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  outline: none;
}
.bh-auto-input:focus { border-color: var(--accent); }
.bh-auto-clear {
  padding: 6px 10px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--text-dim);
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.bh-auto-clear:hover { color: var(--text); }

.bh-confirm-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.6);
  display: grid; place-items: center;
  z-index: 9999;
  padding: 16px;
  animation: bh-confirm-fade 0.18s ease-out both;
}
@keyframes bh-confirm-fade { from { opacity: 0; } to { opacity: 1; } }
.bh-confirm-card {
  background: var(--surface, #161616);
  border: 1px solid var(--surface-2, #2a2a2a);
  border-radius: 16px;
  padding: 24px;
  max-width: 380px;
  width: 100%;
  color: var(--text, #fff);
  animation: bh-confirm-pop 0.22s cubic-bezier(.2,1.3,.4,1) both;
}
@keyframes bh-confirm-pop { from { transform: scale(0.92); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.bh-confirm-card h3 { margin: 0 0 4px; font-size: 20px; font-weight: 800; letter-spacing: -0.01em; }
.bh-confirm-sub { margin: 0 0 16px; font-size: 13px; color: var(--text-dim); }
.bh-confirm-sub code { background: var(--bg); padding: 2px 6px; border-radius: 6px; font-size: 12px; }
.bh-confirm-amount {
  padding: 14px 16px;
  background: var(--bg);
  border-radius: 12px;
  border: 1px solid var(--surface-2);
  display: flex; justify-content: space-between; align-items: baseline;
  margin-bottom: 12px;
}
.bh-confirm-amount .lbl { font-size: 12px; color: var(--text-dim); }
.bh-confirm-amount strong { font-size: 20px; font-weight: 800; color: var(--accent); }
.bh-confirm-note { font-size: 11.5px; color: var(--text-dim); margin: 0 0 18px; line-height: 1.5; }
.bh-confirm-actions { display: flex; gap: 10px; }
.bh-confirm-cancel,
.bh-confirm-go {
  flex: 1;
  padding: 12px 0;
  border-radius: 10px;
  border: none;
  font: inherit;
  font-size: 13.5px;
  font-weight: 800;
  cursor: pointer;
}
.bh-confirm-cancel { background: var(--bg); color: var(--text); border: 1px solid var(--surface-2); }
.bh-confirm-cancel:hover { background: var(--surface-2); }
.bh-confirm-go { background: #116f43; color: #fff; }
.bh-confirm-go:hover { background: #1eaf6a; }

.bh-fraction-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin-bottom: 14px;
}
.bh-fraction-chip {
  padding: 9px 0;
  border-radius: 9px;
  border: 1px solid var(--surface-2);
  background: var(--bg);
  color: var(--text);
  font: inherit;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  transition: all .15s;
}
.bh-fraction-chip:hover { border-color: var(--accent); }
.bh-fraction-chip.active {
  background: var(--accent);
  color: var(--bg);
  border-color: var(--accent);
}
.bh-confirm-residual {
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid var(--surface-2);
  background: var(--bg);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  margin-bottom: 12px;
  gap: 12px;
}
.bh-confirm-residual > .lbl { color: var(--text-dim); font-weight: 600; }
.bh-confirm-residual > div { text-align: right; }
.bh-confirm-residual strong { font-variant-numeric: tabular-nums; }

/* ─── TICKET DETAILS OVERLAY ─── */
.td-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.7);
  z-index: 1200;
  display: flex; align-items: flex-start; justify-content: center;
  overflow: hidden;
  backdrop-filter: blur(4px);
  animation: tdFadeIn .25s ease both;
}
@keyframes tdFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
.td-sheet {
  width: 100%;
  max-width: 480px;
  height: 100%;
  display: flex; flex-direction: column;
  background: #0b1014;
  color: #e7eaef;
  font-family: 'Bricolage Grotesque', system-ui, sans-serif;
  animation: tdSlideUp .3s cubic-bezier(.16,1,.3,1) both;
}
@keyframes tdSlideUp {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}
.td-top {
  position: sticky; top: 0; z-index: 2;
  display: grid; grid-template-columns: 36px 1fr auto; align-items: center;
  gap: 10px;
  padding: 14px 14px 12px;
  background: linear-gradient(180deg, #131922 0%, #0b1014 100%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.td-top h2 {
  margin: 0;
  font-size: 17px; font-weight: 700;
  letter-spacing: -0.01em;
}
.td-top-actions { display: flex; gap: 4px; }
.td-back, .td-icon-btn {
  width: 36px; height: 36px;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: #e7eaef;
  display: grid; place-items: center;
  cursor: pointer;
  transition: background .15s, transform .15s;
}
.td-back:hover, .td-icon-btn:hover { background: rgba(255, 255, 255, 0.08); transform: scale(1.05); }
.td-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px 14px 60px;
  display: flex; flex-direction: column; gap: 12px;
}

/* Status Banner */
.td-banner {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 16px 20px;
  border-radius: 14px;
  font-size: 18px;
  font-weight: 900;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  animation: tdBannerIn .35s cubic-bezier(.16,1,.3,1) both;
}
@keyframes tdBannerIn {
  from { opacity: 0; transform: scale(0.92) translateY(-8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
.td-banner-won {
  background: linear-gradient(135deg, #0d6b2e, #16a34a);
  color: #fff;
  box-shadow: 0 0 30px rgba(22, 163, 74, 0.35);
}
.td-banner-lost {
  background: linear-gradient(135deg, #991b1b, #e53935);
  color: #fff;
  box-shadow: 0 0 30px rgba(229, 57, 53, 0.35);
}
.td-banner-cashed {
  background: linear-gradient(135deg, #0e6b50, #14b8a6);
  color: #fff;
  box-shadow: 0 0 30px rgba(20, 184, 166, 0.3);
}
.td-banner-void {
  background: linear-gradient(135deg, #4b5563, #6b7280);
  color: #fff;
}
.td-banner-open {
  background: linear-gradient(135deg, #1e40af, #4f8bff);
  color: #fff;
  box-shadow: 0 0 30px rgba(79, 139, 255, 0.3);
}
.td-banner-icon { font-size: 24px; line-height: 1; }

/* Summary Card */
.td-summary {
  background: #161b22;
  border-radius: 14px;
  padding: 16px 16px 14px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  animation: tdFadeIn .3s ease both;
  animation-delay: 0.05s;
}
.td-summary-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.td-summary-ticket { font-size: 13px; color: #b2b8c0; margin-bottom: 4px; }
.td-summary-code { font-size: 13px; color: #b2b8c0; margin-bottom: 6px; }
.td-summary-code-value { color: #67e8f9 !important; letter-spacing: 0.08em; }
.td-summary-label { color: #8a8f97; }
.td-summary-value { color: #e7eaef; font-weight: 700; font-family: 'JetBrains Mono', monospace; }
.td-summary-dot {
  display: inline-block; width: 3px; height: 3px; border-radius: 50%;
  background: #5d6470; margin: 0 6px;
}
.td-summary-time { color: #8a8f97; font-size: 12.5px; }
.td-summary-mode { justify-content: space-between; align-items: center; }
.td-mode {
  font-size: 17px;
  font-weight: 800;
  letter-spacing: -0.01em;
}
.td-badge {
  font-size: 12px;
  font-weight: 800;
  padding: 4px 12px;
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.td-badge-won { background: rgba(22, 163, 74, 0.2); color: #2ee079; }
.td-badge-lost { background: rgba(229, 57, 53, 0.2); color: #ff5d5d; }
.td-badge-cashed { background: rgba(20, 184, 166, 0.2); color: #67e8f9; }
.td-badge-void { background: rgba(245, 166, 35, 0.2); color: #f5a623; }
.td-badge-open { background: rgba(79, 139, 255, 0.2); color: #4f8bff; }

.td-summary-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.06);
  margin: 12px 0 10px;
}
.td-summary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.td-summary-item {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 10px;
  padding: 10px 12px;
  display: flex; flex-direction: column; gap: 3px;
}
.td-summary-item-highlight {
  background: rgba(22, 163, 74, 0.08);
  border: 1px solid rgba(22, 163, 74, 0.15);
}
.td-summary-item-profit {
  background: rgba(22, 163, 74, 0.06);
  border: 1px solid rgba(22, 163, 74, 0.1);
}
.td-summary-item-loss {
  background: rgba(229, 57, 53, 0.08);
  border: 1px solid rgba(229, 57, 53, 0.15);
}
.td-summary-item-label {
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #8a8f97;
  font-weight: 600;
}
.td-summary-item-value {
  font-size: 16px;
  font-weight: 800;
  color: #e7eaef;
  font-variant-numeric: tabular-nums;
  font-family: 'JetBrains Mono', monospace;
}
.td-summary-item-value.is-positive { color: #2ee079; text-shadow: 0 0 12px rgba(46, 224, 121, 0.2); }
.td-summary-item-value.is-negative { color: #ff5d5d; }
.td-summary-odds { color: #67e8f9 !important; }
.td-summary-pot { color: #f5a623 !important; }
.td-summary-settled {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
  display: flex; align-items: center; gap: 6px;
  font-size: 12px;
  color: #8a8f97;
}

/* Leg Cards */
.td-legs { display: flex; flex-direction: column; gap: 12px; }
.td-leg {
  background: #161b22;
  border-radius: 14px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.04);
  overflow: hidden;
  animation: tdLegIn .35s ease both;
}
.td-leg:nth-child(1) { animation-delay: 0.08s; }
.td-leg:nth-child(2) { animation-delay: 0.16s; }
.td-leg:nth-child(3) { animation-delay: 0.24s; }
.td-leg:nth-child(4) { animation-delay: 0.32s; }
.td-leg:nth-child(5) { animation-delay: 0.40s; }
.td-leg:nth-child(6) { animation-delay: 0.48s; }
.td-leg:nth-child(7) { animation-delay: 0.56s; }
.td-leg:nth-child(8) { animation-delay: 0.64s; }
@keyframes tdLegIn {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
.td-leg-won {
  border-color: rgba(22, 163, 74, 0.3);
  box-shadow: 0 0 20px rgba(22, 163, 74, 0.08);
}
.td-leg-lost {
  border-color: rgba(229, 57, 53, 0.3);
  box-shadow: 0 0 20px rgba(229, 57, 53, 0.08);
}
.td-leg-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  font-size: 12px;
  color: #8a8f97;
  font-family: 'JetBrains Mono', monospace;
}
.td-leg-game strong { color: #e7eaef; font-weight: 700; }
.td-leg-status {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.03em;
  padding: 3px 10px;
  border-radius: 999px;
  font-family: system-ui, sans-serif;
}
.td-leg-status-won {
  background: rgba(22, 163, 74, 0.15);
  color: #2ee079;
}
.td-leg-status-lost {
  background: rgba(229, 57, 53, 0.15);
  color: #ff5d5d;
}
.td-leg-status-pending {
  background: rgba(79, 139, 255, 0.12);
  color: #4f8bff;
}
.td-leg-status-icon { font-size: 13px; line-height: 1; }
.td-leg-body {
  padding: 16px 14px 14px;
}
.td-leg-teams-wrapper {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 12px;
  font-size: 15px;
  font-weight: 700;
  color: #e7eaef;
  line-height: 1.3;
  flex-wrap: wrap;
}
.td-leg-home { color: #e7eaef; }
.td-leg-vs {
  color: #5d6470;
  font-weight: 600;
  font-size: 13px;
  text-transform: uppercase;
}
.td-leg-away { color: #e7eaef; }
.td-leg-score {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 14px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  font-size: 13px;
  color: #b2b8c0;
  flex-wrap: wrap;
}
.td-leg-score-label { color: #8a8f97; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
.td-leg-score-value {
  color: #e7eaef;
  font-weight: 800;
  font-family: 'JetBrains Mono', monospace;
  font-size: 16px;
  letter-spacing: 0.02em;
}
.td-leg-details {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.td-leg-detail {
  background: rgba(255, 255, 255, 0.02);
  border-radius: 8px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.td-leg-detail-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #8a8f97;
  font-weight: 600;
}
.td-leg-detail-value {
  font-size: 13px;
  font-weight: 700;
  color: #e7eaef;
  word-break: break-word;
}
.td-leg-detail-market { color: #f5a623 !important; }
.td-leg-detail-odds { color: #67e8f9 !important; font-family: 'JetBrains Mono', monospace; }

/* Actions */
.td-actions {
  display: flex; flex-direction: column; gap: 10px;
  animation: tdFadeIn .3s ease both;
  animation-delay: 0.3s;
}
.td-action-btn {
  display: flex; align-items: center; gap: 14px;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: #161b22;
  color: #e7eaef;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: background .15s, transform .15s, border-color .15s;
}
.td-action-btn:hover {
  background: #1c232b;
  transform: translateY(-1px);
  border-color: rgba(255, 255, 255, 0.1);
}
.td-action-icon {
  flex-shrink: 0;
  width: 40px; height: 40px;
  border-radius: 10px;
  display: grid; place-items: center;
  font-size: 18px;
}
.td-action-remix .td-action-icon {
  background: linear-gradient(135deg, #0d6b2e, #16a34a);
  color: #fff;
}
.td-action-share .td-action-icon {
  background: linear-gradient(135deg, #1e40af, #4f8bff);
  color: #fff;
}
.td-action-text { display: flex; flex-direction: column; gap: 2px; }
.td-action-title {
  font-size: 15px;
  font-weight: 700;
  color: #e7eaef;
}
.td-action-sub {
  font-size: 12px;
  color: #8a8f97;
  font-weight: 500;
}

@media (min-width: 481px) {
  .td-sheet {
    max-width: 460px;
    margin: 40px auto;
    height: calc(100vh - 80px);
    border-radius: 18px;
    overflow: hidden;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
  }
  .td-overlay {
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    align-items: center;
  }
  .td-leg-details {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 480px) {
  .td-leg-details {
    grid-template-columns: 1fr 1fr;
  }
  .td-summary-grid {
    grid-template-columns: 1fr 1fr;
  }
  .td-banner { font-size: 16px; padding: 14px 16px; }
  .td-summary-item-value { font-size: 14px; }
}
`;

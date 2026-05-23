import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchBetHistory, cashOutBet } from '../api/betApi.js';
import { useAccount, useToast } from '../providers/AccountProvider.jsx';
import { toBookingCode } from '../components/BetSuccessModal.jsx';
import PageBack from '../components/PageBack.jsx';

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

function HistoryBetCard({ bet, onRemix }) {
  const { day, month } = dayMonth(bet.settledAt || bet.placedAt);
  const head = HISTORY_HEAD_LABEL[bet.status] || HISTORY_HEAD_LABEL.open;
  const modeLabel = bet.mode === 'single' ? 'Single' : bet.mode === 'multiple' ? 'Multiple' : bet.mode === 'system' ? 'System' : (bet.mode || 'Bet');
  const legs = bet.legs || [];
  const previewLegs = legs.slice(0, 3);
  const extraLegs = Math.max(0, legs.length - previewLegs.length);
  const totalReturn = bet.status === 'won'
    ? Number(bet.potentialWin || 0)
    : bet.status === 'cashed_out'
      ? Number(bet.cashOut || 0)
      : 0;

  return (
    <li className={`bh-hcard bh-hcard-${head.cls}`}>
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
            <span className="bh-hstatus-chevron" aria-hidden>›</span>
          </span>
        </header>

        <dl className="bh-hstats">
          <div>
            <dt>Total Stake(GHS)</dt>
            <dd>{fmt(bet.stake)}</dd>
          </div>
          <div>
            <dt>Total Return</dt>
            <dd className={totalReturn > 0 ? 'is-positive' : ''}>{fmt(totalReturn)}</dd>
          </div>
        </dl>

        {previewLegs.length > 0 && (
          <ul className="bh-hlegs">
            {previewLegs.map((l, i) => (
              <li key={i}>{l.home} v {l.away}</li>
            ))}
            {extraLegs > 0 && (
              <li className="bh-hlegs-more">…(and {extraLegs} other match{extraLegs === 1 ? '' : 'es'})</li>
            )}
          </ul>
        )}

        {bet.status === 'lost' && (
          <button type="button" className="bh-hremix" onClick={onRemix}>
            Remix Bet
          </button>
        )}
      </div>
    </li>
  );
}

function computeOffer(b) {
  if (b.status !== 'open') return 0;
  return b.lastCashOutOffer?.amount ?? b.cashoutOffer ?? Number((b.stake * (b.totalOdds * 0.6)).toFixed(2));
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
        <PageBack />
        <header className="bh-head fade-up">
          <div>
            <h1>My Bets</h1>
            <p className="bh-sub">Open tickets and your full bet history — all in one place.</p>
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
                onRemix={() => {
                  toast('Building a new slip from this ticket…');
                  navigate('/');
                }}
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
                        {b.legs.map((l, i) => (
                          <li key={i} className="bh-leg">
                            <div className="bh-leg-teams">{l.home} <span>vs</span> {l.away}</div>
                            <div className="bh-leg-pick">
                              <span className="bh-leg-market">{l.marketName || l.market}</span>
                              <span className="bh-leg-odds">{l.outcome} @ {Number(l.odds).toFixed(2)}</span>
                            </div>
                          </li>
                        ))}
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
  .bh-summary { display: grid; grid-template-columns: repeat(3, 1fr); }
  .bh-summary-card { min-width: 0; padding: 8px 10px; }
  .bh-summary-card strong { font-size: 14px; }
  .bh-list { grid-template-columns: 1fr; gap: 10px; }
  .bh-card { padding: 14px; }
  .bh-stats { padding: 10px; gap: 6px; }
  .bh-stat strong { font-size: 13.5px; }
}

/* Trend arrows on the cash-out button */
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

/* Auto cash-out target input */
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

/* Confirmation modal */
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

/* Partial-cash-out fraction chips */
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
`;

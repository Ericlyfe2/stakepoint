import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchBetHistory, cashOutBet } from '../api/betApi.js';
import { useAccount, useToast } from '../providers/AccountProvider.jsx';
import { toBookingCode } from '../components/BetSuccessModal.jsx';

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

export default function BetHistoryPage() {
  const navigate = useNavigate();
  const { account, adjustBalance } = useAccount();
  const { toast } = useToast();
  const [tab, setTab]         = useState('open');
  const [bets, setBets]       = useState([]);
  const [busy, setBusy]       = useState(false);
  const [copiedCode, setCopiedCode] = useState(null);

  useEffect(() => {
    if (!account) { navigate('/login?next=/my-bets'); return; }
    let alive = true;
    (async () => {
      try {
        setBusy(true);
        const data = await fetchBetHistory();
        if (alive) setBets(data.bets || []);
      } catch (e) {
        if (alive) toast(e.message || 'Could not load bets.', 'error');
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => { alive = false; };
  }, [account, navigate, toast]);

  const openBets = useMemo(() => bets.filter((b) => b.status === 'open'), [bets]);
  const settled  = useMemo(() => bets.filter((b) => b.status !== 'open'), [bets]);
  const visible  = tab === 'open' ? openBets : settled;

  const totals = useMemo(() => ({
    openCount:  openBets.length,
    openStake:  openBets.reduce((s, b) => s + Number(b.stake || 0), 0),
    openWin:    openBets.reduce((s, b) => s + Number(b.potentialWin || 0), 0),
    settledCount: settled.length,
  }), [openBets, settled]);

  const onCashOut = async (id) => {
    try {
      const res = await cashOutBet(id);
      const cash = res.bet.cashOut || 0;
      adjustBalance(cash, `Cashed out: GHS ${fmt(cash)}.`);
      const refreshed = await fetchBetHistory();
      setBets(refreshed.bets || []);
    } catch (e) {
      toast(e.message || 'Cash-out unavailable.', 'error');
    }
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
        ) : (
          <ul className="bh-list">
            {visible.map((b) => {
              const code = toBookingCode(b.id);
              const isOpen = b.status === 'open';
              const cashOutVal = Number((b.stake * (b.totalOdds * 0.6)).toFixed(2));
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
                    <button type="button" className="bh-copy" onClick={() => onCopy(code)}>
                      {copiedCode === code ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>

                  {isOpen && (
                    <button
                      type="button"
                      className="bh-cashout"
                      onClick={() => onCashOut(b.id)}
                    >
                      Cash Out · GHS {fmt(cashOutVal)}
                    </button>
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
`;

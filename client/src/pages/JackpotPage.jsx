import { useEffect, useMemo, useState } from 'react';
import { fetchJackpot, enterJackpot } from '../api/betApi.js';
import { useToast, useAccount } from '../layout/AppShell.jsx';
import PageBack from '../components/PageBack.jsx';

function fmt(n) {
  return Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseDuration(str) {
  // "4d 12h 32m" / "12h 32m" / "32m" → seconds
  if (!str) return 0;
  let total = 0;
  for (const m of String(str).matchAll(/(\d+)\s*([dhms])/gi)) {
    const v = Number(m[1]);
    const u = m[2].toLowerCase();
    total += v * (u === 'd' ? 86400 : u === 'h' ? 3600 : u === 'm' ? 60 : 1);
  }
  return total;
}

function formatCountdown(secs) {
  if (secs <= 0) return { d: '00', h: '00', m: '00', s: '00' };
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const p = (n) => String(n).padStart(2, '0');
  return { d: p(d), h: p(h), m: p(m), s: p(s) };
}

export default function JackpotPage() {
  const { toast } = useToast();
  const { account, adjustBalance } = useAccount();
  const [jackpot, setJackpot] = useState(null);
  const [picks, setPicks] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    fetchJackpot()
      .then((d) => {
        setJackpot(d.jackpot);
        setSecondsLeft(parseDuration(d.jackpot?.drawsIn));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!secondsLeft) return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [secondsLeft > 0]);

  const completed   = jackpot ? jackpot.legs.filter((l) => picks[l.id]).length : 0;
  const allPicked   = jackpot ? completed === jackpot.legs.length : false;
  const progressPct = jackpot ? Math.round((completed / jackpot.legs.length) * 100) : 0;
  const countdown   = useMemo(() => formatCountdown(secondsLeft), [secondsLeft]);

  if (!jackpot) {
    return (
      <main className="jp-page">
        <div className="jp-shell">
          <p className="jp-empty">Loading jackpot…</p>
        </div>
        <style>{JP_CSS}</style>
      </main>
    );
  }

  const autoFill = () => {
    const next = {};
    for (const leg of jackpot.legs) {
      next[leg.id] = leg.outcomes[Math.floor(Math.random() * leg.outcomes.length)];
    }
    setPicks(next);
    toast('Auto-pick complete — review or submit.');
  };

  const clearAll = () => {
    setPicks({});
    toast('Picks cleared.');
  };

  const submit = async () => {
    if (!allPicked) { toast(`Pick all ${jackpot.legs.length} legs to enter.`); return; }
    if (!account)   { toast('Sign in to enter the jackpot.'); return; }
    if (account.balance < jackpot.entryFee) { toast(`Top up — entry fee is GHS ${jackpot.entryFee}`); return; }
    try {
      setSubmitting(true);
      const res = await enterJackpot(picks);
      adjustBalance(-jackpot.entryFee, `Jackpot entry confirmed · ${res.entry.id.slice(-6)}`);
      setPicks({});
    } catch (e) {
      toast(e.message || 'Could not enter jackpot.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="jp-page">
      <div className="jp-shell">
        <PageBack />
        <header className="jp-hero fade-up">
          <div className="jp-hero-bg" aria-hidden />
          <div className="jp-hero-inner">
            <div className="jp-hero-tags">
              <span className="jp-badge">JACKPOT</span>
              <span className="jp-badge jp-badge-cool">{jackpot.legs.length}-LEG</span>
              <span className="jp-badge jp-badge-warm">ENTRY GHS {jackpot.entryFee}</span>
            </div>
            <h1>{jackpot.name}</h1>

            <div className="jp-pool">
              <div className="jp-pool-label">Current pool</div>
              <div className="jp-pool-amt">
                <span className="cur">GHS</span>
                <span className="amt">{fmt(jackpot.pool)}</span>
              </div>
            </div>

            <div className="jp-countdown" aria-live="polite">
              <div className="jp-cd-cell"><strong>{countdown.d}</strong><span>days</span></div>
              <div className="jp-cd-sep">:</div>
              <div className="jp-cd-cell"><strong>{countdown.h}</strong><span>hrs</span></div>
              <div className="jp-cd-sep">:</div>
              <div className="jp-cd-cell"><strong>{countdown.m}</strong><span>min</span></div>
              <div className="jp-cd-sep">:</div>
              <div className="jp-cd-cell"><strong>{countdown.s}</strong><span>sec</span></div>
            </div>
          </div>
        </header>

        <section className="jp-toolbar fade-up" style={{ animationDelay: '0.04s' }}>
          <div className="jp-progress" aria-hidden>
            <div className="jp-progress-track">
              <div className="jp-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="jp-progress-label">
              <strong>{completed}</strong> / {jackpot.legs.length} legs picked
            </span>
          </div>
          <div className="jp-toolbar-actions">
            <button type="button" className="btn btn-ghost" onClick={clearAll} disabled={!completed}>Clear</button>
            <button type="button" className="btn btn-ghost" onClick={autoFill}>Auto-pick</button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={submit}
              disabled={submitting || !allPicked}
            >
              {submitting ? 'Entering…' : allPicked ? `Enter · GHS ${jackpot.entryFee}` : `Pick ${jackpot.legs.length - completed} more`}
            </button>
          </div>
        </section>

        <ul className="jp-legs">
          {jackpot.legs.map((leg, i) => {
            const picked = picks[leg.id];
            return (
              <li
                key={leg.id}
                className={`jp-leg fade-up${picked ? ' picked' : ''}`}
                style={{ animationDelay: `${0.06 + i * 0.025}s` }}
              >
                <div className="jp-leg-num">{String(i + 1).padStart(2, '0')}</div>
                <div className="jp-leg-body">
                  <div className="jp-leg-fix">{leg.fixture}</div>
                  {leg.kickoff && <div className="jp-leg-meta">{leg.kickoff}</div>}
                </div>
                <div className="jp-leg-picks">
                  {leg.outcomes.map((o) => (
                    <button
                      key={o}
                      type="button"
                      className={`jp-pick${picked === o ? ' active' : ''}`}
                      onClick={() => setPicks((p) => ({ ...p, [leg.id]: p[leg.id] === o ? null : o }))}
                    >
                      <span className="jp-pick-label">{o}</span>
                      {leg.odds?.[o] && <span className="jp-pick-odds">{Number(leg.odds[o]).toFixed(2)}</span>}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>

        {/* sticky submit on mobile */}
        <div className="jp-sticky-submit">
          <button
            type="button"
            className="btn btn-primary"
            onClick={submit}
            disabled={submitting || !allPicked}
          >
            {submitting ? 'Entering…' : allPicked ? `Enter · GHS ${jackpot.entryFee}` : `${completed}/${jackpot.legs.length} picked`}
          </button>
        </div>
      </div>

      <style>{JP_CSS}</style>
    </main>
  );
}

const JP_CSS = `
.jp-page { padding: 28px 0 120px; min-height: calc(100vh - 200px); }
.jp-shell { max-width: 1100px; margin: 0 auto; padding: 0 20px; display: flex; flex-direction: column; gap: 18px; }
.jp-empty { color: var(--text-dim); padding: 32px 0; text-align: center; }

.jp-hero {
  position: relative; overflow: hidden;
  border-radius: 22px;
  background: linear-gradient(135deg, #0f1413 0%, #1a2421 100%);
  border: 1px solid rgba(255, 181, 71, .25);
  padding: 28px;
}
.jp-hero-bg {
  position: absolute; inset: -10%;
  background:
    radial-gradient(540px 320px at 90% -20%, rgba(255, 181, 71, .22), transparent 60%),
    radial-gradient(420px 280px at -10% 110%, rgba(197, 255, 61, .12), transparent 60%);
  pointer-events: none;
}
.jp-hero-inner { position: relative; z-index: 1; }
.jp-hero-tags {
  display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px;
}
.jp-badge {
  font-size: 10px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase;
  padding: 4px 10px; border-radius: 999px;
  background: rgba(255, 181, 71, .14);
  color: var(--accent-warm);
}
.jp-badge.jp-badge-cool { background: rgba(106, 208, 255, .12); color: var(--accent-cool); }
.jp-badge.jp-badge-warm { background: rgba(197, 255, 61, .14); color: var(--accent); }
.jp-hero-inner h1 {
  margin: 4px 0 16px; font-size: 30px; font-weight: 900;
  letter-spacing: -.02em; line-height: 1.05;
}

.jp-pool { margin-bottom: 14px; }
.jp-pool-label {
  font-size: 11px; letter-spacing: .14em; text-transform: uppercase;
  color: var(--text-dim); font-weight: 700;
}
.jp-pool-amt {
  display: flex; align-items: baseline; gap: 10px; margin-top: 4px;
  font-variant-numeric: tabular-nums;
}
.jp-pool-amt .cur { color: var(--accent-warm); font-size: 18px; font-weight: 700; letter-spacing: .04em; }
.jp-pool-amt .amt {
  font-size: 48px; font-weight: 900; letter-spacing: -.02em;
  background: linear-gradient(120deg, #ffd76d, #ffb547 50%, #ff9f1c);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  text-shadow: 0 8px 30px rgba(255, 181, 71, .35);
}

.jp-countdown {
  display: inline-flex; align-items: stretch; gap: 6px;
  background: rgba(0, 0, 0, .25);
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 181, 71, .14);
}
.jp-cd-cell {
  display: flex; flex-direction: column; align-items: center; gap: 1px;
  min-width: 44px;
}
.jp-cd-cell strong {
  font-size: 20px; font-weight: 900; color: #fff;
  font-variant-numeric: tabular-nums; letter-spacing: -.02em;
}
.jp-cd-cell span {
  font-size: 9px; letter-spacing: .12em; text-transform: uppercase;
  color: var(--text-dim);
}
.jp-cd-sep { font-size: 18px; font-weight: 800; color: var(--text-dim); display: grid; place-items: center; padding-bottom: 14px; }

.jp-toolbar {
  display: grid; grid-template-columns: 1fr auto; gap: 16px;
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--surface-2);
  border-radius: 14px;
  padding: 14px 16px;
}
.jp-progress { display: flex; flex-direction: column; gap: 6px; }
.jp-progress-track {
  height: 8px; border-radius: 999px;
  background: var(--surface-2); overflow: hidden;
}
.jp-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-warm));
  transition: width .25s ease;
}
.jp-progress-label {
  font-size: 12px; color: var(--text-soft);
}
.jp-progress-label strong { color: var(--text); font-weight: 800; }
.jp-toolbar-actions { display: flex; gap: 8px; }

.jp-legs { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.jp-leg {
  display: grid;
  grid-template-columns: 40px 1fr auto;
  align-items: center;
  gap: 12px;
  background: var(--surface);
  border: 1px solid var(--surface-2);
  border-radius: 14px;
  padding: 14px 16px;
  transition: border-color .15s ease, transform .15s ease;
}
.jp-leg:hover { border-color: rgba(197, 255, 61, .25); transform: translateY(-1px); }
.jp-leg.picked { border-color: color-mix(in srgb, var(--accent) 45%, var(--surface-2)); }
.jp-leg-num {
  font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
  font-size: 12px; font-weight: 700;
  color: var(--text-dim);
  background: var(--surface-2);
  border-radius: 8px;
  padding: 6px 0;
  text-align: center;
}
.jp-leg.picked .jp-leg-num { color: var(--accent); background: rgba(197, 255, 61, .1); }
.jp-leg-fix { font-size: 14px; font-weight: 700; }
.jp-leg-meta { font-size: 11.5px; color: var(--text-dim); margin-top: 2px; }
.jp-leg-picks { display: flex; gap: 6px; }
.jp-pick {
  min-width: 52px;
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 8px 10px;
  background: var(--surface-2);
  border: 1px solid transparent;
  border-radius: 10px;
  color: var(--text-soft);
  font-weight: 700; font-size: 13px;
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease, color .15s ease;
}
.jp-pick:hover { color: var(--text); border-color: var(--text-dim); }
.jp-pick.active {
  background: var(--accent);
  color: #0e1330;
  border-color: var(--accent);
}
.jp-pick-label { font-weight: 800; }
.jp-pick-odds { font-size: 10px; opacity: .75; font-variant-numeric: tabular-nums; }
.jp-pick.active .jp-pick-odds { opacity: 1; }

.jp-sticky-submit {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  padding: 12px 16px;
  background: linear-gradient(180deg, rgba(15, 20, 19, 0) 0%, var(--bg-soft) 40%);
  z-index: 50;
  display: none;
}
.jp-sticky-submit .btn { width: 100%; padding: 14px; font-size: 14px; font-weight: 800; }

@media (max-width: 760px) {
  .jp-shell { padding: 0 12px; }
  .jp-hero { padding: 22px 18px; }
  .jp-hero-inner h1 { font-size: 22px; }
  .jp-pool-amt .amt { font-size: 36px; }
  .jp-cd-cell { min-width: 38px; }
  .jp-cd-cell strong { font-size: 17px; }
  .jp-toolbar { grid-template-columns: 1fr; }
  .jp-toolbar-actions { justify-content: stretch; }
  .jp-toolbar-actions .btn { flex: 1; }
  .jp-leg { grid-template-columns: 36px 1fr; }
  .jp-leg-picks { grid-column: 1 / -1; margin-top: 6px; }
  .jp-pick { flex: 1; }
  .jp-sticky-submit { display: block; }
}
`;

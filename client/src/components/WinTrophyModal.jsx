/**
 * Celebration modal shown when the player has freshly-settled winning bets
 * they haven't acknowledged yet.
 *
 * Layout:
 *   ┌────────────────────────────────────────┐
 *   │ [WIN CONFIRMED]                    [×] │
 *   │              🏆                        │
 *   │           Congratulations!             │
 *   │   Your winning bet has been paid…      │
 *   │            GHS 29,470.00               │
 *   │           Single · 1 selection         │
 *   │  ┌────────────┐  ┌──────────────┐      │
 *   │  │ Slip Code  │  │   Stake      │      │
 *   │  │ SLIP-…     │  │  GHS 1,000   │      │
 *   │  └────────────┘  └──────────────┘      │
 *   │  ┌─────────────────────────────────┐   │
 *   │  │ Paid At  10 May 2026, 04:25     │   │
 *   │  └─────────────────────────────────┘   │
 *   │  [ View Slip ]  [ AWESOME ]            │
 *   └────────────────────────────────────────┘
 *
 * Auto-dismisses after 45s so the rest of the UI stays interactive.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { toBookingCode } from './BetSuccessModal.jsx';

function fmt(n) {
  return Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function paidAtLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const dt = d.toLocaleDateString('en-GH', { day: '2-digit', month: 'short', year: 'numeric' });
  const tm = d.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${dt}, ${tm}`;
}

export default function WinTrophyModal({ wins = [], onClose, onViewSlip }) {
  const dlgRef = useRef(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!wins.length) return;
    setIndex(0);
    dlgRef.current?.showModal?.();
    const onCancel = (e) => { e.preventDefault(); onClose?.(); };
    const node = dlgRef.current;
    node?.addEventListener('cancel', onCancel);
    const autoClose = setTimeout(() => onClose?.(), 45_000);
    return () => {
      node?.removeEventListener('cancel', onCancel);
      clearTimeout(autoClose);
    };
  }, [wins.length, onClose]);

  // Each entry's effective payout: cash-outs use `cashOut`, plain wins use
  // `potentialWin`. Same logic feeds both the totals row and the focused tile.
  const payoutOf = (b) => Number(b?.cashOut ?? b?.potentialWin ?? 0);
  const totalPayout = useMemo(
    () => wins.reduce((s, b) => s + payoutOf(b), 0),
    [wins]
  );

  if (!wins.length) return null;

  const focus    = wins[Math.min(index, wins.length - 1)];
  const single   = wins.length === 1;
  const isCashOut = !!focus.cashOut || focus.status === 'cashed_out';
  const showPayout = single ? payoutOf(focus) : totalPayout;
  const legs     = focus.legs?.length || 1;
  const modeLbl  = focus.mode === 'single' ? 'Single'
                 : focus.mode === 'multiple' ? 'Multiple'
                 : focus.mode === 'system' ? 'System' : (focus.mode || 'Bet');
  const slipCode = focus.bookingCode || toBookingCode(focus.id);
  const paidAt   = paidAtLabel(focus.settledAt || focus.placedAt);
  const badgeLabel = isCashOut ? 'CASH-OUT CONFIRMED' : 'WIN CONFIRMED';
  const subCopy = isCashOut
    ? 'Your cash-out has been credited to your wallet.'
    : 'Your winning bet has been paid successfully.';
  const metaSingle = isCashOut
    ? <>Cashed out · {legs} selection{legs > 1 ? 's' : ''}</>
    : <>{modeLbl} · {legs} selection{legs > 1 ? 's' : ''}</>;

  const handleViewSlip = () => {
    onViewSlip?.(focus);
    onClose?.();
  };

  return (
    <dialog ref={dlgRef} className="bv-trophy">
      <Confetti count={48} />

      <div className="bv-trophy-card" role="alertdialog" aria-labelledby="bv-trophy-title">
        <header className="bv-trophy-head">
          <span className="bv-trophy-badge">{badgeLabel}</span>
          <button
            type="button"
            className="bv-trophy-x"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="bv-trophy-emblem" aria-hidden>
          <TrophyBadge />
        </div>

        <h2 id="bv-trophy-title" className="bv-trophy-title">Congratulations!</h2>
        <p className="bv-trophy-sub">{subCopy}</p>

        <div className="bv-trophy-amount">
          <span className="cur">GHS</span>
          <span className="amt">{fmt(showPayout)}</span>
        </div>
        <div className="bv-trophy-meta">
          {single
            ? metaSingle
            : <>{wins.length} {isCashOut ? 'cash-outs · combined payout' : 'winning tickets · combined payout'}</>}
        </div>

        <div className="bv-trophy-grid">
          <div className="bv-trophy-stat">
            <span className="lbl">Slip Code</span>
            <span className="val val-mono">{slipCode}</span>
          </div>
          <div className="bv-trophy-stat">
            <span className="lbl">Stake</span>
            <span className="val">GHS {fmt(focus.stake)}</span>
          </div>
        </div>

        <div className="bv-trophy-paidat">
          <span className="lbl">Paid At</span>
          <span className="val">{paidAt || '—'}</span>
        </div>

        {wins.length > 1 && (
          <div className="bv-trophy-pager">
            {wins.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Show winning ticket ${i + 1} of ${wins.length}`}
                className={`bv-trophy-dot${i === index ? ' active' : ''}`}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
        )}

        <div className="bv-trophy-actions">
          <button
            type="button"
            className="bv-trophy-btn bv-trophy-btn-ghost"
            onClick={handleViewSlip}
          >
            View Slip
          </button>
          <button
            type="button"
            className="bv-trophy-btn bv-trophy-btn-primary"
            onClick={onClose}
          >
            Awesome
          </button>
        </div>
      </div>

      <style>{TROPHY_CSS}</style>
    </dialog>
  );
}

function TrophyBadge() {
  return (
    <div className="bv-trophy-disc">
      <svg viewBox="0 0 64 64" width="42" height="42" aria-hidden>
        <defs>
          <linearGradient id="bvCupBody" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0"   stopColor="#fff3b8" />
            <stop offset=".55" stopColor="#f3a01a" />
            <stop offset="1"   stopColor="#a86200" />
          </linearGradient>
          <linearGradient id="bvCupBase" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7a3f00" />
            <stop offset="1" stopColor="#3a1f00" />
          </linearGradient>
        </defs>
        <path d="M14 12 H50 V30 C50 40 42 46 32 46 C22 46 14 40 14 30 Z" fill="url(#bvCupBody)" />
        <ellipse cx="32" cy="12" rx="18" ry="3.6" fill="#ffe28a" />
        <path d="M14 18 Q7 18 8 24 Q9 30 16 30" fill="none" stroke="#cc7a00" strokeWidth="3" strokeLinecap="round" />
        <path d="M50 18 Q57 18 56 24 Q55 30 48 30" fill="none" stroke="#cc7a00" strokeWidth="3" strokeLinecap="round" />
        <path d="M28 46 H36 V52 H28 Z" fill="url(#bvCupBase)" />
        <path d="M22 52 H42 V55 H22 Z" fill="url(#bvCupBase)" />
        <circle cx="32" cy="26" r="6" fill="#fff3b8" opacity=".75" />
        <path d="M32 22 l1.6 3.2 3.6 .5 -2.6 2.5 .6 3.6 -3.2 -1.7 -3.2 1.7 .6 -3.6 -2.6 -2.5 3.6 -.5 z"
              fill="#a86200" />
      </svg>
    </div>
  );
}

function Confetti({ count = 36 }) {
  const pieces = Array.from({ length: count }).map((_, i) => {
    const left = Math.random() * 100;
    const delay = Math.random() * 1.4;
    const dur   = 2.4 + Math.random() * 2.2;
    const rot   = Math.random() * 360;
    const colors = ['#ffd76d', '#ffb547', '#18f0a1', '#22d3ee', '#c5ff3d', '#ff9f1c'];
    const c = colors[i % colors.length];
    return { left, delay, dur, rot, c, key: i, w: 6 + Math.random() * 6, h: 9 + Math.random() * 9 };
  });
  return (
    <div className="bv-trophy-confetti" aria-hidden>
      {pieces.map((p) => (
        <span key={p.key} style={{
          left: `${p.left}%`,
          animationDelay: `${p.delay}s`,
          animationDuration: `${p.dur}s`,
          background: p.c,
          width: p.w, height: p.h,
          transform: `rotate(${p.rot}deg)`,
        }} />
      ))}
    </div>
  );
}

const TROPHY_CSS = `
.bv-trophy {
  border: none; padding: 0; background: transparent;
  width: min(420px, 92vw);
  border-radius: 22px;
  color: #ffffff;
}
.bv-trophy::backdrop {
  background: radial-gradient(800px 600px at 50% 30%, rgba(8, 60, 42, .55), rgba(0, 0, 0, .82));
  backdrop-filter: blur(6px);
}
.bv-trophy-card {
  position: relative; z-index: 2;
  background:
    radial-gradient(600px 220px at 80% -10%, rgba(255, 200, 80, .14), transparent 60%),
    linear-gradient(180deg, #0d2c1d 0%, #0a2418 100%);
  border-radius: 22px;
  padding: 22px 22px 20px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, .55), 0 0 0 1px rgba(255, 200, 80, .18) inset;
  font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
  animation: bvTrophyPop .38s cubic-bezier(.18, .8, .36, 1.18);
  text-align: center;
}
@keyframes bvTrophyPop {
  from { transform: scale(.9) translateY(8px); opacity: 0; }
  to   { transform: scale(1)  translateY(0);   opacity: 1; }
}

.bv-trophy-head {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 8px;
}
.bv-trophy-badge {
  font-size: 10px; letter-spacing: .18em; font-weight: 800;
  color: #ffe28a;
  background: rgba(255, 200, 80, .08);
  border: 1px solid rgba(255, 200, 80, .35);
  padding: 5px 10px; border-radius: 999px;
}
.bv-trophy-x {
  width: 28px; height: 28px; border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, .14);
  background: transparent;
  color: rgba(255, 255, 255, .75);
  font-size: 18px; line-height: 1;
  cursor: pointer;
  display: grid; place-items: center;
  transition: color .15s ease, border-color .15s ease;
}
.bv-trophy-x:hover { color: #fff; border-color: rgba(255, 255, 255, .35); }

.bv-trophy-emblem {
  display: flex; justify-content: center; margin: 6px 0 4px;
  animation: bvTrophyBounce 2.6s ease-in-out infinite;
}
@keyframes bvTrophyBounce {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-4px); }
}
.bv-trophy-disc {
  width: 64px; height: 64px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #ffd76d 0%, #f3a01a 60%, #b06700 100%);
  display: grid; place-items: center;
  box-shadow: 0 14px 36px rgba(255, 180, 50, .35),
              0 0 0 4px rgba(255, 200, 80, .18);
}

.bv-trophy-title {
  margin: 12px 0 4px;
  font-size: 24px; font-weight: 900;
  letter-spacing: -.01em;
  color: #ffffff;
}
.bv-trophy-sub {
  margin: 0 0 14px;
  font-size: 12.5px;
  color: rgba(255, 255, 255, .72);
}

.bv-trophy-amount {
  display: flex; align-items: baseline; justify-content: center; gap: 8px;
  margin: 4px 0 4px;
  font-variant-numeric: tabular-nums;
}
.bv-trophy-amount .cur {
  font-size: 14px; font-weight: 700;
  color: rgba(255, 200, 80, .65);
  letter-spacing: .08em;
}
.bv-trophy-amount .amt {
  font-size: 36px; font-weight: 900;
  letter-spacing: -.02em;
  color: #ffc44d;
  text-shadow: 0 6px 24px rgba(255, 180, 50, .35);
}
.bv-trophy-meta {
  font-size: 12px;
  color: rgba(255, 255, 255, .58);
  margin-bottom: 16px;
}

.bv-trophy-grid {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 8px;
}
.bv-trophy-stat,
.bv-trophy-paidat {
  background: rgba(255, 255, 255, .04);
  border: 1px solid rgba(255, 255, 255, .06);
  border-radius: 12px;
  padding: 10px 12px;
  display: flex; flex-direction: column; gap: 4px;
  text-align: left;
}
.bv-trophy-paidat { margin-bottom: 14px; }
.bv-trophy-stat .lbl,
.bv-trophy-paidat .lbl {
  font-size: 10px; letter-spacing: .12em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, .45);
}
.bv-trophy-stat .val,
.bv-trophy-paidat .val {
  font-size: 14px; font-weight: 700;
  color: #ffffff;
  font-variant-numeric: tabular-nums;
}
.bv-trophy-stat .val-mono {
  font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
  letter-spacing: .04em;
  color: #ffe28a;
  font-weight: 700;
  font-size: 13px;
}

.bv-trophy-pager {
  display: flex; gap: 6px; justify-content: center;
  margin-bottom: 12px;
}
.bv-trophy-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: rgba(255, 255, 255, .25);
  border: none; padding: 0;
  cursor: pointer;
  transition: background .15s ease, transform .15s ease;
}
.bv-trophy-dot.active { background: #ffc44d; transform: scale(1.4); }

.bv-trophy-actions {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.bv-trophy-btn {
  padding: 12px 16px;
  border-radius: 12px;
  border: none;
  font-weight: 800; font-size: 13.5px;
  letter-spacing: .02em;
  cursor: pointer;
  transition: transform .15s ease, box-shadow .15s ease, background .15s ease;
}
.bv-trophy-btn-ghost {
  background: rgba(255, 255, 255, .06);
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, .14);
}
.bv-trophy-btn-ghost:hover {
  background: rgba(255, 255, 255, .1);
  border-color: rgba(255, 255, 255, .25);
}
.bv-trophy-btn-primary {
  background: linear-gradient(135deg, #ffc44d 0%, #f6a200 100%);
  color: #2a1700;
  box-shadow: 0 12px 28px rgba(246, 162, 0, .35);
}
.bv-trophy-btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 16px 36px rgba(246, 162, 0, .55);
}

.bv-trophy-confetti {
  position: fixed; inset: 0; pointer-events: none; z-index: 1;
  overflow: hidden;
}
.bv-trophy-confetti span {
  position: absolute;
  top: -16px;
  border-radius: 2px;
  opacity: .92;
  animation: bvTrophyFall linear infinite;
}
@keyframes bvTrophyFall {
  0%   { transform: translate(0, -20px) rotate(0); opacity: 0; }
  10%  { opacity: .95; }
  100% { transform: translate(20px, 110vh) rotate(720deg); opacity: 0; }
}

@media (max-width: 380px) {
  .bv-trophy-card { padding: 18px 16px 16px; }
  .bv-trophy-title { font-size: 20px; }
  .bv-trophy-amount .amt { font-size: 32px; }
  .bv-trophy-stat .val,
  .bv-trophy-paidat .val { font-size: 13px; }
}
`;

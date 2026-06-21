import { useEffect, useRef, useState } from 'react';
import OddsGauge from './OddsGauge.jsx';

export function toBookingCode(id = '') {
  const s = String(id).replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (!s) return 'XX00000';
  const letters = (s.match(/[A-Z]/g) || ['X', 'X']).slice(0, 2).join('').padEnd(2, 'X');
  const digits  = (s.match(/[0-9]/g) || ['0']).slice(-5).join('').padStart(5, '0');
  return letters + digits;
}

function formatAmt(n) {
  return Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BetSuccessModal({ bet, onClose, onRebet, onConfirm, recommendedCodes = [] }) {
  const dlg = useRef(null);
  const [showWin, setShowWin] = useState(false);

  useEffect(() => {
    if (!bet || !dlg.current) return;
    if (!dlg.current.open) dlg.current.showModal();
    setShowWin(false);
  }, [bet]);

  if (!bet) return null;
  const code = bet.bookingCode || toBookingCode(bet.id);

  const copy = async () => {
    try { await navigator.clipboard.writeText(code); } catch {/* ignore */}
  };

  const totalOdds = bet.legs?.reduce((acc, l) => acc * (l.odds || 1), 1) || bet.totalOdds || 0;

  return (
    <dialog
      ref={dlg}
      className="bet-success-dialog"
      onClose={onClose}
    >
      <div className="bet-success-scroll">
        {/* Checkmark */}
        <div className="bet-success-check">
          <div className="bet-success-check-circle">
            <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
              <path
                d="M12 27.5 L22 37 L41 16"
                stroke="#ffffff"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  strokeDasharray: 60,
                  strokeDashoffset: 60,
                  animation: 'bv-tick-draw 420ms ease-out 120ms forwards',
                }}
              />
            </svg>
          </div>
          <h3 className="bet-success-title">Bet Successful</h3>
        </div>

        <style>{`
          @keyframes bv-tick-pop {
            0%   { transform: scale(0.4); opacity: 0; }
            60%  { transform: scale(1.08); opacity: 1; }
            100% { transform: scale(1);    opacity: 1; }
          }
          @keyframes bv-tick-draw {
            to { stroke-dashoffset: 0; }
          }
        `}</style>

        {/* Stats */}
        <div className="bet-success-stats">
          <div className="bet-success-stat">
            <span className="bet-success-stat-label">Total Stake</span>
            <span className="bet-success-stat-value">{formatAmt(bet.stake)}</span>
          </div>
          <div className="bet-success-stat">
            <span className="bet-success-stat-label">Potential Win</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="bet-success-stat-value" style={{ filter: showWin ? 'none' : 'blur(6px)', cursor: 'pointer' }} onClick={() => setShowWin(true)}>
                {formatAmt(bet.potentialWin)}
              </span>
              {!showWin && (
                <button type="button" className="bet-success-publish" onClick={() => setShowWin(true)}>
                  Publish
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Reward + Open Bets */}
        <div className="bet-success-links">
          <div className="bet-success-link-row">
            <span>Reward Progress</span>
            <button type="button" className="bet-success-view">View</button>
          </div>
          <div className="bet-success-link-row">
            <span>Open Bets</span>
            <button type="button" className="bet-success-view" onClick={() => { dlg.current?.close(); onConfirm?.(); }}>View</button>
          </div>
        </div>

        {/* Booking code */}
        <div className="bet-success-code-row">
          <div>
            <div className="bet-success-code-label">Booking Code</div>
            <div className="bet-success-code-value">{code}</div>
          </div>
          <button type="button" className="bet-success-copy" onClick={copy}>COPY</button>
        </div>

        {/* Recommended codes */}
        {recommendedCodes.length > 0 && (
          <div className="bet-success-recommended">
            <h4 className="bet-success-recommended-title">
              Recommended Football Codes
            </h4>

            {recommendedCodes.slice(0, 2).map((card) => (
              <div key={card.id} className="bet-success-rec-card">
                <div className="bet-success-rec-header">
                  <span className="bet-success-rec-code">{card.code}</span>
                  <div className="bet-success-rec-meta">
                    <span>Folds: <strong>{card.folds}</strong></span>
                    <span>Odds: <strong>{formatAmt(card.odds)}</strong></span>
                  </div>
                </div>

                {card.legs?.slice(0, 4).map((leg, i) => (
                  <div key={i} className="bet-success-rec-leg">
                    <span className="bet-success-rec-dot" />
                    <div className="bet-success-rec-leg-info">
                      <div className="bet-success-rec-pick">{leg.pick} | {leg.type}</div>
                      <div className="bet-success-rec-match">{leg.match || leg.matchLabel}</div>
                    </div>
                    <span className="bet-success-rec-time">{leg.time}</span>
                  </div>
                ))}

                <div className="bet-success-rec-actions">
                  <button type="button" className="bet-success-rec-share">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                      <polyline points="16 6 12 2 8 6" />
                      <line x1="12" y1="2" x2="12" y2="15" />
                    </svg>
                    Share
                  </button>
                  <button type="button" className="bet-success-rec-add">
                    Add to Betslip
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Bottom actions */}
        <div className="bet-success-actions">
          <button
            type="button"
            className="bet-success-rebet"
            onClick={() => { dlg.current?.close(); onRebet?.(); }}
          >
            Rebet
          </button>
          <button
            type="button"
            className="bet-success-ok"
            onClick={() => { dlg.current?.close(); onConfirm?.(); }}
          >
            OK
          </button>
        </div>
      </div>
    </dialog>
  );
}

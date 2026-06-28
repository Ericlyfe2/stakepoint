import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

function fmt(n) {
  return Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const PROCESSING_MESSAGES = [
  'Confirming current odds...',
  'Validating market status...',
  'Processing cash-out request...',
  'Checking offer availability...',
];

export default function CashoutModal({
  isOpen,
  bet,
  currentOffer,
  onConfirm,
  onCancel,
  busy,
  error,
  processing,
  processingMessage,
  changedOffer,
  onAcceptChanged,
}) {
  const [fraction, setFraction] = useState(1);
  const [messageIdx, setMessageIdx] = useState(0);

  useEffect(() => {
    if (!processing) return;
    const id = setInterval(() => {
      setMessageIdx((i) => (i + 1) % PROCESSING_MESSAGES.length);
    }, 1200);
    return () => clearInterval(id);
  }, [processing]);

  useEffect(() => {
    setFraction(1);
    setMessageIdx(0);
  }, [isOpen]);

  const isSystem = bet?.mode === 'system';
  const payoutNow = Number((currentOffer * fraction).toFixed(2));
  const remainStake = Number(((bet?.stake || 0) * (1 - fraction)).toFixed(2));
  const remainPotWin = Number((remainStake * (bet?.totalOdds || 1) * 1.08).toFixed(2));
  const isPartial = fraction > 0 && fraction < 1;
  const profitLoss = payoutNow - (bet?.stake || 0);
  const maxPartial = bet?.mode === 'multiple' ? 5 : 10;
  const partialCount = bet?.partialCashoutCount || 0;
  const remainingPartial = Math.max(0, maxPartial - partialCount);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="cm-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={!processing && !busy ? onCancel : undefined}
        >
          <motion.div
            className="cm-card"
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            {processing ? (
              <div className="cm-processing">
                <div className="cm-spinner-ring" />
                <h3 className="cm-processing-title">{processingMessage || 'Processing Cashout...'}</h3>
                <p className="cm-processing-msg">{PROCESSING_MESSAGES[messageIdx]}</p>
                <div className="cm-processing-amount">
                  <span className="cm-processing-label">Cashout Amount</span>
                  <strong className="cm-processing-value">GHS {fmt(payoutNow)}</strong>
                </div>
              </div>
            ) : changedOffer !== null ? (
              <div className="cm-changed">
                <div className="cm-changed-icon">!</div>
                <h3 className="cm-changed-title">Cashout Amount Changed</h3>
                <p className="cm-changed-desc">The offer changed while processing. Review the new amount below.</p>
                <div className="cm-changed-compare">
                  <div className="cm-changed-old">
                    <span className="cm-changed-label">Previous</span>
                    <strong className="cm-changed-value-old">GHS {fmt(currentOffer)}</strong>
                  </div>
                  <div className="cm-changed-arrow">→</div>
                  <div className="cm-changed-new">
                    <span className="cm-changed-label">New Offer</span>
                    <strong className="cm-changed-value-new">GHS {fmt(changedOffer)}</strong>
                  </div>
                </div>
                <div className="cm-changed-actions">
                  <button type="button" className="cm-btn cm-btn-cancel" onClick={onCancel}>Cancel</button>
                  <button type="button" className="cm-btn cm-btn-go" onClick={() => onAcceptChanged(changedOffer)}>
                    Accept GHS {fmt(changedOffer)}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="cm-header">
                  <h3 className="cm-title">Confirm Cashout</h3>
                  {bet?.bookingCode && (
                    <span className="cm-code">Booking: {bet.bookingCode}</span>
                  )}
                </div>

                {!isSystem && remainingPartial > 0 && (
                  <div className="cm-partial-section">
                    <div className="cm-partial-header">
                      <span className="cm-partial-label">Cashout Amount</span>
                      <span className="cm-partial-remaining">{remainingPartial} of {maxPartial} partial uses remaining</span>
                    </div>
                    <div className="cm-fraction-row">
                      {[0.25, 0.5, 0.75, 1].map((f) => (
                        <button
                          key={f}
                          type="button"
                          className={`cm-fraction-chip${fraction === f ? ' active' : ''}`}
                          onClick={() => setFraction(f)}
                          disabled={busy}
                        >
                          {f === 1 ? 'Full' : `${Math.round(f * 100)}%`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="cm-amount-card">
                  <div className="cm-amount-row">
                    <span className="cm-amount-label">Cashout Amount</span>
                    <strong className="cm-amount-value">GHS {fmt(payoutNow)}</strong>
                  </div>
                  <div className="cm-amount-row cm-amount-sub">
                    <span className="cm-amount-label">Original Stake</span>
                    <span className="cm-amount-subvalue">GHS {fmt(bet?.stake)}</span>
                  </div>
                  <div className="cm-amount-row cm-amount-sub">
                    <span className="cm-amount-label">Potential Win</span>
                    <span className="cm-amount-subvalue">GHS {fmt(bet?.potentialWin)}</span>
                  </div>
                  <div className="cm-divider" />
                  <div className={`cm-amount-row cm-amount-pl ${profitLoss >= 0 ? 'positive' : 'negative'}`}>
                    <span className="cm-amount-label">Profit / Loss</span>
                    <strong className="cm-amount-pl-value">
                      {profitLoss >= 0 ? '+' : ''}GHS {fmt(Math.abs(profitLoss))}
                    </strong>
                  </div>
                </div>

                {isPartial && (
                  <div className="cm-residual-card">
                    <span className="cm-residual-label">Remaining Ticket Stays Active</span>
                    <div className="cm-residual-details">
                      <div className="cm-residual-row">
                        <span>Remaining Stake</span>
                        <strong>GHS {fmt(remainStake)}</strong>
                      </div>
                      <div className="cm-residual-row">
                        <span>Remaining Potential Win</span>
                        <strong>GHS {fmt(remainPotWin)}</strong>
                      </div>
                    </div>
                  </div>
                )}

                <p className="cm-note">
                  The offer can change before submission. We will re-validate and notify you of any changes.
                </p>

                {error && (
                  <div className="cm-error">
                    <span className="cm-error-icon">!</span>
                    <span>{error}</span>
                  </div>
                )}

                <div className="cm-actions">
                  <button
                    type="button"
                    className="cm-btn cm-btn-cancel"
                    onClick={onCancel}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="cm-btn cm-btn-go"
                    onClick={() => onConfirm(fraction)}
                    disabled={busy}
                  >
                    {busy ? (
                      <>
                        <span className="cm-btn-spinner" />
                        Processing...
                      </>
                    ) : (
                      isPartial ? `Cash Out ${Math.round(fraction * 100)}%` : 'Confirm Cashout'
                    )}
                  </button>
                </div>
              </>
            )}
          </motion.div>

          <style>{CM_CSS}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const CM_CSS = `
.cm-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.65);
  display: grid; place-items: center;
  z-index: 99999;
  padding: 16px;
  backdrop-filter: blur(2px);
}
.cm-card {
  background: var(--surface);
  border: 1px solid var(--surface-2);
  border-radius: 16px;
  padding: 24px;
  max-width: 400px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0,0,0,0.4);
}

/* Header */
.cm-header { margin-bottom: 16px; }
.cm-title { margin: 0; font-size: 20px; font-weight: 800; color: var(--text); }
.cm-code { font-size: 12px; color: var(--text-dim); margin-top: 2px; display: block; }

/* Partial cashout */
.cm-partial-section { margin-bottom: 16px; }
.cm-partial-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.cm-partial-label { font-size: 11px; color: var(--text-dim); text-transform: uppercase; letter-spacing: .06em; font-weight: 700; }
.cm-partial-remaining { font-size: 10px; color: var(--text-soft); }
.cm-fraction-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.cm-fraction-chip {
  padding: 10px 0; border-radius: 8px;
  border: 1px solid var(--surface-2);
  background: var(--bg);
  color: var(--text);
  font: inherit; font-size: 12.5px; font-weight: 700;
  cursor: pointer; transition: all .15s;
}
.cm-fraction-chip:hover { border-color: var(--accent); }
.cm-fraction-chip.active { background: var(--accent); color: var(--bg); border-color: var(--accent); }
.cm-fraction-chip:disabled { opacity: .5; cursor: not-allowed; }

/* Amount card */
.cm-amount-card {
  padding: 16px;
  background: var(--bg);
  border-radius: 12px;
  border: 1px solid var(--surface-2);
  margin-bottom: 12px;
}
.cm-amount-row { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; }
.cm-amount-label { font-size: 13px; color: var(--text-dim); }
.cm-amount-value { font-size: 22px; font-weight: 800; color: var(--accent); font-variant-numeric: tabular-nums; }
.cm-amount-subvalue { font-size: 14px; font-weight: 600; color: var(--text-soft); }
.cm-divider { height: 1px; background: var(--surface-2); margin: 8px 0; }
.cm-amount-pl { padding-top: 4px; }
.cm-amount-pl.positive .cm-amount-pl-value { color: #0E8A4A; }
.cm-amount-pl.negative .cm-amount-pl-value { color: #e53935; }

/* Residual card */
.cm-residual-card {
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--surface-2);
  background: rgba(79,139,255,0.06);
  margin-bottom: 12px;
}
.cm-residual-label { font-size: 11px; font-weight: 700; color: #4f8bff; display: block; margin-bottom: 8px; }
.cm-residual-details { display: flex; flex-direction: column; gap: 4px; }
.cm-residual-row { display: flex; justify-content: space-between; font-size: 12px; color: var(--text-soft); }
.cm-residual-row strong { color: var(--text); font-variant-numeric: tabular-nums; }

/* Note & error */
.cm-note { font-size: 11px; color: var(--text-dim); margin: 0 0 16px; line-height: 1.5; }
.cm-error {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; border-radius: 8px;
  background: rgba(229,57,53,0.1);
  color: #e53935; font-size: 12px; font-weight: 600;
  margin-bottom: 12px;
}
.cm-error-icon {
  width: 20px; height: 20px; border-radius: 50%;
  background: #e53935; color: #fff;
  display: grid; place-items: center;
  font-size: 12px; font-weight: 800; flex-shrink: 0;
}

/* Actions */
.cm-actions { display: flex; gap: 10px; }
.cm-btn {
  flex: 1; padding: 13px 0; border-radius: 10px;
  border: none; font: inherit; font-size: 14px;
  font-weight: 800; cursor: pointer;
  transition: all .15s;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
}
.cm-btn:disabled { opacity: .5; cursor: not-allowed; }
.cm-btn-cancel { background: var(--bg); color: var(--text); border: 1px solid var(--surface-2); }
.cm-btn-cancel:hover:not(:disabled) { background: var(--surface-2); }
.cm-btn-go { background: linear-gradient(135deg, #004A2A, #005A32); color: #fff; }
.cm-btn-go:hover:not(:disabled) { opacity: .9; transform: translateY(-1px); }
.cm-btn-spinner {
  width: 14px; height: 14px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff; border-radius: 50%;
  animation: cmSpin .6s linear infinite;
}
@keyframes cmSpin { to { transform: rotate(360deg); } }

/* Processing state */
.cm-processing { text-align: center; padding: 20px 0; }
.cm-spinner-ring {
  width: 48px; height: 48px; margin: 0 auto 16px;
  border: 3px solid var(--surface-2);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: cmRing .8s linear infinite;
}
@keyframes cmRing { to { transform: rotate(360deg); } }
.cm-processing-title { margin: 0 0 4px; font-size: 18px; font-weight: 800; color: var(--text); }
.cm-processing-msg { margin: 0 0 20px; font-size: 13px; color: var(--text-dim); }
.cm-processing-amount {
  padding: 14px 16px;
  background: var(--bg);
  border-radius: 10px;
  border: 1px solid var(--surface-2);
}
.cm-processing-label { font-size: 12px; color: var(--text-dim); display: block; margin-bottom: 4px; }
.cm-processing-value { font-size: 24px; font-weight: 800; color: var(--accent); }

/* Changed offer */
.cm-changed { text-align: center; padding: 10px 0; }
.cm-changed-icon {
  width: 48px; height: 48px; border-radius: 50%;
  background: rgba(245,166,35,0.15);
  color: #f5a623;
  display: grid; place-items: center;
  font-size: 24px; font-weight: 800;
  margin: 0 auto 12px;
}
.cm-changed-title { margin: 0 0 4px; font-size: 18px; font-weight: 800; }
.cm-changed-desc { margin: 0 0 20px; font-size: 13px; color: var(--text-soft); }
.cm-changed-compare {
  display: flex; align-items: center; justify-content: center;
  gap: 12px; margin-bottom: 20px;
}
.cm-changed-old, .cm-changed-new { text-align: center; }
.cm-changed-label { font-size: 11px; color: var(--text-dim); display: block; margin-bottom: 4px; }
.cm-changed-value-old { font-size: 18px; font-weight: 700; color: var(--text-dim); text-decoration: line-through; }
.cm-changed-value-new { font-size: 20px; font-weight: 800; color: var(--accent); }
.cm-changed-arrow { font-size: 20px; color: var(--text-soft); }
.cm-changed-actions { display: flex; gap: 10px; }

/* ── Responsive small screens ── */
@media (max-width: 420px) {
  .cm-overlay { padding: 8px; }
  .cm-card { padding: 16px; border-radius: 12px; }
  .cm-title { font-size: 17px; }
  .cm-partial-header { flex-direction: column; align-items: flex-start; gap: 4px; }
  .cm-fraction-chip { padding: 9px 0; font-size: 11px; }
  .cm-amount-card { padding: 12px; }
  .cm-amount-value { font-size: 18px; }
  .cm-residual-card { padding: 10px 12px; }
  .cm-btn { font-size: 13px; padding: 12px 0; }
  .cm-processing-title { font-size: 16px; }
  .cm-processing-value { font-size: 20px; }
  .cm-changed-value-new { font-size: 17px; }
  .cm-changed-compare { gap: 8px; }
}
@media (max-width: 360px) {
  .cm-card { padding: 12px; }
  .cm-fraction-row { gap: 4px; }
  .cm-fraction-chip { padding: 8px 0; font-size: 10px; border-radius: 6px; }
  .cm-amount-card { padding: 10px; }
  .cm-amount-label { font-size: 11px; }
  .cm-amount-value { font-size: 16px; }
  .cm-amount-subvalue { font-size: 12px; }
  .cm-actions { gap: 6px; }
  .cm-btn { font-size: 12px; padding: 11px 0; }
}
`;

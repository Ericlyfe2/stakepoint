import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

function fmt(n) {
  return Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AutoCashoutPanel({
  betId,
  currentOffer,
  target,
  onSetTarget,
  onClearTarget,
  busy,
}) {
  const [inputValue, setInputValue] = useState(target > 0 ? String(target) : '');
  const [isOpen, setIsOpen] = useState(target > 0);

  const isActive = target > 0;
  const canTrigger = isActive && currentOffer >= target;

  const handleSubmit = () => {
    const v = parseFloat(String(inputValue).replace(/,/g, ''));
    if (!Number.isFinite(v) || v <= 0) return;
    if (v <= currentOffer) return;
    onSetTarget(betId, v);
    setIsOpen(true);
  };

  const handleClear = () => {
    setInputValue('');
    onClearTarget(betId);
    setIsOpen(false);
  };

  return (
    <div className={`ac-panel${isActive ? ' active' : ''}`}>
      <button
        type="button"
        className="ac-toggle"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="ac-toggle-icon">
          {isActive ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          )}
        </span>
        <span className="ac-toggle-text">
          {isActive ? `Auto Cashout Active — Target: GHS ${fmt(target)}` : 'Set Auto Cashout'}
        </span>
        <span className={`ac-toggle-chevron${isOpen ? ' open' : ''}`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="ac-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="ac-content">
              {isActive ? (
                <>
                  <div className="ac-status">
                    <div className="ac-status-row">
                      <span>Current Offer</span>
                      <strong>GHS {fmt(currentOffer)}</strong>
                    </div>
                    <div className="ac-status-row">
                      <span>Target</span>
                      <strong className="ac-target-value">GHS {fmt(target)}</strong>
                    </div>
                    {canTrigger && (
                      <div className="ac-ready-badge">Ready to trigger</div>
                    )}
                  </div>
                  <div className="ac-progress-bar">
                    <div
                      className="ac-progress-fill"
                      style={{ width: `${Math.min(100, (currentOffer / target) * 100)}%` }}
                    />
                  </div>
                  <div className="ac-actions">
                    <button
                      type="button"
                      className="ac-btn ac-btn-change"
                      onClick={() => {
                        setInputValue(String(target));
                        handleClear();
                        setTimeout(() => setIsOpen(true), 100);
                      }}
                    >
                      Change Target
                    </button>
                    <button
                      type="button"
                      className="ac-btn ac-btn-remove"
                      onClick={handleClear}
                      disabled={busy}
                    >
                      Disable Auto Cashout
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="ac-desc">
                    Set a target amount. When the cashout offer reaches or exceeds your target,
                    we will automatically attempt to cash out.
                  </p>
                  <div className="ac-input-row">
                    <div className="ac-input-wrap">
                      <span className="ac-currency">GHS</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        className="ac-input"
                        placeholder="e.g. 500"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        min={currentOffer + 1}
                        step="0.01"
                        disabled={busy}
                      />
                    </div>
                    <button
                      type="button"
                      className="ac-btn ac-btn-set"
                      onClick={handleSubmit}
                      disabled={busy || !inputValue || parseFloat(String(inputValue).replace(/,/g, '')) <= currentOffer}
                    >
                      Set
                    </button>
                  </div>
                  {inputValue && parseFloat(String(inputValue).replace(/,/g, '')) <= currentOffer && (
                    <p className="ac-warn">Target must be higher than current offer (GHS {fmt(currentOffer)})</p>
                  )}
                  <p className="ac-disclaimer">
                    Auto cashout is not guaranteed. If odds move suddenly or the market suspends,
                    the auto cashout may fail.
                  </p>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{AC_CSS}</style>
    </div>
  );
}

const AC_CSS = `
.ac-panel {
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
  background: var(--surface);
  margin-bottom: 8px;
}
.ac-panel.active {
  border-color: rgba(0,122,69,0.2);
  background: rgba(0,122,69,0.03);
}
.ac-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: transparent;
  color: var(--text-soft);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: color .15s;
}
.ac-toggle:hover { color: var(--text); }
.ac-toggle-icon { flex-shrink: 0; color: var(--accent); }
.ac-toggle-text { flex: 1; text-align: left; }
.ac-toggle-chevron { transition: transform .2s; }
.ac-toggle-chevron.open { transform: rotate(180deg); }

.ac-body { overflow: hidden; }
.ac-content { padding: 0 12px 12px; }

.ac-desc { margin: 0 0 12px; font-size: 12px; color: var(--text-dim); line-height: 1.5; }

.ac-input-row { display: flex; gap: 8px; margin-bottom: 8px; }
.ac-input-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--bg);
}
.ac-currency { font-size: 13px; font-weight: 700; color: var(--text-dim); }
.ac-input {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 15px;
  font-weight: 700;
  padding: 10px 0;
  outline: none;
  font-family: inherit;
}
.ac-input::placeholder { color: var(--text-dim); opacity: .5; }

.ac-btn {
  padding: 10px 16px;
  border-radius: 8px;
  border: none;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all .15s;
  white-space: nowrap;
}
.ac-btn:disabled { opacity: .5; cursor: not-allowed; }
.ac-btn-set { background: var(--accent); color: var(--text-inv); }
.ac-btn-set:hover:not(:disabled) { opacity: .85; }
.ac-btn-change { background: var(--surface-2); color: var(--text); border: 1px solid var(--line); }
.ac-btn-change:hover { border-color: var(--accent); }
.ac-btn-remove { background: transparent; color: #e53935; border: 1px solid rgba(229,57,53,0.3); }
.ac-btn-remove:hover:not(:disabled) { background: rgba(229,57,53,0.1); }

.ac-warn { margin: 0 0 4px; font-size: 11px; color: #f5a623; font-weight: 600; }
.ac-disclaimer { margin: 0; font-size: 10px; color: var(--text-dim); line-height: 1.4; }

.ac-status { margin-bottom: 12px; }
.ac-status-row { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 12px; color: var(--text-soft); }
.ac-status-row strong { color: var(--text); font-variant-numeric: tabular-nums; }
.ac-target-value { color: var(--accent) !important; }
.ac-ready-badge {
  display: inline-block;
  margin-top: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(14,138,74,0.15);
  color: #0E8A4A;
  font-size: 11px;
  font-weight: 700;
  animation: acPulse 2s ease-in-out infinite;
}
@keyframes acPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: .6; }
}

.ac-progress-bar {
  height: 4px;
  border-radius: 2px;
  background: var(--surface-2);
  overflow: hidden;
  margin-bottom: 12px;
}
.ac-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-soft));
  border-radius: 2px;
  transition: width .3s ease;
}
.ac-actions { display: flex; gap: 8px; }

/* ── Responsive small screens ── */
@media (max-width: 420px) {
  .ac-toggle-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ac-btn { font-size: 11px; padding: 9px 12px; }
  .ac-input { font-size: 14px; }
  .ac-currency { font-size: 12px; }
  .ac-input-wrap { padding: 0 8px; }
}
@media (max-width: 360px) {
  .ac-panel { border-radius: 6px; }
  .ac-toggle { padding: 8px 10px; gap: 6px; font-size: 11px; }
  .ac-content { padding: 0 10px 10px; }
  .ac-input-row { gap: 6px; }
  .ac-btn { font-size: 10px; padding: 8px 10px; }
  .ac-actions { gap: 6px; flex-wrap: wrap; }
  .ac-btn-change, .ac-btn-remove { flex: 1; text-align: center; }
}
`;

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function BetPlacementSuccessModal({
  isOpen,
  betType = 'placed',
  onClose,
  onShare,
  onViewOpenBets,
  onAddToBetslip,
  totalStake = 0,
  potentialWin = 0,
  currency = 'GHS',
  bookingCode = 'XX00000',
  sport = 'Football',
  isPrivate = false,
  recommendedCodes = [],
}) {
  const isBooked = betType === 'booked';
  const [copied, setCopied] = useState(false);
  const [privateNote, setPrivateNote] = useState('');
  const [mounted, setMounted] = useState(false);
  const carouselRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      document.body.style.overflow = 'hidden';
      setCopied(false);
      setPrivateNote('');
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(bookingCode);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = bookingCode;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch { /* ignore */ }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [bookingCode]);

  const formatAmt = (n) => {
    return Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const stagger = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.2, delayChildren: 0.3 },
    },
  };

  const fadeUp = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 200, damping: 20 } },
  };

  const confettiPieces = useMemo(() => {
    if (!mounted || isBooked) return [];
    const pieces = [];
    const colors = ['#c5ff3d', '#ffd700', '#00d26a', '#ff6b6b', '#4ecdc4', '#ffffff'];
    for (let i = 0; i < 50; i++) {
      pieces.push({
        id: i,
        x: Math.random() * 100,
        color: colors[Math.floor(Math.random() * colors.length)],
        delay: Math.random() * 0.8,
        duration: 1.5 + Math.random() * 2,
        size: 4 + Math.random() * 8,
        rotation: Math.random() * 360,
        drift: (Math.random() - 0.5) * 40,
        radius: Math.random() > 0.5 ? '50%' : '2px',
      });
    }
    return pieces;
  }, [mounted, isBooked]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="bpsm-overlay"
          className="bpsm-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={onClose}
        >
          {/* Confetti Layer — only for placed bets */}
          {!isBooked && <div className="bpsm-confetti-layer" aria-hidden="true">
            {confettiPieces.map((p) => (
              <motion.div
                key={p.id}
                className="bpsm-confetti-piece"
                style={{
                  left: `${p.x}%`,
                  width: p.size,
                  height: p.size * 1.4,
                  backgroundColor: p.color,
                  borderRadius: p.radius,
                }}
                initial={{ y: -20, x: 0, rotate: 0, opacity: 1 }}
                animate={{
                  y: [0, 200 + Math.random() * 300],
                  x: p.drift,
                  rotate: p.rotation * 3,
                  opacity: [1, 1, 0],
                }}
                transition={{
                  duration: p.duration,
                  delay: p.delay,
                  ease: [0.25, 0.1, 0.25, 1],
                  repeat: 0,
                }}
              />
            ))}
          </div>}

          <motion.div
            className="bpsm-card"
            variants={stagger}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0, scale: 0.85, y: 40 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button type="button" className="bpsm-close" onClick={onClose} aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {/* Stage 1: Celebration */}
            <motion.div className="bpsm-celebration" variants={fadeUp}>
              <motion.div
                className="bpsm-checkmark"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 12, delay: 0.1 }}
              >
                {isBooked ? (
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" fill="var(--accent)" fillOpacity="0.15" /><polyline points="9 10 12 13 16 9" stroke="var(--accent)" strokeWidth="2.2" />
                  </svg>
                ) : (
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="var(--accent)" stroke="none">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                )}
              </motion.div>
              <h2 className="bpsm-title">{isBooked ? 'Bet Booked' : 'Bet Placed'}</h2>
              {isBooked && <p className="bpsm-subtitle">Share this code so anyone can load and place it.</p>}

              {/* Trophy with float animation — only for placed bets */}
              {!isBooked && (
                <motion.div
                  className="bpsm-trophy"
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                    <defs>
                      <linearGradient id="trophy-gold" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#ffd700" />
                        <stop offset="50%" stopColor="#ffec8b" />
                        <stop offset="100%" stopColor="#daa520" />
                      </linearGradient>
                    </defs>
                    <path d="M6 9H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2" stroke="url(#trophy-gold)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M18 9h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2" stroke="url(#trophy-gold)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M12 15v4" stroke="url(#trophy-gold)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M8 21h8" stroke="url(#trophy-gold)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M6 9a6 6 0 0 0 12 0V3H6v6z" stroke="url(#trophy-gold)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="url(#trophy-gold)" fillOpacity="0.15"/>
                  </svg>
                </motion.div>
              )}
            </motion.div>

            {/* Stage 2: Bet Summary Card */}
            <motion.div className="bpsm-summary-card" variants={fadeUp}>
              <div className="bpsm-summary-row">
                <span className="bpsm-summary-label">{isBooked ? 'Suggested Stake' : 'Total Stake'}</span>
                <span className="bpsm-summary-value">{currency} {formatAmt(totalStake)}</span>
              </div>
              <div className="bpsm-summary-row">
                <span className="bpsm-summary-label">Potential Win</span>
                <span className="bpsm-summary-value bpsm-win">{currency} {formatAmt(potentialWin)}</span>
              </div>
              {isBooked ? (
                <div className="bpsm-summary-row">
                  <span className="bpsm-summary-label">Status</span>
                  <span className="bpsm-summary-value bpsm-booked-badge">Not yet placed</span>
                </div>
              ) : (
                <>
                  <div className="bpsm-summary-row">
                    <span className="bpsm-summary-label">Reward Progress</span>
                    <button type="button" className="bpsm-link-btn" onClick={onViewOpenBets}>View</button>
                  </div>
                  <div className="bpsm-summary-row">
                    <span className="bpsm-summary-label">Open Bets</span>
                    <button type="button" className="bpsm-link-btn" onClick={onViewOpenBets}>View</button>
                  </div>
                </>
              )}
            </motion.div>

            {/* Stage 3: Booking Code Actions */}
            <motion.div className="bpsm-code-section" variants={fadeUp}>
              <div className="bpsm-code-row">
                <span className="bpsm-code-value">{bookingCode}</span>
                <div className="bpsm-code-actions">
                  <button type="button" className="bpsm-icon-btn" onClick={handleCopy} title="Copy code">
                    {copied ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    )}
                  </button>
                  <button type="button" className="bpsm-icon-btn" onClick={onShare} title="Share">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Private Note Input */}
              <div className="bpsm-note-row">
                <span className="bpsm-note-label">Note</span>
                <div className="bpsm-note-input-wrap">
                  <input
                    type="text"
                    className="bpsm-note-input"
                    placeholder="Add Private Note"
                    value={privateNote}
                    onChange={(e) => setPrivateNote(e.target.value)}
                    maxLength={60}
                  />
                  {privateNote && (
                    <span className="bpsm-note-badge">Private</span>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Stage 4: Recommended Codes Carousel */}
            {recommendedCodes.length > 0 && (
              <motion.div className="bpsm-carousel-section" variants={fadeUp}>
                <div className="bpsm-carousel-header">
                  <span className="bpsm-carousel-title">Recommended {sport} Codes</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
                <div className="bpsm-carousel" ref={carouselRef}>
                  {recommendedCodes.map((rec) => (
                    <div key={rec.id} className="bpsm-rec-card">
                      <div className="bpsm-rec-header">
                        <span className="bpsm-rec-code">Code {rec.code}</span>
                        <span className="bpsm-rec-odds">Odds {rec.odds.toFixed(2)}</span>
                      </div>
                      <div className="bpsm-rec-stake-row">
                        <span>Stake {currency} {formatAmt(rec.stake)}</span>
                        <span>Win {currency} {formatAmt(rec.potentialWin)}</span>
                      </div>
                      <div className="bpsm-rec-tipster">
                        Tip: {rec.tipster}
                      </div>
                      {rec.matches.map((m, i) => (
                        <div key={i} className="bpsm-rec-match">
                          <span className="bpsm-rec-match-teams">{m.team1} vs {m.team2}</span>
                          <span className="bpsm-rec-match-info">{m.time} · {m.odd.toFixed(2)}</span>
                        </div>
                      ))}
                      <div className="bpsm-rec-footer">
                        <button type="button" className="bpsm-rec-share-btn" onClick={onShare}>
                          Share
                        </button>
                        <button
                          type="button"
                          className="bpsm-rec-add-btn"
                          onClick={() => onAddToBetslip(rec.code)}
                        >
                          Add to Betslip
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Footer */}
            <motion.div className="bpsm-footer" variants={fadeUp}>
              <div className="bpsm-footer-brand">
                <span className="bpsm-footer-x">X</span>
                <span className="bpsm-footer-name">xenbet.com</span>
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const BPSM_CSS = `
.bpsm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.88);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  z-index: 9999;
  display: grid;
  place-items: center;
  padding: 16px;
  overflow-y: auto;
}

.bpsm-confetti-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 10000;
  overflow: hidden;
}

.bpsm-confetti-piece {
  position: absolute;
  top: -20px;
}

.bpsm-card {
  position: relative;
  width: 100%;
  max-width: 440px;
  background: var(--surface);
  border-radius: 20px;
  overflow: hidden;
  padding: 28px 20px 20px;
  box-shadow: 0 25px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05);
}

.bpsm-close {
  position: absolute;
  top: 14px;
  right: 14px;
  background: var(--surface-2);
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  transition: all 0.15s;
  z-index: 2;
}
.bpsm-close:hover { background: var(--surface-3); color: var(--text); }

/* Stage 1: Celebration */
.bpsm-celebration {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 8px 0 16px;
}

.bpsm-checkmark { line-height: 0; }

.bpsm-title {
  font-size: 24px;
  font-weight: 800;
  color: var(--text);
  letter-spacing: -0.02em;
  margin: 0;
}

.bpsm-subtitle {
  font-size: 13px;
  color: var(--text-dim);
  font-weight: 500;
  margin: 0;
  text-align: center;
}

.bpsm-trophy {
  margin-top: 4px;
  line-height: 0;
}

/* Stage 2: Summary Card */
.bpsm-summary-card {
  background: var(--surface-2);
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.bpsm-summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.bpsm-summary-label {
  font-size: 13px;
  color: var(--text-dim);
  font-weight: 600;
}

.bpsm-summary-value {
  font-size: 14px;
  color: var(--text);
  font-weight: 700;
}

.bpsm-summary-value.bpsm-win {
  color: var(--accent);
}

.bpsm-link-btn {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  padding: 0;
}
.bpsm-link-btn:hover { text-decoration: underline; }

.bpsm-booked-badge {
  background: var(--surface-3);
  color: var(--text-soft);
  font-size: 11px !important;
  font-weight: 700 !important;
  padding: 3px 8px;
  border-radius: 6px;
}

/* Stage 3: Booking Code */
.bpsm-code-section {
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bpsm-code-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--surface-2);
  border-radius: 10px;
  padding: 12px 14px;
}

.bpsm-code-value {
  font-size: 20px;
  font-weight: 900;
  color: var(--text);
  letter-spacing: 0.08em;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}

.bpsm-code-actions {
  display: flex;
  gap: 6px;
}

.bpsm-icon-btn {
  background: var(--surface-3);
  border: none;
  color: var(--text-soft);
  cursor: pointer;
  padding: 8px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  transition: all 0.15s;
}
.bpsm-icon-btn:hover { background: var(--surface); color: var(--text); }

.bpsm-note-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.bpsm-note-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-dim);
  white-space: nowrap;
}

.bpsm-note-input-wrap {
  flex: 1;
  position: relative;
}

.bpsm-note-input {
  width: 100%;
  background: var(--surface-2);
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text);
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;
}
.bpsm-note-input:focus { border-color: var(--accent); }
.bpsm-note-input::placeholder { color: var(--text-dim); opacity: 0.6; }

.bpsm-note-badge {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: var(--accent);
  color: #000;
  font-size: 9px;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 4px;
  pointer-events: none;
}

/* Stage 4: Carousel */
.bpsm-carousel-section {
  margin-bottom: 16px;
}

.bpsm-carousel-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}

.bpsm-carousel-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
}

.bpsm-carousel {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 6px;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scrollbar-color: var(--surface-3) transparent;
}
.bpsm-carousel::-webkit-scrollbar { height: 4px; }
.bpsm-carousel::-webkit-scrollbar-track { background: transparent; }
.bpsm-carousel::-webkit-scrollbar-thumb { background: var(--surface-3); border-radius: 4px; }

.bpsm-rec-card {
  min-width: 280px;
  max-width: 280px;
  background: var(--surface-2);
  border-radius: 12px;
  padding: 14px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bpsm-rec-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.bpsm-rec-code {
  font-size: 13px;
  font-weight: 800;
  color: var(--text);
  font-family: 'JetBrains Mono', monospace;
}

.bpsm-rec-odds {
  font-size: 12px;
  font-weight: 700;
  color: var(--accent);
}

.bpsm-rec-stake-row {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-dim);
}

.bpsm-rec-tipster {
  font-size: 12px;
  color: var(--text-soft);
  font-style: italic;
  padding: 4px 0;
  border-top: 1px solid var(--surface-3);
}

.bpsm-rec-match {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  padding: 2px 0;
}

.bpsm-rec-match-teams {
  color: var(--text);
  font-weight: 600;
}

.bpsm-rec-match-info {
  color: var(--text-dim);
  white-space: nowrap;
}

.bpsm-rec-footer {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px solid var(--surface-3);
}

.bpsm-rec-share-btn {
  flex: 1;
  background: var(--surface-3);
  border: none;
  color: var(--text-soft);
  font-size: 12px;
  font-weight: 700;
  padding: 8px 0;
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}
.bpsm-rec-share-btn:hover { background: var(--surface); color: var(--text); }

.bpsm-rec-add-btn {
  flex: 1;
  background: var(--accent);
  border: none;
  color: #000;
  font-size: 12px;
  font-weight: 800;
  padding: 8px 0;
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}
.bpsm-rec-add-btn:hover { filter: brightness(1.1); transform: scale(1.03); }

/* Footer */
.bpsm-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 0 4px;
}

.bpsm-footer-brand {
  display: flex;
  align-items: center;
  gap: 6px;
}

.bpsm-footer-x {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--accent);
  color: #000;
  font-size: 13px;
  font-weight: 900;
}

.bpsm-footer-name {
  color: var(--text-dim);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
`;

// Inject styles once
if (typeof document !== 'undefined') {
  const id = 'bpsm-styles';
  if (!document.getElementById(id)) {
    const style = document.createElement('style');
    style.id = id;
    style.textContent = BPSM_CSS;
    document.head.appendChild(style);
  }
}

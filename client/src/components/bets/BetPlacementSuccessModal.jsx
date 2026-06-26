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
  recommendedCodes = [],
}) {
  const isBooked = betType === 'booked';
  const [copied, setCopied] = useState(false);
  const [privateNote, setPrivateNote] = useState('');
  const carouselRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
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

  const handleShareTo = useCallback((platform) => {
    const code = bookingCode;
    const text = `Check out my bet on BetXentra! Booking Code: ${code}`;
    const url = `https://betxentra.vercel.app/ticket/${code}`;
    if (platform === 'copy') {
      handleCopy();
    } else if (platform === 'x') {
      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
    } else if (platform === 'telegram') {
      window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank');
    } else if (platform === 'whatsapp') {
      window.open(`https://wa.me/?text=${encodeURIComponent(text + '\n' + url)}`, '_blank');
    } else if (platform === 'share') {
      if (onShare) onShare();
    }
  }, [bookingCode, handleCopy, onShare]);

  const fmt = (n) => Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  const fadeUp = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 220, damping: 22 } },
  };
  const stagger = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.12, delayChildren: 0.15 } },
  };

  if (!isOpen) return null;

  /* ─────────── BOOKED modal ─────────── */
  if (isBooked) {
    return (
      <AnimatePresence>
        <motion.div
          key="bpsm-overlay"
          className="bpsm-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="bpsm-card bpsm-booked-card"
            initial={{ opacity: 0, scale: 0.92, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 30 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close */}
            <button type="button" className="bpsm-close" onClick={onClose} aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {/* Reload icon */}
            <div className="bpsm-bk-reload">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </div>

            {/* Header */}
            <div className="bpsm-bk-header">
              <span className="bpsm-bk-label">Booking Code</span>
            </div>

            {/* Big booking code */}
            <motion.div
              className="bpsm-bk-code"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 350, damping: 18, delay: 0.1 }}
            >
              {bookingCode}
            </motion.div>

            {/* Date */}
            <div className="bpsm-bk-date">{dateStr}</div>

            {/* Load Code link */}
            <button type="button" className="bpsm-bk-load" onClick={() => { if (onAddToBetslip) onAddToBetslip(bookingCode); }}>
              Load Code
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </button>

            {/* Share row */}
            <motion.div
              className="bpsm-bk-share-row"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              <button type="button" className="bpsm-bk-share-btn" onClick={() => handleShareTo('share')}>
                <div className="bpsm-bk-share-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </div>
                <span>Save Image</span>
              </button>
              <button type="button" className="bpsm-bk-share-btn" onClick={() => handleShareTo('copy')}>
                <div className="bpsm-bk-share-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </div>
                <span>{copied ? 'Copied!' : 'Copy Link'}</span>
              </button>
              <button type="button" className="bpsm-bk-share-btn" onClick={() => handleShareTo('x')}>
                <div className="bpsm-bk-share-icon bpsm-bk-x-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </div>
                <span>X</span>
              </button>
              <button type="button" className="bpsm-bk-share-btn" onClick={() => handleShareTo('telegram')}>
                <div className="bpsm-bk-share-icon bpsm-bk-tg-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                  </svg>
                </div>
                <span>Telegram</span>
              </button>
              <button type="button" className="bpsm-bk-share-btn" onClick={() => handleShareTo('whatsapp')}>
                <div className="bpsm-bk-share-icon bpsm-bk-wa-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
                  </svg>
                </div>
                <span>WhatsApp</span>
              </button>
            </motion.div>

            {/* Footer */}
            <div className="bpsm-bk-footer">
              <div className="bpsm-bk-footer-bar">
                <svg width="22" height="22" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{borderRadius:6,overflow:'hidden',flexShrink:0}}>
                  <rect width="64" height="64" rx="14" fill="#0a0d0c"/>
                  <path d="M32 6L54 16L54 36C54 50 32 60 32 60C32 60 10 50 10 36L10 16Z" fill="#22c55e"/>
                  <path d="M22 22L22 43L33 43C38 43 42 40 42 35.5C42 33 40.5 31 38.5 30C40 29 41 27.5 41 25.5C41 23 38 22 34 22ZM26.5 26L33 26C35.5 26 37 27 37 29C37 31 35.5 32 33 32L26.5 32ZM26.5 35.5L33.5 35.5C36.5 35.5 37.5 37 37.5 39C37.5 41 35.5 39.5 33.5 39.5L26.5 39.5Z" fill="white"/>
                </svg>
                <span className="bpsm-footer-name">betxentra.com</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  /* ─────────── PLACED modal ─────────── */
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="bpsm-overlay"
          className="bpsm-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="bpsm-card bpsm-placed-card"
            variants={stagger}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0, scale: 0.85, y: 40 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close */}
            <button type="button" className="bpsm-close" onClick={onClose} aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {/* Checkmark + title */}
            <motion.div className="bpsm-celebration" variants={fadeUp}>
              <motion.div
                className="bpsm-checkmark"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 12, delay: 0.1 }}
              >
                <svg width="52" height="52" viewBox="0 0 24 24" fill="var(--accent)" stroke="none">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              </motion.div>
              <motion.h2
                className="bpsm-title"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                Bet Successful
              </motion.h2>
            </motion.div>

            {/* Summary rows */}
            <motion.div className="bpsm-summary-card" variants={fadeUp}>
              <div className="bpsm-summary-row">
                <span className="bpsm-summary-label">Total Stake</span>
                <span className="bpsm-summary-value">{fmt(totalStake)}</span>
              </div>
              <div className="bpsm-summary-row">
                <span className="bpsm-summary-label">Potential Win</span>
                <span className="bpsm-summary-value bpsm-win">{fmt(potentialWin)}</span>
              </div>
              <div className="bpsm-summary-row">
                <span className="bpsm-summary-label">Reward Progress</span>
                <button type="button" className="bpsm-link-btn" onClick={onViewOpenBets}>View</button>
              </div>
              <div className="bpsm-summary-row">
                <span className="bpsm-summary-label">Open Bets</span>
                <button type="button" className="bpsm-link-btn" onClick={onViewOpenBets}>View</button>
              </div>
            </motion.div>

            {/* Booking code + publish */}
            <motion.div className="bpsm-code-section" variants={fadeUp}>
              <div className="bpsm-code-row">
                <span className="bpsm-code-value">{bookingCode}</span>
                <div className="bpsm-code-actions">
                  <button type="button" className="bpsm-publish-btn" onClick={handleCopy}>
                    {copied ? (
                      <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg> Copied</>
                    ) : (
                      <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg> Publish</>
                    )}
                  </button>
                </div>
              </div>

              {/* Sport + Note */}
              <div className="bpsm-meta-row">
                <span className="bpsm-meta-label">{sport}</span>
                <button type="button" className="bpsm-add-note-btn" onClick={() => document.querySelector('.bpsm-note-input')?.focus()}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Add Private Note
                </button>
              </div>
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
                  {privateNote && <span className="bpsm-note-badge">Private</span>}
                </div>
              </div>
            </motion.div>

            {/* Recommended Codes */}
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
                        <span>Stake {currency} {fmt(rec.stake)}</span>
                        <span>Win {currency} {fmt(rec.potentialWin)}</span>
                      </div>
                      <div className="bpsm-rec-tipster">Tip: {rec.tipster}</div>
                      {rec.matches.map((m, i) => (
                        <div key={i} className="bpsm-rec-match">
                          <span className="bpsm-rec-match-teams">{m.team1} vs {m.team2}</span>
                          <span className="bpsm-rec-match-info">{m.time} · {m.odd.toFixed(2)}</span>
                        </div>
                      ))}
                      <div className="bpsm-rec-footer">
                        <button type="button" className="bpsm-rec-share-btn" onClick={onShare}>Share</button>
                        <button type="button" className="bpsm-rec-add-btn" onClick={() => onAddToBetslip(rec.code)}>Add to Betslip</button>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Footer */}
            <motion.div className="bpsm-footer" variants={fadeUp}>
              <div className="bpsm-footer-brand">
                <svg width="22" height="22" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{borderRadius:6,overflow:'hidden',flexShrink:0}}>
                  <rect width="64" height="64" rx="14" fill="#0a0d0c"/>
                  <path d="M32 6L54 16L54 36C54 50 32 60 32 60C32 60 10 50 10 36L10 16Z" fill="#22c55e"/>
                  <path d="M22 22L22 43L33 43C38 43 42 40 42 35.5C42 33 40.5 31 38.5 30C40 29 41 27.5 41 25.5C41 23 38 22 34 22ZM26.5 26L33 26C35.5 26 37 27 37 29C37 31 35.5 32 33 32L26.5 32ZM26.5 35.5L33.5 35.5C36.5 35.5 37.5 37 37.5 39C37.5 41 35.5 39.5 33.5 39.5L26.5 39.5Z" fill="white"/>
                </svg>
                <span className="bpsm-footer-name">betxentra.com</span>
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const BPSM_CSS = `
/* ── Shared ── */
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
.bpsm-card {
  position: relative;
  width: 100%;
  max-width: 400px;
  background: var(--surface);
  border-radius: 20px;
  overflow: hidden;
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

/* ── Footer (shared) ── */
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
  overflow: hidden;
  flex-shrink: 0;
}
.bpsm-footer-name {
  color: var(--text-dim);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

/* ═════════════════════════════════════
   BOOKED MODAL
   ═════════════════════════════════════ */
.bpsm-booked-card {
  padding: 32px 24px 20px;
  text-align: center;
}
.bpsm-bk-reload {
  position: absolute;
  top: 16px;
  left: 16px;
  opacity: 0.5;
}
.bpsm-bk-header {
  margin-bottom: 8px;
}
.bpsm-bk-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-dim);
  letter-spacing: 0.03em;
}
.bpsm-bk-code {
  font-size: 32px;
  font-weight: 900;
  color: var(--text);
  letter-spacing: 0.06em;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  margin: 8px 0 4px;
}
.bpsm-bk-date {
  font-size: 12px;
  color: var(--text-dim);
  margin-bottom: 16px;
}
.bpsm-bk-load {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: var(--accent);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  margin-bottom: 24px;
  padding: 0;
}
.bpsm-bk-load:hover { text-decoration: underline; }

/* Share row */
.bpsm-bk-share-row {
  display: flex;
  justify-content: center;
  gap: 16px;
  padding: 16px 0;
  border-top: 1px solid var(--surface-3);
}
.bpsm-bk-share-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
  color: var(--text-dim);
  font-size: 10px;
  font-weight: 600;
  transition: color 0.15s;
  padding: 0;
  min-width: 52px;
}
.bpsm-bk-share-btn:hover { color: var(--text); }
.bpsm-bk-share-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--surface-2);
  display: grid;
  place-items: center;
  color: var(--text-soft);
  transition: all 0.15s;
}
.bpsm-bk-share-btn:hover .bpsm-bk-share-icon {
  background: var(--surface-3);
  color: var(--text);
}
.bpsm-bk-x-icon { background: #333 !important; color: #fff !important; }
.bpsm-bk-tg-icon { background: #229ED9 !important; color: #fff !important; }
.bpsm-bk-wa-icon { background: #25D366 !important; color: #fff !important; }

/* Booked footer bar */
.bpsm-bk-footer {
  padding: 14px 0 4px;
  border-top: 1px solid var(--surface-3);
  margin-top: 8px;
}
.bpsm-bk-footer-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: var(--accent);
  border-radius: 8px;
  padding: 8px 16px;
}
.bpsm-bk-footer-bar .bpsm-footer-x {
  background: #000;
  color: var(--accent);
}
.bpsm-bk-footer-bar .bpsm-footer-name {
  color: #000;
  font-weight: 800;
}

/* ═════════════════════════════════════
   PLACED MODAL
   ═════════════════════════════════════ */
.bpsm-placed-card {
  padding: 24px 20px 20px;
  max-height: 85vh;
  overflow-y: auto;
}
.bpsm-placed-card::-webkit-scrollbar { width: 4px; }
.bpsm-placed-card::-webkit-scrollbar-track { background: transparent; }
.bpsm-placed-card::-webkit-scrollbar-thumb { background: var(--surface-3); border-radius: 4px; }

/* Celebration */
.bpsm-celebration {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 4px 0 16px;
}
.bpsm-checkmark { line-height: 0; }
.bpsm-title {
  font-size: 22px;
  font-weight: 800;
  color: var(--text);
  letter-spacing: -0.02em;
  margin: 0;
}

/* Summary */
.bpsm-summary-card {
  background: var(--surface-2);
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 14px;
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
.bpsm-summary-value.bpsm-win { color: var(--accent); }
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

/* Code section */
.bpsm-code-section {
  margin-bottom: 14px;
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
  padding: 10px 14px;
}
.bpsm-code-value {
  font-size: 18px;
  font-weight: 900;
  color: var(--text);
  letter-spacing: 0.06em;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}
.bpsm-code-actions { display: flex; gap: 6px; }
.bpsm-publish-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: var(--accent);
  border: none;
  color: #000;
  font-size: 12px;
  font-weight: 800;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}
.bpsm-publish-btn:hover { filter: brightness(1.1); }

/* Meta row */
.bpsm-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.bpsm-meta-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
}
.bpsm-add-note-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  padding: 0;
}

/* Note */
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

/* Carousel */
.bpsm-carousel-section { margin-bottom: 14px; }
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
`;

if (typeof document !== 'undefined') {
  const id = 'bpsm-styles';
  const el = document.getElementById(id);
  if (el) el.textContent = BPSM_CSS;
  else {
    const style = document.createElement('style');
    style.id = id;
    style.textContent = BPSM_CSS;
    document.head.appendChild(style);
  }
}

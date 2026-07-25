import { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import trophyImg from '../assets/win-trophy.png';

function fmt(n) {
  return Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ───────────────────────────────────────────────
   Confetti particles (framer-motion driven)
   ─────────────────────────────────────────────── */
function ConfettiRain() {
  const pieces = useMemo(() => Array.from({ length: 80 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 2,
    dur: 2.4 + Math.random() * 2.6,
    rot: Math.random() * 720,
    size: 5 + Math.random() * 7,
    colors: ['#ffd76d', '#f3a01a', '#0E8A4A', '#22d3ee', '#007A45', '#ff9f1c', '#a78bfa', '#fff7cc'],
    colorIdx: i % 8,
  })), []);

  return (
    <div className="wcm-confetti" aria-hidden>
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="wcm-confetti-piece"
          initial={{ y: '-5vh', x: `${p.x}vw`, rotate: 0, opacity: 0 }}
          animate={{
            y: '105vh',
            rotate: p.rot,
            opacity: [0, 1, 1, 1, 0],
          }}
          transition={{
            duration: p.dur,
            delay: p.delay,
            ease: [0.25, 0.46, 0.45, 0.94],
            repeat: Infinity,
            repeatDelay: Math.random() * 3 + 2,
          }}
          style={{
            width: p.size,
            height: p.size * 1.4,
            background: p.colors[p.colorIdx],
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  );
}

/* ───────────────────────────────────────────────
   Sparkle particles emanating from trophy base
   ─────────────────────────────────────────────── */
function Sparkles() {
  const items = useMemo(() => Array.from({ length: 30 }, (_, i) => ({
    id: i,
    angle: (Math.PI * 2 * i) / 30 + (Math.random() - 0.5) * 0.5,
    dist: 40 + Math.random() * 100,
    size: 3 + Math.random() * 6,
    delay: Math.random() * 1.5,
    dur: 1.5 + Math.random() * 2,
  })), []);

  return (
    <div className="wcm-sparkles" aria-hidden>
      {items.map((p) => (
        <motion.div
          key={p.id}
          className="wcm-sparkle"
          initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
          animate={{
            x: Math.cos(p.angle) * p.dist,
            y: Math.sin(p.angle) * p.dist,
            scale: [0, 1.2, 0],
            opacity: [0, 1, 0],
          }}
          transition={{
            duration: p.dur,
            delay: p.delay,
            repeat: Infinity,
            repeatDelay: 0.3 + Math.random() * 1.2,
            ease: 'easeOut',
          }}
          style={{
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: '#ffd76d',
            boxShadow: '0 0 8px #f3a01a, 0 0 16px #ffb84d',
            position: 'absolute',
            pointerEvents: 'none',
          }}
        />
      ))}
    </div>
  );
}

/* ───────────────────────────────────────────────
   Trophy artwork (user-supplied image)
   ─────────────────────────────────────────────── */
function TrophyGraphic() {
  return (
    <div className="wcm-trophy-wrapper">
      <div className="wcm-trophy-arena">
        {/* Glow behind trophy */}
        <motion.div
          className="wcm-trophy-glow"
          animate={{
            scale: [1, 1.12, 1],
            opacity: [0.5, 0.85, 0.5],
          }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Floating idle animation */}
        <motion.img
          src={trophyImg}
          alt="Winner's trophy"
          className="wcm-trophy-img"
          animate={{ y: [-8, 8, -8] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />

        <Sparkles />
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────
   Market tag pills
   ─────────────────────────────────────────────── */
function MarketTags({ markets = [] }) {
  if (!markets.length) return null;
  return (
    <div className="wcm-tags">
      {markets.map((m) => (
        <span key={m} className="wcm-tag">{m}</span>
      ))}
    </div>
  );
}

/* ───────────────────────────────────────────────
   Main modal component
   ─────────────────────────────────────────────── */
export default function WinCelebrationModal({
  isOpen,
  onClose,
  onDetails,
  onShowOff,
  winAmount,
  currency = 'GHS',
  ticketId,
  markets = [],
}) {
  const overlayRef = useRef(null);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 500);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {mounted && (
        <motion.div
          ref={overlayRef}
          className="wcm-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: visible ? 1 : 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          onClick={(e) => { if (e.target === overlayRef.current) onClose?.(); }}
        >
          {/* Confetti layer */}
          <ConfettiRain />

          <motion.div
            className="wcm-card"
            initial={{ opacity: 0, scale: 0.88, y: 20 }}
            animate={{
              opacity: visible ? 1 : 0,
              scale: visible ? 1 : 0.88,
              y: visible ? 0 : 20,
            }}
            transition={{
              type: 'spring',
              stiffness: 260,
              damping: 22,
              mass: 1,
              delay: 0.08,
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="wcm-title"
          >
            {/* Close button */}
            <button
              type="button"
              className="wcm-close"
              onClick={onClose}
              aria-label="Close"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>

            {/* Header badge */}
            <div className="wcm-badge">VICTORY</div>

            {/* Trophy */}
            <TrophyGraphic />

            {/* Title */}
            <h1 id="wcm-title" className="wcm-title">YOU WON</h1>

            {/* Amount */}
            <div className="wcm-amount">
              <span className="wcm-currency">{currency}</span>
              <span className="wcm-value">{fmt(winAmount)}</span>
            </div>

            {/* Ticket context */}
            <div className="wcm-ticket-info">
              <span className="wcm-ticket-label">Ticket ID {ticketId}</span>
            </div>

            <MarketTags markets={markets} />

            {/* Brand wordmark */}
            <div className="wcm-brand">Bet<em>X</em>entra</div>

            {/* Action buttons */}
            <div className="wcm-actions">
              <motion.button
                type="button"
                className="wcm-btn wcm-btn-outline"
                onClick={onDetails}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                Details
              </motion.button>

              <motion.button
                type="button"
                className="wcm-btn wcm-btn-solid"
                onClick={onShowOff}
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.95 }}
              >
                Show Off
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ───────────────────────────────────────────────
   Styles
   ─────────────────────────────────────────────── */
const STYLES = `
/* ── Overlay ── */
.wcm-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.78);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  overflow-y: auto;
  padding: 16px;
}

/* ── Card ── */
.wcm-card {
  position: relative;
  width: 100%;
  max-width: 480px;
  background: linear-gradient(180deg, #111827 0%, #030712 100%);
  border: 1px solid rgba(255, 215, 100, 0.15);
  border-radius: 28px;
  padding: 32px 24px 28px;
  text-align: center;
  color: #ffffff;
  font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
  box-shadow:
    0 24px 80px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(255, 215, 100, 0.12) inset,
    0 0 60px rgba(255, 215, 100, 0.06);
}

/* ── Close button ── */
.wcm-close {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: color 0.15s, background 0.15s;
}
.wcm-close:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}

/* ── Badge ── */
.wcm-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.2em;
  color: #ffd76d;
  background: rgba(255, 215, 100, 0.08);
  border: 1px solid rgba(255, 215, 100, 0.25);
  padding: 4px 12px;
  border-radius: 999px;
  margin-bottom: 16px;
}

/* ── Trophy area ── */
.wcm-trophy-wrapper {
  display: flex;
  justify-content: center;
  margin: 4px 0 8px;
}
.wcm-trophy-arena {
  position: relative;
  width: 220px;
  height: 200px;
  display: flex;
  justify-content: center;
  align-items: center;
}
.wcm-trophy-glow {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  width: 130px;
  height: 80px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 215, 100, 0.35) 0%, rgba(255, 215, 100, 0) 70%);
  pointer-events: none;
}
.wcm-trophy-img {
  position: relative;
  z-index: 2;
  width: 220px;
  height: auto;
  display: block;
  margin: 0;
  border: none;
  background: none;
}

/* ── Sparkles layer ── */
.wcm-sparkles {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 3;
  display: flex;
  justify-content: center;
  align-items: center;
}

/* ── Confetti ── */
.wcm-confetti {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 10000;
  overflow: hidden;
}
.wcm-confetti-piece {
  position: absolute;
  top: 0;
  pointer-events: none;
  will-change: transform, opacity;
}

/* ── Title ── */
.wcm-title {
  margin: 8px 0 4px;
  font-size: clamp(2.5rem, 10vw, 4rem);
  font-weight: 900;
  letter-spacing: -0.03em;
  color: #ffffff;
  line-height: 1.05;
}

/* ── Amount ── */
.wcm-amount {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 8px;
  font-variant-numeric: tabular-nums;
  margin: 4px 0 8px;
}
.wcm-currency {
  font-size: clamp(1rem, 4vw, 1.4rem);
  font-weight: 700;
  color: rgba(255, 215, 100, 0.65);
  letter-spacing: 0.06em;
}
.wcm-value {
  font-size: clamp(2rem, 9vw, 3.2rem);
  font-weight: 800;
  color: #ffffff;
  text-shadow:
    0 4px 16px rgba(255, 215, 100, 0.35),
    0 0 40px rgba(255, 215, 100, 0.12);
}

/* ── Ticket info ── */
.wcm-ticket-info {
  margin: 4px 0 2px;
}
.wcm-ticket-label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.55);
}

/* ── Market tags ── */
.wcm-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  margin: 8px 0 4px;
}
.wcm-tag {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.07);
  padding: 3px 10px;
  border-radius: 999px;
  letter-spacing: 0.02em;
}

/* ── Brand wordmark ── */
.wcm-brand {
  margin: 14px 0 2px;
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: #ffffff;
}
.wcm-brand em {
  font-style: normal;
  color: #26d97a;
}

/* ── Action buttons ── */
.wcm-actions {
  display: flex;
  gap: 12px;
  padding-top: 20px;
}
.wcm-btn {
  flex: 1;
  padding: 14px 16px;
  border-radius: 14px;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
  font-family: inherit;
}
.wcm-btn-outline {
  background: transparent;
  color: #007A45;
  border: 2px solid #007A45;
}
.wcm-btn-outline:hover {
  background: rgba(0, 122, 69, 0.08);
}
.wcm-btn-solid {
  background: #007A45;
  color: #ffffff;
  border: none;
  font-weight: 900;
  box-shadow: 0 8px 24px rgba(0, 122, 69, 0.35);
}
.wcm-btn-solid:hover {
  background: #005A32;
  box-shadow: 0 12px 32px rgba(0, 122, 69, 0.5);
}

/* ── Responsive ── */
@media (max-width: 400px) {
  .wcm-card {
    padding: 24px 16px 20px;
    border-radius: 22px;
  }
  .wcm-trophy-arena {
    width: 180px;
    height: 160px;
  }
  .wcm-trophy-img {
    width: 160px;
  }
  .wcm-actions {
    flex-direction: column;
    gap: 8px;
    padding-top: 16px;
  }
}
`;

/* Inject styles once */
let injected = false;
if (typeof document !== 'undefined' && !injected) {
  const style = document.createElement('style');
  style.textContent = STYLES;
  document.head.appendChild(style);
  injected = true;
}

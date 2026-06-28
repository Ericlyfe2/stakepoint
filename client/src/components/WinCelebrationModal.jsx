import { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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
   Trophy SVG with classical flanking figures
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
        <motion.div
          className="wcm-trophy-group"
          animate={{ y: [-8, 8, -8] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        >
          {/* Left figure */}
          <svg className="wcm-figure wcm-figure-left" viewBox="0 0 40 100" width="36" height="90" fill="none">
            <defs>
              <linearGradient id="figL" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#ffe28a" />
                <stop offset=".6" stopColor="#d4891a" />
                <stop offset="1" stopColor="#7a4400" />
              </linearGradient>
            </defs>
            {/* Head */}
            <circle cx="20" cy="10" r="8" fill="url(#figL)" />
            {/* Torso */}
            <path d="M12 18 Q8 18 6 22 L6 50 Q10 55 14 50 L16 36 Q18 34 20 38 L22 36 Q24 34 26 36 L28 50 Q30 55 34 50 L34 22 Q32 18 28 18 Z" fill="url(#figL)" />
            {/* Left arm (up lifting) */}
            <path d="M8 22 Q2 16 4 8 Q5 6 8 8 Q10 14 12 20" fill="url(#figL)" />
            {/* Right arm (up lifting) */}
            <path d="M32 22 Q38 16 36 8 Q35 6 32 8 Q30 14 28 20" fill="url(#figL)" />
            {/* Legs */}
            <path d="M14 50 L10 94 L16 94 L18 56 Z" fill="url(#figL)" />
            <path d="M26 50 L30 94 L24 94 L22 56 Z" fill="url(#figL)" />
            {/* Leaf crown */}
            <path d="M12 4 Q16 0 20 3 Q24 0 28 4" fill="#007A45" opacity="0.35" />
          </svg>

          {/* Center trophy */}
          <div className="wcm-trophy-center">
            <svg viewBox="0 0 80 90" width="72" height="81" fill="none">
              <defs>
                <linearGradient id="trophyBody" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#fff7cc" />
                  <stop offset=".35" stopColor="#ffdb5c" />
                  <stop offset=".7" stopColor="#e8a317" />
                  <stop offset="1" stopColor="#8b5e00" />
                </linearGradient>
                <linearGradient id="trophyBase" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#c4861a" />
                  <stop offset="1" stopColor="#5c3700" />
                </linearGradient>
              </defs>
              {/* Handles */}
              <path d="M6 28 Q-4 40 6 56" stroke="url(#trophyBody)" strokeWidth="5" strokeLinecap="round" fill="none" />
              <path d="M74 28 Q84 40 74 56" stroke="url(#trophyBody)" strokeWidth="5" strokeLinecap="round" fill="none" />
              {/* Cup body */}
              <path d="M12 20 H68 V44 Q68 60 54 68 H26 Q12 60 12 44 Z" fill="url(#trophyBody)" />
              {/* Rim */}
              <ellipse cx="40" cy="20" rx="30" ry="6" fill="#fff7cc" />
              <ellipse cx="40" cy="20" rx="28" ry="4.5" fill="#ffe066" />
              {/* BetXentra shield mark on cup */}
              <g transform="translate(28,28) scale(0.36)">
                <path d="M32 6L54 16L54 36C54 50 32 60 32 60C32 60 10 50 10 36L10 16Z" fill="#1a0e00" fillOpacity="0.35"/>
                <path d="M22 22L22 43L33 43C38 43 42 40 42 35.5C42 33 40.5 31 38.5 30C40 29 41 27.5 41 25.5C41 23 38 22 34 22ZM26.5 26L33 26C35.5 26 37 27 37 29C37 31 35.5 32 33 32L26.5 32ZM26.5 35.5L33.5 35.5C36.5 35.5 37.5 37 37.5 39C37.5 41 35.5 39.5 33.5 39.5L26.5 39.5Z" fill="#1a0e00" fillOpacity="0.55"/>
              </g>
              {/* Highlight */}
              <ellipse cx="34" cy="32" rx="10" ry="16" fill="white" opacity="0.12" />
              {/* Stem */}
              <rect x="34" y="68" width="12" height="8" rx="2" fill="url(#trophyBase)" />
              {/* Foot */}
              <path d="M22 76 H58 A6 6 0 0 1 64 82 L64 82 A4 4 0 0 1 60 86 H20 A4 4 0 0 1 16 82 L16 82 A6 6 0 0 1 22 76 Z" fill="url(#trophyBase)" />
            </svg>
          </div>

          {/* Right figure */}
          <svg className="wcm-figure wcm-figure-right" viewBox="0 0 40 100" width="36" height="90" fill="none">
            <defs>
              <linearGradient id="figR" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#ffe28a" />
                <stop offset=".6" stopColor="#d4891a" />
                <stop offset="1" stopColor="#7a4400" />
              </linearGradient>
            </defs>
            {/* Head */}
            <circle cx="20" cy="10" r="8" fill="url(#figR)" />
            {/* Torso */}
            <path d="M12 18 Q8 18 6 22 L6 50 Q10 55 14 50 L16 36 Q18 34 20 38 L22 36 Q24 34 26 36 L28 50 Q30 55 34 50 L34 22 Q32 18 28 18 Z" fill="url(#figR)" />
            {/* Left arm (up lifting) */}
            <path d="M8 22 Q2 16 4 8 Q5 6 8 8 Q10 14 12 20" fill="url(#figR)" />
            {/* Right arm (up lifting) */}
            <path d="M32 22 Q38 16 36 8 Q35 6 32 8 Q30 14 28 20" fill="url(#figR)" />
            {/* Legs */}
            <path d="M14 50 L10 94 L16 94 L18 56 Z" fill="url(#figR)" />
            <path d="M26 50 L30 94 L24 94 L22 56 Z" fill="url(#figR)" />
            {/* Leaf crown */}
            <path d="M12 4 Q16 0 20 3 Q24 0 28 4" fill="#007A45" opacity="0.35" />
          </svg>
        </motion.div>

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
  width: 180px;
  height: 120px;
  display: flex;
  justify-content: center;
  align-items: flex-end;
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
.wcm-trophy-group {
  display: flex;
  align-items: flex-end;
  gap: 0;
  position: relative;
  z-index: 2;
}
.wcm-trophy-center {
  position: relative;
  z-index: 2;
  margin-bottom: -4px;
}
.wcm-figure {
  flex-shrink: 0;
}
.wcm-figure-left {
  margin-right: -6px;
  margin-bottom: -2px;
}
.wcm-figure-right {
  margin-left: -6px;
  margin-bottom: -2px;
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
    width: 150px;
    height: 100px;
  }
  .wcm-figure {
    width: 28px;
    height: 70px;
  }
  .wcm-trophy-center svg {
    width: 56px;
    height: 63px;
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

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import html2canvas from 'html2canvas';
import {
  formatAmt, formatDate, formatTime, buildBetSummary,
  copyToClipboard, shareWhatsApp, shareTelegram, shareTwitter,
  getTicketUrl, buildShareText, downloadTicketImage, statusLabel,
} from '../utils/shareUtils.js';

const PHASES = {
  INIT: 'init',
  FADE_IN: 'fade_in',
  CHECKMARK: 'checkmark',
  PARTICLES: 'particles',
  RAYS: 'rays',
  CARD_REVEAL: 'card_reveal',
  COMPLETE: 'complete',
};

const PHASE_DELAYS = {
  [PHASES.FADE_IN]: 0,
  [PHASES.CHECKMARK]: 300,
  [PHASES.PARTICLES]: 900,
  [PHASES.RAYS]: 1300,
  [PHASES.CARD_REVEAL]: 1900,
  [PHASES.COMPLETE]: 2800,
};

function usePhaseSequence() {
  const [phase, setPhase] = useState(PHASES.INIT);

  useEffect(() => {
    const timers = Object.entries(PHASE_DELAYS).map(([p, delay]) =>
      setTimeout(() => setPhase(p), delay)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return phase;
}

function particles(count = 24) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: 50 + (Math.random() - 0.5) * 60,
    y: 50 + (Math.random() - 0.5) * 60,
    size: 4 + Math.random() * 8,
    color: ['#c5ff3d', '#4ade80', '#22d3ee', '#ffb547', '#ff4d3d', '#a78bfa', '#f472b6'][i % 7],
    delay: Math.random() * 0.3,
    duration: 0.8 + Math.random() * 0.6,
    driftX: (Math.random() - 0.5) * 100,
    driftY: (Math.random() - 0.5) * 100 - 30,
    rotation: Math.random() * 720,
  }));
}

function SuccessCheckmark({ phase }) {
  const visible = phase !== PHASES.INIT;
  const circleScale = phase === PHASES.INIT ? 0 : phase === PHASES.FADE_IN ? 0.3 : phase === PHASES.CHECKMARK ? 1.1 : 1;
  const strokeDone = phase === PHASES.CHECKMARK || phase === PHASES.PARTICLES || phase === PHASES.RAYS || phase === PHASES.CARD_REVEAL || phase === PHASES.COMPLETE;
  const showText = phase === PHASES.CHECKMARK || phase === PHASES.PARTICLES || phase === PHASES.RAYS || phase === PHASES.CARD_REVEAL || phase === PHASES.COMPLETE;

  return (
    <motion.div
      className="sp-success-checkmark"
      initial={{ opacity: 0, scale: 0.5 }}
      animate={visible ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.5 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.div
        className="sp-success-circle"
        animate={{ scale: circleScale }}
        transition={{ type: 'spring', stiffness: 200, damping: 14, mass: 0.8 }}
      >
        <svg width="56" height="56" viewBox="0 0 72 72" fill="none">
          <motion.path
            d="M20 36 L30 46 L52 24"
            stroke="#fff"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: strokeDone ? 1 : 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
            style={{ filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.6))' }}
          />
        </svg>
      </motion.div>
      <AnimatePresence>
        {showText && (
          <motion.div
            className="sp-success-text"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
            <span className="sp-success-title">Bet Placed</span>
            <span className="sp-success-sub">Booking code ready</span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ParticleBurst({ phase }) {
  const show = phase === PHASES.PARTICLES || phase === PHASES.RAYS || phase === PHASES.CARD_REVEAL || phase === PHASES.COMPLETE;
  const [items] = useState(() => particles());

  return (
    <AnimatePresence>
      {show && (
        <div className="sp-particles" aria-hidden>
          {items.map((p) => (
            <motion.div
              key={p.id}
              className="sp-particle"
              initial={{ x: '50vw', y: '50vh', scale: 0, opacity: 0 }}
              animate={{
                x: `calc(50vw + ${p.driftX}px)`,
                y: `calc(50vh + ${p.driftY}px)`,
                scale: [0, 1.2, 0.8, 0],
                opacity: [0, 1, 1, 0],
                rotate: p.rotation,
              }}
              transition={{
                duration: p.duration,
                delay: p.delay,
                ease: [0.25, 0.46, 0.45, 0.94],
              }}
              style={{
                width: p.size,
                height: p.size,
                background: p.color,
                borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                position: 'absolute',
                pointerEvents: 'none',
              }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  );
}

function LightRays({ phase }) {
  const show = phase === PHASES.RAYS || phase === PHASES.CARD_REVEAL || phase === PHASES.COMPLETE;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="sp-light-rays"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          aria-hidden
        >
          {[0, 60, 120, 180, 240, 300].map((angle) => (
            <div
              key={angle}
              className="sp-ray"
              style={{ transform: `rotate(${angle}deg)` }}
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function TicketImageContent({ bet }) {
  const summary = buildBetSummary(bet);
  const { code, legs, stake, odds, potentialWin, modeLabel, placedAt } = summary;
  const totalOdds = Number(odds || 0);

  return (
    <div className="sp-ticket-image" id="sp-ticket-capture">
      <div className="sp-ticket-image-header">
        <div className="sp-ticket-image-logo">
          <svg width="28" height="28" viewBox="0 0 40 40" fill="none">
            <rect width="40" height="40" rx="10" fill="#c5ff3d" />
            <path d="M12 20 L18 26 L28 14" stroke="#0a0d0c" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>StakePoint</span>
        </div>
        <div className="sp-ticket-image-code">{code}</div>
      </div>
      <div className="sp-ticket-image-divider" />
      <div className="sp-ticket-image-matches">
        <div className="sp-ticket-image-section-title">Selections ({legs.length})</div>
        {legs.map((leg, i) => (
          <div key={i} className="sp-ticket-image-leg">
            <div className="sp-ticket-image-leg-info">
              <span className="sp-ticket-image-leg-teams">{leg.home} vs {leg.away}</span>
              <span className="sp-ticket-image-leg-market">{leg.marketName || leg.market} · {leg.outcome}</span>
            </div>
            <span className="sp-ticket-image-leg-odds">{Number(leg.odds || 0).toFixed(2)}</span>
          </div>
        ))}
      </div>
      <div className="sp-ticket-image-divider" />
      <div className="sp-ticket-image-summary">
        <div className="sp-ticket-image-row">
          <span>Stake</span>
          <span>GHS {formatAmt(stake)}</span>
        </div>
        <div className="sp-ticket-image-row">
          <span>Total Odds</span>
          <span>{totalOdds.toFixed(2)}</span>
        </div>
        <div className="sp-ticket-image-row sp-ticket-image-row-highlight">
          <span>Potential Win</span>
          <span>GHS {formatAmt(potentialWin)}</span>
        </div>
        <div className="sp-ticket-image-row">
          <span>Type</span>
          <span>{modeLabel}</span>
        </div>
        <div className="sp-ticket-image-row">
          <span>Date</span>
          <span>{formatDate(placedAt)} {formatTime(placedAt)}</span>
        </div>
      </div>
      <div className="sp-ticket-image-footer">
        <span>stakepoint.com/ticket/{code}</span>
      </div>
    </div>
  );
}

export function toBookingCode(id = '') {
  const s = String(id).replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (!s) return 'XX00000';
  const letters = (s.match(/[A-Z]/g) || ['X', 'X']).slice(0, 2).join('').padEnd(2, 'X');
  const digits  = (s.match(/[0-9]/g) || ['0']).slice(-5).join('').padStart(5, '0');
  return letters + digits;
}

function ActionButton({ icon, label, onClick, variant = 'default', disabled }) {
  return (
    <motion.button
      className={`sp-action-btn sp-action-btn-${variant}`}
      onClick={onClick}
      disabled={disabled}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.96 }}
    >
      {icon && <span className="sp-action-btn-icon">{icon}</span>}
      <span className="sp-action-btn-label">{label}</span>
    </motion.button>
  );
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function LoadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

function TwitterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export default function BookingCodeOverlay({ bet, onClose, onConfirm, onRebet, toast }) {
  const phase = usePhaseSequence();
  const [actionFeedback, setActionFeedback] = useState('');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const ticketCaptureRef = useRef(null);

  // Lock body scroll when overlay is active
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const summary = bet ? buildBetSummary(bet) : null;
  const code = summary?.code || 'XX00000';
  const legs = summary?.legs || [];
  const stake = summary?.stake || 0;
  const odds = summary?.odds || 0;
  const potentialWin = summary?.potentialWin || 0;
  const modeLabel = summary?.modeLabel || 'Bet';
  const placedAt = summary?.placedAt || null;
  const status = summary?.status || 'open';
  const totalOdds = Number(odds || 0);
  const ticketUrl = getTicketUrl(code);
  const shareText = bet ? buildShareText(bet) : '';
  const showActions = phase === PHASES.COMPLETE;

  const showFeedback = useCallback((msg) => {
    setActionFeedback(msg);
    setTimeout(() => setActionFeedback(''), 2500);
  }, []);

  const handleCopyCode = useCallback(async () => {
    try {
      await copyToClipboard(code);
      showFeedback('Booking code copied successfully!');
      toast?.('Booking code copied successfully!', 'success');
    } catch {
      showFeedback('Failed to copy code');
    }
  }, [code, showFeedback, toast]);

  const handleCopyLink = useCallback(async () => {
    try {
      await copyToClipboard(ticketUrl);
      showFeedback('Ticket link copied successfully!');
      toast?.('Ticket link copied successfully!', 'success');
    } catch {
      showFeedback('Failed to copy link');
    }
  }, [ticketUrl, showFeedback, toast]);

  const handleWhatsApp = useCallback(() => {
    shareWhatsApp(`${shareText}\n\n${ticketUrl}`);
  }, [shareText, ticketUrl]);

  const handleTelegram = useCallback(() => {
    shareTelegram(shareText, ticketUrl);
  }, [shareText, ticketUrl]);

  const handleTwitter = useCallback(() => {
    shareTwitter(shareText);
  }, [shareText]);

  const handleSaveImage = useCallback(async () => {
    setIsGeneratingImage(true);
    try {
      const el = ticketCaptureRef.current;
      if (!el) throw new Error('Capture element not found');
      const canvas = await html2canvas(el, {
        backgroundColor: '#0f1413',
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
      });
      await downloadTicketImage(canvas, code);
      showFeedback('Ticket image saved!');
      toast?.('Ticket image saved successfully!', 'success');
    } catch (e) {
      showFeedback('Failed to generate image');
      toast?.('Could not generate ticket image.', 'warn');
    } finally {
      setIsGeneratingImage(false);
    }
  }, [code, showFeedback, toast]);

  const handleLoadCode = useCallback(() => {
    window.dispatchEvent(new CustomEvent('xenbet:load-code', { detail: { code } }));
    onClose?.();
  }, [code, onClose]);

  const overlayVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.4 } },
    exit: { opacity: 0, transition: { duration: 0.3 } },
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 60, scale: 0.85 },
    visible: {
      opacity: 1, y: 0, scale: 1,
      transition: { type: 'spring', stiffness: 120, damping: 18, mass: 0.9, delay: 0.15 },
    },
  };

  const glowVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: {
      opacity: [0, 0.6, 0.3, 0.5, 0.2],
      scale: [0.95, 1.05, 1, 1.03, 1],
      transition: { duration: 3, ease: 'easeInOut', repeat: Infinity, repeatType: 'mirror' },
    },
  };

  return (
    <AnimatePresence>
      {bet && (
        <motion.div
          key="sp-overlay"
          className="sp-overlay"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          {/* Backdrop */}
          <motion.div
            className="sp-overlay-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          />

          {/* Light Rays */}
          <LightRays phase={phase} />

          <div className="sp-overlay-body">
            {/* Particle Burst */}
            <ParticleBurst phase={phase} />

            {/* Success Checkmark */}
            <SuccessCheckmark phase={phase} />

            {/* Booking Code Card */}
            {(phase === PHASES.CARD_REVEAL || phase === PHASES.COMPLETE) && (
              <motion.div
                className="sp-card-container"
                variants={cardVariants}
                initial="hidden"
                animate="visible"
              >
                {/* Floating glow */}
                <motion.div
                  className="sp-card-glow"
                  variants={glowVariants}
                  initial="hidden"
                  animate="visible"
                />

                <div className="sp-card">
                  {/* Card Header */}
                  <div className="sp-card-header">
                    <div className="sp-card-brand">
                      <svg width="18" height="18" viewBox="0 0 40 40" fill="none">
                        <rect width="40" height="40" rx="10" fill="#c5ff3d" />
                        <path d="M12 20 L18 26 L28 14" stroke="#0a0d0c" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span>StakePoint</span>
                    </div>
                    <span className="sp-card-badge">{statusLabel(status)}</span>
                  </div>

                  {/* Booking Code */}
                  <div className="sp-card-code-section">
                    <span className="sp-card-code-label">Booking Code</span>
                    <div className="sp-card-code-value">{code}</div>
                  </div>

                  {/* Compact Summary */}
                  <div className="sp-card-summary">
                    <div className="sp-card-summary-row sp-card-summary-row-win">
                      <span className="sp-card-summary-label">Potential Win</span>
                      <span className="sp-card-summary-value sp-card-win">GHS {formatAmt(potentialWin)}</span>
                    </div>
                    <div className="sp-card-divider" />
                    <div className="sp-card-summary-row">
                      <span className="sp-card-summary-label">Stake</span>
                      <span className="sp-card-summary-value">GHS {formatAmt(stake)}</span>
                    </div>
                    <div className="sp-card-summary-row">
                      <span className="sp-card-summary-label">Total Odds</span>
                      <span className="sp-card-summary-value sp-card-mono">{totalOdds.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  {showActions && (
                    <motion.div
                      className="sp-card-actions"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3, duration: 0.4 }}
                    >
                      <div className="sp-card-actions-row">
                        <ActionButton
                          icon={<CopyIcon />}
                          label="Copy"
                          onClick={handleCopyCode}
                        />
                        <ActionButton
                          icon={<LoadIcon />}
                          label="Load"
                          onClick={handleLoadCode}
                        />
                        <ActionButton
                          icon={<LinkIcon />}
                          label="Link"
                          onClick={handleCopyLink}
                        />
                        <ActionButton
                          icon={<ImageIcon />}
                          label={isGeneratingImage ? 'Saving' : 'Image'}
                          onClick={handleSaveImage}
                          disabled={isGeneratingImage}
                        />
                      </div>
                      <div className="sp-card-actions-row sp-card-actions-social">
                        <ActionButton
                          icon={<WhatsAppIcon />}
                          label="WhatsApp"
                          onClick={handleWhatsApp}
                          variant="social"
                        />
                        <ActionButton
                          icon={<TelegramIcon />}
                          label="Telegram"
                          onClick={handleTelegram}
                          variant="social"
                        />
                        <ActionButton
                          icon={<TwitterIcon />}
                          label="X"
                          onClick={handleTwitter}
                          variant="social"
                        />
                      </div>
                    </motion.div>
                  )}

                  {/* Bottom Navigation */}
                  {showActions && (
                    <motion.div
                      className="sp-card-bottom"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5, duration: 0.4 }}
                    >
                      <button
                        type="button"
                        className="sp-card-btn sp-card-btn-primary"
                        onClick={onConfirm}
                      >
                        View My Bets
                      </button>
                      <button
                        type="button"
                        className="sp-card-btn sp-card-btn-secondary"
                        onClick={() => { onRebet?.(); onClose?.(); }}
                      >
                        Rebet
                      </button>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}
          </div>

          {/* Feedback Toast */}
          <AnimatePresence>
            {actionFeedback && (
              <motion.div
                className="sp-feedback-toast"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.3 }}
              >
                {actionFeedback}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Hidden ticket image for capture */}
          <div ref={ticketCaptureRef} style={{ position: 'fixed', left: '-9999px', top: 0 }}>
            <TicketImageContent bet={bet} />
          </div>

          {/* Inline styles for the ticket image capture */}
          <style>{TICKET_IMAGE_CSS}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const TICKET_IMAGE_CSS = `
.sp-ticket-image {
  width: 400px;
  padding: 24px;
  background: #0f1413;
  color: #ecf0ee;
  font-family: 'Bricolage Grotesque', 'Inter', system-ui, sans-serif;
  border-radius: 16px;
}
.sp-ticket-image-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.sp-ticket-image-logo {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 800;
}
.sp-ticket-image-code {
  font-family: 'JetBrains Mono', monospace;
  font-size: 20px;
  font-weight: 800;
  color: #c5ff3d;
  letter-spacing: 0.08em;
}
.sp-ticket-image-divider {
  height: 1px;
  background: rgba(255,255,255,0.08);
  margin: 12px 0;
}
.sp-ticket-image-section-title {
  font-size: 12px;
  font-weight: 700;
  color: rgba(255,255,255,0.5);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 8px;
}
.sp-ticket-image-leg {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.sp-ticket-image-leg-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sp-ticket-image-leg-teams {
  font-size: 13px;
  font-weight: 700;
}
.sp-ticket-image-leg-market {
  font-size: 11px;
  color: rgba(255,255,255,0.5);
}
.sp-ticket-image-leg-odds {
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  font-weight: 700;
  color: #c5ff3d;
}
.sp-ticket-image-summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sp-ticket-image-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}
.sp-ticket-image-row span:first-child {
  color: rgba(255,255,255,0.5);
}
.sp-ticket-image-row span:last-child {
  font-weight: 700;
}
.sp-ticket-image-row-highlight span:last-child {
  color: #4ade80;
  font-size: 16px;
}
.sp-ticket-image-footer {
  text-align: center;
  font-size: 11px;
  color: rgba(255,255,255,0.3);
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid rgba(255,255,255,0.08);
}
`;

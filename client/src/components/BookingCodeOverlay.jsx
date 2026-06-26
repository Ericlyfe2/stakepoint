import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  formatDate, formatTime, buildBetSummary,
  copyToClipboard, shareWhatsApp, shareTelegram, shareTwitter,
  getTicketUrl, buildShareText,
} from '../utils/shareUtils.js';

export function toBookingCode(id = '') {
  const s = String(id).replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (!s) return 'XX00000';
  const letters = (s.match(/[A-Z]/g) || ['X', 'X']).slice(0, 2).join('').padEnd(2, 'X');
  const digits  = (s.match(/[0-9]/g) || ['0']).slice(-5).join('').padStart(5, '0');
  return letters + digits;
}

export default function BookingCodeOverlay({ bet, onClose, onConfirm, onRebet, toast }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!bet) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [bet]);

  const summary = bet ? buildBetSummary(bet) : null;
  const code = summary?.code || 'XX00000';
  const placedAt = summary?.placedAt || null;
  const ticketUrl = getTicketUrl(code);
  const shareText = bet ? buildShareText(bet) : '';

  const handleCopy = useCallback(async () => {
    try {
      await copyToClipboard(code);
      setCopied(true);
      toast?.('Booking code copied!', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast?.('Failed to copy', 'warn');
    }
  }, [code, toast]);

  const handleCopyLink = useCallback(async () => {
    try {
      await copyToClipboard(ticketUrl);
      toast?.('Link copied!', 'success');
    } catch {
      toast?.('Failed to copy link', 'warn');
    }
  }, [ticketUrl, toast]);

  return (
    <AnimatePresence>
      {bet && (
        <motion.div
          key="bco-overlay"
          className="bco-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            className="bco-card"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 22 }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bco-header">
              <span className="bco-header-title">Booking Code</span>
              <button type="button" className="bco-close" onClick={onClose} aria-label="Close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* Code Display */}
            <div className="bco-code-area">
              <div className="bco-reload">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
              </div>
              <motion.div
                className="bco-code-value"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 12, delay: 0.15 }}
              >
                {code}
              </motion.div>
              <div className="bco-code-date">
                {placedAt ? `${formatDate(placedAt)} ${formatTime(placedAt)}` : ''}
              </div>
              <button type="button" className="bco-load-btn" onClick={handleCopy}>
                {copied ? '✓ Copied' : 'Load Code'}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
            </div>

            {/* Share Row */}
            <div className="bco-share-row">
              {navigator.share && (
                <button type="button" className="bco-share-btn" onClick={() => navigator.share({ title: 'BetXentra Booking Code', text: shareText, url: ticketUrl }).catch(() => {})}>
                  <div className="bco-share-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                  </div>
                  <span>Save<br/>Image</span>
                </button>
              )}
              <button type="button" className="bco-share-btn" onClick={handleCopyLink}>
                <div className="bco-share-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                  </div>
                  <span>Copy<br/>Link</span>
                </button>
              <button type="button" className="bco-share-btn" onClick={() => shareTwitter(shareText)}>
                <div className="bco-share-icon bco-icon-x">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </div>
                <span>X</span>
              </button>
              <button type="button" className="bco-share-btn" onClick={() => shareTelegram(shareText, ticketUrl)}>
                <div className="bco-share-icon bco-icon-tg">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                </div>
                <span>Telegram</span>
              </button>
              <button type="button" className="bco-share-btn" onClick={() => shareWhatsApp(`${shareText}\n\n${ticketUrl}`)}>
                <div className="bco-share-icon bco-icon-wa">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
                </div>
                <span>WhatsApp</span>
              </button>
            </div>

            {/* Green branded footer */}
            <div className="bco-footer">
              <div className="bco-footer-brand">
                <span className="bco-footer-logo">X</span>
                <span className="bco-footer-name">betxentra.com</span>
              </div>
              <button type="button" className="bco-footer-more" onClick={onConfirm} aria-label="More">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const BCO_CSS = `
.bco-overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:9999;display:grid;place-items:center;padding:16px}
.bco-card{width:100%;max-width:380px;background:var(--surface);border-radius:16px;overflow:hidden}
.bco-header{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 0}
.bco-header-title{font-size:14px;font-weight:700;color:var(--text-soft)}
.bco-close{background:none;border:none;color:var(--text-dim);cursor:pointer;padding:4px;display:grid;place-items:center}
.bco-close:hover{color:var(--text)}
.bco-code-area{display:flex;flex-direction:column;align-items:center;padding:20px 16px 16px;gap:8px}
.bco-reload{color:var(--text-dim);opacity:.45}
.bco-code-value{font-size:34px;font-weight:900;color:var(--text);letter-spacing:.1em;font-family:'JetBrains Mono',monospace}
.bco-code-date{font-size:12px;color:var(--text-dim);margin-bottom:4px}
.bco-load-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 22px;border-radius:6px;border:1px solid var(--line-strong);background:var(--surface-2);color:var(--text);font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;transition:all .15s}
.bco-load-btn:hover{border-color:var(--accent);color:var(--accent)}
.bco-share-row{display:flex;justify-content:center;gap:14px;padding:8px 16px 18px}
.bco-share-btn{display:flex;flex-direction:column;align-items:center;gap:5px;background:none;border:none;cursor:pointer;font-family:inherit;color:var(--text-soft);font-size:10px;font-weight:600;line-height:1.3;text-align:center}
.bco-share-btn:hover{color:var(--text)}
.bco-share-icon{width:44px;height:44px;border-radius:50%;background:var(--surface-2);display:grid;place-items:center;color:var(--text);transition:all .15s}
.bco-share-btn:hover .bco-share-icon{background:var(--surface-3)}
.bco-icon-x{background:#000;color:#fff}
.bco-icon-tg{background:#229ED9;color:#fff}
.bco-icon-wa{background:#25D366;color:#fff}
.bco-footer{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:linear-gradient(135deg,#0a4a2e,#116f43)}
.bco-footer-brand{display:flex;align-items:center;gap:6px}
.bco-footer-logo{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;background:var(--accent);color:#000;font-size:13px;font-weight:900}
.bco-footer-name{color:#fff;font-size:14px;font-weight:700;letter-spacing:.02em}
.bco-footer-more{background:none;border:none;color:rgba(255,255,255,.7);cursor:pointer;padding:6px;display:grid;place-items:center}
.bco-footer-more:hover{color:#fff}
`;

// Inject styles once
if (typeof document !== 'undefined') {
  const id = 'bco-styles';
  if (!document.getElementById(id)) {
    const style = document.createElement('style');
    style.id = id;
    style.textContent = BCO_CSS;
    document.head.appendChild(style);
  }
}

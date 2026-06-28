import { useEffect, useRef, useState } from 'react';

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

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mn = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mn}`;
}

export default function BetSuccessModal({ bet, onClose, onRebet, onConfirm }) {
  const dlg = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!bet || !dlg.current) return;
    if (!dlg.current.open) dlg.current.showModal();
    setCopied(false);
  }, [bet]);

  if (!bet) return null;
  const code = bet.bookingCode || toBookingCode(bet.id);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = code;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch { /* clipboard not available */ }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareText = `Check out my bet on BetXentra!\nBooking Code: ${code}`;
  const shareUrl = `https://betxentra.vercel.app/ticket/${code}`;

  const shareNative = () => {
    if (navigator.share) {
      navigator.share({ title: 'BetXentra Booking Code', text: shareText, url: shareUrl }).catch(() => {});
    }
  };

  const shareX = () => {
    window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(shareText + '\n' + shareUrl)}`, '_blank');
  };

  const shareTelegram = () => {
    window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`, '_blank');
  };

  const shareWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText + '\n' + shareUrl)}`, '_blank');
  };

  return (
    <dialog ref={dlg} className="bsm-dialog" onClose={onClose}>
      <div className="bsm-content">
        {/* Header */}
        <div className="bsm-header">
          <span className="bsm-header-title">Booking Code</span>
          <button type="button" className="bsm-close" onClick={() => { dlg.current?.close(); onClose?.(); }} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Booking Code Display */}
        <div className="bsm-code-area">
          <div className="bsm-reload-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
          </div>
          <div className="bsm-code-value">{code}</div>
          <div className="bsm-code-date">{formatDate(bet.placedAt)}</div>
          <button type="button" className="bsm-load-code" onClick={copy}>
            {copied ? '✓ Copied' : 'Load Code'} <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
        </div>

        {/* Share Options */}
        <div className="bsm-share-row">
          {navigator.share && (
            <button type="button" className="bsm-share-btn" onClick={shareNative}>
              <div className="bsm-share-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
              </div>
              <span>Save<br/>Image</span>
            </button>
          )}
          <button type="button" className="bsm-share-btn" onClick={copy}>
            <div className="bsm-share-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            </div>
            <span>Copy<br/>Link</span>
          </button>
          <button type="button" className="bsm-share-btn" onClick={shareX}>
            <div className="bsm-share-icon bsm-share-x">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </div>
            <span>X</span>
          </button>
          <button type="button" className="bsm-share-btn" onClick={shareTelegram}>
            <div className="bsm-share-icon bsm-share-tg">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
            </div>
            <span>Telegram</span>
          </button>
          <button type="button" className="bsm-share-btn" onClick={shareWhatsApp}>
            <div className="bsm-share-icon bsm-share-wa">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
            </div>
            <span>WhatsApp</span>
          </button>
        </div>

        {/* Branded footer */}
        <div className="bsm-footer">
          <div className="bsm-footer-brand">
            <svg width="22" height="22" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{borderRadius:6,overflow:'hidden',flexShrink:0}}>
              <rect width="64" height="64" rx="14" fill="#0a0d0c"/>
              <path d="M32 6L54 16L54 36C54 50 32 60 32 60C32 60 10 50 10 36L10 16Z" fill="#007A45"/>
              <path d="M22 22L22 43L33 43C38 43 42 40 42 35.5C42 33 40.5 31 38.5 30C40 29 41 27.5 41 25.5C41 23 38 22 34 22ZM26.5 26L33 26C35.5 26 37 27 37 29C37 31 35.5 32 33 32L26.5 32ZM26.5 35.5L33.5 35.5C36.5 35.5 37.5 37 37.5 39C37.5 41 35.5 39.5 33.5 39.5L26.5 39.5Z" fill="white"/>
            </svg>
            <span className="bsm-footer-name">betxentra.com</span>
          </div>
          <button type="button" className="bsm-footer-ok" onClick={() => { dlg.current?.close(); onConfirm?.(); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
          </button>
        </div>
      </div>

      <style>{BSM_CSS}</style>
    </dialog>
  );
}

const BSM_CSS = `
.bsm-dialog { border: none; background: transparent; padding: 0; max-width: 400px; width: 92vw; margin: auto; }
.bsm-dialog::backdrop { background: rgba(0,0,0,.7); }
.bsm-content { background: var(--surface); border-radius: 16px; overflow: hidden; animation: bsmPop .25s cubic-bezier(.2,1.3,.4,1) both; }
@keyframes bsmPop { from { transform: scale(.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }

/* Header */
.bsm-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px 0; }
.bsm-header-title { font-size: 14px; font-weight: 700; color: var(--text-soft); }
.bsm-close { background: none; border: none; color: var(--text-dim); cursor: pointer; padding: 4px; display: grid; place-items: center; }
.bsm-close:hover { color: var(--text); }

/* Code area */
.bsm-code-area { display: flex; flex-direction: column; align-items: center; padding: 20px 16px 16px; gap: 8px; }
.bsm-reload-icon { color: var(--text-dim); opacity: .5; }
.bsm-code-value { font-size: 32px; font-weight: 900; color: var(--text); letter-spacing: .08em; font-family: 'JetBrains Mono', monospace; }
.bsm-code-date { font-size: 12px; color: var(--text-dim); margin-bottom: 4px; }
.bsm-load-code { display: inline-flex; align-items: center; gap: 6px; padding: 8px 20px; border-radius: 6px; border: 1px solid var(--line-strong); background: var(--surface-2); color: var(--text); font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; transition: all .15s; }
.bsm-load-code:hover { border-color: var(--accent); color: var(--accent); }

/* Share row */
.bsm-share-row { display: flex; justify-content: center; gap: 16px; padding: 12px 16px 20px; }
.bsm-share-btn { display: flex; flex-direction: column; align-items: center; gap: 6px; background: none; border: none; cursor: pointer; font-family: inherit; color: var(--text-soft); font-size: 10px; font-weight: 600; line-height: 1.3; text-align: center; }
.bsm-share-btn:hover { color: var(--text); }
.bsm-share-icon { width: 42px; height: 42px; border-radius: 50%; background: var(--surface-2); display: grid; place-items: center; color: var(--text); transition: all .15s; }
.bsm-share-btn:hover .bsm-share-icon { background: var(--surface-3); }
.bsm-share-x { background: #000; color: #fff; }
.bsm-share-tg { background: #229ED9; color: #fff; }
.bsm-share-wa { background: #25D366; color: #fff; }

/* Footer */
.bsm-footer { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; background: linear-gradient(135deg, #0a4a2e, #116f43); border-radius: 0 0 16px 16px; }
.bsm-footer-brand { display: flex; align-items: center; gap: 6px; }
.bsm-footer-x { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 6px; overflow: hidden; flex-shrink: 0; }
.bsm-footer-name { color: #fff; font-size: 14px; font-weight: 700; letter-spacing: .02em; }
.bsm-footer-ok { background: none; border: none; color: rgba(255,255,255,.7); cursor: pointer; padding: 6px; display: grid; place-items: center; }
.bsm-footer-ok:hover { color: #fff; }
`;

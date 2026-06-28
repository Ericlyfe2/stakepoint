import { useCallback, useState } from 'react';

function Loader2() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="bsm-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function Copy() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function TicketIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <path d="M13 5v2" />
      <path d="M13 17v2" />
      <path d="M13 11v2" />
    </svg>
  );
}

function Download() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function Link2() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function Telegram() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#229ED9">
      <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

function WhatsApp() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

export default function BetShareModal({
  bookingCode,
  timestamp,
  shareUrl,
  onLoadCode,
  onSaveImage,
}) {
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const defaultUrl = shareUrl || `${window.location.origin}/ticket/${bookingCode}`;
  const shareText = `Check out my bet on BETXENTRA — code ${bookingCode}!`;

  const handleCopyCode = useCallback(async () => {
    try {
      await copyToClipboard(bookingCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch { /* ignore */ }
  }, [bookingCode]);

  const handleCopyLink = useCallback(async () => {
    try {
      await copyToClipboard(defaultUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch { /* ignore */ }
  }, [defaultUrl]);

  const handleWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText + '\n' + defaultUrl)}`, '_blank', 'noopener');
  };

  const handleTelegram = () => {
    window.open(`https://t.me/share/url?url=${encodeURIComponent(defaultUrl)}&text=${encodeURIComponent(shareText)}`, '_blank', 'noopener');
  };

  const handleX = () => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText + '\n' + defaultUrl)}`, '_blank', 'noopener');
  };

  return (
    <div className="bsm-root">
      <div className="bsm-card">
        {/* Top bar */}
        <div className="bsm-topbar">
          <div className="bsm-topbar-left">
            <span className="bsm-topbar-label">TABLE | AC</span>
            <Loader2 />
          </div>
          <div className="bsm-topbar-right">
            <span className="bsm-topbar-label">MID</span>
          </div>
        </div>

        {/* Booking Code */}
        <div className="bsm-code-block">
          <span className="bsm-code-label">Booking Code</span>
          <div className="bsm-code-row">
            <span className="bsm-code-value">{bookingCode}</span>
            <button
              type="button"
              className="bsm-code-copy"
              onClick={handleCopyCode}
              aria-label={codeCopied ? 'Copied' : 'Copy booking code'}
            >
              {codeCopied ? <Check /> : <Copy />}
            </button>
          </div>
          <button type="button" className="bsm-load-link" onClick={onLoadCode}>
            <TicketIcon />
            Load Code
          </button>
        </div>

        {/* Timestamp */}
        <div className="bsm-timestamp">{timestamp}</div>

        {/* Share buttons */}
        <div className="bsm-share-row">
          <button type="button" className="bsm-share-btn" onClick={onSaveImage} aria-label="Save Image">
            <div className="bsm-share-icon">
              <Download />
            </div>
            <span className="bsm-share-label">Save Image</span>
          </button>
          <button type="button" className="bsm-share-btn" onClick={handleCopyLink} aria-label="Copy Link">
            <div className="bsm-share-icon">
              {linkCopied ? <Check /> : <Link2 />}
            </div>
            <span className="bsm-share-label">Copy Link</span>
          </button>
          <button type="button" className="bsm-share-btn" onClick={handleX} aria-label="Share on X">
            <div className="bsm-share-icon">
              <XIcon />
            </div>
            <span className="bsm-share-label">X</span>
          </button>
          <button type="button" className="bsm-share-btn" onClick={handleTelegram} aria-label="Share on Telegram">
            <div className="bsm-share-icon">
              <Telegram />
            </div>
            <span className="bsm-share-label">Telegram</span>
          </button>
          <button type="button" className="bsm-share-btn" onClick={handleWhatsApp} aria-label="Share on WhatsApp">
            <div className="bsm-share-icon">
              <WhatsApp />
            </div>
            <span className="bsm-share-label">WhatsApp</span>
          </button>
        </div>

        {/* Footer */}
        <div className="bsm-footer">
          <span className="bsm-footer-pill">{window.location.hostname}</span>
        </div>
      </div>

      <style>{BSM_CSS}</style>
    </div>
  );
}

const BSM_CSS = `
.bsm-root {
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
}

.bsm-card {
  width: 320px;
  background: #1a1a2e;
  border-radius: 16px;
  padding: 20px 20px 18px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.4);
  color: #ffffff;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* Top bar */
.bsm-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.bsm-topbar-left,
.bsm-topbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.bsm-topbar-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.35);
  text-transform: uppercase;
}

.bsm-spin {
  animation: bsm-rotate 1.2s linear infinite;
  color: rgba(255, 255, 255, 0.6);
}

@keyframes bsm-rotate {
  to { transform: rotate(360deg); }
}

/* Booking Code */
.bsm-code-block {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.bsm-code-label {
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  letter-spacing: 0.04em;
}

.bsm-code-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bsm-code-value {
  font-size: 28px;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: #ffffff;
  font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
}

.bsm-code-copy {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, border-color 0.15s;
  flex-shrink: 0;
}

.bsm-code-copy:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.25);
}

.bsm-load-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: none;
  border: none;
  color: #0E8A4A;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  padding: 2px 0;
  transition: opacity 0.15s;
}

.bsm-load-link:hover {
  opacity: 0.8;
}

/* Timestamp */
.bsm-timestamp {
  font-size: 11px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.3);
  text-align: left;
}

/* Share row */
.bsm-share-row {
  display: flex;
  justify-content: space-between;
  gap: 4px;
}

.bsm-share-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 0;
  min-width: 48px;
  transition: opacity 0.15s;
}

.bsm-share-btn:hover {
  opacity: 0.8;
}

.bsm-share-icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.07);
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.8);
}

.bsm-share-label {
  font-size: 9.5px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

/* Footer */
.bsm-footer {
  display: flex;
  justify-content: center;
  margin-top: 2px;
}

.bsm-footer-pill {
  display: inline-flex;
  align-items: center;
  padding: 6px 16px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.07);
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
}
`;

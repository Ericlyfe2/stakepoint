export function formatAmt(n) {
  return Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GH', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function buildBetSummary(bet) {
  const code = bet.bookingCode || 'XX00000';
  const legs = bet.legs || [];
  const stake = bet.stake || 0;
  const odds = bet.totalOdds || legs.reduce((acc, l) => acc * (l.odds || 1), 1) || 0;
  const potentialWin = bet.potentialWin || 0;
  const modeLabel = bet.mode === 'single' ? 'Single' : bet.mode === 'multiple' ? 'Multiple' : bet.mode === 'system' ? 'System' : 'Bet';
  return { code, legs, stake, odds, potentialWin, modeLabel, placedAt: bet.placedAt, status: bet.status };
}

export function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  return Promise.resolve();
}

export function shareWhatsApp(text) {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function shareTelegram(text, url = '') {
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url || window.location.origin)}&text=${encodeURIComponent(text)}`;
  window.open(shareUrl, '_blank', 'noopener,noreferrer');
}

export function shareTwitter(text) {
  const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  window.open(shareUrl, '_blank', 'noopener,noreferrer');
}

export function getTicketUrl(code) {
  return `${window.location.origin}/ticket/${code}`;
}

export function buildShareText(bet) {
  const summary = buildBetSummary(bet);
  const lines = [
    `⚡ StakePoint Betting Ticket`,
    ``,
    `Booking Code: ${summary.code}`,
    `Stake: GHS ${formatAmt(summary.stake)}`,
    `Total Odds: ${summary.odds.toFixed(2)}`,
    `Potential Win: GHS ${formatAmt(summary.potentialWin)}`,
    `Selections: ${summary.legs.length}`,
    `Status: ${summary.status}`,
    ``,
    `Place your bets on StakePoint!`,
  ];
  return lines.join('\n');
}

export async function downloadTicketImage(canvas, code) {
  const link = document.createElement('a');
  link.download = `stakepoint-ticket-${code}.png`;
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function shareTicketImage(canvas) {
  try {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Failed to generate image blob');
    if (navigator.share && navigator.canShare?.({ files: [new File([blob], 'ticket.png', { type: 'image/png' })] })) {
      await navigator.share({
        files: [new File([blob], 'ticket.png', { type: 'image/png' })],
        title: 'StakePoint Betting Ticket',
      });
      return 'shared';
    }
    await downloadTicketImage(canvas);
    return 'downloaded';
  } catch (e) {
    if (e.name !== 'AbortError') throw e;
    return 'cancelled';
  }
}

const STATUS_MAP = {
  open: 'Open',
  won: 'Won',
  lost: 'Lost',
  cashed_out: 'Cashed Out',
  void: 'Void',
};

export function statusLabel(status) {
  return STATUS_MAP[status] || status || '—';
}

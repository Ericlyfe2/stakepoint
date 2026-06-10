/**
 * Oddsify design tokens — JS mirror of the CSS custom properties in
 * styles/app.css. Imported by inline-styled components ported from the
 * Claude Design Oddsify.html prototype so token changes happen in one place.
 *
 * Token names retained from the design source ("greenDeep" / "greenBright")
 * even though we're black+gold now — keeping the names means we don't have to
 * rewrite every callsite if the palette pivots again.
 */
export const T = {
  bg: '#0a0a0a',
  surface: '#161513',
  surfaceAlt: '#211f1a',
  ink: '#f3e9cf',
  inkSoft: '#9c9277',
  inkDim: '#5f5848',
  line: 'rgba(243, 233, 207, 0.08)',
  lineStrong: 'rgba(243, 233, 207, 0.16)',

  greenDeep: '#0f0e0c',     // header / hero — elevated black
  greenMid: '#1a1814',      // active surface
  greenBright: '#e8b94a',   // primary CTA / brand — gold
  greenSoft: 'rgba(232, 185, 74, 0.16)',

  gold: '#f7c948',          // highlight gold (cash-out, best odds)
  goldDark: '#1a1300',      // dark ink for use on gold buttons
  danger: '#ff5b78',
  warn: '#f0a040',
};

/**
 * Format a number as Ghana Cedi with two-decimal grouping (no currency code).
 * Used pervasively in the design's match cards, slip totals, and tx rows.
 */
export function fmtCedi(n) {
  const v = Math.abs(Number(n) || 0);
  return v.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

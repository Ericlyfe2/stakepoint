/**
 * Oddsify icon set — stroke-based, original SVG paths ported verbatim from
 * the Claude Design prototype's bits.jsx. Every glyph lives in a 24×24 box
 * and uses currentColor by default so callers can tint via CSS.
 *
 * Names match the design source so screen ports compile without renames.
 */
export default function OddIcon({ name, size = 20, color = 'currentColor', strokeWidth = 1.8 }) {
  const sw = strokeWidth;
  const paths = {
    home: <path d="M3 10.5 12 3l9 7.5M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />,
    menu: <><path d="M4 7h16M4 12h16M4 17h10" /></>,
    grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></>,
    ticket: <><path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8Z"/><path d="M14 6v12" strokeDasharray="2 2"/></>,
    user: <><circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.5-3.5 4.5-5 7-5s5.5 1.5 7 5"/></>,
    search: <><circle cx="11" cy="11" r="6.5"/><path d="m16.5 16.5 4 4"/></>,
    bell: <><path d="M6 16h12l-1.5-2V11a4.5 4.5 0 0 0-9 0v3L6 16Z"/><path d="M10 19a2 2 0 0 0 4 0"/></>,
    chevR: <path d="m9 5 7 7-7 7" />,
    chevL: <path d="m15 5-7 7 7 7" />,
    chevD: <path d="m5 9 7 7 7-7" />,
    chevU: <path d="m5 15 7-7 7 7" />,
    plus: <path d="M12 5v14M5 12h14" />,
    minus: <path d="M5 12h14" />,
    x: <path d="m6 6 12 12M6 18 18 6" />,
    check: <path d="m5 12 5 5L20 7" />,
    star: <path d="m12 3 2.8 5.7 6.3.9-4.55 4.4 1.1 6.3L12 17.3l-5.65 3 1.1-6.3L2.9 9.6l6.3-.9L12 3Z" />,
    bag: <><path d="M5 8h14l-1 12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 8Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/></>,
    lock: <><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 1 1 8 0v3"/></>,
    play: <path d="M8 5v14l11-7L8 5Z" fill={color} />,
    trash: <><path d="M5 7h14"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="m7 7 1 13a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-13"/></>,
    download: <><path d="M12 4v11"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/></>,
    upload: <><path d="M12 20V9"/><path d="m7 13 5-5 5 5"/><path d="M5 4h14"/></>,
    deposit: <><path d="M12 14V5"/><path d="m8 9 4 5 4-5"/><rect x="4" y="15" width="16" height="5" rx="1.5"/></>,
    wallet: <><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><circle cx="16" cy="14.5" r="1.2" fill={color}/></>,
    refresh: <><path d="M20 11a8 8 0 1 0-3 6"/><path d="M20 5v6h-6"/></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
    eyeOff: <><path d="M3 3l18 18"/><path d="M10.7 6.2a10 10 0 0 1 1.3-.2c6.5 0 10 7 10 7a17 17 0 0 1-3.3 4M6.1 7.4A17 17 0 0 0 2 12s3.5 7 10 7c1.6 0 3-.3 4.3-.9"/></>,
    fire: <path d="M12 3s4 4 4 8a4 4 0 0 1-8 0c0-1.5.5-2.5 1-3 .5.8 1 1.5 1.5 1.5 0-2 1.5-4 1.5-6.5Zm-2 13a3 3 0 0 1 4 0"/>,
    bolt: <path d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z" fill={color} stroke="none"/>,
    soccer: <><circle cx="12" cy="12" r="9"/><path d="m12 6 4 2.8-1.5 4.7h-5L8 8.8 12 6Z"/><path d="m12 6V3M16 8.8l2.8-1M14.5 13.5l1.7 2.5M9.5 13.5 7.8 16M8 8.8 5.2 7.8"/></>,
    basket: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M5.5 5.5c4 3 9 3 13 0M5.5 18.5c4-3 9-3 13 0"/></>,
    tennis: <><circle cx="12" cy="12" r="9"/><path d="M3.5 8.5c4 1 7 4 8 8M20.5 15.5c-4-1-7-4-8-8"/></>,
    dice: <><rect x="3.5" y="3.5" width="17" height="17" rx="3"/><circle cx="8" cy="8" r="1.4" fill={color}/><circle cx="16" cy="16" r="1.4" fill={color}/><circle cx="12" cy="12" r="1.4" fill={color}/></>,
    cards: <><rect x="3" y="6" width="12" height="15" rx="1.6" /><path d="M8 6V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-1"/></>,
    flag: <><path d="M5 21V4"/><path d="M5 4h11l-2 3 2 3H5"/></>,
    trophy: <><path d="M8 4h8v4a4 4 0 0 1-8 0V4Z"/><path d="M16 5h3v2a3 3 0 0 1-3 3M8 5H5v2a3 3 0 0 0 3 3"/><path d="M10 14h4l-1 4h-2l-1-4ZM8 21h8"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></>,
    coin: <><circle cx="12" cy="12" r="9"/><path d="M14 9.5c-.6-.8-1.5-1.2-2.5-1.2-1.4 0-2.5.9-2.5 2s.9 1.5 2.5 1.8c1.6.3 2.5.7 2.5 2s-1.1 2-2.5 2c-1 0-2-.4-2.5-1.2M11.5 7v1M11.5 16v1"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

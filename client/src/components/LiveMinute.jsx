import { useEffect, useRef, useState } from 'react';
import { tickMinuteDisplay } from '../utils/liveClock.js';

/**
 * Renders a fixture's match clock (minutes:seconds) so it visibly ticks
 * forward between server/admin updates instead of sitting frozen until the
 * next patch. Re-anchors whenever the upstream minute string actually changes.
 */
export default function LiveMinute({ match, className }) {
  const anchorRef = useRef({ minute: match?.minute, ts: Date.now() });
  const [, tick] = useState(0);

  if (anchorRef.current.minute !== match?.minute) {
    anchorRef.current = { minute: match?.minute, ts: Date.now() };
  }

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!match?.minute) return null;
  const display = tickMinuteDisplay(match.minute, anchorRef.current.ts, match.id);
  return <span className={className}>{display}</span>;
}

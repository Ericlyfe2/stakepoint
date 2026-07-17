import { useEffect, useRef, useState } from 'react';
import { tickMinuteDisplay } from '../utils/liveClock.js';

function anchorFor(match, rawMinute) {
  // liveAt is the wall-clock instant the current `minute` value became true
  // (stamped server-side on go-live and on every minute change/step). Anchor
  // to it whenever present so every viewer — admin panel, a player's ticket —
  // simulates the elapsed clock from the same shared starting point instead
  // of "whenever this browser happened to render this minute string", which
  // made the same match show a different running time on different screens.
  // Fall back to now only for legacy fixtures with no liveAt at all.
  return { minute: rawMinute, ts: match?.liveAt ? new Date(match.liveAt).getTime() : Date.now() };
}

/**
 * Renders a fixture's match clock (minutes:seconds) so it visibly ticks
 * forward between server/admin updates instead of sitting frozen until the
 * next patch. Re-anchors whenever the upstream minute string actually changes.
 */
export default function LiveMinute({ match, className }) {
  const rawMinute = match?.minute || (match?.isLive ? "0'" : null);
  const anchorRef = useRef(anchorFor(match, rawMinute));
  const [, tick] = useState(0);

  if (anchorRef.current.minute !== rawMinute) {
    anchorRef.current = anchorFor(match, rawMinute);
  }

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!rawMinute) return null;
  const display = tickMinuteDisplay(rawMinute, anchorRef.current.ts, match.id);
  return <span className={className}>{display}</span>;
}

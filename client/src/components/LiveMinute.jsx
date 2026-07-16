import { useEffect, useRef, useState } from 'react';
import { tickMinuteDisplay } from '../utils/liveClock.js';

function anchorFor(match, rawMinute) {
  // A fixture just gone live with no real minute yet ticks from "0'". Anchor
  // it to the server's liveAt timestamp (shared by every viewer) rather than
  // "whenever this browser happened to load the page" so admin and user
  // screens agree — falling back to now for legacy fixtures with no liveAt.
  const useLiveAt = rawMinute === "0'" && match?.liveAt;
  return { minute: rawMinute, ts: useLiveAt ? new Date(match.liveAt).getTime() : Date.now() };
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

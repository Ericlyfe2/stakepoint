import { useEffect, useRef, useState } from 'react';
import { fetchRecentPayouts } from '../api/betApi.js';

/* ---------------------------------------------------------------------------
   useStitchPayouts
   ---------------------------------------------------------------------------
   Feeds the ports' "Verified Payouts" ticker from the real
   GET /bet/recent-payouts feed — the same source the production Home page
   uses. The server only ever returns settled, winning bets with masked
   identifiers, so nothing here is fabricated.

   When the feed is unreachable or empty, `payouts` stays `[]` and
   `unavailable` reports why: the ticker then shows an honest state instead of
   inventing winners. (Presenting made-up names as "verified payouts" would
   breach the platform's own integrity rule on the endpoint.)
   ------------------------------------------------------------------------- */

const REFRESH_MS = 45_000;

export default function useStitchPayouts(limit = 12) {
  const [payouts, setPayouts] = useState([]);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const load = async () => {
      try {
        const data = await fetchRecentPayouts(limit);
        if (!mountedRef.current) return;
        const list = Array.isArray(data?.payouts) ? data.payouts : [];
        setPayouts(list);
        setUnavailable(list.length === 0);
      } catch {
        if (!mountedRef.current) return;
        setPayouts([]);
        setUnavailable(true);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };

    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [limit]);

  return { payouts, unavailable, loading };
}

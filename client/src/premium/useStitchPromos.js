import { useEffect, useState } from 'react';
import { fetchPromotions } from '../api/betApi.js';

/* ---------------------------------------------------------------------------
   useStitchPromos
   ---------------------------------------------------------------------------
   Real, admin-managed promotions from GET /bet/promos. The endpoint returns
   only active DB promotions and an empty array otherwise — it never falls back
   to invented copy — so this hook never fabricates an offer either. When the
   feed is empty or unreachable the ports render an honest "no active offers"
   state rather than a made-up welcome bonus.
   ------------------------------------------------------------------------- */

export default function useStitchPromos() {
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await fetchPromotions();
        if (!alive) return;
        setPromos(Array.isArray(res?.promotions) ? res.promotions : []);
        setUnavailable(false);
      } catch {
        if (!alive) return;
        setPromos([]);
        setUnavailable(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, []);

  return { promos, loading, unavailable };
}

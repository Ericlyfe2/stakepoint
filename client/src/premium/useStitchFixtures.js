import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchMatches } from '../api/betApi.js';
import { onLive, subscribeSports, unsubscribeSports } from '../api/socketClient.js';
import { seedSnapshot } from './stitchSeed.js';

/* ---------------------------------------------------------------------------
   useStitchFixtures
   ---------------------------------------------------------------------------
   Feeds the four Stitch ports with real fixtures from /bet/matches, overlaid
   with socket ticks (odds:tick / score:update / match:status) exactly the way
   Home.jsx does it — so the ports show production data whenever the API is
   reachable.

   When the API is unreachable (design review, preview deploy, offline) it falls
   back to the designed seed set in stitchSeed.js so the screens still render
   their full layout instead of an error state. `usingSeed` reports which. The
   seed set is football-only — every port currently requests 'football'.
   ------------------------------------------------------------------------- */

export default function useStitchFixtures(sportId = 'football') {
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [usingSeed, setUsingSeed] = useState(false);
  const pollRef = useRef(null);

  /* ---- initial load + periodic odds refresh ---------------------------- */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const data = await fetchMatches(sportId);
        if (cancelled) return;
        setSnapshot(data);
        setUsingSeed(false);
      } catch (e) {
        if (cancelled) return;
        // Keep whatever we already had; only seed when we have nothing at all.
        setSnapshot((cur) => {
          if (cur && !usingSeed) return cur;
          return seedSnapshot();
        });
        setUsingSeed(true);
        setError(e?.message || 'Could not load fixtures.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    pollRef.current = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sportId]);

  /* ---- socket room lifecycle ------------------------------------------- */
  useEffect(() => {
    subscribeSports([sportId]);
    return () => unsubscribeSports([sportId]);
  }, [sportId]);

  /* ---- realtime overlays ------------------------------------------------ */
  useEffect(() => {
    const offOdds = onLive('odds:tick', (payload) => {
      if (!payload?.fixtureId || !payload?.market) return;
      setSnapshot((cur) => {
        if (!cur) return cur;
        let touched = false;
        const leagues = cur.leagues.map((lg) => ({
          ...lg,
          matches: lg.matches.map((m) => {
            if (m.id !== payload.fixtureId) return m;
            const prev = m.markets?.[payload.market];
            if (!prev) return m;
            const selections = Array.isArray(payload.selections)
              ? payload.selections.map((s) => ({
                  key: s.key,
                  label: s.label,
                  odds: typeof s.odds === 'number'
                    ? s.odds
                    : prev.selections?.find((x) => x.key === s.key)?.odds,
                  suspended: !!s.suspended,
                }))
              : prev.selections;
            touched = true;
            return {
              ...m,
              markets: { ...m.markets, [payload.market]: { ...prev, selections } },
            };
          }),
        }));
        return touched ? { ...cur, leagues } : cur;
      });
    });

    const offScore = onLive('score:update', (payload) => {
      if (!payload?.fixtureId) return;
      setSnapshot((cur) => {
        if (!cur) return cur;
        let touched = false;
        const leagues = cur.leagues.map((lg) => ({
          ...lg,
          matches: lg.matches.map((m) => {
            if (m.id !== payload.fixtureId) return m;
            touched = true;
            return {
              ...m,
              scoreHome: payload.scoreHome ?? m.scoreHome,
              scoreAway: payload.scoreAway ?? m.scoreAway,
              minute: payload.minute ?? m.minute,
              period: payload.period ?? m.period,
            };
          }),
        }));
        return touched ? { ...cur, leagues } : cur;
      });
    });

    const offEvent = onLive('match:event', (payload) => {
      if (!payload?.fixtureId || !payload?.kind) return;
      setSnapshot((cur) => {
        if (!cur) return cur;
        let touched = false;
        const leagues = cur.leagues.map((lg) => ({
          ...lg,
          matches: lg.matches.map((m) => {
            if (m.id !== payload.fixtureId) return m;
            touched = true;
            const feed = [
              { minute: m.minute, kind: payload.kind, team: payload.team, ts: Date.now() },
              ...(m.events || []),
            ].slice(0, 12);
            return {
              ...m,
              events: feed,
              scoreHome: payload.scoreHome ?? m.scoreHome,
              scoreAway: payload.scoreAway ?? m.scoreAway,
            };
          }),
        }));
        return touched ? { ...cur, leagues } : cur;
      });
    });

    const offStatus = onLive('match:status', (payload) => {
      if (!payload?.fixtureId) return;
      setSnapshot((cur) => {
        if (!cur) return cur;
        let touched = false;
        const leagues = cur.leagues.map((lg) => ({
          ...lg,
          matches: lg.matches.map((m) => {
            if (m.id !== payload.fixtureId) return m;
            touched = true;
            // Statuses emitted by the feed: live | ht | 2h | finished.
            // Mirrors Home.jsx so a finished match leaves the Live Now list
            // instead of sitting there with a running clock.
            return {
              ...m,
              matchStatus: payload.status,
              isLive: ['live', 'ht', '2h'].includes(payload.status),
              finished: payload.status === 'finished',
              scoreHome: payload.scoreHome ?? m.scoreHome,
              scoreAway: payload.scoreAway ?? m.scoreAway,
              minute: payload.minute ?? m.minute,
              kickoff: payload.kickoff ?? m.kickoff,
              day: payload.day ?? m.day,
            };
          }),
        }));
        return touched ? { ...cur, leagues } : cur;
      });
    });

    return () => {
      [offOdds, offScore, offEvent, offStatus].forEach((off) => {
        try { off?.(); } catch { /* ignore */ }
      });
    };
  }, [sportId]);

  /* ---- derived views --------------------------------------------------- */
  const leagues = snapshot?.leagues || [];
  const allMatches = useMemo(() => leagues.flatMap((lg) => lg.matches), [leagues]);
  const liveMatches = useMemo(
    () => allMatches.filter((m) => m.isLive && !m.suspended),
    [allMatches],
  );
  const upcomingMatches = useMemo(
    () => allMatches.filter((m) => !m.isLive && !m.suspended),
    [allMatches],
  );
  const liveCount = liveMatches.length;

  /* ---- live clock (drives the fast-market countdown + match minute) ---- */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const refetch = useCallback(async () => {
    try {
      const data = await fetchMatches(sportId);
      setSnapshot(data);
      setUsingSeed(false);
      setError(null);
    } catch (e) {
      setSnapshot((cur) => cur || seedSnapshot());
      setUsingSeed(true);
      setError(e?.message || 'Could not load fixtures.');
    }
  }, [sportId]);

  return {
    snapshot,
    leagues,
    allMatches,
    liveMatches,
    upcomingMatches,
    liveCount,
    loading,
    error,
    usingSeed,
    now,
    refetch,
  };
}

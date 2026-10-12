import { useEffect, useState } from 'react';

/* ---------------------------------------------------------------------------
   Minimal matchMedia hook. Returns false when matchMedia is unavailable
   (jsdom / SSR) so tests keep rendering the desktop branch deterministically.
   ------------------------------------------------------------------------- */

export default function useMediaQuery(query) {
  const supported =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function';

  const [matches, setMatches] = useState(() =>
    supported ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    if (!supported) return undefined;

    const mql = window.matchMedia(query);
    const onChange = (event) => setMatches(event.matches);

    setMatches(mql.matches);
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else mql.addListener(onChange);

    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange);
      else mql.removeListener(onChange);
    };
  }, [query, supported]);

  return matches;
}

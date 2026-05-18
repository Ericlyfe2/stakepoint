import { useCallback, useEffect, useState } from 'react';

// localStorage-backed favourite leagues. We keep this purely on the client
// so it works without an extra round trip and survives sign-out — the
// user's saved leagues are about UI personalisation, not account state.
const STORAGE_KEY = 'bv_fav_leagues';

function read() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch { return []; }
}

function write(list) {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {/* ignore */}
}

export function useFavouriteLeagues() {
  const [list, setList] = useState(() => read());

  // Sync across tabs.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== STORAGE_KEY) return;
      setList(read());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const isFavourite = useCallback((id) => list.includes(id), [list]);

  const toggle = useCallback((id) => {
    if (!id) return;
    setList((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      write(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setList([]);
    write([]);
  }, []);

  return { favourites: list, isFavourite, toggle, clear };
}

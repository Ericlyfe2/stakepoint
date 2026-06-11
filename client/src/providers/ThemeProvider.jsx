import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const ThemeCtx = createContext(null);
const STORAGE_KEY = 'xenbet_theme';

function readInitial() {
  if (typeof window === 'undefined') return 'dark';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {}
  if (typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

export function ThemeProvider({ children }) {
  const [theme, setThemeRaw] = useState(readInitial);

  // Reflect onto <html> so CSS can target light vs dark consistently.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const setTheme = useCallback((t) => {
    const next = t === 'light' ? 'light' : 'dark';
    setThemeRaw(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeRaw((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(STORAGE_KEY, next); } catch {}
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) return { theme: 'dark', setTheme: () => {}, toggleTheme: () => {} };
  return ctx;
}

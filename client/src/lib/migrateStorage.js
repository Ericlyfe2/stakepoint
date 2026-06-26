/**
 * One-time localStorage key migration from the former brands (Oddsify / XenBet)
 * to BetXentra.
 *
 * Copies any persisted `oddsify_*` or `xenbet_*` value to the matching
 * `betxentra_*` key, then deletes the old keys.
 * Idempotent: once the old keys are gone, the function is a fast
 * no-op on every subsequent load.
 *
 * Invoked once from main.jsx before React mounts, so providers that read
 * storage during their initializers see the migrated values.
 */
export function migrateLegacyStorage() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const legacy = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('oddsify_') || key.startsWith('xenbet_'))) legacy.push(key);
    }
    for (const key of legacy) {
      const newKey = key.replace(/^(oddsify_|xenbet_)/, 'betxentra_');
      if (localStorage.getItem(newKey) === null) {
        const value = localStorage.getItem(key);
        if (value !== null) localStorage.setItem(newKey, value);
      }
      localStorage.removeItem(key);
    }
  } catch {
    // Storage may be disabled (private mode, quota). Best-effort only.
  }
}

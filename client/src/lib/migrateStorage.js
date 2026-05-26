/**
 * One-time localStorage key migration for the xenbet → Oddsify rebrand.
 *
 * Copies any persisted `xenbet_*` value to the matching `oddsify_*` key,
 * then deletes the original. Idempotent: once the legacy keys are gone,
 * the function is a fast no-op on every subsequent load.
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
      if (key && key.startsWith('xenbet_')) legacy.push(key);
    }
    for (const key of legacy) {
      const newKey = key.replace(/^xenbet_/, 'oddsify_');
      // Don't clobber a value the user has already set under the new key.
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

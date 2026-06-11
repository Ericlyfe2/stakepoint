/**
 * One-time localStorage key migration back to the Xenbet brand.
 *
 * The 2026-05-26 rebrand moved `xenbet_*` keys to `oddsify_*`; that rebrand
 * has been rolled back, so this shim copies any persisted `oddsify_*`
 * value to the matching `xenbet_*` key, then deletes the original.
 * Idempotent: once the `oddsify_*` keys are gone, the function is a fast
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
      if (key && key.startsWith('oddsify_')) legacy.push(key);
    }
    for (const key of legacy) {
      const newKey = key.replace(/^oddsify_/, 'xenbet_');
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

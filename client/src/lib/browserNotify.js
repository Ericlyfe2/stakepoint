/**
 * Thin wrapper around the Web Notifications API.
 *
 * Why a wrapper:
 *  - `Notification` is missing on insecure origins, SSR, and old browsers — we
 *    need to no-op without throwing.
 *  - `requestPermission()` may be called many times across the app. We cache
 *    the in-flight promise so concurrent callers share one prompt.
 *  - The browser is the only thing that can actually show notifications when
 *    the tab is hidden — exactly the case the user cares about for deposit
 *    decisions while they're using another app.
 */

const hasApi = typeof window !== 'undefined' && 'Notification' in window;

let pendingRequest = null;

export function notificationsSupported() {
  return hasApi;
}

export function notificationsPermission() {
  if (!hasApi) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

/**
 * Ask the user for permission. Safe to call repeatedly — once granted/denied
 * we never re-prompt. Browsers require a user gesture on the call stack for
 * the prompt to appear, so call this from a click/submit handler when you can.
 *
 * Returns the resulting permission string, or 'unsupported' on platforms
 * without the API.
 */
export async function requestNotificationPermission() {
  if (!hasApi) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  if (pendingRequest) return pendingRequest;
  try {
    pendingRequest = Promise.resolve(Notification.requestPermission());
    const result = await pendingRequest;
    return result;
  } catch {
    return Notification.permission;
  } finally {
    pendingRequest = null;
  }
}

/**
 * Fire a browser notification. No-ops silently when:
 *  - the API is missing,
 *  - permission isn't granted,
 *  - the tab is the current foreground tab and `onlyWhenHidden` is true
 *    (we still show toasts in-app, so the OS push would be redundant).
 *
 * `tag` lets the browser collapse repeats of the same event (e.g. a deposit
 * approved twice from two open tabs shows as one notification).
 */
export function notify({ title, body, tag, icon, onlyWhenHidden = false } = {}) {
  if (!hasApi || !title) return null;
  if (Notification.permission !== 'granted') return null;
  if (onlyWhenHidden && typeof document !== 'undefined' && document.visibilityState === 'visible') {
    return null;
  }
  try {
    const n = new Notification(title, {
      body: body || '',
      tag: tag || undefined,
      icon: icon || '/favicon.ico',
      // Don't keep the notification on screen forever; let the OS reclaim it.
      requireInteraction: false,
    });
    // Bring the tab to the front when the user clicks the notification.
    n.onclick = () => {
      try { window.focus(); } catch { /* ignore */ }
      n.close();
    };
    return n;
  } catch {
    return null;
  }
}

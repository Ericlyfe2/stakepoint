import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from './providers/ThemeProvider.jsx';
import App from './App.jsx';

// /maintance is a top-level escape hatch, deliberately registered outside
// MaintenanceGate (same as /admin/*, see App.jsx) so it works even while the
// site-wide maintenance flag is on. It should always land an admin on
// /admin/settings — the page with the maintenance toggle — regardless of
// the maintenance flag's current value, since the whole point is to be able
// to turn it back off. That also depends on MaintenanceGate letting
// /login?next=/admin/... through even while blocked (see its own test file
// for that piece in isolation) — here we exercise it end to end through the
// real App, plus confirm ordinary player login stays gated.

const respond = (body) => ({ ok: true, json: async () => body });

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

function renderAppAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </MemoryRouter>
  );
}

function stubFetch(maintenance) {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (String(url).includes('/settings/public')) return respond({ maintenance });
    return { ok: false, status: 404, json: async () => ({}) };
  }));
}

describe('/maintance escape hatch', () => {
  it('redirects an unauthenticated visitor toward /admin/settings, landing on the real login form', async () => {
    // No admin token in localStorage -> AdminGuard bounces to /login?next=...
    // without ever calling the network for the admin session check.
    stubFetch(false);
    renderAppAt('/maintance');
    await waitFor(() => expect(screen.queryByText('Forgot password?')).not.toBeNull());
  });

  it('still reaches login (not a blank page) while maintenance is flagged on', async () => {
    stubFetch(true);
    renderAppAt('/maintance');
    // AdminGuard -> /login?next=/admin/settings -> MaintenanceGate's
    // admin-login exemption lets it through instead of blanking it.
    await waitFor(() => expect(screen.queryByText('Forgot password?')).not.toBeNull());
  });

  it('does NOT reopen the site for ordinary players during maintenance', async () => {
    // A plain /login (no ?next=/admin...) must stay behind the gate — the
    // exemption is scoped to the admin escape path only.
    stubFetch(true);
    renderAppAt('/login');
    await waitFor(() => {
      expect(document.body.textContent).toBe('');
    });
    expect(screen.queryByText('Forgot password?')).toBeNull();
  });

  it('still blocks the homepage during maintenance (sanity check the gate itself is untouched)', async () => {
    stubFetch(true);
    renderAppAt('/');
    await waitFor(() => {
      expect(document.body.textContent).toBe('');
    });
  });
});

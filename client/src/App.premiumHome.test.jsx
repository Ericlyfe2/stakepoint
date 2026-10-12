import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from './providers/ThemeProvider.jsx';
import App from './App.jsx';

/* ---------------------------------------------------------------------------
   The premium (Stitch) design system is the primary player experience:
   "/" is the sportsbook and "/live" is the in-play tracker. These tests pin
   that wiring so a future route reshuffle can't silently drop it back to the
   legacy Home page while every unit test stays green.

   matchMedia is absent under jsdom, so StitchHome deterministically renders
   the desktop port (the compact branch is exercised by the mobile port's own
   suite). The live API is stubbed out, so the ports must fall back to their
   designed preview fixtures — exactly what a reviewer sees offline.
   ------------------------------------------------------------------------- */

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

function stubFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (String(url).includes('/settings/public')) {
      return { ok: true, json: async () => ({ maintenance: false }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  }));
}

describe('premium design is the primary site', () => {
  it('serves the premium sportsbook at /', async () => {
    stubFetch();
    const { container } = renderAppAt('/');

    await waitFor(() => expect(container.querySelector('.stx-desk')).toBeTruthy());
    expect(container.querySelector('.stx-rail')).toBeTruthy();
    expect(container.querySelector('.stx-slip')).toBeTruthy();
    // Seed preview fixtures prove the real data pipeline (and its fallback) ran.
    await screen.findByText('Ghana Premier League');
    // The legacy shell is gone from "/".
    expect(container.querySelector('.app-header')).toBeNull();
  });

  it('serves the premium live tracker at /live', async () => {
    stubFetch();
    const { container } = renderAppAt('/live');

    // No live fixtures come back from the stubbed API, so the port shows its
    // honest empty state with a route back to the sportsbook.
    await screen.findByText('No live fixtures');
    expect(screen.getByRole('link', { name: /Back to Sportsbook/ })).toBeTruthy();
    expect(container.querySelector('.stx')).toBeTruthy();
    expect(container.querySelector('.app-header')).toBeNull();
  });

  it('keeps the legacy sportsbook reachable at /classic', async () => {
    stubFetch();
    const { container } = renderAppAt('/classic');

    await waitFor(() => expect(container.querySelector('.app-header')).toBeTruthy());
    expect(container.querySelector('.stx-desk')).toBeNull();
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MaintenanceGate from './MaintenanceGate.jsx';

const App = () => <div>THE APP</div>;

const respond = (body) => ({ ok: true, json: async () => body });

afterEach(() => { vi.restoreAllMocks(); });

function renderAt(path, ui) {
  return render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);
}

describe('MaintenanceGate', () => {
  it('renders nothing until the check resolves (no flash of the app)', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));  // never settles
    const { container } = renderAt('/', <MaintenanceGate><App /></MaintenanceGate>);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('THE APP')).toBeNull();
  });

  it('renders a blank page when maintenance is on', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond({ maintenance: true })));
    const { container } = renderAt('/', <MaintenanceGate><App /></MaintenanceGate>);
    await waitFor(() => expect(container.firstChild).not.toBeNull());
    expect(screen.queryByText('THE APP')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('renders the app when maintenance is off', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond({ maintenance: false })));
    renderAt('/', <MaintenanceGate><App /></MaintenanceGate>);
    expect(await screen.findByText('THE APP')).toBeInTheDocument();
  });

  it('fails open when the request rejects', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    renderAt('/', <MaintenanceGate><App /></MaintenanceGate>);
    expect(await screen.findByText('THE APP')).toBeInTheDocument();
  });

  it('fails open on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    renderAt('/', <MaintenanceGate><App /></MaintenanceGate>);
    expect(await screen.findByText('THE APP')).toBeInTheDocument();
  });

  it('fails open on malformed JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => { throw new Error('bad json'); } })));
    renderAt('/', <MaintenanceGate><App /></MaintenanceGate>);
    expect(await screen.findByText('THE APP')).toBeInTheDocument();
  });

  describe('admin-login escape hatch', () => {
    it('lets /login?next=/admin/... through even while maintenance is on', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => respond({ maintenance: true })));
      renderAt('/login?next=/admin/settings', <MaintenanceGate><App /></MaintenanceGate>);
      // Renders synchronously, before the (still-pending) network check even
      // has a chance to resolve — the exemption doesn't wait on it.
      expect(screen.getByText('THE APP')).toBeInTheDocument();
    });

    it('does not exempt a next param that is not actually /admin/...', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => respond({ maintenance: true })));
      const { container } = renderAt('/login?next=/wallet', <MaintenanceGate><App /></MaintenanceGate>);
      await waitFor(() => expect(container.textContent).toBe(''));
      expect(screen.queryByText('THE APP')).toBeNull();
    });

    it('does not exempt /login with no next param at all', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => respond({ maintenance: true })));
      const { container } = renderAt('/login', <MaintenanceGate><App /></MaintenanceGate>);
      await waitFor(() => expect(container.textContent).toBe(''));
      expect(screen.queryByText('THE APP')).toBeNull();
    });

    it('does not exempt other pages even if they happen to mention /admin in the query string', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => respond({ maintenance: true })));
      const { container } = renderAt('/wallet?next=/admin', <MaintenanceGate><App /></MaintenanceGate>);
      await waitFor(() => expect(container.textContent).toBe(''));
      expect(screen.queryByText('THE APP')).toBeNull();
    });
  });
});

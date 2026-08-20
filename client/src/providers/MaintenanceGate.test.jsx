import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import MaintenanceGate from './MaintenanceGate.jsx';

const App = () => <div>THE APP</div>;

const respond = (body) => ({ ok: true, json: async () => body });

afterEach(() => { vi.restoreAllMocks(); });

describe('MaintenanceGate', () => {
  it('renders nothing until the check resolves (no flash of the app)', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));  // never settles
    const { container } = render(<MaintenanceGate><App /></MaintenanceGate>);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('THE APP')).toBeNull();
  });

  it('renders a blank page when maintenance is on', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond({ maintenance: true })));
    const { container } = render(<MaintenanceGate><App /></MaintenanceGate>);
    await waitFor(() => expect(container.firstChild).not.toBeNull());
    expect(screen.queryByText('THE APP')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('renders the app when maintenance is off', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond({ maintenance: false })));
    render(<MaintenanceGate><App /></MaintenanceGate>);
    expect(await screen.findByText('THE APP')).toBeInTheDocument();
  });

  it('fails open when the request rejects', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    render(<MaintenanceGate><App /></MaintenanceGate>);
    expect(await screen.findByText('THE APP')).toBeInTheDocument();
  });

  it('fails open on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    render(<MaintenanceGate><App /></MaintenanceGate>);
    expect(await screen.findByText('THE APP')).toBeInTheDocument();
  });

  it('fails open on malformed JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => { throw new Error('bad json'); } })));
    render(<MaintenanceGate><App /></MaintenanceGate>);
    expect(await screen.findByText('THE APP')).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { fetchPublicSettings, setLoginLock } = vi.hoisted(() => ({
  fetchPublicSettings: vi.fn(),
  setLoginLock: vi.fn(),
}));

vi.mock('../api/betApi.js', () => ({
  fetchPublicSettings,
  setLoginLock,
  fetchAuthConfig: vi.fn(async () => ({ googleEnabled: false, googleClientId: null })),
  login: vi.fn(),
  register: vi.fn(),
  googleSignIn: vi.fn(),
}));

vi.mock('../providers/AccountProvider.jsx', () => ({
  useAccount: () => ({ account: null, signIn: vi.fn(), signOut: vi.fn() }),
  useToast: () => ({ toast: vi.fn() }),
}));

import LoginPage from './LoginPage.jsx';

const renderPage = () => render(
  <MemoryRouter>
    <LoginPage />
  </MemoryRouter>
);

beforeEach(() => {
  fetchPublicSettings.mockReset();
  setLoginLock.mockReset();
});

afterEach(cleanup);

describe('LoginPage "No login" kill switch', () => {
  it('shows the animated server-down panel instead of the form when the flag is on', async () => {
    fetchPublicSettings.mockResolvedValue({ loginDisabled: true });
    renderPage();

    expect(await screen.findByText('Server is down')).toBeInTheDocument();
    expect(screen.queryByText('Forgot password?')).toBeNull();
    // The textless switch stays available so an operator can turn logins back on.
    expect(screen.getByRole('button', { name: /turn logins back on/i })).toBeInTheDocument();
  });

  it('flips the shared flag from the login page and swaps in the down panel', async () => {
    fetchPublicSettings.mockResolvedValue({ loginDisabled: false });
    setLoginLock.mockResolvedValue({ ok: true, loginDisabled: true });
    renderPage();

    const toggle = await screen.findByRole('button', { name: /pause all logins/i });
    expect(screen.getByText('Forgot password?')).toBeInTheDocument();

    fireEvent.click(toggle);

    await waitFor(() => expect(setLoginLock).toHaveBeenCalledWith(true));
    expect(await screen.findByText('Server is down')).toBeInTheDocument();
  });
});

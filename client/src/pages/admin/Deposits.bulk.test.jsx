/**
 * Bulk deposit actions on Admin -> Deposits.
 *
 * The page must expose "Approve all" and "Reject all" next to the pending
 * queue, confirm before doing anything destructive, call the bulk endpoints
 * exactly once, and stay disabled when the queue is empty.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  pending: [],
  approveAll: vi.fn(),
  rejectAll: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
}));

vi.mock('../../api/adminApi.js', () => ({
  adminListPendingDeposits: vi.fn(() => Promise.resolve({ pending: h.pending })),
  adminListDepositHistory: vi.fn(() => Promise.resolve({ deposits: [] })),
  adminApproveDeposit: (...a) => h.approve(...a),
  adminRejectDeposit: (...a) => h.reject(...a),
  adminApproveAllDeposits: (...a) => h.approveAll(...a),
  adminRejectAllDeposits: (...a) => h.rejectAll(...a),
}));

vi.mock('../../api/adminSocket.js', () => ({ onAdmin: () => () => {} }));
vi.mock('../../lib/browserNotify.js', () => ({
  requestNotificationPermission: () => Promise.resolve(),
  notify: () => {},
}));

import DepositsPage from './Deposits.jsx';

function makeDeposit(id, amount) {
  return {
    id,
    amount,
    method: 'momo',
    at: new Date().toISOString(),
    status: 'pending',
    user: { id: `u-${id}`, email: `${id}@example.com`, displayName: id },
  };
}

function mount() {
  return render(<DepositsPage />);
}

beforeEach(() => {
  h.pending = [makeDeposit('tx-1', 400), makeDeposit('tx-2', 300)];
  h.approveAll.mockReset().mockResolvedValue({ ok: true, approvedCount: 2, failedCount: 0 });
  h.rejectAll.mockReset().mockResolvedValue({ ok: true, rejectedCount: 2, failedCount: 0 });
  h.approve.mockReset().mockResolvedValue({ ok: true });
  h.reject.mockReset().mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Deposits page bulk actions', () => {
  it('shows both bulk buttons with the pending count', async () => {
    mount();
    expect(await screen.findByRole('button', { name: /approve all \(2\)/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /reject all \(2\)/i })).toBeEnabled();
  });

  it('approves everything after confirmation', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mount();

    fireEvent.click(await screen.findByRole('button', { name: /approve all \(2\)/i }));

    await waitFor(() => expect(h.approveAll).toHaveBeenCalledTimes(1));
    expect(h.rejectAll).not.toHaveBeenCalled();
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/approved 2 deposits/i)).toBeInTheDocument();
  });

  it('rejects everything after confirmation and sends a reason', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mount();

    fireEvent.click(await screen.findByRole('button', { name: /reject all \(2\)/i }));

    await waitFor(() => expect(h.rejectAll).toHaveBeenCalledTimes(1));
    expect(h.rejectAll.mock.calls[0][0]).toMatchObject({ reason: expect.any(String) });
    expect(h.approveAll).not.toHaveBeenCalled();
    expect(await screen.findByText(/rejected 2 deposits/i)).toBeInTheDocument();
  });

  it('does nothing when the confirmation is dismissed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    mount();

    fireEvent.click(await screen.findByRole('button', { name: /approve all \(2\)/i }));
    fireEvent.click(screen.getByRole('button', { name: /reject all \(2\)/i }));

    expect(h.approveAll).not.toHaveBeenCalled();
    expect(h.rejectAll).not.toHaveBeenCalled();
  });

  it('disables both buttons when nothing is pending', async () => {
    h.pending = [];
    mount();

    expect(await screen.findByRole('button', { name: /^approve all$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^reject all$/i })).toBeDisabled();
  });
});

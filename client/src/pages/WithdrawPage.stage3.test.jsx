/**
 * Stage 3 withdrawal popups.
 *
 * Withdrawal is restricted below Stage 4 — the condition popups always show
 * and block submission (the Confirm to Withdraw step exists only at Stage 4 /
 * VIP). Stage 2/3 present the "Additional deposit required" popup; the
 * account-blocked popup only appears once the 10% is met.
 *
 * Stage 3 auto-locks the account and has TWO ordered conditions:
 *   1. approved deposits >= 10% of the withdrawal -> "Additional deposit required"
 *   2. only once that is met -> "account blocked" (until an admin unblocks)
 * Once both are cleared, the account still cannot withdraw below Stage 4 —
 * the "Additional deposit required" popup keeps blocking. Other stages keep
 * "account blocked comes first". Min withdrawal GHS 40,000.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  account: null,
  openDeposit: vi.fn(),
  setAccount: vi.fn(),
  withdraw: vi.fn(),
}));

vi.mock('../providers/AccountProvider.jsx', () => ({
  useAccount: () => ({ account: h.account, openDeposit: h.openDeposit, setAccount: h.setAccount }),
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock('../api/betApi.js', () => ({
  fetchTransactions: vi.fn().mockResolvedValue({ transactions: [] }),
  withdraw: (...args) => h.withdraw(...args),
}));

import WithdrawPage from './WithdrawPage.jsx';

function makeAccount(overrides = {}) {
  return {
    id: 'u-stage3',
    email: 'stage3@example.com',
    phone: '0241234567',
    balance: 100000,
    stage: 3,
    blocked: true,
    totalDeposited: 1200,
    ...overrides,
  };
}

function mount() {
  return render(
    <MemoryRouter initialEntries={['/withdraw']}>
      <WithdrawPage />
    </MemoryRouter>,
  );
}

function submitAmount(value) {
  fireEvent.change(screen.getByLabelText(/amount \(ghs\)/i), { target: { value: String(value) } });
  fireEvent.click(screen.getByRole('button', { name: /withdraw now/i }));
}

const extraPopup = () => screen.queryByRole('dialog', { name: /additional deposit required/i });
const blockedPopup = () => screen.queryByRole('dialog', { name: /account blocked/i });
const confirmPopup = () => screen.queryByRole('dialog', { name: /confirm to withdraw/i });

beforeEach(() => {
  h.account = makeAccount();
  h.openDeposit.mockClear();
  h.setAccount.mockClear();
  h.withdraw.mockReset();
  window.localStorage.clear();
});

describe('Stage 3, blocked — condition 1: the 10% deposit popup comes first', () => {
  it('shows "Additional deposit required" (not "account blocked") while the 10% is unmet', () => {
    h.account = makeAccount({ totalDeposited: 1200 });
    mount();
    submitAmount(40000);

    const dlg = extraPopup();
    expect(dlg).toBeInTheDocument();
    expect(blockedPopup()).not.toBeInTheDocument();
    // 10% of 40,000 = 4,000; 1,200 available; 2,800 still needed
    expect(within(dlg).getByText(/GHS 40,000\.00/)).toBeInTheDocument();
    expect(within(dlg).getByText(/Required extra approved deposit/i).parentElement).toHaveTextContent('4,000.00');
    expect(within(dlg).getByText(/Available approved deposit credit/i).parentElement).toHaveTextContent('1,200.00');
    expect(within(dlg).getByText(/Still needed/i).parentElement).toHaveTextContent('2,800.00');
    expect(h.withdraw).not.toHaveBeenCalled();
  });

  it('GHS 1 short of 10% still shows the deposit popup', () => {
    h.account = makeAccount({ totalDeposited: 3999 });
    mount();
    submitAmount(40000); // 10% = 4,000 > 3,999
    expect(extraPopup()).toBeInTheDocument();
    expect(blockedPopup()).not.toBeInTheDocument();
    expect(within(extraPopup()).getByText(/Still needed/i).parentElement).toHaveTextContent('1.00');
  });

  it('one pesewa short of 10% still shows the deposit popup (cents are accepted)', () => {
    h.account = makeAccount({ totalDeposited: 4000 });
    mount();
    submitAmount('40000.1'); // 10% = 4,000.01 > 4,000.00
    expect(extraPopup()).toBeInTheDocument();
    expect(blockedPopup()).not.toBeInTheDocument();
    expect(within(extraPopup()).getByText(/Still needed/i).parentElement).toHaveTextContent('0.01');
  });

  it('exactly 10% with cents (40,000.00 vs 4,000.00) moves on to the blocked popup', () => {
    h.account = makeAccount({ totalDeposited: 4000.01 });
    mount();
    submitAmount('40000.1'); // 10% = 4,000.01 == deposited -> met
    expect(blockedPopup()).toBeInTheDocument();
    expect(extraPopup()).not.toBeInTheDocument();
  });

  it('"Go to Deposit" closes the popup and opens the deposit flow', () => {
    mount();
    submitAmount(40000);
    fireEvent.click(within(extraPopup()).getByRole('button', { name: /go to deposit/i }));
    expect(h.openDeposit).toHaveBeenCalledTimes(1);
    expect(extraPopup()).not.toBeInTheDocument();
    expect(blockedPopup()).not.toBeInTheDocument();
  });

  it('"Later" dismisses the popup without opening anything else', () => {
    mount();
    submitAmount(40000);
    fireEvent.click(within(extraPopup()).getByRole('button', { name: /later/i }));
    expect(extraPopup()).not.toBeInTheDocument();
    expect(blockedPopup()).not.toBeInTheDocument();
    expect(h.openDeposit).not.toHaveBeenCalled();
  });
});

describe('Stage 3, blocked — condition 2: the blocked popup once the 10% is met', () => {
  it('shows "account blocked" (not the deposit popup) when approved deposits cover exactly 10%', () => {
    h.account = makeAccount({ totalDeposited: 4000 });
    mount();
    submitAmount(40000);

    expect(blockedPopup()).toBeInTheDocument();
    expect(extraPopup()).not.toBeInTheDocument();
    expect(confirmPopup()).not.toBeInTheDocument();
    expect(h.withdraw).not.toHaveBeenCalled();
  });

  it('shows "account blocked" when deposits comfortably exceed 10%', () => {
    h.account = makeAccount({ totalDeposited: 90000 });
    mount();
    submitAmount(40000);
    expect(blockedPopup()).toBeInTheDocument();
    expect(extraPopup()).not.toBeInTheDocument();
  });

  it('the blocked popup offers deposit + support + close', () => {
    h.account = makeAccount({ totalDeposited: 4000 });
    mount();
    submitAmount(40000);
    const dlg = blockedPopup();
    expect(within(dlg).getByRole('button', { name: /go to deposit/i })).toBeInTheDocument();
    expect(within(dlg).getByRole('button', { name: /contact support/i })).toBeInTheDocument();
    fireEvent.click(within(dlg).getByRole('button', { name: /^close$/i }));
    expect(blockedPopup()).not.toBeInTheDocument();
  });

  it('walks the whole journey: deposit popup -> deposit approved -> blocked popup -> unblocked -> deposit popup again (still blocked until Stage 4)', () => {
    h.account = makeAccount({ totalDeposited: 1200 });
    const view = mount();

    // 1) 10% not met -> the deposit popup
    submitAmount(40000);
    expect(extraPopup()).toBeInTheDocument();
    expect(blockedPopup()).not.toBeInTheDocument();
    fireEvent.click(within(extraPopup()).getByRole('button', { name: /later/i }));

    // 2) An admin approves the user's deposit — the account updates live
    h.account = makeAccount({ totalDeposited: 4000 });
    view.rerender(<MemoryRouter initialEntries={['/withdraw']}><WithdrawPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /withdraw now/i }));
    expect(blockedPopup()).toBeInTheDocument();
    expect(extraPopup()).not.toBeInTheDocument();
    fireEvent.click(within(blockedPopup()).getByRole('button', { name: /^close$/i }));

    // 3) An admin unblocks the account (account:stage-changed pushes blocked:false).
    //    All conditions are now met, but below Stage 4 the "Additional deposit
    //    required" popup still BLOCKS — the confirm step never appears.
    h.account = makeAccount({ totalDeposited: 4000, blocked: false });
    view.rerender(<MemoryRouter initialEntries={['/withdraw']}><WithdrawPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /withdraw now/i }));
    expect(blockedPopup()).not.toBeInTheDocument();
    expect(extraPopup()).toBeInTheDocument();
    expect(confirmPopup()).not.toBeInTheDocument();
    expect(h.withdraw).not.toHaveBeenCalled();
  });
});

describe('Stage 3, unblocked', () => {
  it('still enforces the 10% condition', () => {
    h.account = makeAccount({ blocked: false, totalDeposited: 1200 });
    mount();
    submitAmount(40000);
    expect(extraPopup()).toBeInTheDocument();
    expect(blockedPopup()).not.toBeInTheDocument();
    expect(confirmPopup()).not.toBeInTheDocument();
  });

  it('shows the "Additional deposit required" popup even when the 10% is met (no confirm below Stage 4)', () => {
    h.account = makeAccount({ blocked: false, totalDeposited: 4000 });
    mount();
    submitAmount(40000);
    expect(extraPopup()).toBeInTheDocument();
    expect(blockedPopup()).not.toBeInTheDocument();
    expect(confirmPopup()).not.toBeInTheDocument();
    expect(h.withdraw).not.toHaveBeenCalled();
  });
});

describe('Stage 3 amount limits', () => {
  it('disables submit below the GHS 40,000 minimum and shows no popup', () => {
    mount();
    fireEvent.change(screen.getByLabelText(/amount \(ghs\)/i), { target: { value: '39999' } });
    const btn = screen.getByRole('button', { name: /withdraw now/i });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(extraPopup()).not.toBeInTheDocument();
    expect(blockedPopup()).not.toBeInTheDocument();
  });

  it('disables submit above the GHS 95,000 ceiling', () => {
    h.account = makeAccount({ balance: 500000 });
    mount();
    fireEvent.change(screen.getByLabelText(/amount \(ghs\)/i), { target: { value: '95001' } });
    expect(screen.getByRole('button', { name: /withdraw now/i })).toBeDisabled();
  });

  it('rejects more than 2 decimal places (finer than a pesewa)', () => {
    mount();
    fireEvent.change(screen.getByLabelText(/amount \(ghs\)/i), { target: { value: '40000.123' } });
    expect(screen.getByRole('button', { name: /withdraw now/i })).toBeDisabled();
  });

  it('accepts pesewas: 40,000.55 enables submit', () => {
    mount();
    fireEvent.change(screen.getByLabelText(/amount \(ghs\)/i), { target: { value: '40000.55' } });
    expect(screen.getByRole('button', { name: /withdraw now/i })).not.toBeDisabled();
  });

  it('the +10 chip keeps the amount exact to the pesewa (no 40010.099999…)', () => {
    mount();
    fireEvent.change(screen.getByLabelText(/amount \(ghs\)/i), { target: { value: '40000.1' } });
    fireEvent.click(screen.getByRole('button', { name: '+10' }));
    expect(screen.getByLabelText(/amount \(ghs\)/i)).toHaveValue(40010.1);
  });

  it('Max fills the exact balance including pesewas', () => {
    h.account = makeAccount({ balance: 60000.29 });
    mount();
    fireEvent.click(screen.getByRole('button', { name: /^max$/i }));
    expect(screen.getByLabelText(/amount \(ghs\)/i)).toHaveValue(60000.29);
  });

  it('exactly 40,000 is accepted and triggers the popup flow', () => {
    mount();
    fireEvent.change(screen.getByLabelText(/amount \(ghs\)/i), { target: { value: '40000' } });
    expect(screen.getByRole('button', { name: /withdraw now/i })).not.toBeDisabled();
  });

  it('shows the stage minimum with no "(Stage N minimum)" label', () => {
    mount();
    expect(screen.getByText(/Minimum per transaction is GHS 40,000\.00/)).toBeInTheDocument();
    expect(screen.queryByText(/Stage 3 minimum/i)).not.toBeInTheDocument();
  });

  it('the deposit requirement scales with the amount entered', () => {
    h.account = makeAccount({ totalDeposited: 5200 });
    mount();
    submitAmount(52000); // 10% = 5,200 -> met -> blocked
    expect(blockedPopup()).toBeInTheDocument();
    fireEvent.click(within(blockedPopup()).getByRole('button', { name: /^close$/i }));

    submitAmount(60000); // 10% = 6,000 > 5,200 -> deposit popup
    expect(extraPopup()).toBeInTheDocument();
    expect(blockedPopup()).not.toBeInTheDocument();
  });
});

describe('other stages keep "account blocked" first', () => {
  it('a blocked Stage 2 account sees "account blocked" even with the 10% unmet', () => {
    h.account = makeAccount({ stage: 2, blocked: true, totalDeposited: 1200 });
    mount();
    submitAmount(20000);
    expect(blockedPopup()).toBeInTheDocument();
    expect(extraPopup()).not.toBeInTheDocument();
  });

  it('an unblocked Stage 2 account still gets the deposit popup when the 10% is unmet', () => {
    h.account = makeAccount({ stage: 2, blocked: false, totalDeposited: 1200 });
    mount();
    submitAmount(20000);
    expect(extraPopup()).toBeInTheDocument();
  });

  it('Stage 1 still gets the "Deposit requirement" popup', () => {
    h.account = makeAccount({ stage: 1, blocked: false, totalDeposited: 1200, balance: 5000 });
    mount();
    submitAmount(600);
    expect(screen.getByRole('dialog', { name: /deposit requirement/i })).toBeInTheDocument();
  });
});

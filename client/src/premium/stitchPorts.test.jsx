import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import StitchSportsbook from '../pages/premium/StitchSportsbook.jsx';
import StitchMobile from '../pages/premium/StitchMobile.jsx';
import StitchLiveTracker from '../pages/premium/StitchLiveTracker.jsx';
import StitchMyBets from '../pages/premium/StitchMyBets.jsx';
import StitchWallet from '../pages/premium/StitchWallet.jsx';
import StitchWithdraw from '../pages/premium/StitchWithdraw.jsx';
import StitchPromos from '../pages/premium/StitchPromos.jsx';
import StitchCodeHub from '../pages/premium/StitchCodeHub.jsx';
import StitchProfile from '../pages/premium/StitchProfile.jsx';

/* ---------------------------------------------------------------------------
   Render tests for the four Stitch ports.

   These are the only checks that prove the ports mount AND talk to the real
   betslip engine — a Vite build cannot catch a renamed selection field or a
   wrong hook property, but these can.
   ------------------------------------------------------------------------- */

const fetchMatches = vi.fn();
const fetchRecentPayouts = vi.fn();
const fetchPromotions = vi.fn();
const fetchBetHistory = vi.fn();
const fetchCashoutOffer = vi.fn();
const executeCashout = vi.fn();
const setAutoCashout = vi.fn();
const placeBet = vi.fn();
const fetchTransactions = vi.fn();
const fetchWalletRules = vi.fn();
const withdraw = vi.fn();
const fetchBetByCode = vi.fn();
const updateProfile = vi.fn();
const changePassword = vi.fn();
const setAccount = vi.fn();
const openDeposit = vi.fn();
const showWin = vi.fn();
const refresh = vi.fn();
const toast = vi.fn();
const openWithdraw = vi.fn();
const signOut = vi.fn();
const clearNotifications = vi.fn();
const markNotificationRead = vi.fn();
const notificationsState = [];
// Captured so tests can drive the ports' socket handlers directly.
const liveHandlers = new Map();

// Shared account object so tests can shape it (stage, balance, phone) per case.
const accountState = { balance: 5000, userId: 'u-1' };

vi.mock('../api/betApi.js', () => ({
  fetchMatches: (...a) => fetchMatches(...a),
  fetchRecentPayouts: (...a) => fetchRecentPayouts(...a),
  fetchPromotions: (...a) => fetchPromotions(...a),
  fetchBetHistory: (...a) => fetchBetHistory(...a),
  fetchCashoutOffer: (...a) => fetchCashoutOffer(...a),
  executeCashout: (...a) => executeCashout(...a),
  setAutoCashout: (...a) => setAutoCashout(...a),
  placeBet: (...a) => placeBet(...a),
  fetchTransactions: (...a) => fetchTransactions(...a),
  fetchWalletRules: (...a) => fetchWalletRules(...a),
  withdraw: (...a) => withdraw(...a),
  fetchBetByCode: (...a) => fetchBetByCode(...a),
  updateProfile: (...a) => updateProfile(...a),
  changePassword: (...a) => changePassword(...a),
}));

// No real socket in jsdom; onLive registers the handler and returns an
// unsubscribe fn, matching socketClient's contract.
vi.mock('../api/socketClient.js', () => ({
  onLive: (event, handler) => {
    liveHandlers.set(event, handler);
    return () => liveHandlers.delete(event);
  },
  subscribeSports: () => {},
  unsubscribeSports: () => {},
}));

vi.mock('../providers/AccountProvider.jsx', () => ({
  useAccount: () => ({
    account: accountState.userId ? accountState : null,
    setAccount,
    openDeposit,
    openWithdraw: openWithdraw,
    showWin,
    refresh,
    signOut,
    notifications: notificationsState,
    unreadCount: notificationsState.filter((n) => !n.read).length,
    clearNotifications,
    markNotificationRead,
  }),
  useToast: () => ({ toast }),
}));

const PAGE = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

/* Deterministic seed odds (see premium/stitchSeed.js). */
const ARS_LEE_HOME = 'Match Result — Home @ 1.45';
const LIV_MCI_HOME = 'Match Result — Home @ 2.55';
const CHE_TOT_HOME = 'Match Result — Home @ 2.05';

const slipOf = () => screen.getByRole('complementary', { name: /Bet slip/i });

/** Seed fixture data only exists once the API failure has been handled. */
const ready = async () => {
  await waitFor(() => expect(fetchMatches).toHaveBeenCalled());
  await screen.findByText('Ghana Premier League');
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  notificationsState.length = 0;
  vi.clearAllMocks();
  liveHandlers.clear();
  // Reset the shared account to the default signed-in shape.
  for (const k of Object.keys(accountState)) delete accountState[k];
  Object.assign(accountState, { balance: 5000, userId: 'u-1' });
  fetchMatches.mockRejectedValue(new Error('offline'));
  fetchRecentPayouts.mockResolvedValue({
    payouts: [
      { id: 'p-1', maskedId: '024***123', amount: 4280, currency: 'GHS', sport: 'football' },
      { id: 'p-2', maskedId: '055***987', amount: 1960, currency: 'GHS', sport: 'basketball' },
    ],
  });
  fetchPromotions.mockResolvedValue({
    promotions: [
      { id: 'pr-1', badge: 'NEW', title: 'Welcome Bonus', body: 'Double your first deposit.', cta: 'Opt in', accent: '#7c5cff' },
    ],
  });
  fetchBetHistory.mockResolvedValue({ bets: [] });
  fetchCashoutOffer.mockResolvedValue({ offer: 0 });
  executeCashout.mockResolvedValue({ ok: true, cashOut: 0 });
  setAutoCashout.mockResolvedValue({ ok: true });
  placeBet.mockResolvedValue({
    success: true,
    bet: { id: 'bet-1', potentialReturn: 3120 },
    account: { balance: 4500, userId: 'u-1' },
  });
  fetchTransactions.mockResolvedValue({ transactions: [] });
  fetchWalletRules.mockResolvedValue({ minDeposit: 300, minWithdraw: 550, withdrawDepositRatio: 0.1, totalDeposited: 0, maxWithdrawByRatio: 0 });
  withdraw.mockResolvedValue({
    ok: true,
    account: { balance: 4500, userId: 'u-1' },
    transaction: { id: 'w-1', kind: 'withdraw', amount: 5000, status: 'pending', at: '2026-10-01T10:00:00.000Z' },
  });
  fetchBetByCode.mockResolvedValue({ bet: { legs: [] } });
});

afterEach(() => vi.useRealTimers());

/* ---- screen 01 ------------------------------------------------------------ */

describe('screen 01 — premium sportsbook', () => {
  test('renders the three-column shell and falls back to seed fixtures', async () => {
    const { container } = PAGE(<StitchSportsbook />);
    await ready();

    expect(container.querySelector('.stx')).toBeTruthy();
    expect(container.querySelector('.stx-desk')).toBeTruthy();
    expect(container.querySelector('.stx-rail')).toBeTruthy();
    expect(container.querySelector('.stx-slip')).toBeTruthy();

    expect(screen.getAllByText('Arsenal').length).toBeGreaterThan(0);
    // "Live Now" is both a section heading and a market filter chip.
    expect(screen.getAllByText('Live Now').length).toBeGreaterThan(0);
    expect(screen.getByText('Premier League')).toBeTruthy();
    expect(screen.getByText('UEFA Champions League')).toBeTruthy();
    // The API-down banner tells the reviewer why the data looks designed.
    expect(screen.getByText(/live API is unreachable/i)).toBeTruthy();
  });

  test('the payout ticker shows real settled winners from the API', async () => {
    PAGE(<StitchSportsbook />);
    await ready();

    // Real masked identifiers + amounts come back from /bet/recent-payouts.
    expect((await screen.findAllByText(/024\*\*\*123/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/GHS 4,280\.00/).length).toBeGreaterThan(0);
    // No fabricated winner names are ever rendered.
    expect(screen.queryByText(/Kwesi|Abena|Yaw |Kofi/)).toBeNull();
  });

  test('an empty payout feed shows an honest state, not invented winners', async () => {
    fetchRecentPayouts.mockResolvedValue({ payouts: [] });
    PAGE(<StitchSportsbook />);
    await ready();

    expect(await screen.findByText(/Payout feed unavailable right now/i)).toBeTruthy();
    expect(screen.queryByText(/024\*\*\*123/)).toBeNull();
  });

  test('promo surfaces render real active promotions from the API', async () => {
    fetchPromotions.mockResolvedValue({
      promotions: [
        { id: 'pr-9', badge: 'VIP', title: 'Weekly Reload', body: 'GHS 200 reload boost.', cta: 'Claim' },
      ],
    });
    PAGE(<StitchSportsbook />);
    await ready();

    expect(await screen.findByText('Weekly Reload')).toBeTruthy();
    expect(screen.getByText('GHS 200 reload boost.')).toBeTruthy();
    // The old hardcoded welcome offer never appears.
    expect(screen.queryByText(/XENTRA100/)).toBeNull();
    expect(screen.queryByText(/Welcome Boost/)).toBeNull();
  });

  test('no active promotions shows an honest state, not invented copy', async () => {
    fetchPromotions.mockResolvedValue({ promotions: [] });
    PAGE(<StitchSportsbook />);
    await ready();

    expect(await screen.findByText(/No active offers right now/i)).toBeTruthy();
    expect(screen.queryByText(/XENTRA100/)).toBeNull();
  });

  test('the chrome carries no fabricated notification badge or sport counts', async () => {
    const { container } = PAGE(<StitchSportsbook />);
    await ready();

    // No invented unread badge and no made-up per-sport event counts.
    expect(container.querySelector('.stx-top .stx-badge-dot')).toBeNull();
    expect(container.querySelectorAll('.stx-sportpill b').length).toBe(0);
  });

  test('the header search filters fixtures to matching teams', async () => {
    PAGE(<StitchSportsbook />);
    await ready();
    expect(screen.getAllByText('Arsenal').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByRole('searchbox', { name: /search teams/i }), {
      target: { value: 'Liverpool' },
    });

    await waitFor(() => expect(screen.queryByText('Arsenal')).toBeNull());
    expect(screen.getByText('Liverpool')).toBeTruthy();
  });

  test('an unmatched search shows an honest empty state', async () => {
    PAGE(<StitchSportsbook />);
    await ready();

    fireEvent.change(screen.getByRole('searchbox', { name: /search teams/i }), {
      target: { value: 'zzzznotateam' },
    });

    expect(await screen.findByText(/No fixtures match/i)).toBeTruthy();
  });

  test('an odds click becomes a real selection labelled by the engine', async () => {
    const { container } = PAGE(<StitchSportsbook />);
    await ready();

    fireEvent.click(screen.getByTitle(ARS_LEE_HOME));

    const slip = slipOf();
    expect(container.querySelector('.stx-count')?.textContent).toBe('1');
    // marketLabel, pickLabel and meta all come from betslipEngine.buildSelection.
    expect(within(slip).getByText('Match Result')).toBeTruthy();
    expect(within(slip).getByText('Arsenal to win')).toBeTruthy();
    expect(slip.textContent).toContain('Arsenal vs Leeds United');
    expect(slip.textContent).toContain('@ 1.45');
  });

  test('a single Multi pick explains the disabled CTA instead of failing silently', async () => {
    PAGE(<StitchSportsbook />);
    await ready();

    fireEvent.click(screen.getByTitle(ARS_LEE_HOME));

    const slip = slipOf();
    expect(within(slip).getByRole('alert').textContent).toMatch(
      /Multiple bets need at least 2 selections/,
    );
    expect(within(slip).getByRole('button', { name: /Place Bet/ })).toBeDisabled();
    expect(placeBet).not.toHaveBeenCalled();
  });

  test('an under-minimum stake is reported and not sent to the API', async () => {
    PAGE(<StitchSportsbook />);
    await ready();

    fireEvent.click(screen.getByTitle(ARS_LEE_HOME));
    fireEvent.click(screen.getByTitle(LIV_MCI_HOME));

    const slip = slipOf();
    fireEvent.change(within(slip).getByLabelText('Stake amount'), {
      target: { value: '100' },
    });

    expect(within(slip).getByRole('alert').textContent).toMatch(
      /Minimum stake is GHS 300/,
    );
    expect(within(slip).getByRole('button', { name: /Place Bet/ })).toBeDisabled();
    expect(placeBet).not.toHaveBeenCalled();
  });

  test('the accumulator bonus matches the real engine rate with no double count', async () => {
    PAGE(<StitchSportsbook />);
    await ready();

    fireEvent.click(screen.getByTitle(ARS_LEE_HOME));
    fireEvent.click(screen.getByTitle(LIV_MCI_HOME));

    const slip = slipOf();
    fireEvent.change(within(slip).getByLabelText('Stake amount'), {
      target: { value: '500' },
    });

    // Real backend rate (8%), sourced from the engine — never a fabricated 15%.
    expect(within(slip).getByText(/Boosted Extra \(8%\)/)).toBeTruthy();
    expect(within(slip).queryByText(/15%/)).toBeNull();
    // 500 × 1.45 × 2.55 = 1,848.75, +8% = 1,996.65 — the bonus is baked in once.
    expect(slip.textContent).toContain('GHS 1,996.65');
  });

  test('a valid Multi posts the production payload and refreshes the account', async () => {
    PAGE(<StitchSportsbook />);
    await ready();

    fireEvent.click(screen.getByTitle(ARS_LEE_HOME));
    fireEvent.click(screen.getByTitle(LIV_MCI_HOME));

    const slip = slipOf();
    fireEvent.change(within(slip).getByLabelText('Stake amount'), {
      target: { value: '500' },
    });

    // A third leg on a separate match unlocks the design's accumulator bonus line
    // (one pick per market — two outcomes on the same match would conflict).
    fireEvent.click(screen.getByTitle(CHE_TOT_HOME));

    const cta = within(slip).getByRole('button', { name: /Place Bet \(GHS/ });
    await waitFor(() => expect(cta).toBeEnabled());
    expect(within(slip).getByText(/Accumulator Bonus/)).toBeTruthy();
    fireEvent.click(cta);

    await waitFor(() => expect(placeBet).toHaveBeenCalledTimes(1));
    const payload = placeBet.mock.calls[0][0];
    expect(payload.mode).toBe('multiple');
    expect(payload.stake).toBe(500);
    expect(payload.selections).toHaveLength(3);
    expect(payload.selections[0]).toEqual({
      matchId: 'seed-ars-lee',
      market: '1X2',
      outcome: '1',
      odds: 1.45,
    });

    expect(setAccount).toHaveBeenCalledWith({ balance: 4500, userId: 'u-1' });
    expect(await screen.findByText(/Bet placed/)).toBeTruthy();
  });

  test('quick-add stake buttons feed the same accumulator stake', async () => {
    PAGE(<StitchSportsbook />);
    await ready();

    fireEvent.click(screen.getByTitle(ARS_LEE_HOME));
    fireEvent.click(screen.getByTitle(LIV_MCI_HOME));

    const slip = slipOf();
    fireEvent.click(within(slip).getByRole('button', { name: '+500' }));
    fireEvent.click(within(slip).getByRole('button', { name: '+500' }));

    expect(within(slip).getByLabelText('Stake amount').value).toBe('1000');
    // formatAmt renders 2 decimals, so the CTA reads GHS 1,000.00.
    expect(within(slip).getByRole('button', { name: /Place Bet \(GHS 1,000\.00\)/ })).toBeEnabled();
  });

  test('removing a pick empties the slip and restores the empty state', async () => {
    PAGE(<StitchSportsbook />);
    await ready();

    fireEvent.click(screen.getByTitle(ARS_LEE_HOME));
    const slip = slipOf();
    expect(within(slip).queryByText(/Tap any odds to build your slip/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Remove / }));
    expect(within(slip).getByText(/Tap any odds to build your slip/)).toBeTruthy();
    expect(within(slip).queryByRole('button', { name: /^Remove / })).toBeNull();
  });
});

/* ---- screens 02 & 04 ------------------------------------------------------ */

describe('screens 02 & 04 — mobile app', () => {
  test('dark variant renders the mobile chrome and tab bar', async () => {
    const { container } = PAGE(<StitchMobile />);
    await ready();

    expect(container.querySelector('.stx-mob')).toBeTruthy();
    expect(container.querySelector('.stx')).not.toHaveClass('stx-light');
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeTruthy();
    // The mobile hero now shows a real promotion from the API, not hardcoded copy.
    expect(await screen.findByText('Welcome Bonus')).toBeTruthy();
    expect(screen.getByText('LIVE RADAR 03')).toBeTruthy();
    expect(screen.getByText('Upcoming Fixtures')).toBeTruthy();
  });

  test('light variant only swaps the theme modifier', async () => {
    const { container } = PAGE(<StitchMobile light />);
    await ready();

    expect(container.querySelector('.stx')).toHaveClass('stx-light');
    expect(container.querySelector('.stx-mob')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeTruthy();
  });

  test('the hero live score comes from the seed fixture', async () => {
    const { container } = PAGE(<StitchMobile />);
    await ready();

    const hero = container.querySelector('.stx-mob-hero');
    expect(hero.textContent).toContain('Arsenal');
    expect(hero.textContent).toContain('Chelsea');
    expect(container.querySelectorAll('.stx-mob-score-num')[0].textContent).toBe('2');
    expect(container.querySelectorAll('.stx-mob-score-num')[1].textContent).toBe('1');
  });

  test('a pick reveals the thumb dock with its stake controls', async () => {
    const { container } = PAGE(<StitchMobile />);
    await ready();
    expect(container.querySelector('.stx-dock')).toBeNull();

    await waitFor(() => expect(screen.getAllByTitle(/Match Result — Home @/).length).toBeGreaterThan(1));
    fireEvent.click(screen.getAllByTitle(/Match Result — Home @/)[0]);
    fireEvent.click(screen.getAllByTitle(/Match Result — Home @/)[1]);

    const dock = container.querySelector('.stx-dock');
    expect(dock).toBeTruthy();
    expect(dock.textContent).toMatch(/2 Active Selections/);
    expect(within(dock).getByLabelText('Stake amount')).toBeTruthy();
    expect(within(dock).getByRole('button', { name: /Place Bet/ })).toBeTruthy();
  });
});

/* ---- screen 03 ------------------------------------------------------------ */

describe('screen 03 — live tracker', () => {
  test('renders the live shell and an honest cash-out state when no bet is open', async () => {
    const { container } = PAGE(<StitchLiveTracker />);
    await screen.findByText(/SWITCH MATCH/);

    expect(container.querySelector('.stx-desk')).toBeTruthy();
    expect(container.querySelector('.stx-pitchbox')).toBeTruthy();
    expect(container.querySelector('.stx-momentum')).toBeTruthy();
    expect(container.querySelector('.stx-timeline')).toBeTruthy();

    // Hero derives from the seed live fixture: Arsenal 2-1 Chelsea at 74'.
    expect(container.textContent).toContain("74'");
    expect(screen.getByText('Main Markets')).toBeTruthy();

    // The radar no longer claims real-time possession or invented xG.
    expect(container.textContent).toContain('LIVE RADAR — ILLUSTRATIVE PITCH MAP');
    expect(container.textContent).not.toContain('REAL-TIME POSSESSION');
    expect(container.textContent).not.toContain('Home xG');

    // Real API: no open bet on this match → honest empty state, no slider.
    expect(await screen.findByText(/No open bet on this match/i)).toBeTruthy();
    expect(within(container.querySelector('.stx-cashout')).queryByRole('slider')).toBeNull();
  });

  test('the cash-out panel reflects the real open bet and offer', async () => {
    fetchBetHistory.mockResolvedValue({
      bets: [{
        id: 'bet-9',
        status: 'open',
        mode: 'single',
        stake: 200,
        totalOdds: 1.9,
        potentialWin: 380,
        legs: [{ matchId: 'seed-ars-che', market: '1X2', outcome: '1' }],
      }],
    });
    fetchCashoutOffer.mockResolvedValue({ offer: 250, locked: false, autoCashoutTarget: 0 });

    const { container } = PAGE(<StitchLiveTracker />);
    await screen.findByText(/SWITCH MATCH/);

    expect(await screen.findByText('CURRENT CASH OUT')).toBeTruthy();
    const panel = container.querySelector('.stx-cashout');
    expect(panel.textContent).toContain('GHS 200.00');   // real stake
    expect(panel.textContent).toContain('GHS 250.00');   // real offer
    expect(panel.textContent).toContain('+25% PROFIT');  // (250 - 200) / 200

    fireEvent.click(within(panel).getByRole('button', { name: /Cash Out GHS/ }));
    await waitFor(() => expect(executeCashout).toHaveBeenCalledWith('bet-9', 250, 1));
  });

  test('a locked match reports cash-out as locked', async () => {
    fetchBetHistory.mockResolvedValue({
      bets: [{
        id: 'bet-10',
        status: 'open',
        stake: 100,
        legs: [{ matchId: 'seed-ars-che', market: '1X2', outcome: '1' }],
      }],
    });
    fetchCashoutOffer.mockResolvedValue({ offer: 0, locked: true });

    PAGE(<StitchLiveTracker />);
    await screen.findByText(/SWITCH MATCH/);
    expect(await screen.findByText(/Cash-out is locked for this match/i)).toBeTruthy();
  });

  test('timeline and momentum react to the fixture event feed', async () => {
    const { container } = PAGE(<StitchLiveTracker />);
    await screen.findByText(/SWITCH MATCH/);

    const tl = container.querySelector('.stx-timeline');
    expect(tl.textContent).toContain('Havertz');
    expect(tl.textContent).toContain('Palmer');
    expect(container.querySelector('.stx-momentum .stx-bars')).toBeTruthy();
  });

  test('switching market tabs swaps the in-play panel', async () => {
    const { container } = PAGE(<StitchLiveTracker />);
    await screen.findByText(/SWITCH MATCH/);

    // Default tab is the real 1X2 market.
    expect(container.querySelector('.stx-mkt').textContent).toContain('Match Result');

    fireEvent.click(screen.getByRole('button', { name: /Double Chance/ }));
    expect(container.querySelector('.stx-mkt').textContent).toContain('Double Chance');
  });

  test('an in-play price becomes a betslip selection', async () => {
    PAGE(<StitchLiveTracker />);
    await screen.findByText(/SWITCH MATCH/);

    fireEvent.click(screen.getByTitle('Match Result — Home @ 1.32'));

    const slip = slipOf();
    expect(within(slip).getByText('Arsenal to win')).toBeTruthy();
    expect(within(slip).getByRole('alert').textContent).toMatch(/at least 2 selections/);
  });

  test('falls back to a sportsbook CTA when nothing is live', async () => {
    fetchMatches.mockResolvedValue({ leagues: [], seedSlip: null });
    const { container } = PAGE(<StitchLiveTracker />);

    expect(await screen.findByText('No live fixtures')).toBeTruthy();
    expect(container.querySelector('.stx-pitchbox')).toBeNull();
    expect(screen.getByRole('link', { name: /Back to Sportsbook/ })).toBeTruthy();
  });

  test('flags designed preview data when the live API is unreachable', async () => {
    const { container } = PAGE(<StitchLiveTracker />);
    await screen.findByText(/SWITCH MATCH/);
    expect(container.textContent).toContain('Showing designed preview fixtures');
  });
});

/* ---- realtime feed -------------------------------------------------------- */

describe('realtime wiring', () => {
  const tickOdds = (fixtureId, market, selections) =>
    act(() => liveHandlers.get('odds:tick')({ fixtureId, market, selections }));

  const setStatus = (fixtureId, status, extra = {}) =>
    act(() => liveHandlers.get('match:status')({ fixtureId, status, ...extra }));

  test('the feed drives the Live Now count', async () => {
    PAGE(<StitchSportsbook />);
    await ready();
    // Seed ships three live fixtures.
    expect(screen.getByText('3 Matches In-Play')).toBeTruthy();

    setStatus('seed-ars-che', '2h', { minute: 46 });
    await waitFor(() => expect(screen.getByText('3 Matches In-Play')).toBeTruthy());

    setStatus('seed-ars-che', 'finished', { minute: 90 });
    await waitFor(() => expect(screen.getByText('2 Matches In-Play')).toBeTruthy());
  });

  test('a match going live is added to Live Now', async () => {
    PAGE(<StitchSportsbook />);
    await ready();

    setStatus('seed-ars-lee', 'live', { minute: 12, scoreHome: 1, scoreAway: 0 });
    await waitFor(() => expect(screen.getByText('4 Matches In-Play')).toBeTruthy());
  });

  test('a score:update re-renders the live score', async () => {
    const { container } = PAGE(<StitchSportsbook />);
    await ready();
    expect(container.querySelector('.stx-score').textContent).toContain('2');

    act(() => liveHandlers.get('score:update')({
      fixtureId: 'seed-ars-che',
      scoreHome: 3,
      scoreAway: 1,
      minute: 81,
      period: '2ND HALF',
    }));
    await waitFor(() => expect(container.querySelector('.stx-score').textContent).toContain('3'));
  });

  test('an odds tick re-prices the existing slip', async () => {
    PAGE(<StitchSportsbook />);
    await ready();
    fireEvent.click(screen.getByTitle(ARS_LEE_HOME));
    expect(slipOf().textContent).toContain('@ 1.45');

    tickOdds('seed-ars-lee', '1X2', [{ key: '1', label: 'Home', odds: 1.6 }]);

    const slip = slipOf();
    await waitFor(() => expect(slip.textContent).toContain('@ 1.60'));
    // Lengthening price is flagged with the design's trend arrow.
    expect(slip.querySelector('.stx-pick').textContent).toContain('▲');
  });

  test('a suspended market marks the pick stale', async () => {
    PAGE(<StitchSportsbook />);
    await ready();
    fireEvent.click(screen.getByTitle(ARS_LEE_HOME));

    tickOdds('seed-ars-lee', '1X2', [
      { key: '1', label: 'Home', odds: 1.45, suspended: true },
    ]);

    const slip = slipOf();
    await waitFor(() => expect(slip.textContent).toMatch(/SUSPENDED/));
    expect(slip.querySelector('.stx-pick--stale')).toBeTruthy();
  });

  test('a match:event lands on the live tracker timeline', async () => {
    const { container } = PAGE(<StitchLiveTracker />);
    await screen.findByText(/SWITCH MATCH/);
    const before = container.querySelector('.stx-tl-list').children.length;

    act(() => liveHandlers.get('match:event')({
      fixtureId: 'seed-ars-che',
      kind: 'goal',
      team: 'home',
      scoreHome: 3,
      scoreAway: 1,
    }));

    await waitFor(() =>
      expect(container.querySelector('.stx-tl-list').children.length).toBe(before + 1),
    );
    // The event also carries the new score through to the hero.
    expect(container.querySelector('.stx-mhero-score').textContent).toContain('3');
  });
});

/* ---- My Bets -------------------------------------------------------------- */

describe('My Bets & history centre', () => {
  test('shows an honest empty state when the account has no bets', async () => {
    fetchBetHistory.mockResolvedValue({ bets: [] });
    const { container } = PAGE(<StitchMyBets />);

    expect(await screen.findByText(/You have no open bets/i)).toBeTruthy();
    // The design's sample acca (#BX-89420 / GHS 540) is never reproduced.
    expect(container.textContent).not.toContain('BX-89420');
    expect(container.querySelector('.stx-bet')).toBeNull();
  });

  test('renders a real open ticket and cashes out at the real offer', async () => {
    fetchBetHistory.mockResolvedValue({ bets: [{
      id: 'bet-9',
      status: 'open',
      mode: 'single',
      stake: 200,
      totalOdds: 1.9,
      potentialWin: 380,
      placedAt: '2026-05-01T10:00:00.000Z',
      legs: [{ matchId: 'seed-ars-che', market: '1X2', outcome: '1', home: 'Arsenal', away: 'Chelsea', odds: 1.9 }],
    }] });
    fetchCashoutOffer.mockResolvedValue({ offer: 250, locked: false });

    const { container } = PAGE(<StitchMyBets />);
    await screen.findByRole('heading', { name: 'My Bets' });

    const card = await waitFor(() => {
      const el = container.querySelector('.stx-bet');
      expect(el).toBeTruthy();
      return el;
    });
    expect(card.textContent).toContain('Arsenal vs Chelsea');
    expect(card.textContent).toContain('GHS 200.00');   // real stake / returns

    await waitFor(() => expect(container.querySelector('.stx-bet-cashout').textContent)
      .toContain('GHS 250.00'));

    const panel = container.querySelector('.stx-bet-cashout');
    expect(panel.textContent).toContain('GHS 250.00');   // real offer
    expect(panel.textContent).toContain('+25% PROFIT');  // (250 - 200) / 200

    fireEvent.click(within(panel).getByRole('button', { name: /Cash Out GHS/i }));
    await waitFor(() => expect(executeCashout).toHaveBeenCalledWith('bet-9', 250, 1));
  });

  test('settled tickets surface their real returns', async () => {
    fetchBetHistory.mockResolvedValue({ bets: [
      { id: 'bet-won', status: 'won', mode: 'single', stake: 100, totalOdds: 2, totalReturn: 200, settledAt: '2026-10-01T10:00:00.000Z', legs: [] },
      { id: 'bet-open', status: 'open', mode: 'single', stake: 50, totalOdds: 3, potentialWin: 150, legs: [] },
    ] });

    const { container } = PAGE(<StitchMyBets />);
    await screen.findByRole('heading', { name: 'My Bets' });

    fireEvent.click(screen.getByRole('tab', { name: /Settled/i }));

    const card = await waitFor(() => {
      const el = container.querySelector('.stx-bet');
      expect(el).toBeTruthy();
      return el;
    });
    expect(card.textContent).toContain('WON');
    expect(card.textContent).toContain('GHS 200.00');
    // Net P/L uses the real settled figures (+100).
    expect(container.querySelector('.stx-bets-kpis').textContent).toContain('+GHS 100.00');
  });

  test('an open ticket with no live offer reports cash-out unavailable', async () => {
    fetchBetHistory.mockResolvedValue({ bets: [
      { id: 'bet-9', status: 'open', mode: 'single', stake: 100, totalOdds: 2, potentialWin: 200, legs: [] },
    ] });
    fetchCashoutOffer.mockResolvedValue({ offer: 0, locked: false });

    const { container } = PAGE(<StitchMyBets />);
    await screen.findByRole('heading', { name: 'My Bets' });

    await waitFor(() => expect(container.querySelector('.stx-bet-cashout-note')).toBeTruthy());
    expect(container.querySelector('.stx-bet-cashout-note').textContent).toMatch(/isn't available/i);
  });
});

/* ---- Wallet & Withdraw ---------------------------------------------------- */

describe('Wallet & Withdraw', () => {
  test('wallet shows the real balance, withdraw cap and transaction history', async () => {
    fetchWalletRules.mockResolvedValue({ minDeposit: 300, minWithdraw: 550, withdrawDepositRatio: 0.1, totalDeposited: 2000 });
    fetchTransactions.mockResolvedValue({ transactions: [
      { id: 'd-1', kind: 'deposit', amount: 2000, status: 'completed', at: '2026-10-02T10:00:00.000Z' },
      { id: 'w-1', kind: 'withdraw', amount: 500, status: 'pending', at: '2026-10-03T10:00:00.000Z' },
    ] });

    const { container } = PAGE(<StitchWallet />);
    await screen.findByRole('heading', { name: 'Wallet' });

    expect(container.querySelector('.stx-whero-amt').textContent).toContain('5,000.00');
    // Withdraw cap = lifetime deposits / 0.10.
    expect(container.querySelector('.stx-whero-meta').textContent).toContain('20,000.00');

    await waitFor(() => expect(container.querySelectorAll('.stx-tx').length).toBe(2));
    expect(container.textContent).toContain('Deposit');
    expect(container.textContent).toContain('Withdrawal');
  });

  test('wallet deposit CTA opens the real Paybill dialog', async () => {
    PAGE(<StitchWallet />);
    await screen.findByRole('heading', { name: 'Wallet' });
    fireEvent.click(screen.getByRole('button', { name: /Deposit Now/i }));
    expect(openDeposit).toHaveBeenCalled();
  });

  test('wallet shows an honest empty state with no transactions', async () => {
    const { container } = PAGE(<StitchWallet />);
    await screen.findByRole('heading', { name: 'Wallet' });
    expect(await screen.findByText(/No transactions yet/i)).toBeTruthy();
    expect(container.querySelector('.stx-tx')).toBeNull();
  });

  test('a stage 0 withdrawal is gated by the deposit-requirement modal', async () => {
    Object.assign(accountState, { balance: 100000, stage: 0 });
    PAGE(<StitchWithdraw />);
    await screen.findByRole('heading', { name: 'Withdraw' });
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: /Withdraw Now/i }));
    expect(await screen.findByText(/Deposit requirement/i)).toBeTruthy();
  });

  test('a stage 2 withdrawal requires the 10% extra deposit', async () => {
    Object.assign(accountState, { balance: 100000, stage: 2, totalDeposited: 0 });
    PAGE(<StitchWithdraw />);
    await screen.findByRole('heading', { name: 'Withdraw' });
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '10000' } });
    fireEvent.click(screen.getByRole('button', { name: /Withdraw Now/i }));
    expect(await screen.findByText(/Additional deposit required/i)).toBeTruthy();
  });

  test('a stage 4 withdrawal confirms then submits the real request', async () => {
    Object.assign(accountState, { balance: 100000, stage: 4, phone: '0244000000' });
    PAGE(<StitchWithdraw />);
    await screen.findByRole('heading', { name: 'Withdraw' });
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '50000' } });
    fireEvent.click(screen.getByRole('button', { name: /Withdraw Now/i }));
    await screen.findByText(/Confirm to Withdraw/i);
    fireEvent.click(screen.getByRole('button', { name: /^Confirm$/i }));
    await waitFor(() => expect(withdraw).toHaveBeenCalledWith(50000, 'momo'));
    expect(await screen.findByText(/Pending Request/i)).toBeTruthy();
  });
});

/* ---- Promotions & Code Hub ------------------------------------------------ */

const CODE_HUB_SNAPSHOT = {
  leagues: [{
    id: 'lg-1',
    name: 'Ghana Premier League',
    country: 'Ghana',
    meta: 'Premier',
    crest: { label: 'GPL', style: 'var(--stx-sc-high)' },
    matches: [
      { id: 'm-1', home: 'Hearts of Oak', away: 'Asante Kotoko', markets: hubMarkets(1.50, 1.90, 1.70) },
      { id: 'm-2', home: 'Great Olympics', away: 'Medeama', markets: hubMarkets(1.60, 2.00, 1.80) },
      { id: 'm-3', home: 'Aduana Stars', away: 'Berekum Chelsea', markets: hubMarkets(1.80, 2.10, 1.75) },
    ],
  }],
};

function hubMarkets(home, over, bttsYes) {
  return {
    '1X2': { selections: [{ key: '1', odds: home }, { key: 'X', odds: 3.4 }, { key: '2', odds: 4.5 }] },
    OU25: { selections: [{ key: 'Over', odds: over }, { key: 'Under', odds: 1.95 }] },
    BTTS: { selections: [{ key: 'Yes', odds: bttsYes }, { key: 'No', odds: 2.05 }] },
  };
}

describe('Promotions', () => {
  test('renders real admin offers from the API', async () => {
    fetchPromotions.mockResolvedValue({ promotions: [
      { id: 'p-1', tag: 'WELCOME', title: 'Welcome Bonus', body: '100% first deposit', cta: 'Claim now' },
      { id: 'p-2', tag: 'CASHBACK', title: 'Weekly Cashback', body: 'Up to GHS 200 back', cta: 'Opt in' },
    ] });

    PAGE(<StitchPromos />);
    await screen.findByText('Welcome Bonus');
    expect(screen.getByText('Weekly Cashback')).toBeTruthy();
    // Stats bar counts the real offers.
    expect(document.querySelector('.stx-phead-stats').textContent).toContain('2');
  });

  test('claiming records the offer locally and shows the claimed state', async () => {
    fetchPromotions.mockResolvedValue({ promotions: [
      { id: 'p-1', tag: 'WELCOME', title: 'Welcome Bonus', body: '100% first deposit', cta: 'Claim now' },
    ] });

    PAGE(<StitchPromos />);
    fireEvent.click(await screen.findByRole('button', { name: /Claim now/i }));
    expect(await screen.findByRole('button', { name: /Claimed/i })).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('bv_claimed'))).toContain('p-1');
    expect(toast).toHaveBeenCalled();
  });

  test('no active offers shows an honest empty state', async () => {
    fetchPromotions.mockResolvedValue({ promotions: [] });
    PAGE(<StitchPromos />);
    expect(await screen.findByText(/No active promotions right now/i)).toBeTruthy();
  });

  test('an unreachable feed shows an unavailable state, not invented copy', async () => {
    fetchPromotions.mockRejectedValue(new Error('offline'));
    PAGE(<StitchPromos />);
    expect(await screen.findByText(/Promotions are unavailable right now/i)).toBeTruthy();
  });
});

describe('Code Hub', () => {
  test('derives recommended accumulators from the real odds feed', async () => {
    fetchMatches.mockResolvedValue(CODE_HUB_SNAPSHOT);

    const { container } = PAGE(<StitchCodeHub />);
    expect(await screen.findByText(/Top Picks/i)).toBeTruthy();
    expect(container.textContent).toContain('Hearts of Oak vs Asante Kotoko');
    expect(container.querySelectorAll('.stx-ccard').length).toBeGreaterThan(0);
  });

  test('falls back to an honest unavailable state when the feed is down', async () => {
    fetchMatches.mockRejectedValue(new Error('offline'));
    PAGE(<StitchCodeHub />);
    expect(await screen.findByText(/Live odds feed unavailable/i)).toBeTruthy();
  });

  test('Add to Betslip hands the legs to the slip via sessionStorage', async () => {
    fetchMatches.mockResolvedValue(CODE_HUB_SNAPSHOT);

    PAGE(<StitchCodeHub />);
    const addButtons = await screen.findAllByRole('button', { name: /Add to Betslip/i });
    fireEvent.click(addButtons[0]);
    const stored = JSON.parse(sessionStorage.getItem('sp_recommended_legs'));
    expect(stored.legs.length).toBeGreaterThanOrEqual(3);
    sessionStorage.clear();
  });

  test('a booking code is validated then handed to the slip', async () => {
    fetchBetByCode.mockResolvedValue({ bet: { legs: [
      { matchId: 'm-1', market: '1X2', outcome: '1', odds: 1.5, home: 'Hearts of Oak', away: 'Asante Kotoko', marketName: 'Match Result' },
    ] } });

    PAGE(<StitchCodeHub />);
    fireEvent.change(await screen.findByLabelText(/Insert a booking code/i), { target: { value: 'abc123' } });
    fireEvent.submit(screen.getByRole('button', { name: /^Load$/i }).closest('form'));
    await waitFor(() => expect(fetchBetByCode).toHaveBeenCalledWith('ABC123'));
    expect(JSON.parse(sessionStorage.getItem('sp_recommended_legs')).legs.length).toBe(1);
    sessionStorage.clear();
  });
});

/* ---- Account -------------------------------------------------------------- */

describe('Account', () => {
  test('signed-in account shows identity, real balance and the menu', async () => {
    Object.assign(accountState, { balance: 7000, phone: '0244123456', accountStatus: 'PREMIUM' });
    const { container } = PAGE(<StitchProfile />);

    await screen.findByText('0244123456');
    expect(container.querySelector('.stx-whero-amt').textContent).toContain('7,000.00');
    expect(screen.getByText('PREMIUM')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Deposit/i }).length).toBeGreaterThan(0);
    expect(screen.getByText('Sports Bet History')).toBeTruthy();
  });

  test('guest sees an honest sign-in prompt', async () => {
    delete accountState.userId;
    PAGE(<StitchProfile />);
    expect(await screen.findByText(/Sign in to manage your account/i)).toBeTruthy();
  });

  test('the transactions menu opens a sheet with the real history', async () => {
    fetchTransactions.mockResolvedValue({ transactions: [
      { id: 't-1', kind: 'deposit', amount: 2000, status: 'completed', at: '2026-10-02T10:00:00.000Z' },
    ] });
    PAGE(<StitchProfile />);
    fireEvent.click(await screen.findByText('Transactions'));
    await waitFor(() => expect(fetchTransactions).toHaveBeenCalled());
    expect(await screen.findByText('Deposit')).toBeTruthy();
  });

  test('invalid phone in the settings sheet reports a validation error', async () => {
    PAGE(<StitchProfile />);
    fireEvent.click(await screen.findByText('Account Settings'));
    const phone = await screen.findByLabelText(/Phone number/i);
    fireEvent.change(phone, { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/i }));
    expect(await screen.findByText(/valid phone number/i)).toBeTruthy();
    expect(updateProfile).not.toHaveBeenCalled();
  });
});

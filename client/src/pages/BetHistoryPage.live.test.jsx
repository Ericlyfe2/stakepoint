/**
 * Live-ticket rendering on the My Bets open-bet card.
 * Covers: Live badge on the ticket header, per-leg "Live Odds" chip with
 * direction arrow, "Live Odds Suspended", the minute/score line for in-play
 * legs and the "FT | score" line for finished legs.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BetCardView } from './BetHistoryPage.jsx';

vi.mock('../api/betApi.js', () => ({
  fetchBetHistory: vi.fn(),
  fetchBetByCode: vi.fn(),
  fetchCashoutOffer: vi.fn(),
  executeCashout: vi.fn(),
  setAutoCashout: vi.fn(),
}));
vi.mock('../providers/AccountProvider.jsx', () => ({
  useAccount: () => ({ account: null }),
  useToast: () => ({ toast: vi.fn() }),
}));

function makeLiveBet(overrides = {}) {
  return {
    id: 'bv-test-1',
    status: 'open',
    mode: 'multiple',
    stake: 1000,
    totalOdds: 7.45,
    potentialWin: 8043.84,
    placedAt: new Date().toISOString(),
    anyLive: true,
    legs: [
      {
        matchId: 'fx-live', market: '1X2', outcome: '1', odds: 2.66,
        home: 'FC Arlanda', away: 'IF Karlstad Fotboll',
        live: {
          isLive: true, finished: false, minute: "65'",
          scoreHome: 1, scoreAway: 0, suspended: false,
          currentOdds: 2.10, direction: 'down',
        },
      },
      {
        matchId: 'fx-ft', market: 'CS', outcome: '2-0', odds: 12.0,
        home: 'Stabaek IF', away: 'Bryne FK',
        live: {
          isLive: false, finished: true, minute: null,
          scoreHome: 2, scoreAway: 0, suspended: false,
          currentOdds: null, direction: null,
        },
      },
    ],
    ...overrides,
  };
}

function renderCard(bet) {
  return render(
    <BetCardView
      bet={bet}
      onCashout={vi.fn()} onRemix={vi.fn()} onDetails={vi.fn()}
      copiedCode={null} onCopy={vi.fn()}
      autoTarget="" onAutoTargetChange={vi.fn()} onAutoClear={vi.fn()}
      cashoutBusy={false}
    />
  );
}

describe('live open-bet ticket', () => {
  it('shows the green Live badge on the ticket header when a leg is live', () => {
    const { container } = renderCard(makeLiveBet());
    const badge = container.querySelector('.xh-live-badge');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('Live');
  });

  it('shows no Live badge when no leg is live', () => {
    const bet = makeLiveBet({ anyLive: false });
    bet.legs = bet.legs.map((l) => ({ ...l, live: { ...l.live, isLive: false } }));
    const { container } = renderCard(bet);
    expect(container.querySelector('.xh-live-badge')).toBeNull();
  });

  it('renders live odds with a red down arrow when odds dropped', () => {
    const { container } = renderCard(makeLiveBet());
    fireEvent.click(container.querySelector('.xh-open-mode-row'));
    expect(screen.getByText('Live Odds')).toBeTruthy();
    const oddsVal = container.querySelector('.xh-live-odds-val');
    expect(oddsVal.textContent).toContain('2.10');
    expect(oddsVal.className).toContain('down');
  });

  it('renders a green up arrow when odds rose', () => {
    const bet = makeLiveBet();
    bet.legs[0].live.currentOdds = 3.05;
    bet.legs[0].live.direction = 'up';
    const { container } = renderCard(bet);
    fireEvent.click(container.querySelector('.xh-open-mode-row'));
    const oddsVal = container.querySelector('.xh-live-odds-val');
    expect(oddsVal.textContent).toContain('3.05');
    expect(oddsVal.className).toContain('up');
  });

  it('renders "Live Odds Suspended" when the selection is suspended', () => {
    const bet = makeLiveBet();
    bet.legs[0].live.suspended = true;
    const { container } = renderCard(bet);
    fireEvent.click(container.querySelector('.xh-open-mode-row'));
    expect(screen.getByText('Live Odds Suspended')).toBeTruthy();
    expect(container.querySelector('.xh-live-odds-val')).toBeNull();
  });

  it('renders the minute/half and live score for the in-play leg', () => {
    const { container } = renderCard(makeLiveBet());
    fireEvent.click(container.querySelector('.xh-open-mode-row'));
    const status = container.querySelector('.xh-leg-live-status');
    expect(status.textContent).toContain("65' H2");
    expect(status.textContent).toContain('1:0');
  });

  it('labels first-half minutes as H1', () => {
    const bet = makeLiveBet();
    bet.legs[0].live.minute = "31'";
    const { container } = renderCard(bet);
    fireEvent.click(container.querySelector('.xh-open-mode-row'));
    expect(container.querySelector('.xh-leg-live-status').textContent).toContain("31' H1");
  });

  it('renders FT | score for the finished leg', () => {
    const { container } = renderCard(makeLiveBet());
    fireEvent.click(container.querySelector('.xh-open-mode-row'));
    const ft = container.querySelector('.xh-leg-ft-status');
    expect(ft.textContent).toContain('FT');
    expect(ft.textContent).toContain('2:0');
  });

  it('shows stake and potential win in the expanded ticket', () => {
    const { container } = renderCard(makeLiveBet());
    fireEvent.click(container.querySelector('.xh-open-mode-row'));
    expect(container.textContent).toContain('1,000.00');
    expect(container.textContent).toContain('8,043.84');
  });
});

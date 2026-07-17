import { describe, it, expect } from 'vitest';
import { tickMinuteDisplay, stoppageMinutesFor } from './liveClock.js';

describe('tickMinuteDisplay full-match sanity cap', () => {
  it('ticks normally within a realistic second-half range', () => {
    const anchor = 1_000_000;
    const now = anchor + 5 * 60_000; // +5 minutes elapsed
    expect(tickMinuteDisplay("60'", anchor, 'fx-1', now)).toBe("65:00'");
  });

  it('freezes around 90 minutes instead of climbing into triple digits', () => {
    const anchor = 1_000_000;
    const now = anchor + 60 * 60_000; // +60 minutes elapsed on top of 60' reported
    const cap = stoppageMinutesFor('fx-2', 2);
    const display = tickMinuteDisplay("60'", anchor, 'fx-2', now);
    const minute = parseInt(display, 10);
    expect(minute).toBe(90 + cap);
    expect(minute).toBeLessThan(150);
  });

  it('gives the same frozen minute no matter how long it has been forgotten', () => {
    const anchor = 1_000_000;
    const soon = anchor + 50 * 60_000;
    const muchLater = anchor + 500 * 60_000;
    const a = tickMinuteDisplay("60'", anchor, 'fx-3', soon);
    const b = tickMinuteDisplay("60'", anchor, 'fx-3', muchLater);
    expect(a).toBe(b);
  });

  it('never clamps below an explicitly reported minute past the cap', () => {
    const anchor = 1_000_000;
    const now = anchor; // no elapsed ticking yet
    const display = tickMinuteDisplay("120'", anchor, 'fx-4', now);
    expect(display).toBe('120:00\'');
  });
});

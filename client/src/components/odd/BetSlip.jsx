/**
 * Global bet slip — floating FAB + slide-up sheet ported from the Claude
 * Design Oddsify.html prototype (screens-other.jsx OddBetSlipFAB + OddBetSlip).
 *
 * Consumes both providers:
 *  - SlipProvider     → picks, open/close, totalOdds, placeBet()
 *  - AccountProvider  → balance (shown in the sheet header & MAX stake chip)
 *
 * The sheet is `position: fixed` so it overlays whatever page is mounted.
 * On small screens it slides up from the bottom-nav line; on larger viewports
 * it caps at 88% height and centers in a max-w-md column.
 */
import { useMemo, useState } from 'react';
import { T, fmtCedi } from './tokens.js';
import OddIcon from './Icon.jsx';
import { useSlip } from '../../providers/SlipProvider.jsx';
import { useAccount } from '../../providers/AccountProvider.jsx';

export function OddBetSlipFAB() {
  const { count, open, openSlip } = useSlip();
  if (!count || open) return null;
  return (
    <button onClick={openSlip} type="button" aria-label={`Open bet slip — ${count} selection${count > 1 ? 's' : ''}`}
      style={{
        position: 'fixed', right: 16, bottom: 96, zIndex: 80,
        width: 56, height: 56, borderRadius: 999,
        background: T.greenBright, color: T.goldDark,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 12px 24px -8px rgba(232, 185, 74, 0.6), 0 6px 12px rgba(0,0,0,0.25)',
        border: `2px solid ${T.goldDark}`, cursor: 'pointer',
      }}>
      <OddIcon name="ticket" size={20} color={T.goldDark} strokeWidth={2.2} />
      <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.4, marginTop: -2 }}>SLIP</span>
      <span style={{
        position: 'absolute', top: -4, right: -4,
        minWidth: 22, height: 22, borderRadius: 999,
        background: T.goldDark, color: T.greenBright,
        fontSize: 11, fontWeight: 800,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        border: `2px solid ${T.bg}`,
      }}>{count}</span>
    </button>
  );
}

export function OddBetSlip() {
  const { picks, open, count, totalOdds, busy, removePick, clearSlip, closeSlip, openSlip, placeBet } = useSlip();
  const { account } = useAccount();
  const balance = account?.balance ?? 0;
  const entries = Object.values(picks);
  const [stake, setStake] = useState(1000);
  const [acceptChanges, setAcceptChanges] = useState(true);
  const potentialWin = useMemo(() => (Number(stake) || 0) * totalOdds, [stake, totalOdds]);

  if (!count && !open) return null;

  return (
    <>
      {/* scrim — only covers the page, not the bottom nav */}
      {open && (
        <div onClick={closeSlip} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          zIndex: 88, transition: 'opacity 200ms',
        }} aria-hidden="true" />
      )}

      <div role="dialog" aria-label="Bet slip"
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0,
          background: T.surface, color: T.ink,
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          zIndex: 91, transition: 'transform 280ms cubic-bezier(0.32, 0.72, 0, 1)',
          transform: open ? 'translateY(0)' : 'translateY(calc(100% - 56px))',
          boxShadow: '0 -16px 40px -10px rgba(0,0,0,0.25)',
          maxHeight: '88vh', display: 'flex', flexDirection: 'column',
          width: '100%', maxWidth: 560, margin: '0 auto',
        }}>
        {/* condensed bar / drag handle */}
        <button onClick={() => (open ? closeSlip() : openSlip())} type="button" style={{
          padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', width: '100%', background: 'transparent', border: 0, color: 'inherit',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
            <div style={{ width: 36, height: 4, borderRadius: 999, background: T.lineStrong, alignSelf: 'center' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.3 }}>Betslip</span>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                background: T.greenSoft, color: T.greenBright,
              }}>{count}</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: T.inkSoft, fontWeight: 600 }}>Balance</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.ink, fontVariantNumeric: 'tabular-nums' }}>
              GHS {fmtCedi(balance)}
            </span>
            <OddIcon name={open ? 'chevD' : 'chevU'} size={16} color={T.inkSoft} />
          </div>
        </button>

        {open && (
          <>
            {/* action bar */}
            <div style={{
              padding: '0 16px 12px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <button type="button" style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '6px 10px', borderRadius: 8,
                background: T.surfaceAlt, fontSize: 12, fontWeight: 600,
                border: 0, color: T.ink, cursor: 'pointer',
              }}>Standard mode <OddIcon name="chevD" size={12} /></button>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={clearSlip} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '6px 10px', borderRadius: 8,
                  border: `1px solid ${T.line}`, fontSize: 11,
                  color: T.inkSoft, fontWeight: 600, background: 'transparent', cursor: 'pointer',
                }}>
                  <OddIcon name="trash" size={12} /> Remove all
                </button>
              </div>
            </div>

            {/* accept odds changes */}
            <div style={{
              margin: '0 16px 8px', padding: '10px 12px', borderRadius: 12,
              background: T.surfaceAlt,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: T.ink }}>Accept odds changes</span>
              <button type="button" onClick={() => setAcceptChanges(a => !a)}
                aria-label="Toggle accept odds changes"
                aria-pressed={acceptChanges}
                style={{
                  width: 38, height: 22, borderRadius: 999, position: 'relative',
                  background: acceptChanges ? T.greenBright : T.lineStrong,
                  transition: 'background 150ms', border: 0, cursor: 'pointer',
                }}>
                <span style={{
                  position: 'absolute', top: 2, left: acceptChanges ? 18 : 2,
                  width: 18, height: 18, borderRadius: 999, background: '#fff',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)', transition: 'left 150ms',
                }} />
              </button>
            </div>

            {/* picks list */}
            <div className="odd-pane" style={{ overflowY: 'auto', flex: 1, padding: '0 16px' }}>
              {entries.length === 0 ? (
                <div style={{ padding: '36px 16px', textAlign: 'center' }}>
                  <div style={{
                    width: 60, height: 60, borderRadius: 999, background: T.surfaceAlt,
                    margin: '0 auto 12px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <OddIcon name="ticket" size={26} color={T.inkDim} />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>Your slip is empty</div>
                  <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 4 }}>
                    Tap any odds to add selections.
                  </div>
                </div>
              ) : entries.map(e => (
                <div key={e.match.id} style={{
                  padding: '12px 0', borderBottom: `1px solid ${T.line}`,
                }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'flex-start', gap: 8,
                  }}>
                    <button type="button" onClick={() => removePick(e.match.id)}
                      aria-label={`Remove ${e.match.home} vs ${e.match.away}`}
                      style={{
                        marginTop: 2, color: T.inkDim,
                        background: 'transparent', border: 0, cursor: 'pointer',
                      }}>
                      <OddIcon name="x" size={14} color={T.inkDim} />
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4,
                      }}>
                        <span style={{
                          fontSize: 14, fontWeight: 700,
                          color: e.match.isLive ? T.danger : T.ink,
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {e.match.isLive ? `${e.match.scoreH ?? 0}-${e.match.scoreA ?? 0} ` : ''}
                          {Number(e.val).toFixed(2)}
                        </span>
                        <span style={{
                          marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: T.inkSoft,
                        }}>Single</span>
                      </div>
                      <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 2 }}>
                        {e.key === '1' ? `${e.match.home} to win`
                          : e.key === '2' ? `${e.match.away} to win`
                          : 'Draw'}
                      </div>
                      <div style={{ fontSize: 11, color: T.inkDim, letterSpacing: -0.1 }}>
                        {e.match.home} vs {e.match.away}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* stake + totals + place */}
            {entries.length > 0 && (
              <div style={{ borderTop: `1px solid ${T.line}`, background: T.surface }}>
                <div style={{
                  padding: '14px 16px 0',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div>
                    <div style={{
                      fontSize: 10, fontWeight: 700, color: T.inkSoft, letterSpacing: 0.6,
                    }}>
                      {entries.length === 1 ? 'SINGLES' : 'MULTIPLE'} · {entries.length}X
                    </div>
                    <div style={{
                      fontSize: 18, fontWeight: 700, color: T.ink,
                      fontVariantNumeric: 'tabular-nums',
                    }}>{totalOdds.toFixed(2)}</div>
                  </div>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    background: T.surfaceAlt, borderRadius: 12, padding: 4,
                  }}>
                    <button type="button" onClick={() => setStake(s => Math.max(10, s - 100))} style={{
                      width: 28, height: 28, borderRadius: 8, background: T.surface,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      border: 0, color: T.ink, cursor: 'pointer',
                    }} aria-label="Decrease stake"><OddIcon name="minus" size={14} /></button>
                    <input value={stake}
                      onChange={(e) => setStake(Number(e.target.value.replace(/[^\d]/g, '')) || 0)}
                      aria-label="Stake amount"
                      style={{
                        width: 80, textAlign: 'center', background: 'transparent',
                        border: 0, fontSize: 15, fontWeight: 700, color: T.ink,
                        outline: 'none', fontVariantNumeric: 'tabular-nums',
                      }} />
                    <button type="button" onClick={() => setStake(s => s + 100)} style={{
                      width: 28, height: 28, borderRadius: 8, background: T.surface,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      border: 0, color: T.ink, cursor: 'pointer',
                    }} aria-label="Increase stake"><OddIcon name="plus" size={14} /></button>
                  </div>
                </div>

                {/* quick stake chips */}
                <div style={{ display: 'flex', gap: 6, padding: '8px 16px 4px' }}>
                  {[50, 100, 500, 1000, 'MAX'].map((v, i) => (
                    <button key={i} type="button"
                      onClick={() => setStake(v === 'MAX' ? Math.floor(balance) : v)}
                      style={{
                        flex: 1, padding: '6px 0', borderRadius: 8,
                        background: T.surfaceAlt, color: T.ink,
                        fontSize: 11, fontWeight: 700, border: 0, cursor: 'pointer',
                      }}>{v === 'MAX' ? 'MAX' : `+${v}`}</button>
                  ))}
                </div>

                <div style={{
                  padding: '8px 16px 0',
                  display: 'flex', justifyContent: 'space-between', fontSize: 12,
                }}>
                  <span style={{ color: T.inkSoft, fontWeight: 600 }}>To Return</span>
                  <span style={{
                    fontWeight: 700, color: T.ink, fontVariantNumeric: 'tabular-nums',
                  }}>GHS {fmtCedi(potentialWin)}</span>
                </div>

                <div style={{ display: 'flex', gap: 8, padding: '12px 16px 16px' }}>
                  <button type="button" disabled={busy}
                    onClick={() => placeBet({ stake, acceptOddsChanges: acceptChanges })}
                    style={{
                      flex: 1, padding: '14px 0', borderRadius: 14,
                      background: T.greenBright, color: T.goldDark,
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      fontWeight: 800, border: 0,
                      cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
                    }}>
                    <span style={{ fontSize: 13, fontWeight: 800 }}>
                      {busy ? 'Placing…' : 'Place Bet'}
                    </span>
                    <span style={{
                      fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                    }}>GHS {fmtCedi(potentialWin)}</span>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

/**
 * Oddsify shared primitives — wordmark, odds tile, segmented toggle,
 * status chip, flag badge, page headers, payout marquee, league row,
 * category grid, promo banner, match card.
 *
 * All ported from the Claude Design Oddsify.html prototype (bits.jsx +
 * screens-home.jsx + screens-other.jsx) with original visual rules intact.
 * Inline styles match the source so token churn touches one file.
 */
import { useEffect, useState } from 'react';
import { T, fmtCedi } from './tokens.js';
import OddIcon from './Icon.jsx';

/* ─── Oddsify wordmark ─────────────────────────────────────── */
export function OddsifyWordmark({ size = 22, color = '#ffffff', accent = T.greenBright }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 0,
      fontFamily: '"Space Grotesk", system-ui, sans-serif',
      fontWeight: 700, fontSize: size, letterSpacing: -0.6,
      color, lineHeight: 1,
    }}>
      <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'baseline' }}>
        <span style={{ color: accent }}>O</span>
        <span>ddsify</span>
        <span style={{
          position: 'absolute', right: -2, bottom: -2,
          width: 5, height: 5, borderRadius: 999, background: accent,
        }} />
      </span>
    </div>
  );
}

/* ─── Odds tile — the 1/X/2 button you tap to add to slip ─── */
export function OddsTile({ label, value, locked = false, selected = false, onClick, accent = T.greenBright }) {
  const bg = selected ? accent : '#080808';
  const fg = selected ? T.goldDark : (locked ? 'rgba(255,255,255,0.35)' : '#fff');
  return (
    <button onClick={onClick} disabled={locked} type="button"
      style={{
        flex: 1, minWidth: 0, height: 52,
        background: bg, borderRadius: 10, padding: '6px 8px',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
        gap: 2, cursor: locked ? 'not-allowed' : 'pointer',
        border: selected ? `1px solid ${accent}` : '1px solid rgba(255,255,255,0.06)',
        transition: 'transform 80ms ease, background 120ms ease',
      }}>
      <span style={{
        fontSize: 10, letterSpacing: 0.6,
        color: locked ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.55)',
        textTransform: 'uppercase',
      }}>{label}</span>
      {locked
        ? <OddIcon name="lock" size={14} color="rgba(255,255,255,0.35)" />
        : <span style={{ fontSize: 15, fontWeight: 700, color: fg, fontVariantNumeric: 'tabular-nums' }}>{value}</span>}
    </button>
  );
}

/* ─── Segmented (pill) toggle ──────────────────────────────── */
export function OddSegmented({ options, value, onChange, accent = T.greenBright, full = false }) {
  return (
    <div style={{
      display: 'flex', gap: 4, padding: 4,
      background: T.surfaceAlt,
      borderRadius: 12, width: full ? '100%' : 'fit-content',
      border: `1px solid ${T.line}`,
    }}>
      {options.map(opt => {
        const isActive = opt.value === value;
        return (
          <button key={opt.value} onClick={() => onChange(opt.value)} type="button"
            style={{
              flex: full ? 1 : undefined,
              padding: '9px 18px', borderRadius: 9,
              background: isActive ? accent : 'transparent',
              color: isActive ? T.goldDark : T.ink,
              fontWeight: 600, fontSize: 13, letterSpacing: -0.1,
              transition: 'background 150ms ease',
              whiteSpace: 'nowrap', border: 0, cursor: 'pointer',
            }}>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Status chip (pill with optional dot) ─────────────────── */
export function OddStatusChip({ kind, label }) {
  const map = {
    pending:  { bg: 'rgba(240, 160, 64, 0.18)', fg: '#f0a040', dot: '#f0a040' },
    rejected: { bg: 'rgba(255, 91, 120, 0.16)', fg: '#ff8095', dot: '#ff5b78' },
    won:      { bg: 'rgba(232, 185, 74, 0.18)', fg: '#f7c948', dot: '#e8b94a' },
    live:     { bg: 'rgba(255, 91, 120, 0.16)', fg: '#ff8095', dot: '#ff5b78' },
    open:     { bg: '#e8b94a', fg: '#1a1300', dot: null },
    soon:     { bg: 'rgba(247, 201, 72, 0.18)', fg: '#f7c948', dot: '#f7c948' },
    lost:     { bg: 'rgba(255, 91, 120, 0.16)', fg: '#ff8095', dot: '#ff5b78' },
    cashed_out: { bg: 'rgba(247, 201, 72, 0.18)', fg: '#f7c948', dot: '#f7c948' },
    void:     { bg: T.surfaceAlt, fg: T.inkSoft, dot: T.inkDim },
  };
  const c = map[kind] || map.pending;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 8px 3px 7px', borderRadius: 6,
      background: c.bg, color: c.fg,
      fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8,
      textTransform: 'uppercase',
    }}>
      {c.dot && (
        <span style={{
          width: 6, height: 6, borderRadius: 999, background: c.dot,
          boxShadow: kind === 'live' ? `0 0 0 3px ${c.dot}33` : undefined,
        }} />
      )}
      {label || kind}
    </span>
  );
}

/* ─── Flag badge — round chip with league code initials ────── */
export function FlagBadge({ code, color, size = 40 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 999,
      background: color || '#1a1814',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 700, fontSize: Math.round(size * 0.30), letterSpacing: 0.3,
      border: '1.5px solid rgba(232, 185, 74, 0.25)',
      boxShadow: '0 0 0 1px rgba(0,0,0,0.4) inset',
      flexShrink: 0,
    }}>{code}</div>
  );
}

/* ─── Page header used by non-Home screens (Sports/Bets/etc) ─ */
export function OddPageHeader({ title, subtitle, right }) {
  return (
    <div style={{
      background: T.greenDeep, color: '#fff',
      padding: '58px 16px 22px',
      borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 22, fontWeight: 700, letterSpacing: -0.4,
            fontFamily: '"Space Grotesk", system-ui, sans-serif',
          }}>
            {title}
            <span style={{
              width: 6, height: 6, borderRadius: 999, background: T.greenBright,
              marginLeft: 2, marginBottom: -2,
            }} />
          </div>
          {subtitle && (
            <div style={{
              fontSize: 11, opacity: 0.6, marginTop: 2,
              letterSpacing: 0.6, textTransform: 'uppercase',
            }}>{subtitle}</div>
          )}
        </div>
        {right}
      </div>
    </div>
  );
}

/* ─── Home top header — wordmark + balance pill ────────────── */
export function OddTopHeader({ user, onAuth, onSearch, onBalanceClick }) {
  return (
    <div style={{
      background: T.greenDeep,
      padding: '58px 16px 14px',
      position: 'sticky', top: 0, zIndex: 30,
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <OddsifyWordmark size={22} accent={T.greenBright} />
        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={onSearch} type="button" style={{
              width: 36, height: 36, borderRadius: 999,
              background: 'rgba(255,255,255,0.08)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              border: 0, cursor: 'pointer',
            }} aria-label="Search">
              <OddIcon name="search" size={18} color="#fff" />
            </button>
            <button type="button" onClick={onBalanceClick} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '7px 12px 7px 10px', borderRadius: 999,
              background: T.greenBright, color: T.goldDark,
              fontWeight: 700, fontSize: 13, border: 0, cursor: 'pointer',
              fontVariantNumeric: 'tabular-nums',
            }} aria-label="Open wallet">
              <OddIcon name="coin" size={16} color={T.goldDark} />
              GHS {fmtCedi(user.balance)}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => onAuth?.('signup')} type="button" style={{
              padding: '8px 18px', borderRadius: 999,
              background: '#fff', color: T.greenDeep,
              fontWeight: 700, fontSize: 13, border: 0, cursor: 'pointer',
            }}>Join Now</button>
            <button onClick={() => onAuth?.('login')} type="button" style={{
              padding: '8px 18px', borderRadius: 999,
              background: 'transparent', color: '#fff',
              fontWeight: 600, fontSize: 13,
              border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer',
            }}>Log in</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Payout marquee — auto-scrolling ticker of recent payouts ─ */
const TICKER_ITEMS = [
  'Kwame J. withdrew GHS 4,820',
  'Ama O. won GHS 12,500 on a 6-fold',
  'Yaw M. cashed out GHS 920',
  'Esi A. withdrew GHS 8,400',
  'Kojo D. won GHS 32,090',
];
export function OddPayoutTicker({ items = TICKER_ITEMS }) {
  return (
    <div style={{
      background: T.greenMid, color: '#dff3e3',
      padding: '8px 0', overflow: 'hidden',
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      fontSize: 11, letterSpacing: 0.3,
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{
        display: 'flex', gap: 48, whiteSpace: 'nowrap',
        animation: 'odd-marquee 40s linear infinite', paddingLeft: '100%',
      }}>
        {[...items, ...items].map((s, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: T.greenBright }} />
            <span style={{ opacity: 0.7 }}>FAST PAYOUTS</span>
            <span style={{ color: '#fff' }}>{s}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── Promo banner carousel ───────────────────────────────── */
const DEFAULT_BANNERS = [
  {
    id: 'bn1', tag: 'NEW USERS',
    title: 'Instant MoMo\nDeposits & Withdrawals',
    body: 'Topup any wallet with MTN, Telecel, Vodafone or AirtelTigo in seconds.',
    cta: 'Get bonus', tint: '#0a0a0a', accent: '#e8b94a', glyph: 'wallet',
  },
  {
    id: 'bn2', tag: 'FAST PAYOUTS',
    title: 'GHS 50,000\nMatch on first bet',
    body: '100% bonus up to GHS 50,000 when you stake your first slip this week.',
    cta: 'Learn more', tint: '#1a1306', accent: '#f7c948', glyph: 'fire',
  },
  {
    id: 'bn3', tag: 'JACKPOT',
    title: 'Win GHS 1.2M\non this weekend’s 12-leg slip',
    body: 'Pick winners across 12 European leagues. Entries close Sat 14:00.',
    cta: 'Enter now', tint: '#0d0c08', accent: '#d4a857', glyph: 'trophy',
  },
];
export function OddPromoBanner({ items = DEFAULT_BANNERS, onAction }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % items.length), 5500);
    return () => clearInterval(t);
  }, [items.length]);

  const b = items[idx];
  return (
    <div style={{ padding: '14px 16px 6px' }}>
      <div style={{
        position: 'relative', overflow: 'hidden',
        background: `linear-gradient(135deg, ${b.tint} 0%, ${b.tint} 60%, ${b.accent}22 100%)`,
        borderRadius: 18, padding: '18px 20px',
        color: '#fff', minHeight: 154,
      }}>
        {/* grid overlay */}
        <svg style={{ position: 'absolute', inset: 0, opacity: 0.12, pointerEvents: 'none' }}
          width="100%" height="100%">
          <defs>
            <pattern id={`grid-${b.id}`} width="22" height="22" patternUnits="userSpaceOnUse">
              <path d="M 22 0 L 0 0 0 22" fill="none" stroke={b.accent} strokeWidth="0.6"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#grid-${b.id})`} />
        </svg>

        {/* decorative glyph */}
        <div style={{
          position: 'absolute', right: -14, bottom: -14,
          width: 130, height: 130, borderRadius: 999,
          background: `${b.accent}22`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 76, height: 76, borderRadius: 999, background: b.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transform: 'rotate(-8deg)',
          }}>
            <OddIcon name={b.glyph} size={36} color={b.tint} strokeWidth={2.2} />
          </div>
        </div>

        <div style={{ position: 'relative', maxWidth: '70%' }}>
          <span style={{
            display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
            color: b.accent, padding: '4px 8px', borderRadius: 4,
            background: `${b.accent}22`, marginBottom: 12,
          }}>{b.tag}</span>
          <div style={{
            fontSize: 22, fontWeight: 700, lineHeight: 1.15,
            whiteSpace: 'pre-line', letterSpacing: -0.4,
            fontFamily: '"Space Grotesk", system-ui, sans-serif',
          }}>{b.title}</div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6, lineHeight: 1.4 }}>
            {b.body}
          </div>
          <button type="button" onClick={onAction} style={{
            marginTop: 12, padding: '8px 14px', borderRadius: 999,
            background: b.accent, color: b.tint,
            fontWeight: 700, fontSize: 12, border: 0, cursor: 'pointer',
          }}>{b.cta} →</button>
        </div>
      </div>

      {/* dot indicator */}
      <div style={{ display: 'flex', gap: 5, justifyContent: 'center', marginTop: 10 }}>
        {items.map((_, i) => (
          <div key={i} style={{
            width: i === idx ? 18 : 6, height: 6, borderRadius: 999,
            background: i === idx ? T.greenBright : T.lineStrong,
            transition: 'width 250ms ease',
          }} />
        ))}
      </div>
    </div>
  );
}

/* ─── Category quick-grid (Upcoming / Live / Casino / Jackpot) ─ */
const DEFAULT_CATEGORIES = [
  { id: 'upc',    label: 'Upcoming', icon: 'soccer',  tint: '#e8b94a', to: '/' },
  { id: 'live',   label: 'Live',     icon: 'bolt',    tint: '#ff5b78', to: '/sports' },
  { id: 'casino', label: 'Casino',   icon: 'cards',   tint: '#f7c948', to: '/casino' },
  { id: 'jack',   label: 'Jackpot',  icon: 'trophy',  tint: '#c9a3ff', to: '/jackpot' },
];
export function OddCategoryGrid({ items = DEFAULT_CATEGORIES, onPick, liveCount }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 8, padding: '4px 16px 12px',
    }}>
      {items.map(c => {
        const count = c.id === 'live' ? liveCount : c.count;
        return (
          <button key={c.id} type="button" onClick={() => onPick?.(c)} style={{
            background: T.surface, borderRadius: 14, padding: '12px 4px 10px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            border: `1px solid ${T.line}`, position: 'relative', cursor: 'pointer',
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 12, background: `${c.tint}1f`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: c.tint,
            }}>
              <OddIcon name={c.icon} size={20} color={c.tint} strokeWidth={2} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.ink }}>{c.label}</span>
            {count !== undefined && count !== null && (
              <span style={{
                position: 'absolute', top: 8, right: 8,
                fontSize: 9, fontWeight: 700,
                padding: '2px 6px', borderRadius: 999,
                background: c.tint, color: '#fff',
              }}>{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Top-leagues horizontal scroller ──────────────────────── */
const DEFAULT_LEAGUES = [
  { id: 'eng', name: 'England · Premier', short: 'England', code: 'EPL', color: '#3d195b', live: 7 },
  { id: 'esp', name: 'Spain · La Liga',   short: 'Spain',   code: 'LIG', color: '#c8102e', live: 4 },
  { id: 'ita', name: 'Italy · Serie A',   short: 'Italy',   code: 'ITA', color: '#0b6623', live: 3 },
  { id: 'ger', name: 'Germany · Bundesliga', short: 'Germany', code: 'BUN', color: '#1c1c1c', live: 5 },
  { id: 'fra', name: 'France · Ligue 1',  short: 'France',  code: 'FRA', color: '#0055a4', live: 2 },
  { id: 'por', name: 'Portugal · Primeira', short: 'Portugal', code: 'POR', color: '#006a44', live: 6 },
];
export function OddLeagueRow({ leagues = DEFAULT_LEAGUES, onPick, onSeeAll }) {
  return (
    <div style={{ padding: '0 16px 12px' }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <h3 style={{
          fontSize: 15, fontWeight: 700, color: T.ink, letterSpacing: -0.2,
          fontFamily: '"Space Grotesk", system-ui, sans-serif',
        }}>Top leagues</h3>
        <button onClick={onSeeAll} type="button" style={{
          fontSize: 11, color: T.greenBright, fontWeight: 600,
          background: 'transparent', border: 0, cursor: 'pointer',
        }}>See all →</button>
      </div>
      <div className="odd-pane" style={{
        display: 'flex', gap: 10, overflowX: 'auto',
        paddingBottom: 4, marginLeft: -2, paddingLeft: 2,
      }}>
        {leagues.map(l => (
          <button key={l.id} type="button" onClick={() => onPick?.(l)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '8px 12px 8px 8px', borderRadius: 999,
            background: T.surface, border: `1px solid ${T.line}`,
            whiteSpace: 'nowrap', flexShrink: 0, cursor: 'pointer',
          }}>
            <FlagBadge code={l.code} color={l.color} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: T.ink, letterSpacing: -0.1 }}>
                {l.short}
              </span>
              <span style={{ fontSize: 10, color: T.inkSoft }}>{l.live} live</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Match card with 1/X/2 odds tiles ─────────────────────── */
export function OddMatchCard({ match, picks, onPick, onMore }) {
  const live = match.isLive;
  const pickedKey = picks?.[match.id]?.key;
  const odds = match.odds || {};
  const oddsEntries = Object.entries(odds);
  const leagueCode = match.league || match.leagueCode || match.leagueName?.split(' · ')[0] || '—';

  return (
    <div style={{
      background: T.greenDeep, borderRadius: 16,
      padding: '12px 14px 12px', color: '#fff',
      border: '1px solid rgba(255,255,255,0.05)',
      boxShadow: '0 8px 24px -16px rgba(0,0,0,0.4)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 1,
            color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase',
          }}>{leagueCode}</span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>·</span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>
            {(match.sport || 'SOCCER').toUpperCase()}
          </span>
        </div>
        {live
          ? <OddStatusChip kind="live" label={`LIVE ${match.minute || ''}`.trim()} />
          : <span style={{
              fontSize: 11, color: 'rgba(255,255,255,0.55)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {match.day || ''}{match.day && match.time ? ' · ' : ''}{match.time || match.kickoff || ''}
            </span>
        }
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {[['home', match.scoreH], ['away', match.scoreA]].map(([side, score], i) => {
          const name = side === 'home' ? match.home : match.away;
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: 999,
                  background: i === 0 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, fontWeight: 700,
                }}>{(name || '?').charAt(0)}</div>
                <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.1 }}>{name}</span>
              </div>
              {live && score !== undefined && score !== null && (
                <span style={{
                  fontSize: 16, fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums', color: '#fff',
                }}>{score}</span>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        {oddsEntries.length > 0 ? oddsEntries.map(([key, value]) => (
          <OddsTile key={key}
            label={key === 'X' ? 'DRAW' : key === '1' ? 'HOME' : 'AWAY'}
            value={Number(value).toFixed(2)}
            selected={pickedKey === key}
            onClick={() => onPick?.(match, key, Number(value))} />
        )) : (
          <div style={{
            flex: 1, padding: '14px 10px', borderRadius: 10,
            background: 'rgba(255,255,255,0.04)', textAlign: 'center',
            fontSize: 11, color: 'rgba(255,255,255,0.5)',
          }}>Markets opening soon</div>
        )}
      </div>

      <button type="button" onClick={onMore} style={{
        marginTop: 10, width: '100%', padding: '7px 0', borderRadius: 8,
        background: 'rgba(255,255,255,0.05)',
        fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.7)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        border: 0, cursor: 'pointer',
      }}>
        More markets <OddIcon name="chevR" size={12} color="rgba(255,255,255,0.7)" />
        {match.marketCount && (
          <span style={{ marginLeft: 4, fontSize: 10, color: T.greenBright }}>
            +{match.marketCount}
          </span>
        )}
      </button>
    </div>
  );
}

/* ─── Re-export for one-liner imports from pages ──────────── */
export { T, fmtCedi, OddIcon };

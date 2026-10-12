import { marketName } from '../lib/betslipEngine.js';

/* ---------------------------------------------------------------------------
   Shared presentational atoms for the four Stitch ports.
   Pure markup + token classes from styles/stitch.css — no data fetching.
   ------------------------------------------------------------------------- */

export function Ic({ name, size }) {
  const cls = size === 'lg' ? 'stx-ic stx-ic--lg' : size === 'sm' ? 'stx-ic stx-ic--sm' : 'stx-ic';
  return <span className={cls} aria-hidden="true">{name}</span>;
}

export function Crest({ league, size = 26 }) {
  const c = league?.crest;
  return (
    <span
      className="stx-league-crest"
      style={{ width: size, height: size, background: c?.style || 'var(--stx-sc-high)' }}
    >
      {c?.label || league?.short?.slice(0, 3) || '—'}
    </span>
  );
}

export function TeamCrest({ name, side }) {
  const initials = String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0].toUpperCase())
    .join('');
  return (
    <span
      className="stx-tico"
      style={side === 'away' ? { color: 'var(--stx-secondary)' } : undefined}
    >
      {initials}
    </span>
  );
}

export function LiveMinute({ minute }) {
  if (minute == null || minute === '') return null;
  return (
    <span className="stx-minute">
      <span className="stx-live-dot" />
      {minute}&apos;
    </span>
  );
}

export function TeamLine({ name, side, tag, form }) {
  return (
    <>
      <div className="stx-team">
        <TeamCrest name={name} side={side} />
        <span>{name}</span>
      </div>
      {(tag || form) && (
        <div className="stx-tagrow">
          {tag && <span className="stx-tag stx-tag--gold">{tag}</span>}
          {form && <span className="stx-tag">FORM {form}</span>}
        </div>
      )}
    </>
  );
}

/* --- odds tile ------------------------------------------------------------
   DESIGN.md: label in muted slate, value in JetBrains Mono, selected state
   fills with neon mint. `trend` draws the lengthening/shortening triangle. */
export function OddsTile({ label, odds, selected, onSelect, disabled, trend, title }) {
  return (
    <button
      type="button"
      className={[
        'stx-odd',
        selected ? 'stx-odd--on' : '',
        disabled ? 'stx-odd--stale' : '',
      ].filter(Boolean).join(' ')}
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={!!selected}
      title={title || `${label} @ ${odds?.toFixed(2)}`}
    >
      {trend && (
        <span className={`stx-odd-trend stx-odd-trend--${trend}`} aria-hidden="true">
          {trend === 'up' ? '▲' : '▼'}
        </span>
      )}
      <span className="stx-odd-k">{label}</span>
      <span className="stx-odd-v">{Number.isFinite(odds) ? odds.toFixed(2) : '—'}</span>
    </button>
  );
}

/** Row of OddsTiles for one market of a match. */
export function MarketOdds({ market, match, selections, onToggle, columns }) {
  const mkt = match.markets?.[market];
  if (!mkt?.selections?.length) return null;

  const colClass = columns === 2 ? 'stx-odds--2'
    : columns === 4 ? 'stx-odds--4'
      : 'stx-odds--3';

  return (
    <div className={`stx-odds ${colClass}`}>
      {mkt.selections.map((s) => {
        const picked = selections.some(
          (x) => x.matchId === match.id && x.market === market && x.outcome === s.key,
        );
        return (
          <OddsTile
            key={s.key}
            label={s.key}
            odds={s.odds}
            selected={picked}
            disabled={s.suspended}
            title={`${marketName(market)} — ${s.label || s.key} @ ${s.odds?.toFixed(2)}`}
            onSelect={() => onToggle?.(match, market, s.key, s.odds)}
          />
        );
      })}
    </div>
  );
}

export function SportPill({ item, active, onClick }) {
  return (
    <button
      type="button"
      className={`stx-sportpill${active ? ' stx-sportpill--on' : ''}`}
      onClick={onClick}
      aria-pressed={!!active}
    >
      <span aria-hidden="true">{item.icon}</span>
      {item.label}
      <b>{item.count}</b>
    </button>
  );
}

export function MarketChip({ item, active, onClick, live }) {
  return (
    <button
      type="button"
      className={`stx-chip${active ? ' stx-chip--on' : ''}${live ? ' stx-chip--live' : ''}`}
      onClick={onClick}
      aria-pressed={!!active}
    >
      {live && <span className="stx-live-dot" />}
      {item.label}
    </button>
  );
}

export function LeagueBlock({ league, marketTab, onMarketTab, renderMatch }) {
  return (
    <section className="stx-league">
      <header className="stx-league-head">
        <Crest league={league} />
        <div style={{ minWidth: 0 }}>
          <div className="stx-league-name">{league.name}</div>
          <div className="stx-league-meta">
            {league.country} — {league.meta}
          </div>
        </div>
        <div className="stx-right">
          <span className="stx-league-meta">{league.matches.length} EVENTS</span>
          <Ic name="›" />
        </div>
      </header>

      {onMarketTab && (
        <nav className="stx-mtabs">
          {marketTab.tabs.map((t) => (
            <button
              key={t}
              type="button"
              className={`stx-mtab${t === marketTab.active ? ' stx-mtab--on' : ''}`}
              onClick={() => onMarketTab.set(t)}
            >
              {t}
            </button>
          ))}
        </nav>
      )}

      {league.matches.map((m) => renderMatch(m, marketTab?.active))}
    </section>
  );
}

export function FixtureRow({ match, market, selections, onToggle, columns, tags }) {
  return (
    <article className={`stx-fixture${columns === 1 ? ' stx-fixture--stacked' : ''}`}>
      <div className="stx-when">
        <span className="stx-when-time">{match.kickoff || '—'}</span>
        <span className="stx-when-day">{match.day}</span>
        {tags && <div className="stx-tagrow">{tags}</div>}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="stx-teams">
          <TeamLine name={match.home} side="home" />
          <TeamLine name={match.away} side="away" />
        </div>
        <div style={{ marginTop: 6 }}>
          <MarketOdds
            market={market}
            match={match}
            selections={selections}
            onToggle={onToggle}
            columns={columns}
          />
        </div>
      </div>
    </article>
  );
}

export function LiveMatchCard({ match, league, selections, onToggle, market = '1X2', cashout }) {
  const mkt = match.markets?.[market];
  const sels = mkt?.selections || [];

  return (
    <article className="stx-livecard">
      <div className="stx-livecard-top">
        <Crest league={league} size={20} />
        <span>{league?.short || 'LIVE'}</span>
        <LiveMinute minute={match.minute} />
        <div className="stx-right">
          {cashout && (
            <button type="button" className="stx-textbtn" onClick={cashout}>
              <Ic name="₵" size="sm" /> CASHOUT
            </button>
          )}
          <Ic name="↻" size="sm" />
        </div>
      </div>

      <div className="stx-scorerow">
        <div className="stx-scoreteam">
          <span className="stx-scoreteam-badge">{match.home?.slice(0, 3).toUpperCase()}</span>
          <div style={{ minWidth: 0 }}>
            <div className="stx-scoreteam-name">{match.home}</div>
            <div className="stx-scoreteam-sub">HOME</div>
          </div>
        </div>

        <div className="stx-score">
          <span>{match.scoreHome ?? 0}</span>
          <span className="stx-score-sep">:</span>
          <span>{match.scoreAway ?? 0}</span>
        </div>

        <div className="stx-scoreteam stx-scoreteam--away">
          <span className="stx-scoreteam-badge" style={{ color: 'var(--stx-secondary)' }}>
            {match.away?.slice(0, 3).toUpperCase()}
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="stx-scoreteam-name">{match.away}</div>
            <div className="stx-scoreteam-sub">AWAY</div>
          </div>
        </div>
      </div>

      <div className="stx-odds stx-odds--3">
        {sels.map((s) => {
          const picked = selections.some(
            (x) => x.matchId === match.id && x.market === market && x.outcome === s.key,
          );
          return (
            <OddsTile
              key={s.key}
              label={s.key === 'X' ? 'DRAW' : s.label || s.key}
              odds={s.odds}
              selected={picked}
              disabled={s.suspended}
              onSelect={() => onToggle?.(match, market, s.key, s.odds)}
            />
          );
        })}
      </div>
    </article>
  );
}

export function PromoCard({ eyebrow, title, copy, cta, icon, accent }) {
  const accentStyle = accent ? { borderColor: accent } : undefined;
  return (
    <div className="stx-promo-card" style={accent ? { borderColor: accent } : undefined} data-accent={!!accent}>
      {eyebrow && (
        <span className="stx-promo-eyebrow" style={accent ? { color: accent } : undefined}>{eyebrow}</span>
      )}
      <span className="stx-promo-title">{icon ? `${icon} ` : ''}{title}</span>
      {copy && <span className="stx-promo-copy">{copy}</span>}
      {cta && (
        <button type="button" className="stx-promo-cta">
          {cta} <Ic name="→" size="sm" />
        </button>
      )}
    </div>
  );
}

export function BoostBanner({ title, copy, value, valueLabel }) {
  return (
    <div className="stx-boost">
      <Ic name="◈" size="lg" />
      <div style={{ minWidth: 0 }}>
        <h3>{title}</h3>
        <p>{copy}</p>
      </div>
      <div className="stx-right">
        <div className="stx-boost-num">
          <b>{value}</b>
          <span>{valueLabel}</span>
        </div>
        <Ic name="→" size="lg" />
      </div>
    </div>
  );
}

export function ScreenSwitch({ current, items }) {
  return (
    <nav className="stx-switch" aria-label="Stitch port screens">
      {items.map((i) => (
        <a key={i.to} href={i.to} aria-current={current === i.to ? 'page' : undefined}>
          {i.label}
        </a>
      ))}
    </nav>
  );
}

export const SCREEN_LINKS = [
  { to: '/premium', label: '01 SPORTSBOOK' },
  { to: '/premium/mobile', label: '02 MOBILE' },
  { to: '/premium/live', label: '03 LIVE TRACKER' },
  { to: '/premium/mobile-light', label: '04 MOBILE LIGHT' },
];

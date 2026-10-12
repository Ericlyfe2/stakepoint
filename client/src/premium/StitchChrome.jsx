import { Link } from 'react-router-dom';
import { formatAmt } from '../lib/betslipEngine.js';
import { SPORT_CATEGORIES } from './stitchSeed.js';
import { Ic } from './parts.jsx';

/* ---------------------------------------------------------------------------
   Stitch chrome — desktop top nav + left sports rail.
   Shared by screen 1 (sportsbook) and screen 3 (live tracker).
   ------------------------------------------------------------------------- */

const NAV_LINKS = [
  { to: '/', label: 'Sports', match: '/' },
  { to: '/live', label: 'Live', match: '/live' },
  { to: '/virtuals', label: 'Virtuals' },
  { to: '/jackpot', label: 'Jackpots' },
  { to: '/promos', label: 'Promotions' },
  { to: '/my-bets', label: 'My Bets' },
  { to: '/wallet', label: 'Wallet' },
];

export function StitchTopNav({ slip, current, betCount, search = '', onSearch }) {
  const { account, openDeposit } = slip;

  return (
    <header className="stx-top">
      <Link to="/" className="stx-brand">
        <span className="stx-brand-mark">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" />
          </svg>
        </span>
        BetXentra
      </Link>

      {onSearch && (
        <form className="stx-search" role="search" onSubmit={(e) => e.preventDefault()}>
          <Ic name="⌕" />
          <input
            className="stx-search-input"
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search teams, leagues, markets…"
            aria-label="Search teams, leagues and markets"
          />
        </form>
      )}

      <nav className="stx-navlinks">
        {NAV_LINKS.map((l) => (
          <Link
            key={l.label}
            to={l.to}
            className={`stx-navlink${current === l.match ? ' stx-navlink--on' : ''}`}
          >
            {l.label}
          </Link>
        ))}
      </nav>

      <Link to="/my-bets" className="stx-iconbtn" aria-label="My bets">
        <Ic name="▤" />
      </Link>

      <div className="stx-wallet">
        <Link to="/wallet" className="stx-wallet-amt">GHS {formatAmt(account?.balance || 0)}</Link>
        <button type="button" className="stx-depbtn" onClick={openDeposit}>
          + DEPOSIT
        </button>
      </div>

      <span className="stx-avatar" aria-hidden="true">
        {String(account?.phone || account?.email || 'G').slice(0, 2).toUpperCase()}
      </span>

      {betCount > 0 && <span className="sr-only">{betCount} active selections</span>}
    </header>
  );
}

export function StitchSideRail({ liveCount, activeSport, onSport, mode, onMode }) {
  return (
    <aside className="stx-rail">
      <div className="stx-rail-card">
        <div className="stx-rail-title">
          <Ic name="◈" /> <span>Top Sports</span>
        </div>

        <div className="stx-seg" role="group" aria-label="Sports view">
          <button type="button" aria-pressed={mode === 'live'} onClick={() => onMode?.('live')}>
            <Ic name="◉" size="sm" /> <span>LIVE RADAR</span>
          </button>
          <button type="button" aria-pressed={mode === 'upcoming'} onClick={() => onMode?.('upcoming')}>
            <Ic name="◷" size="sm" /> <span>UPCOMING</span>
          </button>
        </div>

        <nav>
          {SPORT_CATEGORIES.map((s) => (
            <Link
              key={s.id}
              to="/"
              onClick={() => onSport?.(s.id)}
              className={`stx-rail-link${activeSport === s.id ? ' stx-rail-link--on' : ''}`}
              aria-current={activeSport === s.id ? 'page' : undefined}
            >
              <Ic name={s.icon} />
              <span>{s.label}</span>
              {s.id === 'football' && liveCount > 0 && (
                <span className="stx-rail-count">{liveCount}</span>
              )}
            </Link>
          ))}
        </nav>

        <div className="stx-rail-foot">
          <Link to="/my-bets"><Ic name="↺" size="sm" /> <span>Results</span></Link>
          <Link to="/info"><Ic name="◔" size="sm" /> <span>Statistics</span></Link>
          <Link to="/help"><Ic name="✆" size="sm" /> <span>Live Chat</span></Link>
        </div>
      </div>
    </aside>
  );
}

export function StitchFooter({ current }) {
  return (
    <footer className="stx-foot">
      <Link to="/" className="stx-brand" style={{ marginBottom: 4 }}>
        <span className="stx-brand-mark">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" />
          </svg>
        </span>
        BetXentra
      </Link>

      <nav className="stx-foot-links">
        <Link to="/info">Terms of Service</Link>
        <Link to="/info#responsible-gaming">Responsible Gaming</Link>
        <Link to="/info#privacy">Privacy Policy</Link>
        <Link to="/help">MoMo Deposit Guide</Link>
        <Link to="/info#affiliates">Affiliates</Link>
        <Link to="/help">Help Center</Link>
      </nav>

      <small>© {new Date().getFullYear()} BetXentra Ltd. Licensed and regulated by the Gaming Commission of Ghana. 18+ Play Responsibly.</small>

      <div className="stx-pay">
        <span>MTN MoMo</span>
        <span>Telecel Cash</span>
        <span>AirtelTigo</span>
        <span>Instant Bank Pay</span>
        <span>VISA</span>
      </div>

    </footer>
  );
}

import { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAccount } from '../providers/AccountProvider.jsx';
import { useTheme } from '../providers/ThemeProvider.jsx';
import { fetchMatches } from '../api/betApi.js';
import NotificationBell from '../components/NotificationBell.jsx';
export { useAccount, useToast } from '../providers/AccountProvider.jsx';

function formatAmt(n) {
  return Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';
  return (
    <button
      type="button"
      className="btn btn-ghost theme-toggle"
      onClick={toggleTheme}
      aria-label={`Switch to ${isLight ? 'dark' : 'light'} mode`}
      title={`Switch to ${isLight ? 'dark' : 'light'} mode`}
    >
      {isLight ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      )}
    </button>
  );
}

function MobileHeader({ account, onSignIn, onSignUp, onAvatar, onSearch, onBalanceClick }) {
  const authed = !!account;
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';
  return (
    <div className="sb-mobile-header">
      <NavLink to="/" className="sb-logo" end>
        Xen<em>bet</em>
      </NavLink>

      <button type="button" className="sb-search-btn" aria-label="Search" onClick={onSearch}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
      </button>

      {authed && <NotificationBell />}

      <button
        type="button"
        className="sb-theme-btn"
        onClick={toggleTheme}
        aria-label={`Switch to ${isLight ? 'dark' : 'light'} mode`}
        title={`Switch to ${isLight ? 'dark' : 'light'} mode`}
      >
        {isLight ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9 6.3 6.3M17.7 17.7l1.4 1.4M4.9 19.1 6.3 17.7M17.7 6.3l1.4-1.4" />
          </svg>
        )}
      </button>

      {authed ? (
        <>
          <button
            type="button"
            className="sb-balance-chip"
            onClick={onBalanceClick}
            style={{ cursor: 'pointer', background: 'var(--surface)', border: '1px solid var(--surface-2)', font: 'inherit' }}
          >
            <span style={{ color: 'var(--text-dim)' }}>GHS</span>
            <b>{formatAmt(account.balance)}</b>
          </button>
          <button type="button" className="sb-avatar" onClick={onAvatar} aria-label="Account">
            {(account.displayName || account.email || '?').charAt(0).toUpperCase()}
          </button>
        </>
      ) : (
        <>
          <button type="button" className="sb-cta-join"  onClick={onSignUp}>Join Now</button>
          <button type="button" className="sb-cta-login" onClick={onSignIn}>Log in</button>
        </>
      )}
    </div>
  );
}

/* ─── Feature Promo Icons (SportyBet-style) ─── */
function FeaturePromos() {
  const promos = [
    { label: 'Lucky Numbers', emoji: '🎰', bg: 'linear-gradient(135deg,#6c2dc7,#9f5de2)', to: '/casino' },
    { label: 'Daily Rains', emoji: '🌧️', bg: 'linear-gradient(135deg,#1a7a4c,#27ae60)', to: '/promos' },
    { label: 'Instant Win', emoji: '⚡', bg: 'linear-gradient(135deg,#c87f00,#f5a623)', to: '/casino' },
    { label: 'JACKPOT', emoji: '💰', bg: 'linear-gradient(135deg,#c5993d,#ffd700)', to: '/jackpot' },
    { label: 'AutoBet', emoji: '🤖', bg: 'linear-gradient(135deg,#2a5298,#4a90d9)', to: '/' },
  ];

  return (
    <div className="sb-feature-promos">
      {promos.map((p) => (
        <NavLink key={p.label} to={p.to} className="sb-feature-promo">
          <div className="sb-feature-icon" style={{ background: p.bg }}>
            <span>{p.emoji}</span>
          </div>
          <span className="sb-feature-label">{p.label}</span>
        </NavLink>
      ))}
    </div>
  );
}

function BottomNav({ openCount }) {
  const loc = useLocation();
  const { account } = useAccount();
  const is = (p, exact = false) => exact ? loc.pathname === p : loc.pathname.startsWith(p);

  const items = [
    {
      to: '/',
      label: 'Sports',
      active: is('/', true),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </svg>
      ),
    },
    {
      to: '/casino',
      label: 'Casino',
      active: is('/casino') || is('/virtuals') || is('/jackpot'),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="7" width="18" height="11" rx="3" />
          <path d="M8 12h3M9.5 10.5v3M15 11h.01M17 13h.01" />
        </svg>
      ),
    },
    {
      to: '/my-bets',
      label: 'Bet slip',
      active: is('/my-bets'),
      pip: openCount > 0 ? openCount : null,
      isSpecial: true,
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M3 4C3 3.44772 3.44772 3 4 3H20C20.5523 3 21 3.44772 21 4V8.5C21 8.77614 20.7761 9 20.5 9C19.6716 9 19 9.67157 19 10.5C19 11.3284 19.6716 12 20.5 12C20.7761 12 21 12.2239 21 12.5V20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V12.5C3 12.2239 3.22386 12 3.5 12C4.32843 12 5 11.3284 5 10.5C5 9.67157 4.32843 9 3.5 9C3.22386 9 3 8.77614 3 8.5V4Z" />
        </svg>
      ),
    },
    {
      to: account ? '/profile' : '/login',
      label: account ? 'Me' : 'Log in',
      active: is('/profile') || is('/wallet') || is('/login'),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      ),
    },
    {
      to: '/info',
      label: 'Menu',
      active: is('/info'),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="6"  x2="21" y2="6" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      ),
    },
  ];

  return (
    <nav className="sb-bottom-nav" aria-label="Primary">
      {items.map((it) => (
        <NavLink
          key={it.label}
          to={it.to}
          className={`sb-nav-item${it.active ? ' active' : ''}${it.isSpecial ? ' special' : ''}`}
        >
          <div className="icon-wrap">{it.icon}</div>
          <span>{it.label}</span>
          {it.pip != null && <span className="pip">{it.pip}</span>}
        </NavLink>
      ))}
    </nav>
  );
}

export default function AppShell() {
  const navigate = useNavigate();
  const { account, signOut, openDeposit, openWithdraw } = useAccount();

  const navCls = ({ isActive }) => (isActive ? 'active' : undefined);
  const balance = account?.balance ?? 0;
  const authed = !!account;

  // openCount is best-effort — derived from a global window flag set by Home
  // when My Bets history loads. Avoids a second fetch here.
  const openCount = typeof window !== 'undefined'
    ? (window.__xenbetOpenCount || 0)
    : 0;

  // --- Search functionality ---
  const searchDlg = useRef(null);
  const walletMenuDlg = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [allMatches, setAllMatches] = useState([]);

  const openSearch = async () => {
    searchDlg.current?.showModal();
    if (!allMatches.length) {
      setIsSearching(true);
      try {
        const data = await fetchMatches('football');
        const matches = data.leagues.flatMap(l => l.matches.map(m => ({ ...m, leagueName: l.name })));
        setAllMatches(matches);
      } catch (e) {
        console.error('Failed to load matches for search', e);
      } finally {
        setIsSearching(false);
      }
    }
  };

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const q = searchQuery.toLowerCase();
    const results = allMatches.filter(m => 
      m.home.toLowerCase().includes(q) || 
      m.away.toLowerCase().includes(q) ||
      m.leagueName.toLowerCase().includes(q)
    ).slice(0, 15); // limit to 15 results
    setSearchResults(results);
  }, [searchQuery, allMatches]);

  return (
    <>
      {/* === mobile shell === */}
      <MobileHeader
        account={account}
        onSignIn={() => navigate('/login')}
        onSignUp={() => navigate('/login?next=/wallet')}
        onAvatar={() => navigate('/profile')}
        onSearch={openSearch}
        onBalanceClick={() => walletMenuDlg.current?.showModal()}
      />

      {/* === mobile-only feature promos === */}
      <FeaturePromos />

      {/* === desktop shell (kept for ≥961px) === */}
      <div className="ticker">
        <div className="ticker-track">
          <span><b>LIVE</b> Arsenal 2-1 Chelsea · 73&apos;</span>
          <span><b>BOOSTED</b> Real Madrid to win &amp; BTTS · <em>3.45</em></span>
          <span><b>LIVE</b> Aduana 0-0 Medeama · 22&apos;</span>
          <span><b>Xenbet</b> sharper odds, instant payouts</span>
          <span><b>LIVE</b> Arsenal 2-1 Chelsea · 73&apos;</span>
          <span><b>BOOSTED</b> Real Madrid to win &amp; BTTS · <em>3.45</em></span>
          <span><b>LIVE</b> Aduana 0-0 Medeama · 22&apos;</span>
          <span><b>Xenbet</b> sharper odds, instant payouts</span>
        </div>
      </div>

      <header className="app-header">
        <div className="header-inner">
          <NavLink to="/" className="logo" end>
            <div className="logo-mark"><span>X</span></div>
            <div className="logo-text">Xen<em>bet</em></div>
          </NavLink>
          <nav id="main-nav">
            <NavLink to="/" end className={navCls}>Sports</NavLink>
            <NavLink to="/casino"   className={navCls}>Casino</NavLink>
            <NavLink to="/virtuals" className={navCls}>Virtuals</NavLink>
            <NavLink to="/jackpot"  className={navCls}>Jackpot</NavLink>
            <NavLink to="/promos"   className={navCls}>Promotions</NavLink>
            <NavLink to="/my-bets"  className={navCls}>My Bets</NavLink>
            <NavLink to="/wallet"   className={navCls}>Wallet</NavLink>
          </nav>
          <div className="header-right">
            <button type="button" className="btn btn-ghost" onClick={openSearch} title="Search Matches">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginBottom: -2 }}>
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
            </button>
            <button
              type="button"
              className="balance"
              title={authed ? `${account.displayName} — open wallet manager` : 'Not signed in'}
              onClick={() => authed ? walletMenuDlg.current?.showModal() : navigate('/login?next=/')}
              style={{ cursor: 'pointer', background: 'transparent', border: 'none', font: 'inherit' }}
            >
              <span style={{ color: 'var(--text-dim)' }}>GHS</span>
              <span className="balance-amt">{formatAmt(balance)}</span>
            </button>
            <ThemeToggle />
            {authed && <NotificationBell />}
            <button type="button" className="btn btn-ghost" onClick={openDeposit}>Deposit</button>
            {authed && <button type="button" className="btn btn-ghost" onClick={openWithdraw}>Withdraw</button>}
            {authed && <button type="button" className="btn btn-ghost" onClick={() => navigate('/profile')} title="Account">
              {(account.displayName || account.email).charAt(0).toUpperCase()}
            </button>}
            {!authed
              ? <button type="button" className="btn btn-primary" onClick={() => navigate('/login')}>Sign in</button>
              : <button type="button" className="btn btn-primary" onClick={signOut}>Logout</button>}
          </div>
        </div>
      </header>

      <div className="sb-mobile-page-pad">
        <Outlet />
      </div>

      <footer>
        <div className="foot-inner">
          <div className="foot-brand">
            <div className="logo">
              <div className="logo-mark"><span>X</span></div>
              <div className="logo-text">Xen<em>bet</em></div>
            </div>
            <p>Premium sports betting for Ghana — licensed, regulated, and built for the way you actually watch the game. Sharper odds, instant payouts.</p>
          </div>
          <div className="foot-col">
            <h6>Sports</h6>
            <ul>
              <li><NavLink to="/?sport=football">Football</NavLink></li>
              <li><NavLink to="/?sport=basketball">Basketball</NavLink></li>
              <li><NavLink to="/?sport=tennis">Tennis</NavLink></li>
              <li><NavLink to="/">All sports</NavLink></li>
            </ul>
          </div>
          <div className="foot-col">
            <h6>Play</h6>
            <ul>
              <li><NavLink to="/jackpot">Mega-13 jackpot</NavLink></li>
              <li><NavLink to="/virtuals">Virtuals</NavLink></li>
              <li><NavLink to="/casino">Casino</NavLink></li>
              <li><NavLink to="/promos">Promotions</NavLink></li>
            </ul>
          </div>
          <div className="foot-col">
            <h6>Help</h6>
            <ul>
              <li><a onClick={openDeposit}>Deposits</a></li>
              <li><a onClick={authed ? openWithdraw : () => navigate('/login?next=/profile')}>Withdrawals</a></li>
              <li><NavLink to="/my-bets">Cash-out</NavLink></li>
              <li><NavLink to="/help">Contact us</NavLink></li>
              <li><NavLink to="/help">Help centre</NavLink></li>
            </ul>
          </div>
          <div className="foot-col">
            <h6>Legal</h6>
            <ul>
              <li><NavLink to="/info#terms">Terms &amp; conditions</NavLink></li>
              <li><NavLink to="/info#privacy">Privacy policy</NavLink></li>
              <li><NavLink to="/info#responsible-gaming">Responsible gaming</NavLink></li>
              <li><NavLink to="/info#self-exclusion">Self-exclusion</NavLink></li>
              <li><NavLink to="/info#licence">Licence info</NavLink></li>
            </ul>
          </div>
        </div>
        <div className="foot-bottom">
          <div>© {new Date().getFullYear()} Xenbet GH · Licensed by the Gaming Commission of Ghana</div>
          <div className="respo">18+ · BET RESPONSIBLY</div>
        </div>
      </footer>

      <BottomNav openCount={openCount} />

      {/* === global search modal === */}
      <dialog ref={searchDlg} className="bv-dialog search-dialog">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Search Matches</h3>
          <button type="button" className="btn btn-ghost" onClick={() => { searchDlg.current?.close(); setSearchQuery(''); }} style={{ padding: '4px 8px' }}>✕</button>
        </div>
        <input 
          type="search" 
          placeholder="Search teams or leagues..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--text)', fontSize: 16, marginBottom: 16 }}
          autoFocus
        />
        <div className="search-results" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {isSearching && <p style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 20 }}>Loading matches...</p>}
          {!isSearching && searchQuery && searchResults.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 20 }}>No matches found for "{searchQuery}"</p>
          )}
          {searchResults.map(match => (
            <div key={match.id} onClick={() => { navigate(`/?sport=football`); searchDlg.current?.close(); }} style={{ padding: '12px 10px', borderBottom: '1px solid var(--line)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase' }}>{match.leagueName}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{match.home} vs {match.away}</span>
                {match.isLive ? <span style={{ color: 'var(--accent-hot)', fontSize: 10, fontWeight: 800 }}>LIVE {match.minute}</span> : <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{match.kickoff || match.day}</span>}
              </div>
            </div>
          ))}
        </div>
      </dialog>

      {/* === wallet actions modal === */}
      <dialog ref={walletMenuDlg} className="bv-dialog wallet-menu-dialog" style={{ maxWidth: 360, width: '90%' }}>
        <div className="wallet-menu-inner" style={{ padding: '4px 2px' }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Xenbet Wallet</h3>
            <button type="button" className="btn btn-ghost" onClick={() => walletMenuDlg.current?.close()} style={{ padding: '6px 10px', fontSize: 16 }}>✕</button>
          </header>
          
          <div className="wallet-menu-card" style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14,
            padding: '20px 18px',
            marginBottom: 20,
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ position: 'absolute', top: '-50%', left: '-50%', width: '200%', height: '200%', background: 'radial-gradient(circle, rgba(197,255,61,0.08) 0%, transparent 60%)', pointerEvents: 'none' }} />
            <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>Available Balance</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--accent)' }}>
              ₵{formatAmt(balance)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-soft)', marginTop: 4 }}>Currency: Ghana Cedis (GHS)</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => { walletMenuDlg.current?.close(); openDeposit(); }}
              style={{
                width: '100%',
                padding: '12px 18px',
                fontSize: 14,
                fontWeight: 800,
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                background: 'linear-gradient(135deg, var(--accent), #b0e82d)',
                color: '#0a0d0c',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
              Deposit Funds
            </button>

            <button
              type="button"
              className="btn"
              onClick={() => { walletMenuDlg.current?.close(); openWithdraw(); }}
              style={{
                width: '100%',
                padding: '12px 18px',
                fontSize: 14,
                fontWeight: 800,
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                background: 'linear-gradient(135deg, #ff4d3d, #cc3a2e)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 7l-5 5-5-5M12 17V5"/></svg>
              Withdraw Funds
            </button>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => { walletMenuDlg.current?.close(); navigate('/wallet'); }}
              style={{
                width: '100%',
                padding: '10px 18px',
                fontSize: 13,
                fontWeight: 700,
                borderRadius: 8,
                border: '1px solid var(--line)',
                background: 'transparent',
                color: 'var(--text-soft)',
                cursor: 'pointer',
                marginTop: 4
              }}
            >
              Go to Wallet History
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

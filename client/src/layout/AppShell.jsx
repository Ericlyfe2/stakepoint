import { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAccount } from '../providers/AccountProvider.jsx';
import { useTheme } from '../providers/ThemeProvider.jsx';
import { fetchMatches } from '../api/betApi.js';
import NotificationBell from '../components/NotificationBell.jsx';
import XenFooter from '../components/layout/XenFooter.jsx';
import SmartQuickActionBar from '../components/ui/SmartQuickActionBar.jsx';
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
  const location = useLocation();
  const isSports = location.pathname === '/';
  const isProfile = location.pathname === '/profile';
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(false);
    if (!isProfile) return;
    const t = setTimeout(() => setHidden(true), 3000);
    return () => clearTimeout(t);
  }, [isProfile, location.pathname]);

  if (!isSports && !isProfile) return null;
  if (isProfile && hidden) return null;

  const promos = [
    {
      label: 'Lucky Numbers',
      bg: 'linear-gradient(135deg,#6c2dc7,#9f5de2)',
      to: '/casino',
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="3" /><line x1="2" y1="10" x2="22" y2="10" /><circle cx="8" cy="15" r="1.5" fill="#fff" stroke="none" /><circle cx="12" cy="15" r="1.5" fill="#fff" stroke="none" /><circle cx="16" cy="15" r="1.5" fill="#fff" stroke="none" /><rect x="6" y="6" width="4" height="2.5" rx="0.5" fill="#fff" fillOpacity="0.3" stroke="none" /><rect x="11" y="6" width="4" height="2.5" rx="0.5" fill="#fff" fillOpacity="0.3" stroke="none" />
        </svg>
      ),
    },
    {
      label: 'Daily Rains',
      bg: 'linear-gradient(135deg,#1a7a4c,#27ae60)',
      to: '/promos',
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25" /><line x1="8" y1="16" x2="8" y2="20" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="16" y1="16" x2="16" y2="20" />
        </svg>
      ),
    },
    {
      label: 'Instant Win',
      bg: 'linear-gradient(135deg,#c87f00,#f5a623)',
      to: '/casino',
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="#fff" fillOpacity="0.2" />
        </svg>
      ),
    },
    {
      label: 'JACKPOT',
      bg: 'linear-gradient(135deg,#c5993d,#ffd700)',
      to: '/jackpot',
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v2" /><path d="M12 20v2" /><circle cx="12" cy="12" r="8" /><path d="M14.5 9c-.4-.8-1.3-1.2-2.5-1.2-1.6 0-2.5.8-2.5 1.8 0 1.2 1 1.6 2.5 2 1.5.4 2.5 1 2.5 2.2 0 1.1-.9 1.9-2.5 1.9-1.3 0-2.2-.5-2.5-1.3" /><line x1="12" y1="7" x2="12" y2="8" /><line x1="12" y1="16.5" x2="12" y2="17.5" />
        </svg>
      ),
    },
    {
      label: 'AutoBet',
      bg: 'linear-gradient(135deg,#2a5298,#4a90d9)',
      to: '/',
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="4" fill="#fff" fillOpacity="0.15" stroke="#fff" /><circle cx="9" cy="10" r="1.5" fill="#fff" stroke="none" /><circle cx="15" cy="10" r="1.5" fill="#fff" stroke="none" /><path d="M8 15c1 1.5 3 2 4 2s3-.5 4-2" /><line x1="12" y1="2" x2="12" y2="4" /><line x1="12" y1="2" x2="10" y2="0.5" /><line x1="12" y1="2" x2="14" y2="0.5" />
        </svg>
      ),
    },
  ];

  return (
    <div className="sb-feature-promos">
      {promos.map((p) => (
        <NavLink key={p.label} to={p.to} className="sb-feature-promo">
          <div className="sb-feature-icon" style={{ background: p.bg }}>
            {p.icon}
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
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
          <polygon points="12,8 15,10 14,14 10,14 9,10" />
          <path d="M12 6v2M6 12h3M18 12h-3M10 14l-1.5 3.5M14 14l1.5 3.5" />
        </svg>
      ),
    },
    {
      to: '/info',
      label: 'A-Z Menu',
      active: is('/info'),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="6"  x2="21" y2="6" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      ),
    },
    {
      to: '/casino',
      label: 'Games',
      active: is('/casino') || is('/virtuals') || is('/jackpot'),
      isGames: true,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="6" width="20" height="12" rx="3" />
          <path d="M6 12h4M8 10v4M15 11h.01M17 13h.01" />
        </svg>
      ),
    },
    {
      to: '/my-bets',
      label: 'Open Bets',
      active: is('/my-bets'),
      pip: openCount > 0 ? openCount : null,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l.73-.73" />
          <path d="M12 8v8M14 9.5a1.5 1.5 0 0 0-1.5-1.5h-1A1.5 1.5 0 0 0 10 11.5v0A1.5 1.5 0 0 0 11.5 13h1A1.5 1.5 0 0 1 14 14.5v0A1.5 1.5 0 0 1 12.5 16h-1A1.5 1.5 0 0 1 10 14.5" />
        </svg>
      ),
    },
    {
      to: account ? '/profile' : '/login',
      label: account ? 'Me' : 'Me',
      active: is('/profile') || is('/wallet') || is('/login'),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
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
          className={`sb-nav-item${it.active ? ' active' : ''}${it.isGames ? ' games-nav' : ''}`}
        >
          <div className="icon-wrap">{it.icon}</div>
          <span className="nav-label">{it.label}</span>
          {it.pip != null && <span className="pip">{it.pip}</span>}
          {it.active && <div className="active-indicator" />}
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
      <SmartQuickActionBar />

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

      <XenFooter />

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
                background: 'linear-gradient(135deg, var(--accent), var(--accent-soft))',
                color: 'var(--text-inv)',
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

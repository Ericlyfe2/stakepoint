import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAdmin } from '../providers/AdminProvider.jsx';
import { Toast } from '../components/admin/primitives.jsx';
import {
  IconDashboard, IconUsers, IconReceipt, IconChart, IconShield, IconCash, IconBell,
  IconLifebuoy, IconCog, IconSearch, IconSun, IconMoon, IconMenu, IconLogout,
  IconChevronRight, IconLive, IconBot, IconBook, IconSparkles, IconActivity,
  IconTarget, IconFlag, IconAward, IconTrending, IconShieldOff, IconLock,
  IconGift, IconUsers2, IconCode, IconSend, IconBarChart, IconFileText,
  IconSettings, IconServer, IconRefresh, IconKey, IconEye, IconCheck,
} from '../components/admin/Icons.jsx';

const NAV = [
  { section: 'Overview', items: [
    { to: '/admin', label: 'Dashboard', icon: <IconDashboard />, exact: true, perm: null },
    { to: '/admin/live', label: 'Live betting', icon: <IconLive />, badge: 'LIVE', perm: 'live.manage' },
    { to: '/admin/live-control', label: 'Live Control', icon: <IconTarget />, badge: 'LIVE', perm: 'live.manage' },
    { to: '/admin/analytics', label: 'Analytics', icon: <IconChart />, perm: null },
  ]},
  { section: 'Sportsbook', items: [
    { to: '/admin/sports', label: 'Sports', icon: <IconTarget />, perm: 'sports.view' },
    { to: '/admin/leagues', label: 'Leagues', icon: <IconFlag />, perm: 'leagues.view' },
    { to: '/admin/fixtures', label: 'Fixtures', icon: <IconBook />, perm: 'fixtures.view' },
    { to: '/admin/teams', label: 'Teams', icon: <IconUsers2 />, perm: 'teams.view' },
    { to: '/admin/markets', label: 'Markets & Odds', icon: <IconTrending />, perm: 'markets.view' },
    { to: '/admin/results', label: 'Results & Settle', icon: <IconCheck />, perm: 'results.view' },
    { to: '/admin/trading', label: 'Trading Desk', icon: <IconShieldOff />, perm: 'trading.liability' },
  ]},
  { section: 'Operations', items: [
    { to: '/admin/users', label: 'Users', icon: <IconUsers />, perm: 'users.view' },
    { to: '/admin/stages', label: 'Player stages', icon: <IconActivity />, perm: 'users.view' },
    { to: '/admin/bets', label: 'Bets', icon: <IconReceipt />, perm: 'bets.view' },
    { to: '/admin/finance', label: 'Finance', icon: <IconCash />, perm: 'finance.view' },
    { to: '/admin/deposits', label: 'Deposits', icon: <IconCash />, perm: 'finance.deposits.approve' },
    { to: '/admin/withdrawals', label: 'Withdrawals', icon: <IconSend />, perm: 'finance.withdrawals.approve' },
    { to: '/admin/bonuses', label: 'Bonuses', icon: <IconGift />, perm: 'bonuses.create' },
    { to: '/admin/promotions', label: 'Promotions', icon: <IconSparkles />, perm: 'promotions.create' },
  ]},
  { section: 'Risk & Compliance', items: [
    { to: '/admin/fraud', label: 'Fraud & AI', icon: <IconBot />, perm: 'fraud.view' },
    { to: '/admin/kyc', label: 'KYC/AML', icon: <IconShield />, perm: 'compliance.kyc' },
    { to: '/admin/referrals', label: 'Referrals', icon: <IconUsers2 />, perm: 'referrals.view' },
    { to: '/admin/codes', label: 'Booking Codes', icon: <IconCode />, perm: 'codes.view' },
    { to: '/admin/cashout', label: 'Cashout Settings', icon: <IconRefresh />, perm: 'cashout.configure' },
  ]},
  { section: 'Content & Comms', items: [
    { to: '/admin/notifications', label: 'Notifications', icon: <IconBell />, perm: 'notifications.send' },
    { to: '/admin/support', label: 'Support', icon: <IconLifebuoy />, perm: 'support.tickets' },
    { to: '/admin/cms', label: 'CMS', icon: <IconFileText />, perm: 'cms.banners' },
  ]},
  { section: 'Intelligence', items: [
    { to: '/admin/reports', label: 'Reports', icon: <IconBarChart />, perm: 'reports.view' },
    { to: '/admin/audit', label: 'Audit Logs', icon: <IconEye />, perm: 'admin.audit' },
  ]},
  { section: 'System', items: [
    { to: '/admin/providers', label: 'API Providers', icon: <IconActivity />, perm: 'system.providers' },
    { to: '/admin/security', label: 'Security', icon: <IconLock />, perm: 'admin.view' },
    { to: '/admin/management', label: 'Admin Mgmt', icon: <IconKey />, perm: 'admin.view' },
    { to: '/admin/settings', label: 'Settings', icon: <IconCog />, perm: 'admin.settings' },
    { to: '/admin/health', label: 'Health', icon: <IconServer />, perm: 'admin.health' },
  ]},
];

function crumbsFor(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  return parts.map((p, i) => ({
    label: p === 'admin' ? 'Admin' : p.charAt(0).toUpperCase() + p.slice(1),
    href: '/' + parts.slice(0, i + 1).join('/'),
  }));
}

function useCommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const inputRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const allItems = NAV.flatMap((s) => s.items.map((i) => ({ ...i, section: s.section })));
  const filtered = query
    ? allItems.filter((i) => i.label.toLowerCase().includes(query.toLowerCase()))
    : allItems;

  const go = useCallback((to) => {
    navigate(to);
    setOpen(false);
    setQuery('');
  }, [navigate]);

  return { open, setOpen, query, setQuery, filtered, go, inputRef };
}

export default function AdminShell() {
  const { admin, theme, toggleTheme, collapsed, setCollapsed, mobileOpen, setMobileOpen, signOut, toast, can } = useAdmin();
  const loc = useLocation();
  const crumbs = useMemo(() => crumbsFor(loc.pathname), [loc.pathname]);
  const palette = useCommandPalette();

  return (
    <div className={`adm-app ${collapsed ? 'collapsed' : ''}`} data-admin-root data-theme={theme}>
      <aside className={`adm-side ${mobileOpen ? 'open' : ''}`}>
        <div className="adm-brand">
          <div className="mark">
            <svg width="26" height="26" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M32 4L56 15L56 37C56 52 32 64 32 64C32 64 8 52 8 37L8 15Z" fill="rgba(255,255,255,0.2)"/>
              <path d="M32 8L52 18L52 37C52 50 32 61 32 61C32 61 12 50 12 37L12 18Z" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1"/>
              <path d="M22 22L22 43L33 43C38 43 42 40 42 35.5C42 33 40.5 31 38.5 30C40 29 41 27.5 41 25.5C41 23 38 22 34 22ZM26.5 26L33 26C35.5 26 37 27 37 29C37 31 35.5 32 33 32L26.5 32ZM26.5 35.5L33.5 35.5C36.5 35.5 37.5 37 37.5 39C37.5 41 35.5 39.5 33.5 39.5L26.5 39.5Z" fill="white"/>
            </svg>
          </div>
          <div className="text">
            <div className="name">BetXentra</div>
            <div className="sub">Admin OS</div>
          </div>
        </div>

        <nav className="adm-nav">
          {NAV.map((sec) => {
            const visibleItems = sec.items.filter((it) => !it.perm || can(it.perm));
            if (visibleItems.length === 0) return null;
            return (
              <div key={sec.section}>
                <div className="adm-nav-section">{sec.section}</div>
                {visibleItems.map((it) => (
                  <NavLink key={it.to} to={it.to} end={it.exact}
                    className={({ isActive }) => (isActive ? 'active' : '')}>
                    <span className="icn">{it.icon}</span>
                    <span className="lbl">{it.label}</span>
                    {it.badge && <span className="badge">{it.badge}</span>}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="adm-side-foot">
          <div className="avatar">{(admin?.name || admin?.email || 'A').charAt(0).toUpperCase()}</div>
          <div className="who">
            <div className="n">{admin?.name || admin?.email}</div>
            <div className="r">{ADMIN_ROLE_LABEL[admin?.adminRole] || admin?.adminRole}</div>
          </div>
          <button title="Logout" onClick={signOut} aria-label="Logout"><IconLogout /></button>
        </div>
      </aside>

      <div className="adm-main">
        <header className="adm-top">
          <button className="toggle" onClick={() => {
            if (window.innerWidth <= 980) setMobileOpen((m) => !m);
            else setCollapsed((c) => !c);
          }} aria-label="Toggle navigation">
            <IconMenu />
          </button>

          <div className="crumbs">
            {crumbs.map((c, i) => (
              <span key={c.href}>
                {i > 0 && <span className="sep"> · </span>}
                {i === crumbs.length - 1
                  ? <strong>{c.label}</strong>
                  : <span>{c.label}</span>}
              </span>
            ))}
          </div>

          <div className="adm-search" onClick={() => palette.setOpen(true)}>
            <span className="icn"><IconSearch size={16} /></span>
            <input placeholder="Search users, bets, matches, transactions..." readOnly aria-label="Search" />
            <kbd>⌘K</kbd>
          </div>

          <div className="adm-top-actions">
            <button className="adm-icon-btn" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === 'dark' ? <IconSun /> : <IconMoon />}
            </button>
            <button className="adm-icon-btn" aria-label="Notifications">
              <IconBell />
              <span className="dot" />
            </button>
            <button className="adm-icon-btn" aria-label="Account" style={{ background: 'var(--grad-brand)', color: '#fff', borderColor: 'transparent' }}>
              {(admin?.name || admin?.email || 'A').charAt(0).toUpperCase()}
            </button>
          </div>
        </header>

        <main className="adm-page">
          <Outlet />
        </main>
      </div>

      {palette.open && (
        <div className="adm-palette-overlay" onClick={() => palette.setOpen(false)}>
          <div className="adm-palette" onClick={(e) => e.stopPropagation()}>
            <div className="adm-palette-input">
              <IconSearch size={18} />
              <input
                ref={palette.inputRef}
                value={palette.query}
                onChange={(e) => palette.setQuery(e.target.value)}
                placeholder="Type to search..."
                aria-label="Command search"
              />
              <kbd>ESC</kbd>
            </div>
            <div className="adm-palette-results">
              {palette.filtered.map((item) => (
                <button key={item.to} className="adm-palette-item" onClick={() => palette.go(item.to)}>
                  <span className="icn">{item.icon}</span>
                  <span className="lbl">{item.label}</span>
                  <span className="sec">{item.section}</span>
                </button>
              ))}
              {palette.filtered.length === 0 && (
                <div className="adm-palette-empty">No results found</div>
              )}
            </div>
          </div>
        </div>
      )}

      <Toast {...toast} />
    </div>
  );
}

const ADMIN_ROLE_LABEL = {
  super_admin: 'Super Admin',
  trader: 'Trader',
  risk_manager: 'Risk Manager',
  finance_admin: 'Finance Admin',
  compliance_officer: 'Compliance Officer',
  support_agent: 'Support Agent',
  marketing_manager: 'Marketing Manager',
  readonly_auditor: 'Read-Only Auditor',
};

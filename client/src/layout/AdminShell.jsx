/**
 * The chrome that wraps every protected admin page.
 *  - Sidebar with role-aware visibility
 *  - Top bar with search, theme toggle, notifications, account
 *  - Breadcrumb derived from route
 *  - Toast portal
 */
import { useMemo } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAdmin } from '../providers/AdminProvider.jsx';
import { Toast } from '../components/admin/primitives.jsx';
import {
  IconDashboard, IconUsers, IconReceipt, IconChart, IconShield, IconCash, IconBell,
  IconLifebuoy, IconCog, IconSearch, IconSun, IconMoon, IconMenu, IconLogout,
  IconChevronRight, IconLive, IconBot, IconBook, IconSparkles, IconActivity,
} from '../components/admin/Icons.jsx';

const NAV = [
  { section: 'Overview', items: [
    { to: '/admin',            label: 'Dashboard',     icon: <IconDashboard />, exact: true },
    { to: '/admin/live',       label: 'Live betting',  icon: <IconLive />, badge: 'LIVE' },
    { to: '/admin/analytics',  label: 'Analytics',     icon: <IconChart /> },
  ]},
  { section: 'Operations', items: [
    { to: '/admin/users',      label: 'Users',         icon: <IconUsers /> },
    { to: '/admin/stages',     label: 'Player stages', icon: <IconActivity /> },
    { to: '/admin/bets',       label: 'Bets',          icon: <IconReceipt /> },
    { to: '/admin/sports',     label: 'Sports & odds', icon: <IconBook />,    roles: ['odds_manager'] },
    { to: '/admin/promotions', label: 'Promotions',    icon: <IconSparkles /> },
    { to: '/admin/finance',    label: 'Finance',       icon: <IconCash />,    roles: ['finance_admin'] },
    { to: '/admin/deposits',   label: 'Deposits',      icon: <IconCash />,    roles: ['finance_admin'] },
  ]},
  { section: 'Trust & safety', items: [
    { to: '/admin/fraud',      label: 'Fraud & AI',    icon: <IconBot />,    roles: ['moderator'] },
    { to: '/admin/audit',      label: 'Audit logs',    icon: <IconShield /> },
    { to: '/admin/notifications', label: 'Notifications', icon: <IconBell /> },
    { to: '/admin/support',    label: 'Support',       icon: <IconLifebuoy />, roles: ['support'] },
  ]},
  { section: 'Integrations', items: [
    { to: '/admin/providers',  label: 'API providers', icon: <IconActivity /> },
  ]},
  { section: 'System', items: [
    { to: '/admin/health',     label: 'Health',        icon: <IconActivity /> },
    { to: '/admin/settings',   label: 'Settings',      icon: <IconCog /> },
  ]},
];

function crumbsFor(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  return parts.map((p, i) => ({
    label: p === 'admin' ? 'Admin' : p.charAt(0).toUpperCase() + p.slice(1),
    href: '/' + parts.slice(0, i + 1).join('/'),
  }));
}

export default function AdminShell() {
  const { admin, theme, toggleTheme, collapsed, setCollapsed, mobileOpen, setMobileOpen, signOut, toast, hasRole } = useAdmin();
  const loc = useLocation();

  const crumbs = useMemo(() => crumbsFor(loc.pathname), [loc.pathname]);

  return (
    <div className={`adm-app ${collapsed ? 'collapsed' : ''}`} data-admin-root data-theme={theme}>
      {/* Sidebar */}
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
            const visibleItems = sec.items.filter((it) => !it.roles || hasRole(...it.roles));
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
          <div className="avatar">{(admin?.displayName || admin?.email || 'A').charAt(0).toUpperCase()}</div>
          <div className="who">
            <div className="n">{admin?.displayName || admin?.email}</div>
            <div className="r">{ADMIN_ROLE_LABEL[admin?.adminRole] || admin?.adminRole}</div>
          </div>
          <button title="Logout" onClick={signOut} aria-label="Logout"><IconLogout /></button>
        </div>
      </aside>

      {/* Main column */}
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

          <div className="adm-search">
            <span className="icn"><IconSearch size={16} /></span>
            <input placeholder="Search users, bets, matches, transactions…" aria-label="Search" />
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
              {(admin?.displayName || admin?.email || 'A').charAt(0).toUpperCase()}
            </button>
          </div>
        </header>

        <main className="adm-page">
          <Outlet />
        </main>
      </div>

      <Toast {...toast} />
    </div>
  );
}

const ADMIN_ROLE_LABEL = {
  super_admin: 'Super admin',
  finance_admin: 'Finance lead',
  odds_manager: 'Trading desk',
  support: 'Support',
  moderator: 'Risk & moderation',
};

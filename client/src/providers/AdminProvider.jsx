/**
 * Top-level state for the admin app: identity, theme, toast, route guard.
 * Boots on mount by trying to hydrate /auth/me with the saved token.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  setAdminTokens, clearAdminTokens, getAdminAccess,
  adminMe, adminLogout,
} from '../api/adminApi.js';
import { useTheme } from './ThemeProvider.jsx';

const AdminCtx = createContext(null);

export function useAdmin() {
  const v = useContext(AdminCtx);
  if (!v) throw new Error('useAdmin must be used inside <AdminProvider>');
  return v;
}

export function AdminProvider({ children }) {
  const navigate = useNavigate();
  const loc = useLocation();
  const [admin, setAdmin]     = useState(null);
  const [loading, setLoading] = useState(!!getAdminAccess());
  const { theme, setTheme, toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast, setToast] = useState({ open: false, kind: 'success', message: '' });

  const showToast = useCallback((message, kind = 'success') => {
    setToast({ open: true, kind, message });
    setTimeout(() => setToast((s) => ({ ...s, open: false })), 3000);
  }, []);

  const refresh = useCallback(async () => {
    if (!getAdminAccess()) { setAdmin(null); setLoading(false); return null; }
    try {
      const { admin } = await adminMe();
      setAdmin(admin);
      return admin;
    } catch {
      clearAdminTokens();
      setAdmin(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const signIn = useCallback((resp) => {
    if (resp?.accessToken) setAdminTokens(resp.accessToken, resp.refreshToken);
    if (resp?.admin) setAdmin(resp.admin);
  }, []);

  const signOut = useCallback(async () => {
    try { await adminLogout(); } catch { /* ignore */ }
    clearAdminTokens();
    setAdmin(null);
    showToast('Logged out');
    navigate('/admin/login', { replace: true });
  }, [navigate, showToast]);

  const hasRole = useCallback((...allowed) => {
    if (!admin) return false;
    if (admin.adminRole === 'super_admin') return true;
    return allowed.includes(admin.adminRole);
  }, [admin]);

  // Auto-close mobile sidebar on route change
  useEffect(() => { setMobileOpen(false); }, [loc.pathname]);

  const value = useMemo(() => ({
    admin, loading, signIn, signOut, refresh,
    theme, setTheme, toggleTheme,
    collapsed, setCollapsed,
    mobileOpen, setMobileOpen,
    toast, showToast,
    hasRole,
  }), [admin, loading, signIn, signOut, refresh, theme, setTheme, toggleTheme, collapsed, mobileOpen, toast, showToast, hasRole]);

  return <AdminCtx.Provider value={value}>{children}</AdminCtx.Provider>;
}

/** Guard component to be used around protected routes. */
export function AdminGuard({ children }) {
  const { admin, loading } = useAdmin();
  const navigate = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    if (!loading && !admin) {
      navigate(`/login?next=${encodeURIComponent(loc.pathname)}`, { replace: true });
    }
  }, [admin, loading, navigate, loc.pathname]);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'grid', placeItems: 'center',
        background: 'var(--bg-0, #07080d)',
        color: 'var(--text-dim, #8c91a3)',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <span className="adm-spinner" /> Establishing secure session…
        </div>
      </div>
    );
  }
  if (!admin) return null;
  return children;
}

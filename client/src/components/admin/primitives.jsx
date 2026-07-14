/**
 * Small, dependency-free admin UI primitives.
 * Each one composes the css tokens defined in styles/admin.css.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { IconClose, IconCheck, IconAlert } from './Icons.jsx';

export function Card({ title, subtitle, action, pill, children, className = '', flush = false }) {
  return (
    <section className={`adm-card ${flush ? 'flush' : ''} ${className}`}>
      {(title || action) && (
        <header className="adm-card-head">
          <div>
            {title && <h3>{title}</h3>}
            {subtitle && <div className="sub">{subtitle}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {pill && <span className="pill">{pill}</span>}
            {action}
          </div>
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, prefix, delta, icon, accent }) {
  const style = accent ? { '--accentGrad': accent } : undefined;
  return (
    <div className="adm-stat" style={style}>
      <div className="lbl">{label}</div>
      <div className="val">
        {prefix && <span className="pre">{prefix}</span>}
        <span>{value}</span>
      </div>
      {typeof delta === 'object' && delta !== null && (
        <span className={`delta ${delta.direction === 'down' ? 'down' : ''}`}>
          {delta.direction === 'down' ? '▼' : '▲'} {delta.label}
        </span>
      )}
      {icon && <span className="icn">{icon}</span>}
    </div>
  );
}

export function Badge({ children, tone = 'default', dot = false }) {
  return <span className={`adm-badge ${tone} ${dot ? 'dot' : ''}`}>{children}</span>;
}

export function Drawer({ open, title, onClose, children, footer, width }) {
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="adm-drawer-overlay" onClick={onClose}>
      <aside className="adm-drawer" style={width ? { width } : undefined} onClick={(e) => e.stopPropagation()}>
        <header className="adm-drawer-head">
          <h3 style={{ flex: 1 }}>{title}</h3>
          <button className="adm-icon-btn" onClick={onClose} aria-label="Close"><IconClose /></button>
        </header>
        <div className="adm-drawer-body">{children}</div>
        {footer && <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>{footer}</div>}
      </aside>
    </div>
  );
}

export function Modal({ open, title, description, onClose, children, footer }) {
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="adm-modal-overlay" onClick={onClose}>
      <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
        {title && <h3>{title}</h3>}
        {description && <p>{description}</p>}
        {children}
        {footer && <div className="adm-modal-actions">{footer}</div>}
      </div>
    </div>
  );
}

export function Toast({ open, kind = 'success', message }) {
  if (!open) return null;
  return (
    <div className={`adm-toast ${kind}`} role="status" aria-live="polite">
      {kind === 'success' ? <IconCheck /> : <IconAlert />}
      <span>{message}</span>
    </div>
  );
}

export function Empty({ title = 'Nothing here yet', subtitle, action }) {
  return (
    <div className="adm-empty">
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{title}</div>
      {subtitle && <div style={{ marginTop: 4 }}>{subtitle}</div>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }) {
  return <span className="adm-loading"><span className="adm-spinner" /> {label}</span>;
}

export function SkeletonRow({ cols = 6 }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i}><div className="adm-skel" style={{ height: 14, width: `${50 + (i * 7) % 40}%` }} /></td>
      ))}
    </tr>
  );
}

export function useToast() {
  const [state, set] = useState({ open: false, kind: 'success', message: '' });
  const show = useCallback((message, kind = 'success') => {
    set({ open: true, kind, message });
    setTimeout(() => set((s) => ({ ...s, open: false })), 3200);
  }, []);
  return { toast: state, show };
}

export function moneyFmt(n, currency = 'GHS') {
  const v = Number(n || 0);
  return `${currency} ${v.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function numFmt(n) {
  return Number(n || 0).toLocaleString('en-GH');
}
export function ago(iso) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
export function dateShort(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GH', { dateStyle: 'medium', timeStyle: 'short' });
}

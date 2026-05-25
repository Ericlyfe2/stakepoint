import { useState, useRef, useEffect } from 'react';
import { useAccount } from '../providers/AccountProvider.jsx';

function ago(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

const SEVERITY_COLORS = {
  info: '#3b82f6',
  success: '#22c55e',
  warning: '#f59e0b',
  critical: '#ef4444',
};

export default function NotificationBell() {
  const { notifications, unreadCount, clearNotifications, markNotificationRead } = useAccount();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const key = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  const recent = notifications.slice(0, 15);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          position: 'relative', padding: 4, display: 'flex', alignItems: 'center',
          color: 'var(--text-soft)', font: 'inherit',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -4,
            minWidth: 16, height: 16, borderRadius: 8,
            background: '#ef4444', color: '#fff',
            fontSize: 9, fontWeight: 800, lineHeight: '16px',
            textAlign: 'center', padding: '0 4px',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 8,
          width: 340, maxWidth: '90vw',
          background: 'var(--surface)', border: '1px solid var(--line)',
          borderRadius: 12, boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
          zIndex: 1000, overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 14px', borderBottom: '1px solid var(--line)',
          }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
              Notifications{unreadCount > 0 ? ` (${unreadCount})` : ''}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              {unreadCount > 0 && (
                <button type="button" onClick={clearNotifications}
                  style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer', font: 'inherit' }}>
                  Clear all
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)}
                style={{ fontSize: 14, color: 'var(--text-dim)', background: 'transparent', border: 'none', cursor: 'pointer', font: 'inherit', lineHeight: 1 }}>
                ✕
              </button>
            </div>
          </div>

          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {recent.length === 0 ? (
              <div style={{ padding: '28px 14px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
                No notifications yet.
              </div>
            ) : (
              recent.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => markNotificationRead(n.id)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '10px 14px',
                    background: n.read ? 'transparent' : 'rgba(59,130,246,0.04)',
                    borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                    borderBottom: '1px solid var(--line)',
                    cursor: 'pointer', font: 'inherit',
                    color: 'var(--text)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0,
                      background: SEVERITY_COLORS[n.severity] || '#3b82f6',
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: n.read ? 500 : 700, fontSize: 13, lineHeight: 1.3 }}>{n.title}</div>
                      {n.body && <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 2, lineHeight: 1.4 }}>{n.body}</div>}
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>{ago(n.receivedAt || n.createdAt)}</div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

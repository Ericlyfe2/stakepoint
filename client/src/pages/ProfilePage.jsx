/**
 * Account home — phone-first menu layout modelled after the reference design.
 * Brand row + balance pill, identity card, verification banner (Stage 0 only),
 * Deposit / Withdraw split CTA, then a navigable menu list. Profile edit and
 * password change open as inline sheets without leaving the page.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchTransactions, updateProfile, changePassword } from '../api/betApi.js';
import { useAccount, useToast } from '../providers/AccountProvider.jsx';
import NotificationBell from '../components/NotificationBell.jsx';

function fmtMoney(n) {
  return Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function shortId(s = '') {
  return String(s).split('@')[0];
}

// ─── Icons (inline so the file is self-contained) ──────────────────────────
const I = {
  user:    (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>,
  alert:   (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>,
  shield:  (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 2 4 6v6c0 5 3.4 8.9 8 10 4.6-1.1 8-5 8-10V6z"/><path d="M12 8v4M12 16h.01"/></svg>,
  card:    (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/></svg>,
  phone:   (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M12 18h.01"/></svg>,
  receipt: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 3h16v18l-3-2-3 2-3-2-3 2-4-2z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>,
  swap:    (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 7h13l-3-3M21 17H8l3 3"/></svg>,
  gift:    (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18M7 8a3 3 0 1 1 3-4c0 2-1 4-3 4zM17 8a3 3 0 1 0-3-4c0 2 1 4 3 4z"/></svg>,
  bell:    (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>,
  headset: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 14v-2a8 8 0 1 1 16 0v2"/><rect x="2" y="14" width="5" height="7" rx="1.5"/><rect x="17" y="14" width="5" height="7" rx="1.5"/></svg>,
  settings:(p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1A2 2 0 1 1 4.4 17l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 7 4.4l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1A2 2 0 1 1 19.6 7l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>,
  lock:    (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 1 1 8 0v3"/></svg>,
  logout:  (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>,
  chevron: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="9 18 15 12 9 6"/></svg>,
  close:   (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M6 6l12 12M6 18 18 6"/></svg>,
};

export default function ProfilePage() {
  const navigate = useNavigate();
  const { account, refresh, signOut, openDeposit, openWithdraw } = useAccount();
  const { toast } = useToast();

  const [sheet, setSheet] = useState(null); // 'profile' | 'security' | 'transactions' | 'notifications' | null

  if (!account) {
    return (
      <main className="acct-empty">
        <div className="acct-empty-card">
          <p className="acct-empty-eyebrow">ACCOUNT · LOCKED</p>
          <h1>Sign in to use your account.</h1>
          <Link className="acct-empty-cta" to="/login">Sign in to Xenbet →</Link>
        </div>
        <style>{ACCT_CSS}</style>
      </main>
    );
  }

  const stage = (() => {
    const n = Number(account.stage);
    if (!Number.isFinite(n)) return 0;
    return Math.min(4, Math.max(0, n));
  })();
  const isUnverified = stage === 0;

  const identity = account.phone || shortId(account.email) || 'Account';

  const handleSignOut = async () => {
    if (typeof window !== 'undefined' && !window.confirm('Sign out of Xenbet?')) return;
    try { await signOut(); } catch (e) { toast(e?.message || 'Sign-out failed.'); }
  };

  const menu = [
    { icon: I.receipt,  label: 'Sports Bet History', onClick: () => navigate('/my-bets') },
    { icon: I.swap,     label: 'Transactions',       onClick: () => setSheet('transactions') },
    { icon: I.gift,     label: 'Referral',           onClick: () => navigate('/promos') },
    { icon: I.bell,     label: 'Notification Center', onClick: () => setSheet('notifications') },
    { icon: I.headset,  label: 'Customer Service',   onClick: () => navigate('/help') },
    { icon: I.settings, label: 'Account Settings',   onClick: () => setSheet('profile') },
    { icon: I.lock,     label: 'Change Password',    onClick: () => setSheet('security') },
    { icon: I.logout,   label: 'Sign out',           onClick: handleSignOut, tone: 'danger' },
  ];

  return (
    <main className="acct">
      {/* Brand + balance pill */}
      <header className="acct-top">
        <div className="acct-brand">Xen<em>bet</em></div>
        <button type="button" className="acct-balance-pill" onClick={() => navigate('/wallet')}>
          <span className="acct-balance-icon" aria-hidden><I.user width="14" height="14" /></span>
          <span className="acct-balance-amt">₵&nbsp;{fmtMoney(account.balance)}</span>
        </button>
      </header>

      {/* Identity row */}
      <button type="button" className="acct-identity" onClick={() => setSheet('profile')}>
        <span className="acct-identity-avatar"><I.user width="18" height="18" /></span>
        <span className="acct-identity-name">{identity}</span>
        <span className={`acct-identity-alert${isUnverified ? ' is-warn' : ''}`} aria-hidden>
          <I.alert width="16" height="16" />
        </span>
      </button>

      {/* Verification banner (Stage 0 only) */}
      {isUnverified && (
        <div className="acct-verify" role="status">
          <span className="acct-verify-icon" aria-hidden><I.shield width="18" height="18" /></span>
          <div className="acct-verify-text">
            <strong>Account not verified</strong>
            <p>Complete deposit to unlock Premium</p>
          </div>
        </div>
      )}

      {/* Total balance + CTAs */}
      <div className="acct-balance-row">
        <span>Total Balance</span>
        <strong>₵&nbsp;{fmtMoney(account.balance)}</strong>
      </div>
      <div className="acct-cta-row">
        <button type="button" className="acct-cta acct-cta-green" onClick={openDeposit}>
          <I.card width="18" height="18" /> Deposit
        </button>
        <button type="button" className="acct-cta acct-cta-yellow" onClick={openWithdraw}>
          <I.phone width="18" height="18" /> Withdraw
        </button>
      </div>

      {/* Menu list */}
      <nav className="acct-menu" aria-label="Account menu">
        {menu.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.label}
              type="button"
              className={`acct-menu-item${m.tone ? ` is-${m.tone}` : ''}`}
              onClick={m.onClick}
            >
              <span className="acct-menu-icon" aria-hidden><Icon width="20" height="20" /></span>
              <span className="acct-menu-label">{m.label}</span>
              <span className="acct-menu-chev" aria-hidden><I.chevron width="16" height="16" /></span>
            </button>
          );
        })}
      </nav>

      {/* Inline sheets */}
      {sheet === 'profile' && (
        <ProfileSheet
          account={account}
          onClose={() => setSheet(null)}
          onSaved={async () => { await refresh(); toast('Profile updated.'); setSheet(null); }}
          onError={(m) => toast(m, 'error')}
        />
      )}
      {sheet === 'security' && (
        <PasswordSheet
          onClose={() => setSheet(null)}
          onSaved={() => { toast('Password updated. Other sessions were signed out.'); setSheet(null); }}
        />
      )}
      {sheet === 'transactions' && (
        <TransactionsSheet onClose={() => setSheet(null)} />
      )}
      {sheet === 'notifications' && (
        <NotificationsSheet onClose={() => setSheet(null)} />
      )}

      <style>{ACCT_CSS}</style>
    </main>
  );
}

// ─── Sheets ────────────────────────────────────────────────────────────────

function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  return (
    <div className="acct-sheet-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="acct-sheet" onClick={(e) => e.stopPropagation()}>
        <header className="acct-sheet-head">
          <button type="button" className="acct-sheet-x" onClick={onClose} aria-label="Close">
            <I.close width="18" height="18" />
          </button>
          <h2>{title}</h2>
          <span aria-hidden style={{ width: 32 }} />
        </header>
        <div className="acct-sheet-body">{children}</div>
      </div>
    </div>
  );
}

function ProfileSheet({ account, onClose, onSaved, onError }) {
  const [displayName, setDisplayName] = useState(account.displayName || '');
  const [phone, setPhone]             = useState(account.phone || '');
  const [busy, setBusy]               = useState(false);
  const [err, setErr]                 = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    const trimmed = phone.trim();
    if (trimmed && !/^\+?\d[\d\s-]{8,18}$/.test(trimmed)) {
      setErr('Enter a valid phone number (e.g. 0244123456 or +233244123456).');
      return;
    }
    try {
      setBusy(true);
      await updateProfile({ displayName, phone: trimmed });
      onSaved?.();
    } catch (e) {
      const msg = e.message || 'Could not save changes.';
      setErr(msg); onError?.(msg);
    } finally { setBusy(false); }
  };

  return (
    <Sheet title="Account Settings" onClose={onClose}>
      <form onSubmit={submit} className="acct-form">
        <Field label="Email · login" value={account.email} readOnly hint="Locked to your signup email." />
        <Field label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Name we'll use on slips" />
        <Field
          label="Phone number"
          hint="Withdrawals are sent here."
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="0244123456 or +233244123456"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          maxLength={20}
        />
        {err && <p className="acct-form-err">{err}</p>}
        <button type="submit" className="acct-form-cta" disabled={busy}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </Sheet>
  );
}

function PasswordSheet({ onClose, onSaved }) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (form.next.length < 8) return setErr('New password must be at least 8 characters.');
    if (!/[A-Z]/.test(form.next) || !/[a-z]/.test(form.next)) return setErr('Mix upper- and lower-case letters.');
    if (!/\d/.test(form.next)) return setErr('Include at least one digit.');
    if (form.next !== form.confirm) return setErr('Passwords don’t match.');
    try {
      setBusy(true);
      await changePassword({ currentPassword: form.current, newPassword: form.next });
      onSaved?.();
    } catch (e) { setErr(e.message || 'Could not change password.'); }
    finally { setBusy(false); }
  };

  return (
    <Sheet title="Change Password" onClose={onClose}>
      <form onSubmit={submit} className="acct-form">
        <Field
          label="Current password" type="password" autoComplete="current-password"
          value={form.current} onChange={(e) => setForm((p) => ({ ...p, current: e.target.value }))}
        />
        <Field
          label="New password" hint="8+ chars · mixed case · 1 digit." type="password" autoComplete="new-password"
          value={form.next} onChange={(e) => setForm((p) => ({ ...p, next: e.target.value }))}
        />
        <Field
          label="Confirm new password" type="password" autoComplete="new-password"
          value={form.confirm} onChange={(e) => setForm((p) => ({ ...p, confirm: e.target.value }))}
        />
        {err && <p className="acct-form-err">{err}</p>}
        <button type="submit" className="acct-form-cta" disabled={busy}>
          {busy ? 'Updating…' : 'Change password'}
        </button>
      </form>
    </Sheet>
  );
}

function TransactionsSheet({ onClose }) {
  const [tx, setTx] = useState(null);
  useEffect(() => {
    fetchTransactions().then((d) => setTx(d.transactions || [])).catch(() => setTx([]));
  }, []);
  return (
    <Sheet title="Transactions" onClose={onClose}>
      {tx === null ? (
        <div className="acct-skel-list">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="acct-skel" />)}
        </div>
      ) : tx.length === 0 ? (
        <p className="acct-empty-state">No transactions yet.</p>
      ) : (
        <ul className="acct-tx">
          {tx.map((t, i) => {
            const positive = (t.amount || 0) >= 0;
            return (
              <li key={t.id || i} className={`acct-tx-item ${positive ? 'pos' : 'neg'}`}>
                <div className="acct-tx-meta">
                  <strong>{(t.kind || 'movement').replace(/_/g, ' ')}</strong>
                  <span>{new Date(t.at).toLocaleString()}</span>
                </div>
                <span className="acct-tx-amount">
                  {positive ? '+' : '−'}₵&nbsp;{fmtMoney(Math.abs(t.amount || 0))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}

function NotificationsSheet({ onClose }) {
  const { notifications, unreadCount, clearNotifications, markNotificationRead } = useAccount();

  const severityColor = {
    info: '#3b82f6', success: '#22c55e', warning: '#f59e0b', critical: '#ef4444',
  };

  return (
    <Sheet title={`Notifications${unreadCount > 0 ? ` (${unreadCount})` : ''}`} onClose={onClose}>
      {notifications.length === 0 ? (
        <p className="acct-empty-state">No notifications yet.</p>
      ) : (
        <>
          {unreadCount > 0 && (
            <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--line)' }}>
              <button type="button" onClick={clearNotifications}
                style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer', font: 'inherit' }}>
                Mark all as read
              </button>
            </div>
          )}
          <ul className="acct-tx">
            {notifications.map((n) => (
              <li key={n.id} className="acct-tx-item"
                onClick={() => markNotificationRead(n.id)}
                style={{ cursor: 'pointer', opacity: n.read ? 0.7 : 1 }}>
                <div className="acct-tx-meta">
                  <strong>
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: severityColor[n.severity] || '#3b82f6', marginRight: 8, verticalAlign: 'middle' }} />
                    {n.title}
                  </strong>
                  <span>{n.body || ''}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                    {n.receivedAt ? new Date(n.receivedAt).toLocaleString() : ''}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}

function Field({ label, hint, readOnly, ...rest }) {
  return (
    <label className={`acct-field${readOnly ? ' is-readonly' : ''}`}>
      <span className="acct-field-label">
        {label}{hint && <span className="acct-field-hint"> — {hint}</span>}
      </span>
      <input className="acct-input" readOnly={readOnly} {...rest} />
    </label>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const ACCT_CSS = `
.acct {
  --bg: #0a1a14;
  --bg-2: #082017;
  --surface: rgba(255, 255, 255, 0.04);
  --surface-2: rgba(255, 255, 255, 0.06);
  --line: rgba(255, 255, 255, 0.08);
  --text: #f3f6f1;
  --text-soft: rgba(243, 246, 241, 0.78);
  --text-dim: rgba(243, 246, 241, 0.55);
  --green: #16a34a;
  --green-2: #14803c;
  --green-soft: #1f8a4a;
  --yellow: #facc15;
  --yellow-2: #eab308;
  --warn-bg: rgba(250, 204, 21, 0.10);
  --warn-border: rgba(250, 204, 21, 0.35);
  --danger: #ef4444;

  min-height: calc(100vh - 100px);
  padding: 14px 14px 80px;
  background:
    radial-gradient(700px 380px at 90% -20%, rgba(34, 197, 94, 0.14), transparent 65%),
    radial-gradient(500px 320px at -10% 110%, rgba(250, 204, 21, 0.06), transparent 65%),
    linear-gradient(180deg, var(--bg) 0%, #04100b 100%);
  color: var(--text);
  font-family: 'Bricolage Grotesque', system-ui, sans-serif;
  max-width: 480px;
  margin: 0 auto;
}
html[data-theme="light"] .acct {
  --bg: #f0f4ee;
  --bg-2: #e6ecdf;
  --surface: rgba(0, 0, 0, 0.04);
  --surface-2: rgba(0, 0, 0, 0.06);
  --line: rgba(0, 0, 0, 0.10);
  --text: #0c1f17;
  --text-soft: rgba(12, 31, 23, 0.78);
  --text-dim: rgba(12, 31, 23, 0.55);
  --warn-bg: rgba(250, 204, 21, 0.18);
  background:
    radial-gradient(700px 380px at 90% -20%, rgba(34, 197, 94, 0.18), transparent 65%),
    linear-gradient(180deg, var(--bg) 0%, #d8e3d3 100%);
}

/* Top brand row */
.acct-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  padding: 6px 4px;
}
.acct-brand {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text);
}
.acct-brand em {
  color: var(--green);
  font-style: normal;
}
.acct-balance-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px 7px 7px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--text);
  cursor: pointer;
  font: inherit;
  font-weight: 800;
  font-size: 14px;
  letter-spacing: -0.005em;
  transition: background .15s, border-color .15s;
}
.acct-balance-pill:hover { background: var(--surface-2); border-color: var(--green-soft); }
.acct-balance-icon {
  width: 26px; height: 26px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--green), var(--green-2));
  color: #fff;
  display: grid; place-items: center;
  flex-shrink: 0;
}
.acct-balance-amt { font-variant-numeric: tabular-nums; }

/* Identity row */
.acct-identity {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  margin-bottom: 12px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  color: var(--text);
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: background .15s, border-color .15s;
}
.acct-identity:hover { background: var(--surface-2); border-color: var(--green-soft); }
.acct-identity-avatar {
  width: 34px; height: 34px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--green), var(--green-2));
  color: #fff;
  display: grid; place-items: center;
}
.acct-identity-name {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.005em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.acct-identity-alert {
  width: 30px; height: 30px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.25);
  color: var(--text-dim);
  display: grid; place-items: center;
}
.acct-identity-alert.is-warn { background: var(--yellow); color: #1a1500; }

/* Verification banner */
.acct-verify {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  margin-bottom: 14px;
  background: var(--warn-bg);
  border: 1px solid var(--warn-border);
  border-radius: 14px;
}
.acct-verify-icon {
  width: 32px; height: 32px;
  border-radius: 10px;
  background: rgba(250, 204, 21, 0.16);
  color: var(--yellow);
  display: grid; place-items: center;
}
.acct-verify-text strong {
  display: block;
  color: var(--yellow);
  font-size: 14.5px;
  font-weight: 800;
}
.acct-verify-text p {
  margin: 2px 0 0;
  font-size: 12.5px;
  color: var(--text-soft);
}

/* Total balance row */
.acct-balance-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 6px 4px 10px;
}
.acct-balance-row span {
  font-size: 13px;
  color: var(--text-dim);
  letter-spacing: 0.01em;
}
.acct-balance-row strong {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

/* CTA row */
.acct-cta-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 18px;
}
.acct-cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px 16px;
  border: none;
  border-radius: 14px;
  font-family: inherit;
  font-weight: 800;
  font-size: 15px;
  cursor: pointer;
  letter-spacing: 0.01em;
  transition: transform .15s, box-shadow .15s;
}
.acct-cta-green {
  background: linear-gradient(135deg, var(--green), var(--green-2));
  color: #fff;
  box-shadow: 0 6px 16px rgba(22, 163, 74, 0.28);
}
.acct-cta-green:hover { transform: translateY(-1px); box-shadow: 0 10px 22px rgba(22, 163, 74, 0.42); }
.acct-cta-yellow {
  background: linear-gradient(135deg, var(--yellow), var(--yellow-2));
  color: #1a1500;
  box-shadow: 0 6px 16px rgba(234, 179, 8, 0.30);
}
.acct-cta-yellow:hover { transform: translateY(-1px); box-shadow: 0 10px 22px rgba(234, 179, 8, 0.46); }

/* Menu list */
.acct-menu {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.acct-menu-item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 14px 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  transition: background .15s, border-color .15s, transform .12s;
}
.acct-menu-item:hover { background: var(--surface-2); border-color: var(--green-soft); }
.acct-menu-item:active { transform: scale(0.99); }
.acct-menu-icon {
  width: 36px; height: 36px;
  border-radius: 50%;
  background: rgba(22, 163, 74, 0.12);
  color: var(--green);
  display: grid; place-items: center;
}
.acct-menu-label { overflow: hidden; text-overflow: ellipsis; }
.acct-menu-chev { color: var(--text-dim); }
.acct-menu-item.is-danger .acct-menu-icon { background: rgba(239, 68, 68, 0.12); color: var(--danger); }
.acct-menu-item.is-danger .acct-menu-label { color: var(--danger); }

/* Sheets */
.acct-sheet-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  z-index: 1100;
  display: flex; align-items: flex-end; justify-content: center;
  animation: acctFade .18s ease;
}
@keyframes acctFade { from { opacity: 0; } to { opacity: 1; } }
.acct-sheet {
  width: 100%;
  max-width: 480px;
  background: #0c2017;
  color: var(--text, #f3f6f1);
  border-radius: 18px 18px 0 0;
  max-height: 88vh;
  display: flex; flex-direction: column;
  animation: acctSlideUp .25s cubic-bezier(0.2, 0.7, 0.3, 1);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  font-family: 'Bricolage Grotesque', system-ui, sans-serif;
}
@keyframes acctSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
.acct-sheet-head {
  display: grid;
  grid-template-columns: 32px 1fr 32px;
  align-items: center;
  gap: 8px;
  padding: 14px 14px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  text-align: center;
}
.acct-sheet-head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.005em;
}
.acct-sheet-x {
  width: 32px; height: 32px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.10);
  background: transparent;
  color: #f3f6f1;
  cursor: pointer;
  display: grid; place-items: center;
}
.acct-sheet-body {
  padding: 16px 16px 24px;
  overflow-y: auto;
}

/* Form */
.acct-form { display: grid; gap: 14px; }
.acct-field { display: grid; gap: 6px; }
.acct-field-label {
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(243, 246, 241, 0.55);
  font-family: 'JetBrains Mono', monospace;
}
.acct-field-hint {
  text-transform: none;
  letter-spacing: 0.01em;
  font-family: inherit;
  font-size: 10.5px;
  color: rgba(243, 246, 241, 0.42);
}
.acct-input {
  width: 100%;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 12px;
  padding: 13px 14px;
  color: #f3f6f1;
  font: inherit;
  font-size: 15px;
  transition: border-color .15s, background .15s;
}
.acct-input:focus {
  outline: none;
  border-color: var(--green, #16a34a);
  background: rgba(22, 163, 74, 0.06);
}
.acct-field.is-readonly .acct-input {
  color: rgba(243, 246, 241, 0.55);
  cursor: not-allowed;
}
.acct-form-err {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(239, 68, 68, 0.10);
  border: 1px solid rgba(239, 68, 68, 0.32);
  color: #ff5d5d;
  font-size: 13px;
}
.acct-form-cta {
  background: linear-gradient(135deg, #16a34a, #15803d);
  color: #fff;
  border: none;
  padding: 14px 18px;
  border-radius: 12px;
  font-weight: 800;
  font-size: 15px;
  cursor: pointer;
  font-family: inherit;
  margin-top: 4px;
  transition: transform .15s, box-shadow .15s, opacity .15s;
}
.acct-form-cta:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 10px 20px rgba(22, 163, 74, 0.40); }
.acct-form-cta:disabled { opacity: 0.55; cursor: not-allowed; }

/* Transactions */
.acct-tx {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.acct-tx-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.acct-tx-item:last-child { border-bottom: none; }
.acct-tx-meta { display: flex; flex-direction: column; gap: 2px; }
.acct-tx-meta strong { font-size: 14px; font-weight: 700; text-transform: capitalize; }
.acct-tx-meta span { font-size: 11.5px; color: rgba(243, 246, 241, 0.55); }
.acct-tx-amount {
  font-family: 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: 14px;
  white-space: nowrap;
}
.acct-tx-item.pos .acct-tx-amount { color: #34d399; }
.acct-tx-item.neg .acct-tx-amount { color: #facc15; }

.acct-skel-list { display: grid; gap: 8px; }
.acct-skel {
  height: 50px;
  border-radius: 10px;
  background: linear-gradient(110deg, rgba(255,255,255,.04) 8%, rgba(255,255,255,.10) 18%, rgba(255,255,255,.04) 33%);
  background-size: 200% 100%;
  animation: acctShimmer 1.2s linear infinite;
}
@keyframes acctShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
.acct-empty-state { color: rgba(243, 246, 241, 0.55); text-align: center; padding: 20px 0; }

/* Empty (logged-out) */
.acct-empty {
  min-height: calc(100vh - 100px);
  display: grid;
  place-items: center;
  padding: 40px 22px;
  background: #0a1a14;
  color: #f3f6f1;
  font-family: 'Bricolage Grotesque', system-ui, sans-serif;
}
.acct-empty-card { max-width: 460px; text-align: center; }
.acct-empty-card h1 {
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 10px 0 14px;
}
.acct-empty-eyebrow {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #facc15;
}
.acct-empty-cta {
  display: inline-block;
  margin-top: 18px;
  padding: 14px 22px;
  background: #16a34a;
  color: #fff;
  font-weight: 800;
  border-radius: 12px;
  text-decoration: none;
}

@media (min-width: 720px) {
  .acct { padding: 22px 22px 80px; max-width: 520px; }
}
`;

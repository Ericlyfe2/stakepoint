import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useMediaQuery from '../../premium/useMediaQuery.js';
import { StitchFooter, StitchTopNav } from '../../premium/StitchChrome.jsx';
import StitchTxList from '../../premium/StitchTxList.jsx';
import { TabBar } from './StitchMobile.jsx';
import { Ic } from '../../premium/parts.jsx';
import { formatAmt } from '../../lib/betslipEngine.js';
import { fetchTransactions, updateProfile, changePassword } from '../../api/betApi.js';
import { useAccount, useToast } from '../../providers/AccountProvider.jsx';

/* ---------------------------------------------------------------------------
   Stitch — Account
   Identity, balance and the account menu, with real actions only: deposits and
   withdrawals go through the production dialogs, transactions come from
   /wallet/transactions, and profile/password edits call the real endpoints.
   Legacy page retained at /classic/profile.
   ------------------------------------------------------------------------- */

function shortId(s = '') {
  return String(s).split('@')[0];
}

function statusLabel(status) {
  return String(status || 'STANDARD').toUpperCase();
}

export default function StitchProfile() {
  const isMobile = useMediaQuery('(max-width: 1023px)');
  const navigate = useNavigate();
  const { account, refresh, signOut, openDeposit, openWithdraw } = useAccount();
  const { toast } = useToast();

  const [sheet, setSheet] = useState(null);

  if (!account) {
    const empty = (
      <div className="stx-page">
        <div className="stx-bets-empty">
          <p className="stx-body-md">Sign in to manage your account, deposits and withdrawals.</p>
          <Link to="/login" className="stx-cta">Sign in</Link>
        </div>
      </div>
    );
    return isMobile ? (
      <div className="stx">
        <div className="stx-mob">
          <header className="stx-mob-head">
            <Link to="/" className="stx-brand" style={{ fontSize: 17 }}>BetXentra</Link>
          </header>
          <div className="stx-mob-body">{empty}</div>
        </div>
        <TabBar current="/profile" />
      </div>
    ) : (
      <div className="stx">
        <StitchTopNav slip={{ account, openDeposit }} current="/profile" />
        {empty}
        <StitchFooter current="/profile" />
      </div>
    );
  }

  const status = account.accountStatus || 'STANDARD';
  const identity = account.phone || shortId(account.email) || 'Account';
  const initials = String(identity).replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || 'BX';

  const handleSignOut = async () => {
    if (typeof window !== 'undefined' && !window.confirm('Sign out of BetXentra?')) return;
    try { await signOut(); } catch (e) { toast(e?.message || 'Sign-out failed.'); }
  };

  const menu = [
    { icon: '▤', label: 'Sports Bet History', onClick: () => navigate('/my-bets') },
    { icon: '⇄', label: 'Transactions', onClick: () => setSheet('transactions') },
    { icon: '★', label: 'Referral', onClick: () => navigate('/promos') },
    { icon: '◉', label: 'Notification Center', onClick: () => setSheet('notifications') },
    { icon: '✆', label: 'Customer Service', onClick: () => navigate('/help') },
    { icon: '⚙', label: 'Account Settings', onClick: () => setSheet('profile') },
    { icon: '⊘', label: 'Change Password', onClick: () => setSheet('security') },
    { icon: '⇥', label: 'Sign out', onClick: handleSignOut, tone: 'danger' },
  ];

  const content = (
    <div className="stx-page">
      <button type="button" className="stx-acct-id" onClick={() => setSheet('profile')}>
        <span className="stx-acct-avatar">{initials}</span>
        <span className="stx-acct-name">{identity}</span>
        <span className={`stx-acct-status${status === 'PREMIUM' ? ' stx-acct-status--premium' : ''}`}>
          {statusLabel(status)}
        </span>
      </button>

      <section className="stx-whero">
        <span className="stx-whero-label">Total balance</span>
        <div className="stx-whero-amt">
          <span className="cur">GHS</span>
          <span className="amt">{formatAmt(account.balance)}</span>
        </div>
        <div className="stx-whero-actions">
          <button type="button" className="stx-cta" onClick={openDeposit}>+ Deposit</button>
          <button type="button" className="stx-cta stx-cta--ghost" onClick={openWithdraw}>Withdraw</button>
        </div>
      </section>

      <nav className="stx-acct-menu" aria-label="Account menu">
        {menu.map((m) => (
          <button
            key={m.label}
            type="button"
            className={`stx-acct-item${m.tone ? ` stx-acct-item--${m.tone}` : ''}`}
            onClick={m.onClick}
          >
            <span className="stx-acct-item-ic" aria-hidden="true">{m.icon}</span>
            <span>{m.label}</span>
            <span className="stx-acct-item-chev" aria-hidden="true">›</span>
          </button>
        ))}
      </nav>
    </div>
  );

  return (
    <>
      {isMobile ? (
        <div className="stx">
          <div className="stx-mob">
            <header className="stx-mob-head">
              <Link to="/" className="stx-brand" style={{ fontSize: 17 }}>
                <span className="stx-brand-mark" style={{ width: 26, height: 26 }}>
                  <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 15, height: 15 }} aria-hidden="true">
                    <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" />
                  </svg>
                </span>
                BetXentra
              </Link>
              <div className="stx-right">
                <span className="stx-mob-bal"><span>BAL</span> GHS {formatAmt(account.balance)}</span>
                <button type="button" className="stx-depbtn" onClick={openDeposit}>+ ADD</button>
              </div>
            </header>
            <div className="stx-mob-body">{content}</div>
          </div>
          <TabBar current="/profile" />
        </div>
      ) : (
        <div className="stx">
          <StitchTopNav slip={{ account, openDeposit }} current="/profile" />
          {content}
          <StitchFooter current="/profile" />
        </div>
      )}

      {sheet === 'profile' && (
        <ProfileSheet
          account={account}
          onClose={() => setSheet(null)}
          onSaved={async () => { await refresh(); setSheet(null); toast('Profile updated.'); }}
        />
      )}
      {sheet === 'security' && (
        <PasswordSheet onClose={() => setSheet(null)} onSaved={() => { setSheet(null); toast('Password changed.'); }} />
      )}
      {sheet === 'transactions' && <TransactionsSheet onClose={() => setSheet(null)} />}
      {sheet === 'notifications' && <NotificationsSheet onClose={() => setSheet(null)} />}
    </>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="stx-modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="stx-modal-card" onClick={(e) => e.stopPropagation()}>
        <header className="stx-modal-head">
          <h2 className="stx-h3">{title}</h2>
          <button type="button" className="stx-modal-x" onClick={onClose} aria-label="Close">×</button>
        </header>
        {children}
      </div>
    </div>
  );
}

function Field({ label, hint, readOnly, ...rest }) {
  return (
    <label className={`stx-field${readOnly ? ' stx-field--readonly' : ''}`}>
      <span className="stx-field-label">{label}{hint && <span className="stx-muted"> · {hint}</span>}</span>
      <input className="stx-field-input" readOnly={readOnly} {...rest} />
    </label>
  );
}

function ProfileSheet({ account, onClose, onSaved }) {
  const [displayName, setDisplayName] = useState(account.displayName || '');
  const [phone, setPhone] = useState(account.phone || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    const trimmed = phone.trim();
    if (trimmed && !/^\+?\d[\d\s-]{8,18}$/.test(trimmed)) {
      setErr('Enter a valid phone number (e.g. 0244123456).');
      return;
    }
    try {
      setBusy(true);
      await updateProfile({ displayName, phone: trimmed });
      onSaved?.();
    } catch (e2) {
      setErr(e2?.message || 'Could not save changes.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Account Settings" onClose={onClose}>
      <form className="stx-form" onSubmit={submit}>
        <Field label="Email · login" value={account.email || ''} readOnly hint="Locked" />
        <Field label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Name on your slips" />
        <Field label="Phone number" hint="Withdrawals are sent here" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" maxLength={20} />
        {err && <p className="stx-form-err">{err}</p>}
        <button type="submit" className="stx-cta" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
      </form>
    </Modal>
  );
}

function PasswordSheet({ onClose, onSaved }) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (form.next.length < 8) return setErr('New password must be at least 8 characters.');
    if (!/[A-Z]/.test(form.next) || !/[a-z]/.test(form.next)) return setErr('Mix upper- and lower-case letters.');
    if (!/\d/.test(form.next)) return setErr('Include at least one digit.');
    if (form.next !== form.confirm) return setErr('Passwords do not match.');
    try {
      setBusy(true);
      await changePassword({ currentPassword: form.current, newPassword: form.next });
      onSaved?.();
    } catch (e) { setErr(e.message || 'Could not change password.'); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="Change Password" onClose={onClose}>
      <form onSubmit={submit} className="stx-acct-form">
        <Field label="Current password" type="password" autoComplete="current-password"
          value={form.current} onChange={(e) => setForm((p) => ({ ...p, current: e.target.value }))} />
        <Field label="New password" hint="8+ chars · mixed case · 1 digit" type="password" autoComplete="new-password"
          value={form.next} onChange={(e) => setForm((p) => ({ ...p, next: e.target.value }))} />
        <Field label="Confirm new password" type="password" autoComplete="new-password"
          value={form.confirm} onChange={(e) => setForm((p) => ({ ...p, confirm: e.target.value }))} />
        {err && <p className="stx-form-err">{err}</p>}
        <button type="submit" className="stx-cta" disabled={busy}>{busy ? 'Updating…' : 'Change password'}</button>
      </form>
    </Modal>
  );
}

function TransactionsSheet({ onClose }) {
  const [tx, setTx] = useState(null);
  useEffect(() => {
    fetchTransactions().then((d) => setTx(d.transactions || [])).catch(() => setTx([]));
  }, []);

  return (
    <Modal title="Transactions" onClose={onClose}>
      {tx === null
        ? <p className="stx-body-md stx-muted">Loading transactions…</p>
        : <StitchTxList txs={tx} empty="No transactions yet." />}
    </Modal>
  );
}

function NotificationsSheet({ onClose }) {
  const { notifications, unreadCount, clearNotifications, markNotificationRead } = useAccount();
  const severity = { info: '#3b82f6', success: '#22c55e', warning: '#f59e0b', critical: '#ef4444' };

  return (
    <Modal title={`Notifications${unreadCount > 0 ? ` (${unreadCount})` : ''}`} onClose={onClose}>
      {notifications.length === 0 ? (
        <p className="stx-body-md stx-muted">You have no notifications.</p>
      ) : (
        <>
          {unreadCount > 0 && (
            <button type="button" className="stx-cta stx-cta--ghost" onClick={clearNotifications}>Mark all read</button>
          )}
          <ul className="stx-notif">
            {notifications.map((n) => (
              <li key={n.id} className={n.read ? 'is-read' : undefined} onClick={() => markNotificationRead(n.id)}>
                <span className="stx-notif-dot" style={{ background: severity[n.severity] || '#3b82f6' }} />
                <div>
                  <strong>{n.title}</strong>
                  {n.body && <p className="stx-body-sm stx-muted">{n.body}</p>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}

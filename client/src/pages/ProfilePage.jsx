import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchProfile, updateProfile, fetchActivity, fetchTransactions, changePassword } from '../api/betApi.js';
import { useAccount, useToast } from '../providers/AccountProvider.jsx';
import Skeleton from '../components/Skeleton.jsx';
import PageBack from '../components/PageBack.jsx';

function formatAmt(n) {
  return Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ProfilePage() {
  const { account, refresh } = useAccount();
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState(account?.displayName || '');
  const [phone, setPhone]             = useState(account?.phone || '');
  const [activity, setActivity]       = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [tab, setTab] = useState('overview');
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState('');
  const [profileErr, setProfileErr] = useState('');

  useEffect(() => {
    if (!account) return;
    setDisplayName(account.displayName || '');
    setPhone(account.phone || '');
    fetchActivity().then((d) => setActivity(d.activity || [])).catch(() => {});
    fetchTransactions().then((d) => setTransactions(d.transactions || [])).catch(() => {});
  }, [account]);

  if (!account) {
    return (
      <main className="page-wrap">
        <h1>Sign in to view your profile</h1>
        <p style={{ color: 'var(--text-soft)', marginTop: 12 }}>
          <Link className="link" to="/login">Sign in</Link> or <Link className="link" to="/login?mode=register">create an account</Link>.
        </p>
      </main>
    );
  }

  const saveProfile = async (e) => {
    e.preventDefault();
    setProfileErr('');
    const trimmedPhone = phone.trim();
    if (trimmedPhone && !/^\+?\d[\d\s-]{8,18}$/.test(trimmedPhone)) {
      setProfileErr('Enter a valid phone number (e.g. 0244123456 or +233244123456).');
      return;
    }
    try {
      setBusy(true);
      await updateProfile({ displayName, phone: trimmedPhone });
      await refresh();
      toast('Profile saved.');
    } catch (e) {
      const msg = e.message || 'Could not save profile.';
      setProfileErr(msg);
      toast(msg);
    } finally { setBusy(false); }
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    setErr('');
    if (pwForm.next.length < 8) { setErr('New password must be at least 8 characters.'); return; }
    if (!/[A-Z]/.test(pwForm.next) || !/[a-z]/.test(pwForm.next)) { setErr('Mix upper- and lower-case letters.'); return; }
    if (!/\d/.test(pwForm.next)) { setErr('Include at least one digit.'); return; }
    if (pwForm.next !== pwForm.confirm) { setErr('Passwords don’t match.'); return; }
    try {
      setBusy(true);
      await changePassword({ currentPassword: pwForm.current, newPassword: pwForm.next });
      setPwForm({ current: '', next: '', confirm: '' });
      toast('Password updated. Other sessions were signed out.');
    } catch (e) {
      setErr(e.message || 'Could not change password.');
    } finally { setBusy(false); }
  };

  return (
    <main className="page-wrap">
      <PageBack />
      <div className="page-head">
        <p className="eyebrow">ACCOUNT</p>
        <h1>{account.displayName || account.email}</h1>
        <p className="lede">{account.email} · Balance <strong>GHS {formatAmt(account.balance)}</strong></p>
      </div>

      <div className="page-toolbar">
        <div className="filter-bar" style={{ marginBottom: 0 }}>
          {[
            ['overview',     'Overview'],
            ['transactions', 'Transactions'],
            ['security',     'Security'],
            ['activity',     'Activity'],
          ].map(([k, label]) => (
            <button key={k} type="button" className={`chip${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
      </div>

      {tab === 'overview' && (
        <section className="profile-card">
          <h3>Profile details</h3>
          <form onSubmit={saveProfile}>
            <label className="dlg-label">Email</label>
            <input value={account.email} disabled className="search-input" style={{ width: '100%', marginBottom: 12 }} />
            <label className="dlg-label">Display name</label>
            <input className="search-input" style={{ width: '100%', marginBottom: 12 }}
                   value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            <label className="dlg-label" htmlFor="profile-phone">
              Phone number
              <span style={{ marginLeft: 6, color: 'var(--text-dim)', fontWeight: 400, fontSize: 11 }}>
                — withdrawals are sent to this number
              </span>
            </label>
            <input
              id="profile-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              className="search-input"
              style={{ width: '100%', marginBottom: 8 }}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 0244123456 or +233244123456"
              maxLength={20}
            />
            {profileErr && (
              <p style={{
                margin: '0 0 12px',
                fontSize: 12,
                color: 'var(--accent-hot, #e54848)',
                fontWeight: 600,
              }}>{profileErr}</p>
            )}
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
          </form>
        </section>
      )}

      {tab === 'transactions' && (
        <section className="profile-card">
          <h3>Recent transactions</h3>
          {transactions === null ? (
            <div>{Array.from({ length: 4 }).map((_, i) => <Skeleton.Row key={i} />)}</div>
          ) : transactions.length === 0 ? (
            <p style={{ color: 'var(--text-dim)' }}>No transactions yet.</p>
          ) : (
            <ul className="tx-list">
              {transactions.map((tx) => (
                <li key={tx.id} className={`tx-item ${tx.amount >= 0 ? 'pos' : 'neg'}`}>
                  <div>
                    <strong>{tx.kind.replace('_', ' ')}</strong>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{new Date(tx.at).toLocaleString()}</div>
                  </div>
                  <div className="tx-amount">{tx.amount >= 0 ? '+' : ''}GHS {formatAmt(tx.amount)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'security' && (
        <section className="profile-card">
          <h3>Change password</h3>
          <form onSubmit={submitPassword}>
            <label className="dlg-label">Current password</label>
            <input type="password" autoComplete="current-password" className="search-input" style={{ width: '100%', marginBottom: 12 }}
                   value={pwForm.current} onChange={(e) => setPwForm((p) => ({ ...p, current: e.target.value }))} />
            <label className="dlg-label">New password</label>
            <input type="password" autoComplete="new-password" className="search-input" style={{ width: '100%', marginBottom: 12 }}
                   value={pwForm.next} onChange={(e) => setPwForm((p) => ({ ...p, next: e.target.value }))} />
            <label className="dlg-label">Confirm new password</label>
            <input type="password" autoComplete="new-password" className="search-input" style={{ width: '100%', marginBottom: 12 }}
                   value={pwForm.confirm} onChange={(e) => setPwForm((p) => ({ ...p, confirm: e.target.value }))} />
            {err && <div className="err" style={{ marginBottom: 10 }}>{err}</div>}
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Updating…' : 'Change password'}</button>
          </form>
        </section>
      )}

      {tab === 'activity' && (
        <section className="profile-card">
          <h3>Recent activity</h3>
          {activity === null ? (
            <div>{Array.from({ length: 5 }).map((_, i) => <Skeleton.Row key={i} />)}</div>
          ) : activity.length === 0 ? (
            <p style={{ color: 'var(--text-dim)' }}>No activity recorded yet.</p>
          ) : (
            <ul className="activity-list">
              {activity.map((a, i) => (
                <li key={i}>
                  <strong>{a.kind.replace('_', ' ')}</strong>
                  <span style={{ color: 'var(--text-dim)', fontSize: 12, marginLeft: 8 }}>{new Date(a.at).toLocaleString()}</span>
                  {a.ip && <span style={{ color: 'var(--text-dim)', fontSize: 11, marginLeft: 8 }}>· {a.ip}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}

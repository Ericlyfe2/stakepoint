/**
 * Users management.
 *  - Filterable / searchable / sortable table
 *  - Drawer with profile, KYC, wallet, tags, notes, bets, login history
 *  - Privileged actions:
 *      moderator+ : suspend/unsuspend, verify email, KYC, tags, notes
 *      finance+   : wallet adjust
 *      super only : password reset
 *  - CSV export
 */
import { Fragment, useEffect, useMemo, useState, useRef } from 'react';
import { useAdmin } from '../../providers/AdminProvider.jsx';
import {
  adminListUsers, adminGetUser, adminUserBets, adminUserTx, adminUserLogins,
  adminUserStatus, adminUserKyc, adminUserWallet, adminUserTags, adminUserNotes,
  adminUserReset, adminImpersonate, adminDeleteUser, adminBulkDeleteUsers,
  adminDeleteAllUsers,
  adminCreateUser, adminUserCredentials,
  adminUserAccountStatus, adminBulkAccountStatus,
} from '../../api/adminApi.js';

function toBookingCode(id = '') {
  const s = String(id).replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (!s) return 'XX00000';
  const letters = (s.match(/[A-Z]/g) || ['X', 'X']).slice(0, 2).join('').padEnd(2, 'X');
  const digits  = (s.match(/[0-9]/g) || ['0']).slice(-5).join('').padStart(5, '0');
  return letters + digits;
}


import { Card, Badge, Drawer, Modal, Empty, SkeletonRow, moneyFmt, numFmt, ago, dateShort } from '../../components/admin/primitives.jsx';
import {
  IconSearch, IconDownload, IconRefresh, IconBan, IconCheck, IconKey, IconUsers, IconActivity, IconCash,
} from '../../components/admin/Icons.jsx';

function IconTrash({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

const KYC_TONES = { verified: 'success', pending: 'warn', rejected: 'danger', unverified: 'default' };

export default function UsersPage() {
  const { hasRole, showToast } = useAdmin();
  const [filters, setFilters] = useState({ q: '', status: 'all', kyc: '', sort: 'createdAt', dir: 'desc' });
  const [page, setPage]   = useState({ offset: 0, limit: 50 });
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [drawerTab, setDrawerTab] = useState('profile');
  const [picked, setPicked] = useState(new Set()); // user ids ticked for bulk action
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const debounceRef = useRef(0);
  const isSuper = hasRole();

  async function load() {
    setLoading(true);
    try {
      const res = await adminListUsers({
        q: filters.q, status: filters.status, kyc: filters.kyc,
        sort: filters.sort, dir: filters.dir,
        offset: page.offset, limit: page.limit,
      });
      setData(res);
    } catch (e) {
      showToast(e.message || 'Failed to load users', 'error');
    } finally { setLoading(false); }
  }

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(load, 200);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.q, filters.status, filters.kyc, filters.sort, filters.dir, page.offset, page.limit]);

  function openUser(u) {
    setSelected(u);
    setDrawerTab('profile');
  }

  function togglePick(id, e) {
    e.stopPropagation();
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function togglePickAll() {
    if (!data?.users) return;
    setPicked((cur) => {
      if (cur.size === data.users.length) return new Set();
      return new Set(data.users.map((u) => u.id));
    });
  }

  async function deleteUser(u) {
    const updated = data?.users?.filter((x) => x.id !== u.id) || [];
    setData((d) => d ? { ...d, users: updated, total: Math.max(0, d.total - 1) } : d);
    setSelected(null);
    setPicked((cur) => { const n = new Set(cur); n.delete(u.id); return n; });
    showToast(`Deleted ${u.email}.`);
  }

  async function bulkDelete(reason) {
    const ids = Array.from(picked);
    if (!ids.length) return;
    try {
      const r = await adminBulkDeleteUsers(ids, reason);
      showToast(`Deleted ${r.deleted.length} account${r.deleted.length === 1 ? '' : 's'}${r.skipped.length ? ` · ${r.skipped.length} skipped` : ''}.`);
      setPicked(new Set());
      setBulkOpen(false);
      load();
    } catch (e) {
      showToast(e.message || 'Bulk delete failed', 'error');
    }
  }

  async function bulkStatus(targetStatus, note) {
    const ids = Array.from(picked);
    if (!ids.length) return;
    try {
      const r = await adminBulkAccountStatus(ids, targetStatus, note);
      showToast(`Updated ${r.updated} account${r.updated === 1 ? '' : 's'} to ${targetStatus}.`);
      setPicked(new Set());
      setBulkStatusOpen(false);
      load();
    } catch (e) {
      showToast(e.message || 'Bulk status update failed', 'error');
    }
  }

  async function deleteAll(reason) {
    try {
      const r = await adminDeleteAllUsers(reason);
      showToast(`Deleted ${r.deleted} users and ${r.removedBets} bets.`);
      setDeleteAllOpen(false);
      setPicked(new Set());
      load();
    } catch (e) {
      showToast(e.message || 'Delete all failed', 'error');
    }
  }

  function exportCsv() {
    if (!data?.users?.length) return;
    const headers = ['id', 'email', 'displayName', 'balance', 'kycStatus', 'suspended', 'createdAt'];
    const rows = data.users.map((u) => headers.map((h) => JSON.stringify(u[h] ?? '')).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <header className="adm-page-head">
        <div>
          <h1>Users</h1>
          <p>Search, audit, and manage every player on the platform. Actions are recorded in the audit log.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="adm-btn" onClick={load}><IconRefresh size={14} /> Refresh</button>
          <button className="adm-btn" onClick={exportCsv}><IconDownload size={14} /> Export CSV</button>
          {isSuper && (
            <button className="adm-btn primary" onClick={() => setCreateOpen(true)}><IconUsers size={14} /> Add user</button>
          )}
          {isSuper && data?.total > 0 && (
            <button className="adm-btn danger" onClick={() => setDeleteAllOpen(true)}><IconTrash size={14} /> Delete all</button>
          )}
        </div>
      </header>

      <div className="adm-stat-grid">
        <StatTile label="Total users" value={numFmt(data?.total)} />
        <StatTile label="Active" value={numFmt(data?.users?.filter((u) => !u.suspended && u.emailVerified).length)} />
        <StatTile label="Suspended" value={numFmt(data?.users?.filter((u) => u.suspended).length)} />
        <StatTile label="KYC pending" value={numFmt(data?.users?.filter((u) => u.kycStatus === 'pending').length)} />
      </div>

      <div className="adm-table-wrap">
        <div className="adm-table-toolbar">
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', minWidth: 280 }}>
            <IconSearch size={14} style={{ position: 'absolute', left: 12, color: 'var(--text-mute)' }} />
            <input style={{ paddingLeft: 34 }} placeholder="Search email, name or id…"
                   value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} />
          </div>
          <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="unverified">Unverified</option>
            <option value="standard">Standard</option>
            <option value="premium">Premium</option>
          </select>
          <select value={filters.kyc} onChange={(e) => setFilters((f) => ({ ...f, kyc: e.target.value }))}>
            <option value="">Any KYC</option>
            <option value="verified">Verified</option>
            <option value="pending">Pending</option>
            <option value="unverified">Unverified</option>
            <option value="rejected">Rejected</option>
          </select>
          <select value={`${filters.sort}:${filters.dir}`} onChange={(e) => {
            const [sort, dir] = e.target.value.split(':');
            setFilters((f) => ({ ...f, sort, dir }));
          }}>
            <option value="createdAt:desc">Newest first</option>
            <option value="createdAt:asc">Oldest first</option>
            <option value="balance:desc">Highest balance</option>
            <option value="balance:asc">Lowest balance</option>
            <option value="email:asc">Email A–Z</option>
          </select>
          <div className="grow" />
          <div style={{ color: 'var(--text-dim)', fontSize: 12.5 }}>
            {data ? `${data.users.length} of ${data.total}` : '—'}
          </div>
        </div>
        {picked.size > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px',
            background: 'linear-gradient(135deg, rgba(214,58,44,.10), rgba(214,58,44,.04))',
            borderBottom: '1px solid var(--border)',
          }}>
            <strong style={{ fontSize: 13 }}>{picked.size} selected</strong>
            <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>Choose a bulk action</span>
            <div className="grow" />
            <button className="adm-btn ghost" onClick={() => setPicked(new Set())}>Clear</button>
            <button className="adm-btn" onClick={() => setBulkStatusOpen(true)}>
              <IconCheck size={14} /> Set account status
            </button>
            {isSuper && (
              <button className="adm-btn danger" onClick={() => setBulkOpen(true)}>
                <IconTrash size={14} /> Delete selected
              </button>
            )}
          </div>
        )}
        <div className="adm-table-scroll">
          <table className="adm-table">
            <thead>
              <tr>
                {isSuper && (
                  <th style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      onClick={(e) => e.stopPropagation()}
                      checked={!!data?.users?.length && picked.size === data.users.length}
                      onChange={togglePickAll}
                    />
                  </th>
                )}
                <th>User</th>
                <th>Status</th>
                <th>KYC</th>
                <th className="num">Balance</th>
                <th className="num">Bets</th>
                <th className="num">Deposits</th>
                <th>Tags</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} cols={isSuper ? 9 : 8} />)}
              {!loading && data?.users?.length === 0 && (
                <tr><td colSpan={isSuper ? 9 : 8}><Empty title="No users match" subtitle="Try adjusting your filters." /></td></tr>
              )}
              {!loading && data?.users?.map((u) => (
                <tr key={u.id} onClick={() => openUser(u)} className={selected?.id === u.id ? 'selected' : ''}>
                  {isSuper && (
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${u.email}`}
                        checked={picked.has(u.id)}
                        onChange={(e) => togglePick(u.id, e)}
                      />
                    </td>
                  )}
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 9,
                        display: 'grid', placeItems: 'center',
                        background: 'var(--grad-brand)', color: '#fff',
                        fontWeight: 700, fontSize: 13,
                      }}>{(u.displayName || u.email).charAt(0).toUpperCase()}</div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{u.displayName || u.email}</div>
                        <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {u.suspended
                        ? <Badge tone="danger">Suspended</Badge>
                        : u.emailVerified
                          ? <Badge tone="success" dot>Active</Badge>
                          : <Badge tone="warn">Unverified</Badge>}
                      {u.accountStatus === 'PREMIUM' && (
                        <Badge tone="warn" dot>Premium</Badge>
                      )}
                    </div>
                  </td>
                  <td><Badge tone={KYC_TONES[u.kycStatus] || 'default'}>{u.kycStatus || 'unverified'}</Badge></td>
                  <td className="num"><strong>{moneyFmt(u.balance, u.currency)}</strong></td>
                  <td className="num">{u.stats?.bets ?? 0}</td>
                  <td className="num">{moneyFmt(u.stats?.depositTotal)}</td>
                  <td>{(u.tags || []).slice(0, 2).map((t) => <span key={t} style={{ marginRight: 4 }}><Badge tone="brand">{t}</Badge></span>)}</td>
                  <td title={dateShort(u.createdAt)}>{ago(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <UserDrawer
        open={!!selected}
        user={selected}
        tab={drawerTab}
        setTab={setDrawerTab}
        onClose={() => setSelected(null)}
        onUpdate={(updated) => {
          setSelected(updated);
          setData((d) => d ? { ...d, users: d.users.map((u) => u.id === updated.id ? updated : u) } : d);
        }}
        onDeleted={deleteUser}
        hasRole={hasRole}
        showToast={showToast}
      />

      <BulkDeleteModal
        open={bulkOpen}
        count={picked.size}
        onClose={() => setBulkOpen(false)}
        onConfirm={bulkDelete}
      />

      <BulkStatusModal
        open={bulkStatusOpen}
        count={picked.size}
        onClose={() => setBulkStatusOpen(false)}
        onConfirm={bulkStatus}
      />

      <CreateUserModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(user) => {
          setCreateOpen(false);
          showToast(`Created ${user.email}.`);
          load();
        }}
        showToast={showToast}
      />

      <DeleteAllModal
        open={deleteAllOpen}
        count={data?.total || 0}
        onClose={() => setDeleteAllOpen(false)}
        onConfirm={deleteAll}
      />
    </>
  );
}

function CreateUserModal({ open, onClose, onCreated, showToast }) {
  const [form, setForm] = useState({ email: '', password: '', displayName: '', country: 'GH', balance: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setForm({ email: '', password: '', displayName: '', country: 'GH', balance: '' }); }, [open]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const { user } = await adminCreateUser({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        displayName: form.displayName.trim() || undefined,
        country: form.country || undefined,
        balance: form.balance ? Number(form.balance) : 0,
      });
      onCreated(user);
    } catch (err) {
      showToast(err.message || 'Could not create user.', 'error');
    } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose}
           title="Add user"
           description="Create a real account. The user can sign in immediately with the credentials below.">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="adm-field">
          <label>Email or phone</label>
          <input className="adm-input" required value={form.email}
                 onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                 placeholder="you@example.com or 233241234567" autoFocus />
        </div>
        <div className="adm-field">
          <label>Initial password</label>
          <input className="adm-input" type="text" required minLength={8} value={form.password}
                 onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                 placeholder="At least 8 chars, mixed case + a digit" />
        </div>
        <div className="adm-field">
          <label>Display name (optional)</label>
          <input className="adm-input" value={form.displayName}
                 onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} />
        </div>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
          <div className="adm-field">
            <label>Country (ISO-2)</label>
            <input className="adm-input" maxLength={2} value={form.country}
                   onChange={(e) => setForm((f) => ({ ...f, country: e.target.value.toUpperCase() }))} />
          </div>
          <div className="adm-field">
            <label>Opening balance (GHS)</label>
            <input className="adm-input" type="number" min="0" step="0.01" value={form.balance}
                   onChange={(e) => setForm((f) => ({ ...f, balance: e.target.value }))} />
          </div>
        </div>
        <div className="adm-modal-actions">
          <button type="button" className="adm-btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="adm-btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create user'}</button>
        </div>
      </form>
    </Modal>
  );
}

function BulkDeleteModal({ open, count, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');
  useEffect(() => { if (open) { setReason(''); setConfirmText(''); } }, [open]);
  const phrase = `delete ${count}`;
  const ready = confirmText.trim().toLowerCase() === phrase;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Permanently delete ${count} account${count === 1 ? '' : 's'}?`}
      description="Removes the user records, their bet history, and transaction ledger. Sessions are revoked. This action is logged as critical in the audit log and cannot be undone."
      footer={null}
    >
      <form
        onSubmit={(e) => { e.preventDefault(); if (ready) onConfirm(reason || 'bulk delete'); }}
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <div className="adm-field">
          <label>Reason (recorded in audit log)</label>
          <input
            className="adm-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. duplicate signups, fraud sweep"
            maxLength={500}
            autoFocus
          />
        </div>
        <div className="adm-field">
          <label>Type <code style={{ fontFamily: 'var(--ff-mono)', background: 'var(--surface-soft, rgba(255,255,255,.05))', padding: '1px 6px', borderRadius: 4 }}>{phrase}</code> to confirm</label>
          <input
            className="adm-input"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={phrase}
          />
        </div>
        <div className="adm-modal-actions">
          <button type="button" className="adm-btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="adm-btn danger" disabled={!ready}>
            <IconTrash size={14} /> Permanently delete
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteAllModal({ open, count, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');
  useEffect(() => { if (open) { setReason(''); setConfirmText(''); } }, [open]);
  const phrase = `delete all ${count}`;
  const ready = confirmText.trim().toLowerCase() === phrase;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`⚠ Permanently delete ALL ${count} users?`}
      description="This removes EVERY user record, bet history, and transaction ledger. All sessions are revoked. This action is logged as critical in the audit log and CANNOT BE UNDONE."
      footer={null}
    >
      <form
        onSubmit={(e) => { e.preventDefault(); if (ready) onConfirm(reason || 'delete all'); }}
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <div className="adm-field">
          <label>Reason (recorded in audit log)</label>
          <input
            className="adm-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. test data cleanup, platform reset"
            maxLength={500}
            autoFocus
          />
        </div>
        <div className="adm-field">
          <label>Type <code style={{ fontFamily: 'var(--ff-mono)', background: 'var(--surface-soft, rgba(255,255,255,.05))', padding: '1px 6px', borderRadius: 4 }}>{phrase}</code> to confirm</label>
          <input
            className="adm-input"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={phrase}
          />
        </div>
        <div className="adm-modal-actions">
          <button type="button" className="adm-btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="adm-btn danger" disabled={!ready}>
            <IconTrash size={14} /> Wipe all users
          </button>
        </div>
      </form>
    </Modal>
  );
}

function BulkStatusModal({ open, count, onClose, onConfirm }) {
  const [targetStatus, setTargetStatus] = useState('PREMIUM');
  const [note, setNote] = useState('');
  useEffect(() => { if (open) { setTargetStatus('PREMIUM'); setNote(''); } }, [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Set account status for ${count} user${count === 1 ? '' : 's'}`}
      description="Changes the accountStatus field. PREMIUM enables premium-only features; STANDARD is the default level for all new accounts."
      footer={null}
    >
      <form
        onSubmit={(e) => { e.preventDefault(); onConfirm(targetStatus, note || `bulk set to ${targetStatus}`); }}
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          {['PREMIUM', 'STANDARD'].map((s) => (
            <button key={s} type="button" className={`adm-btn ${targetStatus === s ? 'primary' : ''}`} onClick={() => setTargetStatus(s)}>
              {s === 'PREMIUM' ? '★ PREMIUM' : '○ STANDARD'}
            </button>
          ))}
        </div>
        <div className="adm-field">
          <label>Note (recorded in audit log)</label>
          <input
            className="adm-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. sweep upgrade, batch correction"
            maxLength={500}
            autoFocus
          />
        </div>
        <div className="adm-modal-actions">
          <button type="button" className="adm-btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="adm-btn primary">
            Set to {targetStatus}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function StatTile({ label, value }) {
  return (
    <div className="adm-stat" style={{ '--accentGrad': 'linear-gradient(135deg,#7c5cff,#22d3ee)' }}>
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
    </div>
  );
}

/* ------------------- Drawer ------------------- */

function UserDrawer({ open, user, tab, setTab, onClose, onUpdate, onDeleted, hasRole, showToast }) {
  const [detail, setDetail]   = useState(null);
  const [bets, setBets]       = useState([]);
  const [tx, setTx]           = useState([]);
  const [logins, setLogins]   = useState([]);
  const [walletOpen, setWalletOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [credentials, setCredentials] = useState(null);
  const [openBet, setOpenBet] = useState(null);

  useEffect(() => {
    if (!open || !user) return;
    setDetail(null); setBets([]); setTx([]); setLogins([]); setCredentials(null); setOpenBet(null);
    (async () => {
      try {
        const [d, b, t, l] = await Promise.all([
          adminGetUser(user.id),
          adminUserBets(user.id),
          adminUserTx(user.id),
          adminUserLogins(user.id),
        ]);
        setDetail(d.user);
        setBets(b.bets || []);
        setTx(t.transactions || []);
        setLogins(l.events || []);
      } catch (e) {
        showToast(e.message || 'Failed to load user.', 'error');
      }
    })();
  }, [open, user?.id, showToast]);

  async function doStatus(action) {
    try {
      const { user: updated } = await adminUserStatus(user.id, action);
      setDetail(updated);
      onUpdate(updated);
      showToast(`User ${action}d.`);
    } catch (e) { showToast(e.message, 'error'); }
  }
  async function doKyc(status) {
    try {
      const { user: updated } = await adminUserKyc(user.id, status);
      setDetail(updated); onUpdate(updated);
      showToast(`KYC set to ${status}.`);
    } catch (e) { showToast(e.message, 'error'); }
  }
  async function doAccountStatus(status) {
    try {
      const { user: updated } = await adminUserAccountStatus(user.id, status);
      setDetail(updated); onUpdate(updated);
      showToast(`Account status set to ${status}.`);
    } catch (e) { showToast(e.message, 'error'); }
  }
  async function saveTags(tags) {
    try {
      const { user: updated } = await adminUserTags(user.id, tags);
      setDetail(updated); onUpdate(updated);
      showToast('Tags saved.');
    } catch (e) { showToast(e.message, 'error'); }
  }
  async function saveNotes(notes) {
    try {
      const { user: updated } = await adminUserNotes(user.id, notes);
      setDetail(updated); onUpdate(updated);
    } catch (e) { showToast(e.message, 'error'); }
  }
  async function adjustWallet(delta, reason) {
    try {
      const { user: updated } = await adminUserWallet(user.id, delta, reason);
      setDetail(updated); onUpdate(updated);
      showToast(`Wallet adjusted by ${moneyFmt(delta)}.`);
      setWalletOpen(false);
    } catch (e) { showToast(e.message, 'error'); }
  }
  async function resetPassword() {
    if (!confirm('Reset this user\'s password? Their sessions will be revoked.')) return;
    try {
      const r = await adminUserReset(user.id);
      prompt('Temporary password (share securely with the user):', r.tempPassword);
    } catch (e) { showToast(e.message, 'error'); }
  }
  async function impersonateUser() {
    try {
      const r = await adminImpersonate(user.id);
      const loginUrl = `${window.location.origin}/login?token=${r.token}&redirect=/`;
      window.open(loginUrl, '_blank');
      showToast('User login link opened in new tab.');
    } catch (e) { showToast(e.message, 'error'); }
  }
  async function confirmDelete(reason) {
    try {
      await adminDeleteUser(user.id, reason);
      onDeleted?.(user);
      setDeleteOpen(false);
    } catch (e) { showToast(e.message || 'Delete failed', 'error'); }
  }
  async function viewCredentials() {
    try {
      const c = await adminUserCredentials(user.id);
      setCredentials(c);
    } catch (e) { showToast(e.message || 'Could not load credentials.', 'error'); }
  }

  if (!open || !user) return null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={detail?.displayName || user.displayName || user.email}
      footer={hasRole('moderator') ? (
        <>
          {user.suspended
            ? <button className="adm-btn success" onClick={() => doStatus('unsuspend')}><IconCheck size={14} /> Unsuspend</button>
            : <button className="adm-btn warn"    onClick={() => doStatus('suspend')}><IconBan size={14} /> Suspend</button>}
          {(detail?.emailVerified ?? user.emailVerified)
            ? <button className="adm-btn ghost" onClick={() => doStatus('unverify')}><IconBan size={14} /> Revoke verification</button>
            : <button className="adm-btn success" onClick={() => doStatus('verify')}><IconCheck size={14} /> Verify user</button>}
          {hasRole('finance_admin') && (
            <button className="adm-btn" onClick={() => setWalletOpen(true)}><IconCash size={14} /> Adjust wallet</button>
          )}
          <button className="adm-btn ghost" onClick={resetPassword}><IconKey size={14} /> Reset password</button>
          {hasRole() && (
            <>
              <button className="adm-btn" onClick={viewCredentials}><IconKey size={14} /> View credentials</button>
              <button className="adm-btn" onClick={impersonateUser}><IconUsers size={14} /> Login as user</button>
              <button className="adm-btn danger" onClick={() => setDeleteOpen(true)}>
                <IconTrash size={14} /> Delete account
              </button>
            </>
          )}
        </>
      ) : null}
    >
      <div className="adm-drawer-tabs" style={{ marginLeft: -22, marginRight: -22, padding: '0 22px' }}>
        {['profile', 'bets', 'transactions', 'activity'].map((t) => (
          <button key={t} className={`adm-drawer-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'profile' ? 'Profile' : t === 'bets' ? `Bets (${bets.length})` : t === 'transactions' ? `Tx (${tx.length})` : `Activity (${logins.length})`}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <ProfileTab
          user={detail || user}
          logins={logins}
          hasRole={hasRole}
          onKyc={doKyc}
          onAccountStatus={doAccountStatus}
          onTags={saveTags}
          onNotes={saveNotes}
        />
      )}

      {tab === 'bets' && (
        bets.length === 0 ? <Empty title="No bets" /> : (
          <table className="adm-table">
            <thead><tr><th>Code</th><th>Status</th><th>Mode</th><th className="num">Stake</th><th className="num">Win</th><th>Placed</th><th></th></tr></thead>
            <tbody>
              {bets.map((b) => {
                const code = b.bookingCode || toBookingCode(b.id);
                const isOpen = openBet?.id === b.id;
                return (
                  <Fragment key={b.id}>
                    <tr style={{ cursor: 'pointer' }} onClick={() => setOpenBet(isOpen ? null : b)}>
                      <td style={{ fontFamily: 'var(--ff-mono)', fontSize: 13, fontWeight: 700 }}>{code}</td>
                      <td><span className={`bet-status ${b.status}`}>{b.status}{b.deleted ? ' (deleted)' : ''}</span></td>
                      <td>{b.mode}</td>
                      <td className="num">{moneyFmt(b.stake)}</td>
                      <td className="num">{moneyFmt(b.potentialWin)}</td>
                      <td>{ago(b.placedAt)}</td>
                      <td className="row-actions" style={{ textAlign: 'right' }}>
                        <button className="adm-btn sm" onClick={(e) => { e.stopPropagation(); setOpenBet(isOpen ? null : b); }}>
                          {isOpen ? 'Hide' : 'Slip'}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={7} style={{ background: 'var(--surface-soft)' }}>
                          <BetSlipPreview bet={b} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )
      )}

      {tab === 'transactions' && (
        tx.length === 0 ? <Empty title="No transactions" /> : (
          <table className="adm-table">
            <thead><tr><th>Kind</th><th>Method</th><th className="num">Amount</th><th>Status</th><th>When</th></tr></thead>
            <tbody>
              {tx.map((t) => (
                <tr key={t.id}>
                  <td>{t.kind?.replace(/_/g, ' ')}</td>
                  <td>{t.method || '—'}</td>
                  <td className="num"><strong style={{ color: t.amount > 0 ? 'var(--accent)' : 'var(--danger)' }}>{moneyFmt(t.amount)}</strong></td>
                  <td><Badge tone={t.status === 'completed' ? 'success' : t.status === 'pending' ? 'warn' : 'default'}>{t.status}</Badge></td>
                  <td>{ago(t.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      {tab === 'activity' && (
        logins.length === 0 ? <Empty title="No login events" /> : (
          <div className="adm-list-feed">
            {logins.map((e, i) => (
              <div key={i} className="row">
                <span className={`dot ${e.kind?.includes('failed') ? 'danger' : ''}`} />
                <div>
                  <div style={{ fontWeight: 600 }}>{e.kind?.replace(/_/g, ' ')}</div>
                  <div className="meta">{e.ip} {e.userAgent ? `· ${e.userAgent.slice(0, 40)}…` : ''}</div>
                </div>
                <div className="meta">{ago(e.at)}</div>
              </div>
            ))}
          </div>
        )
      )}

      <WalletModal open={walletOpen} onClose={() => setWalletOpen(false)} user={detail || user} onSubmit={adjustWallet} />
      <DeleteUserModal open={deleteOpen} onClose={() => setDeleteOpen(false)} user={detail || user} onConfirm={confirmDelete} />
      <CredentialsModal open={!!credentials} onClose={() => setCredentials(null)} data={credentials} />
    </Drawer>
  );
}

function BetSlipPreview({ bet }) {
  const code = bet.bookingCode || toBookingCode(bet.id);
  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--ff-mono)', fontWeight: 800, fontSize: 16 }}>{code}</span>
        <Badge tone="brand">{bet.mode}</Badge>
        <Badge tone={bet.status === 'won' ? 'success' : bet.status === 'lost' ? 'danger' : bet.status === 'void' ? 'warn' : 'info'} dot>{bet.status}</Badge>
        {bet.deleted && <Badge tone="danger">Deleted</Badge>}
        <span style={{ marginLeft: 'auto', color: 'var(--text-dim)', fontSize: 12 }}>{dateShort(bet.placedAt)}</span>
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13 }}>
        <span>Stake <strong>{moneyFmt(bet.stake)}</strong></span>
        <span>Total odds <strong>{(bet.totalOdds || 0).toFixed(2)}×</strong></span>
        <span>Potential <strong>{moneyFmt(bet.potentialWin)}</strong></span>
        {typeof bet.bonusRate === 'number' && <span>Bonus <strong>{(bet.bonusRate * 100).toFixed(0)}%</strong></span>}
      </div>
      <table className="adm-table" style={{ margin: 0 }}>
        <thead><tr><th>Match</th><th>Market</th><th>Pick</th><th className="num">Odds</th><th>Sport</th></tr></thead>
        <tbody>
          {(bet.legs || []).map((l, i) => (
            <tr key={i}>
              <td>{l.home} <span style={{ color: 'var(--text-dim)' }}>vs</span> {l.away}</td>
              <td>{l.marketName || l.market}</td>
              <td>{l.outcome}</td>
              <td className="num">{Number(l.odds || 0).toFixed(2)}</td>
              <td>{l.sport || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(bet.settledBy || bet.cancelledBy || bet.deletedBy) && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          {bet.settledBy  && <>Settled by <strong>{bet.settledBy}</strong> · {dateShort(bet.settledAt)}{bet.settleReason ? ` · ${bet.settleReason}` : ''}<br /></>}
          {bet.cancelledBy && <>Cancelled by <strong>{bet.cancelledBy}</strong> · {dateShort(bet.cancelledAt)}{bet.cancelReason ? ` · ${bet.cancelReason}` : ''}<br /></>}
          {bet.deletedBy   && <>Deleted by <strong>{bet.deletedBy}</strong> · {dateShort(bet.deletedAt)}{bet.deleteReason ? ` · ${bet.deleteReason}` : ''}</>}
        </div>
      )}
    </div>
  );
}

function CredentialsModal({ open, onClose, data }) {
  return (
    <Modal open={open} onClose={onClose}
           title="Stored credentials"
           description="Plaintext passwords are never recoverable — only a one-way bcrypt hash is stored. The fingerprint below confirms the hash exists without exposing it.">
      {!data ? null : (
        <dl className="adm-kv">
          <dt>Account</dt><dd>{data.email}</dd>
          <dt>User ID</dt><dd style={{ fontFamily: 'var(--ff-mono)', fontSize: 12 }}>{data.id}</dd>
          <dt>Has password</dt><dd>{data.hasPassword ? <Badge tone="success">Yes</Badge> : <Badge tone="warn">No</Badge>}</dd>
          <dt>Password algorithm</dt><dd>{data.passwordAlgo || '—'}</dd>
          <dt>Hash fingerprint</dt><dd style={{ fontFamily: 'var(--ff-mono)', fontSize: 12 }}>{data.passwordHashFingerprint || '—'}</dd>
          <dt>Email verified</dt><dd>{data.emailVerified ? <Badge tone="success">Verified</Badge> : <Badge tone="warn">Unverified</Badge>}</dd>
          <dt>Google linked</dt><dd>{data.googleLinked ? <Badge tone="info">Linked</Badge> : '—'}</dd>
          <dt>2FA</dt><dd>{data.twoFactorEnabled ? <Badge tone="success">Enabled</Badge> : <Badge>Off</Badge>}</dd>
          <dt>KYC</dt><dd>{data.kycStatus}</dd>
          <dt>Country</dt><dd>{data.country || '—'}</dd>
          <dt>Suspended</dt><dd>{data.suspended ? <Badge tone="danger">Yes</Badge> : 'No'}</dd>
          <dt>Created</dt><dd>{dateShort(data.createdAt)}</dd>
          <dt>Last update</dt><dd>{dateShort(data.updatedAt)}</dd>
        </dl>
      )}
      <div className="adm-modal-actions">
        <button type="button" className="adm-btn primary" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

function DeleteUserModal({ open, onClose, user, onConfirm }) {
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');
  useEffect(() => { if (open) { setReason(''); setConfirmText(''); } }, [open]);
  if (!user) return null;
  const ready = confirmText.trim().toLowerCase() === user.email.toLowerCase();
  const hasFunds = (user.balance || 0) > 0;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Permanently delete account"
      description={`This wipes ${user.email}, their bet history, transaction ledger, and revokes all active sessions. Audit-logged as critical. Cannot be undone.`}
      footer={null}
    >
      <form
        onSubmit={(e) => { e.preventDefault(); if (ready) onConfirm(reason || 'admin delete'); }}
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        {hasFunds && (
          <div style={{
            padding: '10px 12px',
            background: 'rgba(214,58,44,.08)',
            border: '1px solid rgba(214,58,44,.25)',
            borderRadius: 8,
            fontSize: 13, lineHeight: 1.45,
          }}>
            ⚠️ Wallet still holds <strong>{moneyFmt(user.balance, user.currency)}</strong>. Settle or refund before deleting if those funds were ever real.
          </div>
        )}
        <div className="adm-field">
          <label>Reason (recorded in audit log)</label>
          <input
            className="adm-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. user requested account closure"
            maxLength={500}
            autoFocus
          />
        </div>
        <div className="adm-field">
          <label>
            Type <code style={{ fontFamily: 'var(--ff-mono)', background: 'var(--surface-soft, rgba(255,255,255,.05))', padding: '1px 6px', borderRadius: 4 }}>{user.email}</code> to confirm
          </label>
          <input
            className="adm-input"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={user.email}
          />
        </div>
        <div className="adm-modal-actions">
          <button type="button" className="adm-btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="adm-btn danger" disabled={!ready}>
            <IconTrash size={14} /> Delete forever
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ProfileTab({ user, logins = [], hasRole, onKyc, onAccountStatus, onTags, onNotes }) {
  const [tagInput, setTagInput] = useState('');
  const [notes, setNotes] = useState(user.notes || '');
  const lastLogin  = logins.find((e) => e.kind === 'login_success' || e.kind === 'login_google');
  const lastLogout = logins.find((e) => e.kind === 'logout');
  return (
    <>
      <Card flush>
        <div style={{ padding: 16 }}>
          <dl className="adm-kv">
            <dt>Email / Login</dt><dd>{user.email}</dd>
            <dt>User ID</dt><dd style={{ fontFamily: 'var(--ff-mono)', fontSize: 12 }}>{user.id}</dd>
            <dt>Balance</dt><dd><strong>{moneyFmt(user.balance, user.currency)}</strong></dd>
            <dt>Account created</dt><dd>{user.createdAt ? `${dateShort(user.createdAt)} · ${ago(user.createdAt)}` : '—'}</dd>
            <dt>Last login</dt><dd>{lastLogin ? `${dateShort(lastLogin.at)} · ${ago(lastLogin.at)}${lastLogin.ip ? ` · ${lastLogin.ip}` : ''}` : '—'}</dd>
            <dt>Last logout</dt><dd>{lastLogout ? `${dateShort(lastLogout.at)} · ${ago(lastLogout.at)}${lastLogout.ip ? ` · ${lastLogout.ip}` : ''}` : '—'}</dd>
            <dt>Last update</dt><dd>{dateShort(user.updatedAt)}</dd>
            <dt>2FA</dt><dd>{user.twoFactorEnabled ? <Badge tone="success">Enabled</Badge> : <Badge>Off</Badge>}</dd>
          </dl>
        </div>
      </Card>

      <Card title="Lifetime stats">
        <div className="adm-grid c3" style={{ gap: 12 }}>
          <Mini label="Stake"   v={moneyFmt(user.stats?.stakeTotal)} />
          <Mini label="Payouts" v={moneyFmt(user.stats?.payoutTotal)} />
          <Mini label="Bets"    v={numFmt(user.stats?.bets)} />
          <Mini label="Won"     v={numFmt(user.stats?.betsWon)} />
          <Mini label="Lost"    v={numFmt(user.stats?.betsLost)} />
          <Mini label="Deposits" v={moneyFmt(user.stats?.depositTotal)} />
        </div>
      </Card>

      <Card
        title="Account Status"
        subtitle="STANDARD and PREMIUM levels. Only admins can change this — never auto-assigned."
        pill={
          <span
            style={{
              padding: '4px 10px', borderRadius: 999,
              background: user.accountStatus === 'PREMIUM'
                ? 'linear-gradient(135deg, #fbbf24, #f59e0b)'
                : 'linear-gradient(135deg, #64748b, #94a3b8)',
              color: user.accountStatus === 'PREMIUM' ? '#0a0d14' : '#fff',
              fontWeight: 800, fontSize: 11, letterSpacing: 0.02,
            }}
          >
            {user.accountStatus || 'STANDARD'}
          </span>
        }
      >
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className={`adm-btn ${user.accountStatus !== 'PREMIUM' ? 'primary' : ''}`}
            disabled={!hasRole('moderator')}
            onClick={() => onAccountStatus('PREMIUM')}
            style={{ flex: '1 1 200px', justifyContent: 'center', minHeight: 42 }}
          >
            ★ Upgrade to PREMIUM
          </button>
          <button
            type="button"
            className={`adm-btn ${user.accountStatus === 'PREMIUM' ? 'primary' : ''}`}
            disabled={!hasRole('moderator')}
            onClick={() => onAccountStatus('STANDARD')}
            style={{ flex: '1 1 200px', justifyContent: 'center', minHeight: 42 }}
          >
            ○ Downgrade to STANDARD
          </button>
        </div>
        {!hasRole('moderator') && (
          <div style={{ marginTop: 10, color: 'var(--text-dim)', fontSize: 12 }}>
            Read-only — your role can't change account status.
          </div>
        )}
      </Card>

      <Card title="KYC" subtitle="Identity verification status">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['unverified', 'pending', 'verified', 'rejected'].map((s) => (
            <button key={s}
              className={`adm-btn ${user.kycStatus === s ? 'primary' : ''}`}
              disabled={!hasRole('moderator', 'support')}
              onClick={() => onKyc(s)}>
              {s}
            </button>
          ))}
        </div>
      </Card>

      <Card title="Tags" subtitle="Use for cohorts, watchlists, promo eligibility">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {(user.tags || []).map((t) => (
            <span key={t} onClick={() => hasRole('moderator', 'support') && onTags((user.tags || []).filter((x) => x !== t))}
                  style={{ cursor: hasRole('moderator', 'support') ? 'pointer' : 'default' }}>
              <Badge tone="brand">{t} ×</Badge>
            </span>
          ))}
        </div>
        {hasRole('moderator', 'support') && (
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="adm-input" placeholder="Add tag…" value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                   onKeyDown={(e) => {
                     if (e.key === 'Enter' && tagInput.trim()) {
                       onTags([...(user.tags || []), tagInput.trim()]); setTagInput('');
                     }
                   }} />
            <button className="adm-btn" onClick={() => { if (tagInput.trim()) { onTags([...(user.tags || []), tagInput.trim()]); setTagInput(''); } }}>Add</button>
          </div>
        )}
      </Card>

      <Card title="Internal notes" subtitle="Visible to admins only">
        <textarea className="adm-textarea" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)}
                  disabled={!hasRole('moderator', 'support')} placeholder="VIP since 2024, prefers MoMo. Watch for late-night patterns." />
        {hasRole('moderator', 'support') && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="adm-btn primary" onClick={() => onNotes(notes)}>Save notes</button>
          </div>
        )}
      </Card>
    </>
  );
}

function Mini({ label, v }) {
  return (
    <div style={{
      padding: 12, borderRadius: 12,
      background: 'var(--surface-soft)',
      border: '1px solid var(--border)',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.12em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
    </div>
  );
}

function WalletModal({ open, onClose, user, onSubmit }) {
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [direction, setDirection] = useState('credit');
  useEffect(() => { if (open) { setDelta(''); setReason(''); setDirection('credit'); } }, [open]);

  function submit(e) {
    e.preventDefault();
    const n = parseFloat(delta);
    if (!Number.isFinite(n) || n <= 0) return;
    onSubmit(direction === 'credit' ? n : -n, reason || 'Manual adjustment');
  }
  return (
    <Modal open={open} onClose={onClose}
           title="Adjust wallet"
           description={`Current balance: ${moneyFmt(user?.balance, user?.currency)}`}
           footer={null}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {[['credit', 'Credit'], ['debit', 'Debit']].map(([k, label]) => (
            <button key={k} type="button" className={`adm-btn ${direction === k ? 'primary' : ''}`} onClick={() => setDirection(k)}>{label}</button>
          ))}
        </div>
        <div className="adm-field">
          <label>Amount (GHS)</label>
          <input className="adm-input" type="number" min="0.01" step="0.01" value={delta} onChange={(e) => setDelta(e.target.value)} autoFocus required />
        </div>
        <div className="adm-field">
          <label>Reason (required, recorded in audit log)</label>
          <input className="adm-input" value={reason} onChange={(e) => setReason(e.target.value)} required minLength={2} />
        </div>
        <div className="adm-modal-actions">
          <button type="button" className="adm-btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="adm-btn primary">Apply adjustment</button>
        </div>
      </form>
    </Modal>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { useAdmin } from '../../providers/AdminProvider.jsx';
import {
  adminListAdmins, adminCreateAdmin, adminUpdateAdmin, adminDeleteAdmin,
  adminResetAdminPassword, adminAdminStats, adminAdminSessions,
} from '../../api/adminApi.js';
import { useToast as useLocalToast, Card, Stat, Badge, Empty, Spinner, Drawer, Modal, moneyFmt, ago } from '../../components/admin/primitives.jsx';
import { IconUsers, IconKey, IconShield, IconPlus, IconTrash, IconLock } from '../../components/admin/Icons.jsx';

const ROLES = [
  { value: 'super_admin', label: 'Super Admin', color: 'danger' },
  { value: 'trader', label: 'Trader', color: 'brand' },
  { value: 'risk_manager', label: 'Risk Manager', color: 'warn' },
  { value: 'finance_admin', label: 'Finance Admin', color: 'success' },
  { value: 'compliance_officer', label: 'Compliance Officer', color: 'info' },
  { value: 'support_agent', label: 'Support Agent', color: 'default' },
  { value: 'marketing_manager', label: 'Marketing Manager', color: 'brand' },
  { value: 'readonly_auditor', label: 'Read-Only Auditor', color: 'default' },
];

export default function ManagementPage() {
  const { can } = useAdmin();
  const { toast, show } = useLocalToast();
  const [admins, setAdmins] = useState([]);
  const [stats, setStats] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, s, sess] = await Promise.all([
        adminListAdmins({ role: roleFilter || undefined, status: statusFilter || undefined, search: search || undefined }),
        adminAdminStats().catch(() => ({ stats: null })),
        adminAdminSessions().catch(() => ({ sessions: [] })),
      ]);
      setAdmins(a.admins || []);
      setStats(s.stats || null);
      setSessions(sess.sessions || []);
    } catch (e) {
      show(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, statusFilter, show]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (data) => {
    try {
      await adminCreateAdmin(data);
      show('Admin created successfully');
      setDrawer(null);
      load();
    } catch (e) { show(e.message, 'error'); }
  };

  const handleUpdate = async (id, data) => {
    try {
      await adminUpdateAdmin(id, data);
      show('Admin updated');
      setDrawer(null);
      load();
    } catch (e) { show(e.message, 'error'); }
  };

  const handleDelete = async (id) => {
    try {
      await adminDeleteAdmin(id);
      show('Admin deleted');
      setConfirm(null);
      load();
    } catch (e) { show(e.message, 'error'); }
  };

  const handleResetPassword = async (id) => {
    const pwd = prompt('Enter new password (min 8 chars):');
    if (!pwd || pwd.length < 8) { show('Password must be at least 8 characters', 'error'); return; }
    try {
      await adminResetAdminPassword(id, pwd);
      show('Password reset. Admin will need to sign in again.');
      setDrawer(null);
    } catch (e) { show(e.message, 'error'); }
  };

  const filtered = admins.filter((a) => {
    if (search) {
      const q = search.toLowerCase();
      if (!a.name?.toLowerCase().includes(q) && !a.email?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>Admin Management</h1>
          <p>Manage administrator accounts, roles, and permissions.</p>
        </div>
        {can('admin.create') && (
          <button className="adm-btn primary" onClick={() => setDrawer({ mode: 'create' })}>
            <IconPlus /> New Admin
          </button>
        )}
      </div>

      {stats && (
        <div className="adm-stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <Stat label="Total" value={stats.total} icon={<IconUsers />} />
          <Stat label="Active" value={stats.active} icon={<IconShield />} accent="linear-gradient(135deg, #0E8A4A, #007A45)" />
          <Stat label="Suspended" value={stats.suspended || 0} icon={<IconLock />} accent="linear-gradient(135deg, #ff5d6c, #ff5fb1)" />
          <Stat label="Online Now" value={sessions.length} icon={<IconKey />} />
        </div>
      )}

      <div className="adm-table-wrap">
        <div className="adm-table-toolbar">
          <input placeholder="Search admins..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">All roles</option>
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
          <div className="grow" />
          <button className="adm-btn ghost sm" onClick={load}>Refresh</button>
        </div>

        {loading ? (
          <div style={{ padding: 24 }}><Spinner /></div>
        ) : filtered.length === 0 ? (
          <Empty title="No admins found" subtitle="Try adjusting your filters" />
        ) : (
          <div className="adm-table-scroll">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Admin</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>2FA</th>
                  <th>Last Login</th>
                  <th>Sessions</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => {
                  const roleInfo = ROLES.find((r) => r.value === a.adminRole) || { label: a.adminRole, color: 'default' };
                  return (
                    <tr key={a.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: 8,
                            background: 'var(--grad-brand)', display: 'grid', placeItems: 'center',
                            color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0,
                          }}>
                            {(a.name || a.email || '?').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600 }}>{a.name || '—'}</div>
                            <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{a.email}</div>
                          </div>
                        </div>
                      </td>
                      <td><Badge tone={roleInfo.color}>{roleInfo.label}</Badge></td>
                      <td>
                        <Badge tone={a.suspended ? 'danger' : 'success'} dot>{a.suspended ? 'Suspended' : 'Active'}</Badge>
                      </td>
                      <td><Badge tone={a.twoFactorEnabled ? 'success' : 'default'}>{a.twoFactorEnabled ? 'Enabled' : '—'}</Badge></td>
                      <td style={{ color: 'var(--text-dim)', fontSize: 12.5 }}>{ago(a.lastLoginAt)}</td>
                      <td>{a.sessionCount || 0}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="row-actions">
                          <button className="adm-btn ghost sm" onClick={() => setDrawer({ mode: 'edit', admin: a })}>
                            Edit
                          </button>
                          {can('admin.edit') && (
                            <button className="adm-btn ghost sm" onClick={() => handleResetPassword(a.id)}>
                              Reset Pwd
                            </button>
                          )}
                          {can('admin.delete') && a.adminRole !== 'super_admin' && (
                            <button className="adm-btn ghost sm danger" onClick={() => setConfirm({ action: 'delete', id: a.id, name: a.name || a.email })}>
                              <IconTrash size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Drawer
        open={!!drawer}
        title={drawer?.mode === 'create' ? 'Create Admin' : 'Edit Admin'}
        onClose={() => setDrawer(null)}
        width="min(480px, 100%)"
      >
        <AdminForm
          initial={drawer?.admin}
          mode={drawer?.mode}
          onSubmit={drawer?.mode === 'create' ? handleCreate : (data) => handleUpdate(drawer.admin.id, data)}
          onClose={() => setDrawer(null)}
        />
      </Drawer>

      <Modal
        open={!!confirm}
        title="Confirm Delete"
        description={`Are you sure you want to delete ${confirm?.name}? This action cannot be undone.`}
        onClose={() => setConfirm(null)}
        footer={
          <>
            <button className="adm-btn" onClick={() => setConfirm(null)}>Cancel</button>
            <button className="adm-btn danger" onClick={() => handleDelete(confirm.id)}>Delete</button>
          </>
        }
      />

      {toast.open && <div className="adm-toast">{toast.message}</div>}
    </div>
  );
}

function AdminForm({ initial, mode, onSubmit, onClose }) {
  const [form, setForm] = useState({
    email: initial?.email || '',
    name: initial?.name || '',
    password: '',
    adminRole: initial?.adminRole || 'support',
    suspended: initial?.suspended || false,
  });
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    if (mode === 'create' && !form.password) { setError('Password is required'); return; }
    if (mode === 'create' && form.password.length < 8) { setError('Password must be 8+ characters'); return; }
    if (!form.email) { setError('Email is required'); return; }
    const payload = mode === 'create'
      ? { email: form.email, name: form.name, password: form.password, adminRole: form.adminRole }
      : { name: form.name, adminRole: form.adminRole, suspended: form.suspended };
    onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {error && <div className="adm-auth-form err">{error}</div>}
      <div className="adm-field">
        <label>Email</label>
        <input className="adm-input" type="email" value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          disabled={mode === 'edit'} required />
      </div>
      <div className="adm-field">
        <label>Name</label>
        <input className="adm-input" type="text" value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </div>
      {mode === 'create' && (
        <div className="adm-field">
          <label>Password (min 8 chars)</label>
          <input className="adm-input" type="password" value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required />
        </div>
      )}
      <div className="adm-field">
        <label>Role</label>
        <select className="adm-select" value={form.adminRole}
          onChange={(e) => setForm((f) => ({ ...f, adminRole: e.target.value }))}>
          {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>
      {mode === 'edit' && (
        <div className="adm-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <label style={{ margin: 0 }}>Suspended</label>
          <input type="checkbox" checked={form.suspended}
            onChange={(e) => setForm((f) => ({ ...f, suspended: e.target.checked }))} />
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
        <button type="button" className="adm-btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="adm-btn primary">
          {mode === 'create' ? 'Create Admin' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}

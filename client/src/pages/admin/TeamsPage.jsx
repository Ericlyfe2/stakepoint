import { useState, useEffect, useCallback } from 'react';
import { useAdmin } from '../../providers/AdminProvider.jsx';
import { adminTeamsList, adminCreateTeam, adminUpdateTeam, adminDeleteTeam } from '../../api/adminApi.js';
import { useToast as useLocalToast, Card, Badge, Drawer, Modal, Empty, Spinner, numFmt } from '../../components/admin/primitives.jsx';
import { IconPlus, IconTrash, IconEdit, IconSearch } from '../../components/admin/Icons.jsx';

const SPORTS = [
  { id: 'football', label: 'Football' },
  { id: 'basketball', label: 'Basketball' },
  { id: 'tennis', label: 'Tennis' },
];

export default function TeamsPage() {
  const { can } = useAdmin();
  const { toast, show } = useLocalToast();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sportFilter, setSportFilter] = useState('');
  const [drawer, setDrawer] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminTeamsList({ sport: sportFilter || undefined, q: search || undefined });
      setTeams(r.teams || []);
    } catch (e) { show(e.message, 'error'); }
    finally { setLoading(false); }
  }, [search, sportFilter, show]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (data) => {
    try {
      await adminCreateTeam(data);
      show('Team created');
      setDrawer(null);
      load();
    } catch (e) { show(e.message, 'error'); }
  };

  const handleUpdate = async (id, data) => {
    try {
      await adminUpdateTeam(id, data);
      show('Team updated');
      setDrawer(null);
      load();
    } catch (e) { show(e.message, 'error'); }
  };

  const handleDelete = async (id) => {
    try {
      await adminDeleteTeam(id);
      show('Team deleted');
      setConfirm(null);
      load();
    } catch (e) { show(e.message, 'error'); }
  };

  const stats = SPORTS.map((s) => ({
    ...s,
    count: teams.filter((t) => t.sport === s.id).length,
  }));

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>Teams</h1>
          <p>Manage team rosters, metadata, and branding across all sports.</p>
        </div>
        {can('sports.edit') && (
          <button className="adm-btn primary" onClick={() => setDrawer({ mode: 'create' })}>
            <IconPlus /> New Team
          </button>
        )}
      </div>

      <div className="adm-stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        {stats.map((s) => (
          <Card key={s.id}>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{numFmt(s.count)}</div>
            <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{s.label}</div>
          </Card>
        ))}
        <Card>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{numFmt(teams.length)}</div>
          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>Total teams</div>
        </Card>
      </div>

      <div className="adm-table-wrap">
        <div className="adm-table-toolbar">
          <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
            <IconSearch size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
            <input placeholder="Search teams..." value={search} onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 32 }} />
          </div>
          <select value={sportFilter} onChange={(e) => setSportFilter(e.target.value)}>
            <option value="">All sports</option>
            {SPORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <div className="grow" />
          <button className="adm-btn ghost sm" onClick={load}>Refresh</button>
        </div>

        {loading ? (
          <div style={{ padding: 24 }}><Spinner /></div>
        ) : teams.length === 0 ? (
          <Empty title="No teams found" subtitle="Click 'New Team' to create one" />
        ) : (
          <div className="adm-table-scroll">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Sport</th>
                  <th>Country</th>
                  <th>Venue</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                          display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700,
                          background: t.logoUrl
                            ? `url(${t.logoUrl}) center/cover`
                            : 'linear-gradient(135deg, var(--accent, #7c5cff), #22d3ee)',
                          color: '#fff',
                        }}>
                          {!t.logoUrl && (t.shortName || t.name || '?').slice(0, 3).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600 }}>{t.name}</div>
                          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{t.shortName && `${t.shortName} · `}{t.id}</div>
                        </div>
                      </div>
                    </td>
                    <td><Badge tone="info">{t.sport}</Badge></td>
                    <td style={{ color: 'var(--text-soft)' }}>{t.country || '—'}</td>
                    <td style={{ color: 'var(--text-soft)', fontSize: 13 }}>{t.venue || '—'}</td>
                    <td><Badge tone={t.active !== false ? 'success' : 'default'} dot>{t.active !== false ? 'Active' : 'Inactive'}</Badge></td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="row-actions">
                        <button className="adm-btn ghost sm" onClick={() => setDrawer({ mode: 'edit', team: t })}>
                          <IconEdit size={14} /> Edit
                        </button>
                        {can('sports.edit') && (
                          <button className="adm-btn ghost sm danger" onClick={() => setConfirm(t)}>
                            <IconTrash size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Drawer
        open={!!drawer}
        title={drawer?.mode === 'create' ? 'Create Team' : 'Edit Team'}
        onClose={() => setDrawer(null)}
        width="min(480px, 100%)"
      >
        <TeamForm
          initial={drawer?.team}
          mode={drawer?.mode}
          onSubmit={drawer?.mode === 'create' ? handleCreate : (data) => handleUpdate(drawer.team.id, data)}
          onClose={() => setDrawer(null)}
        />
      </Drawer>

      <Modal
        open={!!confirm}
        title="Delete Team"
        description={`Are you sure you want to delete "${confirm?.name}"? This cannot be undone.`}
        onClose={() => setConfirm(null)}
        footer={
          <>
            <button className="adm-btn" onClick={() => setConfirm(null)}>Cancel</button>
            <button className="adm-btn danger" onClick={() => handleDelete(confirm.id)}>Delete Team</button>
          </>
        }
      />

      {toast.open && <div className="adm-toast">{toast.message}</div>}
    </div>
  );
}

function TeamForm({ initial, mode, onSubmit, onClose }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    shortName: initial?.shortName || '',
    sport: initial?.sport || 'football',
    country: initial?.country || '',
    logoUrl: initial?.logoUrl || '',
    colors: initial?.colors || '',
    venue: initial?.venue || '',
  });
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    if (!form.name) { setError('Team name is required'); return; }
    onSubmit(mode === 'create'
      ? form
      : Object.fromEntries(Object.entries(form).filter(([_, v]) => v !== ''))
    );
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {error && <div className="adm-auth-form err">{error}</div>}
      <div className="adm-field">
        <label>Team Name</label>
        <input className="adm-input" value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Manchester City" required />
      </div>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <div className="adm-field">
          <label>Short Name</label>
          <input className="adm-input" value={form.shortName}
            onChange={(e) => setForm((f) => ({ ...f, shortName: e.target.value }))}
            placeholder="e.g. MCI" maxLength={10} />
        </div>
        <div className="adm-field">
          <label>Sport</label>
          <select className="adm-select" value={form.sport}
            onChange={(e) => setForm((f) => ({ ...f, sport: e.target.value }))}>
            {SPORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <div className="adm-field">
          <label>Country</label>
          <input className="adm-input" value={form.country}
            onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
            placeholder="e.g. England" />
        </div>
        <div className="adm-field">
          <label>Venue</label>
          <input className="adm-input" value={form.venue}
            onChange={(e) => setForm((f) => ({ ...f, venue: e.target.value }))}
            placeholder="e.g. Etihad Stadium" />
        </div>
      </div>
      <div className="adm-field">
        <label>Logo URL</label>
        <input className="adm-input" value={form.logoUrl}
          onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
          placeholder="https://example.com/logo.png" />
      </div>
      <div className="adm-field">
        <label>Colors</label>
        <input className="adm-input" value={form.colors}
          onChange={(e) => setForm((f) => ({ ...f, colors: e.target.value }))}
          placeholder="e.g. #6CABDD,#1C2F5A" />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
        <button type="button" className="adm-btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="adm-btn primary">
          {mode === 'create' ? 'Create Team' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}

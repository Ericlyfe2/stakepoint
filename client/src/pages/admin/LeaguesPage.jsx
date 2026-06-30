import { useState, useEffect, useCallback } from 'react';
import { useAdmin } from '../../providers/AdminProvider.jsx';
import {
  adminLeagues, adminCreateLeague, adminUpdateLeague, adminDeleteLeague,
} from '../../api/adminApi.js';
import { useToast as useLocalToast, Card, Badge, Drawer, Modal, Empty, Spinner, numFmt } from '../../components/admin/primitives.jsx';
import { IconPlus, IconTrash, IconEdit, IconSearch } from '../../components/admin/Icons.jsx';

const SPORTS = [
  { id: 'football', label: 'Football', icon: '⚽' },
  { id: 'basketball', label: 'Basketball', icon: '🏀' },
  { id: 'tennis', label: 'Tennis', icon: '🎾' },
];

export default function LeaguesPage() {
  const { can } = useAdmin();
  const { toast, show } = useLocalToast();
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sportFilter, setSportFilter] = useState('');
  const [drawer, setDrawer] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminLeagues();
      setLeagues(r.leagues || []);
    } catch (e) { show(e.message, 'error'); }
    finally { setLoading(false); }
  }, [show]);

  useEffect(() => { load(); }, [load]);

  const filtered = leagues.filter((l) => {
    if (sportFilter && l.sport !== sportFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!l.name?.toLowerCase().includes(q) && !l.region?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const stats = SPORTS.map((s) => ({
    ...s,
    count: leagues.filter((l) => l.sport === s.id).length,
  }));

  const handleCreate = async (data) => {
    try {
      await adminCreateLeague(data);
      show('League created');
      setDrawer(null);
      load();
    } catch (e) { show(e.message, 'error'); }
  };

  const handleUpdate = async (id, data) => {
    try {
      await adminUpdateLeague(id, data);
      show('League updated');
      setDrawer(null);
      load();
    } catch (e) { show(e.message, 'error'); }
  };

  const handleDelete = async (id) => {
    try {
      await adminDeleteLeague(id);
      show('League deleted');
      setConfirm(null);
      load();
    } catch (e) { show(e.message, 'error'); }
  };

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>Leagues</h1>
          <p>Manage all sports leagues, seasons, and competition structures.</p>
        </div>
        {can('sports.edit') && (
          <button className="adm-btn primary" onClick={() => setDrawer({ mode: 'create' })}>
            <IconPlus /> New League
          </button>
        )}
      </div>

      <div className="adm-stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        {stats.map((s) => (
          <Card key={s.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 24 }}>{s.icon}</span>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{numFmt(s.count)}</div>
                <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{s.label}</div>
              </div>
            </div>
          </Card>
        ))}
        <Card>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{numFmt(leagues.length)}</div>
          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>Total leagues</div>
        </Card>
      </div>

      <div className="adm-table-wrap">
        <div className="adm-table-toolbar">
          <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
            <IconSearch size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
            <input placeholder="Search leagues..." value={search} onChange={(e) => setSearch(e.target.value)}
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
        ) : filtered.length === 0 ? (
          <Empty title="No leagues found" subtitle={search || sportFilter ? 'Try adjusting your filters' : 'Click "New League" to create one'} />
        ) : (
          <div className="adm-table-scroll">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>League</th>
                  <th>Sport</th>
                  <th>Region</th>
                  <th>Matches</th>
                  <th>Type</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                          display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700,
                          background: l.admin
                            ? 'linear-gradient(135deg, #7c5cff, #22d3ee)'
                            : 'linear-gradient(135deg, #1a1a2e, #16213e)',
                          color: '#fff',
                        }}>
                          {(l.name || '?').slice(0, 3).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {l.name}
                            {l.admin && <Badge tone="brand" style={{ fontSize: 10 }}>Custom</Badge>}
                          </div>
                          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{l.id}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Badge tone="info">{l.sport}</Badge>
                    </td>
                    <td style={{ color: 'var(--text-soft)' }}>{l.region || '—'}</td>
                    <td><span style={{ fontWeight: 600 }}>{numFmt(l.matchCount)}</span></td>
                    <td>
                      <Badge tone={l.admin ? 'brand' : 'default'}>{l.admin ? 'Admin-created' : 'Feed'}</Badge>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="row-actions">
                        <button className="adm-btn ghost sm" onClick={() => setDrawer({ mode: 'edit', league: l })}>
                          <IconEdit size={14} /> Edit
                        </button>
                        {can('sports.edit') && l.admin && (
                          <button className="adm-btn ghost sm danger" onClick={() => setConfirm(l)}>
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
        title={drawer?.mode === 'create' ? 'Create League' : 'Edit League'}
        onClose={() => setDrawer(null)}
        width="min(480px, 100%)"
      >
        <LeagueForm
          initial={drawer?.league}
          mode={drawer?.mode}
          onSubmit={drawer?.mode === 'create' ? handleCreate : (data) => handleUpdate(drawer.league.id, data)}
          onClose={() => setDrawer(null)}
        />
      </Drawer>

      <Modal
        open={!!confirm}
        title="Delete League"
        description={`Are you sure you want to delete "${confirm?.name}"? This cannot be undone. Custom fixtures assigned to this league will become orphans.`}
        onClose={() => setConfirm(null)}
        footer={
          <>
            <button className="adm-btn" onClick={() => setConfirm(null)}>Cancel</button>
            <button className="adm-btn danger" onClick={() => handleDelete(confirm.id)}>Delete League</button>
          </>
        }
      />

      {toast.open && <div className="adm-toast">{toast.message}</div>}
    </div>
  );
}

function LeagueForm({ initial, mode, onSubmit, onClose }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    sport: initial?.sport || 'football',
    region: initial?.region || 'admin',
    countryMeta: initial?.countryMeta || '',
  });
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    if (!form.name || form.name.length < 2) { setError('Name must be at least 2 characters'); return; }
    onSubmit(mode === 'create'
      ? { name: form.name, sport: form.sport, region: form.region, countryMeta: form.countryMeta }
      : { name: form.name, region: form.region, countryMeta: form.countryMeta }
    );
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {error && <div className="adm-auth-form err">{error}</div>}
      <div className="adm-field">
        <label>League Name</label>
        <input className="adm-input" value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Ghana Premier League" required minLength={2} />
      </div>
      {mode === 'create' && (
        <div className="adm-field">
          <label>Sport</label>
          <select className="adm-select" value={form.sport}
            onChange={(e) => setForm((f) => ({ ...f, sport: e.target.value }))}>
            {SPORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      )}
      <div className="adm-field">
        <label>Region</label>
        <select className="adm-select" value={form.region}
          onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}>
          <option value="africa">Africa</option>
          <option value="europe">Europe</option>
          <option value="americas">Americas</option>
          <option value="asia">Asia</option>
          <option value="global">Global</option>
          <option value="admin">Admin / Other</option>
        </select>
      </div>
      <div className="adm-field">
        <label>Country meta (optional)</label>
        <input className="adm-input" value={form.countryMeta}
          onChange={(e) => setForm((f) => ({ ...f, countryMeta: e.target.value }))}
          placeholder="e.g. GHA · MATCHDAY 18" />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
        <button type="button" className="adm-btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="adm-btn primary">
          {mode === 'create' ? 'Create League' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}

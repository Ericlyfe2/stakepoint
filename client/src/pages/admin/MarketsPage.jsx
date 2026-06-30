import { useState, useEffect, useCallback } from 'react';
import { useAdmin } from '../../providers/AdminProvider.jsx';
import { adminListMarkets, adminCreateMarket, adminUpdateMarket, adminDeleteMarket } from '../../api/adminApi.js';
import { useToast as useLocalToast, Card, Badge, Drawer, Modal, Empty, Spinner } from '../../components/admin/primitives.jsx';
import { IconPlus, IconTrash, IconEdit, IconSearch } from '../../components/admin/Icons.jsx';

const SPORTS = [
  { id: 'football', label: 'Football' },
  { id: 'basketball', label: 'Basketball' },
  { id: 'tennis', label: 'Tennis' },
];

export default function MarketsPage() {
  const { can } = useAdmin();
  const { toast, show } = useLocalToast();
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sportFilter, setSportFilter] = useState('');
  const [drawer, setDrawer] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminListMarkets();
      let list = r.markets || [];
      if (sportFilter) list = list.filter((m) => m.sport === sportFilter);
      if (search) {
        const lq = search.toLowerCase();
        list = list.filter((m) => m.name?.toLowerCase().includes(lq) || m.key?.toLowerCase().includes(lq));
      }
      setMarkets(list);
    } catch (e) { show(e.message, 'error'); }
    finally { setLoading(false); }
  }, [search, sportFilter, show]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (data) => {
    try {
      await adminCreateMarket(data);
      show('Market created');
      setDrawer(null);
      load();
    } catch (e) { show(e.message, 'error'); }
  };

  const handleUpdate = async (key, data) => {
    try {
      await adminUpdateMarket(key, data);
      show('Market updated');
      setDrawer(null);
      load();
    } catch (e) { show(e.message, 'error'); }
  };

  const handleDelete = async (key) => {
    try {
      await adminDeleteMarket(key);
      show('Market deleted');
      setConfirm(null);
      load();
    } catch (e) { show(e.message, 'error'); }
  };

  const stats = [
    ...SPORTS.map((s) => ({
      label: s.label,
      value: (r.markets || []).filter((m) => m.sport === s.id).length,
    })),
    { label: 'Total Markets', value: (r?.markets || []).length },
  ];

  const r = { markets }; // for stats

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>Market Templates</h1>
          <p>Define, configure, and manage all betting market types available on the platform.</p>
        </div>
        {can('odds.edit') && (
          <button className="adm-btn primary" onClick={() => setDrawer({ mode: 'create' })}>
            <IconPlus /> New Market
          </button>
        )}
      </div>

      <div className="adm-stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        {SPORTS.map((s) => (
          <Card key={s.id}>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{(markets || []).filter((m) => m.sport === s.id).length}</div>
            <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{s.label}</div>
          </Card>
        ))}
        <Card>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{(markets || []).length}</div>
          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>Total markets</div>
        </Card>
      </div>

      <div className="adm-table-wrap">
        <div className="adm-table-toolbar">
          <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
            <IconSearch size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
            <input placeholder="Search by name or key..." value={search} onChange={(e) => setSearch(e.target.value)}
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
        ) : markets.length === 0 ? (
          <Empty title="No market templates" subtitle="Click 'New Market' to create one." />
        ) : (
          <div className="adm-table-scroll">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Market</th>
                  <th>Key</th>
                  <th>Sport</th>
                  <th>Selections</th>
                  <th>Status</th>
                  <th>Sort</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {markets.map((m) => (
                  <tr key={m.key}>
                    <td>
                      <div>
                        <div style={{ fontWeight: 600 }}>{m.name}</div>
                        {m.description && <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{m.description}</div>}
                      </div>
                    </td>
                    <td><code style={{ fontSize: 12, background: 'var(--bg-card)', padding: '2px 6px', borderRadius: 4 }}>{m.key}</code></td>
                    <td><Badge tone="info">{SPORTS.find((s) => s.id === m.sport)?.label || m.sport || '—'}</Badge></td>
                    <td style={{ color: 'var(--text-soft)', fontSize: 13 }}>{(m.selections || []).length} selections</td>
                    <td><Badge tone={m.active !== false ? 'success' : 'default'} dot>{m.active !== false ? 'Active' : 'Inactive'}</Badge></td>
                    <td style={{ color: 'var(--text-dim)', fontSize: 13 }}>{m.sort || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="row-actions">
                        <button className="adm-btn ghost sm" onClick={() => setDrawer({ mode: 'edit', market: m })}>
                          <IconEdit size={14} /> Edit
                        </button>
                        {can('odds.edit') && (
                          <button className="adm-btn ghost sm danger" onClick={() => setConfirm(m)}>
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
        title={drawer?.mode === 'create' ? 'Create Market' : 'Edit Market'}
        onClose={() => setDrawer(null)}
        width="min(520px, 100%)"
      >
        <MarketForm
          initial={drawer?.market}
          mode={drawer?.mode}
          onSubmit={drawer?.mode === 'create' ? handleCreate : (data) => handleUpdate(drawer.market.key, data)}
          onClose={() => setDrawer(null)}
        />
      </Drawer>

      <Modal
        open={!!confirm}
        title="Delete Market"
        description={`Are you sure you want to delete market "${confirm?.name}" (${confirm?.key})? This cannot be undone.`}
        onClose={() => setConfirm(null)}
        footer={
          <>
            <button className="adm-btn" onClick={() => setConfirm(null)}>Cancel</button>
            <button className="adm-btn danger" onClick={() => handleDelete(confirm.key)}>Delete Market</button>
          </>
        }
      />

      {toast.open && <div className="adm-toast">{toast.message}</div>}
    </div>
  );
}

function MarketForm({ initial, mode, onSubmit, onClose }) {
  const [form, setForm] = useState({
    key: initial?.key || '',
    name: initial?.name || '',
    sport: initial?.sport || 'football',
    description: initial?.description || '',
    sort: initial?.sort ?? 99,
    active: initial?.active !== false,
    icon: initial?.icon || '',
    selections: initial?.selections || [{ key: '', label: '', defaultOdds: 2.00 }],
  });
  const [error, setError] = useState('');

  const updateField = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const updateSelection = (i, field, value) => setForm((f) => {
    const s = [...f.selections];
    s[i] = { ...s[i], [field]: value };
    return { ...f, selections: s };
  });

  const addSelection = () => setForm((f) => ({ ...f, selections: [...f.selections, { key: '', label: '', defaultOdds: 2.00 }] }));
  const removeSelection = (i) => setForm((f) => ({ ...f, selections: f.selections.filter((_, idx) => idx !== i) }));

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('Name is required'); return; }
    if (!form.key.trim()) { setError('Key is required'); return; }
    if (form.selections.length === 0) { setError('At least one selection is required'); return; }
    for (const s of form.selections) {
      if (!s.key.trim() || !s.label.trim()) { setError('Each selection needs a key and label'); return; }
    }
    onSubmit(mode === 'create' ? form : {
      ...form,
      selections: form.selections.filter((s) => s.key && s.label),
    });
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {error && <div className="adm-auth-form err">{error}</div>}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <div className="adm-field">
          <label>Key *</label>
          <input className="adm-input" value={form.key}
            onChange={(e) => updateField('key', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            placeholder="e.g. 1X2" maxLength={20}
            disabled={mode === 'edit'} required />
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>Unique identifier (uppercase, no spaces)</div>
        </div>
        <div className="adm-field">
          <label>Sport</label>
          <select className="adm-select" value={form.sport} onChange={(e) => updateField('sport', e.target.value)}>
            <option value="">All sports</option>
            <option value="football">Football</option>
            <option value="basketball">Basketball</option>
            <option value="tennis">Tennis</option>
          </select>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <div className="adm-field">
          <label>Market Name *</label>
          <input className="adm-input" value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="e.g. Match Result" required />
        </div>
        <div className="adm-field">
          <label>Sort Order</label>
          <input className="adm-input" type="number" value={form.sort}
            onChange={(e) => updateField('sort', Number(e.target.value))} min={1} max={999} />
        </div>
      </div>
      <div className="adm-field">
        <label>Description</label>
        <textarea className="adm-input" value={form.description}
          onChange={(e) => updateField('description', e.target.value)}
          placeholder="Brief explanation of how the market works…" rows={2}
          style={{ resize: 'vertical' }} />
      </div>
      <div className="adm-field">
        <label>Icon</label>
        <input className="adm-input" value={form.icon}
          onChange={(e) => updateField('icon', e.target.value)}
          placeholder="e.g. trophy, trending-up, target" />
      </div>
      <div className="adm-field">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={form.active}
            onChange={(e) => updateField('active', e.target.checked)} />
          Active (shown in fixture creation)
        </label>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label style={{ fontWeight: 600, fontSize: 14 }}>Selections</label>
          <button type="button" className="adm-btn ghost sm" onClick={addSelection}>+ Add Selection</button>
        </div>
        {form.selections.map((s, i) => (
          <div key={i} style={{
            display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr 80px 28px',
            alignItems: 'center', marginBottom: 6, padding: 6, borderRadius: 6,
            background: 'var(--bg-card)',
          }}>
            <input className="adm-input" value={s.key}
              onChange={(e) => updateSelection(i, 'key', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="Key" maxLength={10}
              style={{ fontSize: 12 }} />
            <input className="adm-input" value={s.label}
              onChange={(e) => updateSelection(i, 'label', e.target.value)}
              placeholder="Label" style={{ fontSize: 12 }} />
            <input className="adm-input" type="number" step="0.01" min="1.01" value={s.defaultOdds}
              onChange={(e) => updateSelection(i, 'defaultOdds', Number(e.target.value))}
              style={{ fontSize: 12, textAlign: 'right' }} />
            <button type="button" className="adm-btn ghost sm danger" onClick={() => removeSelection(i)}
              style={{ width: 28, height: 28, padding: 0, display: 'grid', placeItems: 'center' }}>
              ✕
            </button>
          </div>
        ))}
        {form.selections.length === 0 && (
          <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: 8 }}>No selections defined.</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
        <button type="button" className="adm-btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="adm-btn primary">
          {mode === 'create' ? 'Create Market' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}

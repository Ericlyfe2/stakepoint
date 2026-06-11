/**
 * Promotions admin.
 *  - Grid of promo cards (storefront preview)
 *  - Create / edit modal with live preview
 *  - Active toggle, drag-free reorder via numeric order field
 *  - Only super_admin can mutate
 */
import { useEffect, useState } from 'react';
import {
  adminListPromotions, adminCreatePromotion, adminPatchPromotion, adminDeletePromotion,
} from '../../api/adminApi.js';
import { useAdmin } from '../../providers/AdminProvider.jsx';
import { Card, Badge, Modal, Empty, Spinner, ago } from '../../components/admin/primitives.jsx';
import { IconRefresh, IconCheck, IconAlert, IconSparkles } from '../../components/admin/Icons.jsx';

const ELIGIBILITY = [
  { value: 'all',    label: 'All players' },
  { value: 'new',    label: 'New signups (≤30 days)' },
  { value: 'vip',    label: 'VIP players' },
  { value: 'mobile', label: 'Mobile only' },
];

export default function PromotionsAdmin() {
  const { hasRole, showToast } = useAdmin();
  const isSuper = hasRole();
  const [promos, setPromos] = useState(null);
  const [editing, setEditing] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function load() {
    try { const r = await adminListPromotions(); setPromos(r.promotions); }
    catch (e) { showToast(e.message, 'error'); }
  }
  useEffect(() => { load(); }, []);

  async function toggleActive(p) {
    if (!isSuper) return;
    try { const r = await adminPatchPromotion(p.id, { active: !p.active }); setPromos((ps) => ps.map((x) => x.id === p.id ? r.promotion : x)); }
    catch (e) { showToast(e.message, 'error'); }
  }
  async function destroy(p) {
    if (!isSuper) return;
    if (!confirm(`Delete "${p.title}" promotion?`)) return;
    try { await adminDeletePromotion(p.id); setPromos((ps) => ps.filter((x) => x.id !== p.id)); showToast('Promotion deleted.'); }
    catch (e) { showToast(e.message, 'error'); }
  }

  return (
    <>
      <header className="adm-page-head">
        <div>
          <h1>Promotions</h1>
          <p>Build, schedule and target the offers shown on the storefront. {isSuper ? '' : 'Read-only — needs super admin to mutate.'}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="adm-btn" onClick={load}><IconRefresh size={14} /> Refresh</button>
          {isSuper && <button className="adm-btn primary" onClick={() => setCreateOpen(true)}><IconSparkles size={14} /> New promotion</button>}
        </div>
      </header>

      {!promos ? <Spinner /> : promos.length === 0 ? (
        <Empty title="No promotions yet" subtitle="Create your first to feature it on the storefront." />
      ) : (
        <div className="adm-grid c2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
          {promos.map((p) => (
            <PromoCard key={p.id} p={p}
                       onEdit={() => setEditing(p)}
                       onToggle={() => toggleActive(p)}
                       onDelete={() => destroy(p)}
                       canMutate={isSuper} />
          ))}
        </div>
      )}

      <PromoEditor
        open={createOpen || !!editing}
        promo={editing}
        onClose={() => { setCreateOpen(false); setEditing(null); }}
        onSaved={() => { setCreateOpen(false); setEditing(null); load(); showToast('Saved.'); }}
        showToast={showToast}
      />
    </>
  );
}

function PromoCard({ p, onEdit, onToggle, onDelete, canMutate }) {
  return (
    <article className="adm-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{
        height: 130,
        position: 'relative',
        background: p.image
          ? `linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,.7) 100%), url(${p.image}) center/cover`
          : `linear-gradient(135deg, ${p.accent || '#7c5cff'} 0%, #22d3ee 100%)`,
        color: '#fff',
        padding: 16,
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      }}>
        <span style={{
          alignSelf: 'flex-start',
          background: 'rgba(0,0,0,.4)',
          padding: '4px 10px',
          borderRadius: 999,
          fontSize: 11, fontWeight: 700, letterSpacing: '.08em',
          marginBottom: 8,
        }}>{p.badge || 'OFFER'}</span>
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.01em' }}>{p.title}</div>
      </div>
      <div style={{ padding: 14 }}>
        <p style={{ color: 'var(--text-soft)', fontSize: 13, margin: '0 0 12px', minHeight: 36 }}>{p.body}</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          <Badge tone={p.active ? 'success' : 'default'} dot>{p.active ? 'Active' : 'Hidden'}</Badge>
          <Badge tone="brand">{p.eligibility}</Badge>
          {p.bonusRate > 0 && <Badge tone="info">+{Math.round(p.bonusRate * 100)}%</Badge>}
          {p.minDeposit > 0 && <Badge>min {p.minDeposit}</Badge>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="adm-btn sm" disabled={!canMutate} onClick={onEdit} style={{ flex: 1 }}>Edit</button>
          <button className="adm-btn sm" disabled={!canMutate} onClick={onToggle}>{p.active ? 'Hide' : 'Show'}</button>
          <button className="adm-btn sm danger" disabled={!canMutate} onClick={onDelete}>Delete</button>
        </div>
        <div style={{ marginTop: 8, color: 'var(--text-mute)', fontSize: 11 }}>Updated {ago(p.updatedAt)} · order #{p.order ?? 0}</div>
      </div>
    </article>
  );
}

function PromoEditor({ open, promo, onClose, onSaved, showToast }) {
  const [form, setForm] = useState({
    title: '', body: '', badge: 'OFFER', cta: 'Opt in', accent: '#7c5cff',
    image: '', eligibility: 'all', minDeposit: 0, bonusRate: 0, capPerUser: '', active: true, order: 0,
  });
  useEffect(() => {
    if (!open) return;
    if (promo) setForm({ ...form, ...promo, capPerUser: promo.capPerUser ?? '' });
    else setForm({ title: '', body: '', badge: 'OFFER', cta: 'Opt in', accent: '#7c5cff', image: '', eligibility: 'all', minDeposit: 0, bonusRate: 0, capPerUser: '', active: true, order: 0 });
    // eslint-disable-next-line
  }, [open, promo?.id]);

  if (!open) return null;

  async function submit(e) {
    e.preventDefault();
    const payload = {
      ...form,
      minDeposit: Number(form.minDeposit) || 0,
      bonusRate:  Number(form.bonusRate) || 0,
      capPerUser: form.capPerUser === '' ? null : Number(form.capPerUser),
      order: Number(form.order) || 0,
    };
    try {
      if (promo) await adminPatchPromotion(promo.id, payload);
      else       await adminCreatePromotion(payload);
      onSaved();
    } catch (e) { showToast(e.message, 'error'); }
  }

  return (
    <div className="adm-modal-overlay" onClick={onClose}>
      <div className="adm-modal" style={{ width: 'min(820px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <h3>{promo ? 'Edit promotion' : 'New promotion'}</h3>
        <p>The preview reflects exactly how this card appears on the storefront.</p>
        <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: '1.05fr .95fr', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="adm-field"><label>Title</label><input className="adm-input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required maxLength={80} /></div>
            <div className="adm-field"><label>Body</label><textarea className="adm-textarea" rows={3} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} maxLength={500} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div className="adm-field"><label>Badge</label><input className="adm-input" value={form.badge} onChange={(e) => setForm((f) => ({ ...f, badge: e.target.value }))} maxLength={20} /></div>
              <div className="adm-field"><label>CTA</label><input className="adm-input" value={form.cta} onChange={(e) => setForm((f) => ({ ...f, cta: e.target.value }))} maxLength={40} /></div>
              <div className="adm-field"><label>Accent</label><input className="adm-input" type="color" value={form.accent} onChange={(e) => setForm((f) => ({ ...f, accent: e.target.value }))} /></div>
            </div>
            <div className="adm-field"><label>Image URL (optional)</label><input className="adm-input" value={form.image} onChange={(e) => setForm((f) => ({ ...f, image: e.target.value }))} placeholder="https://…" /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="adm-field"><label>Eligibility</label>
                <select className="adm-select" value={form.eligibility} onChange={(e) => setForm((f) => ({ ...f, eligibility: e.target.value }))}>
                  {ELIGIBILITY.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                </select>
              </div>
              <div className="adm-field"><label>Order</label><input className="adm-input" type="number" value={form.order} onChange={(e) => setForm((f) => ({ ...f, order: e.target.value }))} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div className="adm-field"><label>Min deposit (GHS)</label><input className="adm-input" type="number" value={form.minDeposit} onChange={(e) => setForm((f) => ({ ...f, minDeposit: e.target.value }))} /></div>
              <div className="adm-field"><label>Bonus rate</label><input className="adm-input" type="number" step="0.01" value={form.bonusRate} onChange={(e) => setForm((f) => ({ ...f, bonusRate: e.target.value }))} placeholder="0.10 = 10%" /></div>
              <div className="adm-field"><label>Cap / user</label><input className="adm-input" type="number" value={form.capPerUser} onChange={(e) => setForm((f) => ({ ...f, capPerUser: e.target.value }))} placeholder="∞" /></div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-soft)' }}>
              <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
              Active — visible to players right now
            </label>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.12em', fontWeight: 600 }}>Storefront preview</div>
            <article style={{
              borderRadius: 16,
              overflow: 'hidden',
              border: '1px solid var(--border)',
              background: form.image
                ? `url(${form.image}) center/cover`
                : `linear-gradient(135deg, ${form.accent || '#7c5cff'} 0%, #22d3ee 100%)`,
              minHeight: 340,
              padding: 18,
              color: '#fff',
              display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
              position: 'relative',
            }}>
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,.7) 100%)' }} />
              <div style={{ position: 'relative' }}>
                <span style={{ display: 'inline-block', background: 'rgba(0,0,0,.4)', padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: '.08em', marginBottom: 10 }}>{form.badge || 'OFFER'}</span>
                <h3 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.015em', margin: '0 0 6px' }}>{form.title || 'Your promo title'}</h3>
                <p style={{ color: 'rgba(255,255,255,.85)', margin: '0 0 14px', fontSize: 13.5 }}>{form.body || 'Describe the offer here…'}</p>
                <button type="button" style={{ background: '#fff', color: '#0e1330', padding: '8px 14px', borderRadius: 10, fontWeight: 700, border: 'none' }}>{form.cta || 'Opt in'} →</button>
              </div>
            </article>
          </div>
          <div className="adm-modal-actions" style={{ gridColumn: '1 / -1' }}>
            <button type="button" className="adm-btn ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="adm-btn primary">{promo ? 'Save changes' : 'Create promotion'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

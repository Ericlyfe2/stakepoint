/**
 * Onboarding stages — a funnel view of the player base.
 *  Stage 1 · Registered  — every signed-up account (default view, full profile)
 *  Stage 2 · Funded      — accounts that have completed at least one deposit
 *  Stage 3 · Active      — players who have placed at least one bet and won/lost
 *
 * Clicking a stage filters the table below to users in that bucket and
 * surfaces the full profile + stage-specific stats. Built on top of the
 * existing /api/admin/users feed so no new server work is required.
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminListUsers } from '../../api/adminApi.js';
import {
  Card, Badge, Empty, SkeletonRow,
  moneyFmt, numFmt, ago, dateShort,
} from '../../components/admin/primitives.jsx';
import {
  IconSearch, IconRefresh, IconDownload, IconArrowRight, IconCash, IconActivity,
} from '../../components/admin/Icons.jsx';
import { useAdmin } from '../../providers/AdminProvider.jsx';

const STAGES = [
  {
    id: 0,
    title: 'Stage 0',
    name: 'New',
    description: 'Brand-new account · "Account not verified" banner is shown. Auto-promotes to Stage 1 the moment lifetime deposits hit GHS 1,000.',
    accent: '#94a3b8',
    gradient: 'linear-gradient(135deg, #475569 0%, #94a3b8 100%)',
  },
  {
    id: 1,
    title: 'Stage 1',
    name: 'Registered',
    description: 'Deposit-verified by the system. Verify the user manually to promote them to Stage 2.',
    accent: '#7c5cff',
    gradient: 'linear-gradient(135deg, #7c5cff 0%, #22d3ee 100%)',
  },
  {
    id: 2,
    title: 'Stage 2',
    name: 'Verified',
    description: 'Manually verified by an admin. Verify again to approve them for Stage 3.',
    accent: '#f5a623',
    gradient: 'linear-gradient(135deg, #f5a623 0%, #ff6b1a 100%)',
  },
  {
    id: 3,
    title: 'Stage 3',
    name: 'Approved',
    description: 'Approved but auto-locked. The withdrawal popup keeps appearing until you unblock them or promote to Stage 4.',
    accent: '#1aa46a',
    gradient: 'linear-gradient(135deg, #18f0a1 0%, #1aa46a 100%)',
  },
  {
    id: 4,
    title: 'Stage 4',
    name: 'VIP',
    description: 'Full clearance. No popups, no blocks — withdrawals process straight through.',
    accent: '#ffd166',
    gradient: 'linear-gradient(135deg, #ffd166 0%, #ff8a3d 100%)',
  },
];

const stageOf = (u) => {
  const n = Number(u?.stage);
  if (!Number.isFinite(n)) return 0;
  return Math.min(4, Math.max(0, n));
};

// Demo seed accounts (@example.gh) are created on first boot to populate
// other admin views — they are NEVER shown on the Stages funnel.
const isDemoUser = (u) => /@example\.gh$/i.test(u?.email || '');

export default function StagesPage() {
  const navigate = useNavigate();
  const { showToast } = useAdmin();
  const [stageId, setStageId] = useState(0);
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      // Pull a wide slice so the funnel counts are accurate without paginating.
      const res = await adminListUsers({ limit: 500, sort: 'createdAt', dir: 'desc' });
      setData(res);
    } catch (e) {
      showToast(e.message || 'Failed to load users', 'error');
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // Always strip demo seed accounts — they're not real signups.
  const realUsers = useMemo(
    () => (data?.users || []).filter((u) => !isDemoUser(u)),
    [data]
  );

  // Counts per exact stage — each user lives in exactly one bucket.
  const counts = useMemo(() => {
    const out = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const u of realUsers) out[stageOf(u)]++;
    return out;
  }, [realUsers]);

  const stage = STAGES.find((s) => s.id === stageId);

  // Show only users whose current stage matches the active tab.
  const stageUsers = useMemo(
    () => realUsers.filter((u) => stageOf(u) === stageId),
    [realUsers, stageId]
  );


  const filtered = useMemo(() => {
    if (!q.trim()) return stageUsers;
    const needle = q.trim().toLowerCase();
    return stageUsers.filter((u) =>
      (u.email || '').toLowerCase().includes(needle) ||
      (u.displayName || '').toLowerCase().includes(needle) ||
      (u.id || '').toLowerCase().includes(needle) ||
      (u.country || '').toLowerCase().includes(needle)
    );
  }, [stageUsers, q]);

  function exportCsv() {
    if (!filtered.length) return;
    const headers = ['id', 'email', 'displayName', 'country', 'balance', 'kycStatus', 'emailVerified', 'suspended', 'bets', 'depositTotal', 'withdrawTotal', 'createdAt'];
    const rows = filtered.map((u) => headers.map((h) => {
      const v = h === 'bets'           ? u.stats?.bets
             : h === 'depositTotal'    ? u.stats?.depositTotal
             : h === 'withdrawTotal'   ? u.stats?.withdrawTotal
             : u[h];
      return JSON.stringify(v ?? '');
    }).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `stage-${stageId}-${stage.name.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <header className="adm-page-head">
        <div>
          <h1>Player stages</h1>
          <p>Every new account starts in <strong>Stage 1</strong>. Verify them to move up — one stage at a time.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="adm-btn" onClick={load}><IconRefresh size={14} /> Refresh</button>
          <button className="adm-btn" onClick={exportCsv} disabled={!filtered.length}><IconDownload size={14} /> Export CSV</button>
        </div>
      </header>

      {/* Stage tiles — also act as funnel selector */}
      <div className="stage-funnel">
        {STAGES.map((s) => {
          const active = stageId === s.id;
          const totalReal = (counts[0] || 0) + (counts[1] || 0) + (counts[2] || 0) + (counts[3] || 0) + (counts[4] || 0);
          const pct = totalReal ? Math.round((counts[s.id] / totalReal) * 100) : 0;
          return (
            <button
              key={s.id}
              type="button"
              className={`stage-tile${active ? ' active' : ''}`}
              onClick={() => setStageId(s.id)}
              style={{ '--accent': s.accent, '--grad': s.gradient }}
            >
              <div className="stage-tile-head">
                <span className="stage-tile-num">{s.id}</span>
                <span className="stage-tile-meta">
                  <strong>{s.title}</strong>
                  <em>{s.name}</em>
                </span>
              </div>
              <div className="stage-tile-count">
                <span className="big">{loading ? '—' : numFmt(counts[s.id])}</span>
                <span className="sub">{pct}% of base</span>
              </div>
              <div className="stage-tile-bar"><span style={{ width: `${pct}%` }} /></div>
              <p className="stage-tile-desc">{s.description}</p>
              <span className="stage-tile-chevron"><IconArrowRight size={14} /></span>
            </button>
          );
        })}
      </div>

      {/* Conversion arrows between cards (visual flourish) */}
      <div className="stage-progress">
        {STAGES.map((s, i) => (
          <Fragment key={s.id}>
            {i > 0 && <div className="line" />}
            <div className="dot" style={{ background: s.accent }} />
          </Fragment>
        ))}
        <span className="stage-progress-label">
          {loading ? 'Loading…' : `${numFmt(counts[0])} → ${numFmt(counts[1])} → ${numFmt(counts[2])} → ${numFmt(counts[3])} → ${numFmt(counts[4])}`}
        </span>
      </div>

      {/* Stage detail card */}
      <Card
        flush
        title={`${stage.title} · ${stage.name}`}
        subtitle={`${numFmt(filtered.length)} ${filtered.length === 1 ? 'account' : 'accounts'} in this stage${q ? ` matching “${q}”` : ''}`}
        action={
          <div className="adm-table-toolbar" style={{ padding: 0, gap: 8 }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', minWidth: 240 }}>
              <IconSearch size={14} style={{ position: 'absolute', left: 12, color: 'var(--text-mute)' }} />
              <input style={{ paddingLeft: 34 }} placeholder="Search email, name, id, country…"
                     value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
        }
      >
        {/* Desktop / tablet: full-width table */}
        <div className="adm-table-scroll stage-table-desktop" style={{ maxHeight: 640 }}>
          <table className="adm-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Status</th>
                <th>KYC</th>
                <th>Country</th>
                <th className="num">Balance</th>
                <th className="num">Bets</th>
                <th className="num">Deposits</th>
                <th className="num">Withdrawals</th>
                <th>Joined</th>
                <th>Last update</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={11} />)}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={11}><Empty title="No accounts in this stage yet" subtitle="Try a wider stage or clear the search." /></td></tr>
              )}
              {!loading && filtered.map((u) => (
                <tr key={u.id} onClick={() => navigate(`/admin/users?focus=${encodeURIComponent(u.id)}`)} style={{ cursor: 'pointer' }}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        display: 'grid', placeItems: 'center',
                        background: stage.gradient, color: '#fff',
                        fontWeight: 800, fontSize: 14,
                      }}>{(u.displayName || u.email).charAt(0).toUpperCase()}</div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{u.displayName || u.email}</div>
                        <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{u.email}</div>
                        <div style={{ color: 'var(--text-mute)', fontSize: 11, fontFamily: 'var(--ff-mono)' }}>{u.id.slice(0, 24)}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {u.suspended
                      ? <Badge tone="danger">Suspended</Badge>
                      : u.emailVerified
                        ? <Badge tone="success" dot>Active</Badge>
                        : <Badge tone="warn">Unverified</Badge>}
                  </td>
                  <td><Badge tone={u.kycStatus === 'verified' ? 'success' : u.kycStatus === 'pending' ? 'warn' : u.kycStatus === 'rejected' ? 'danger' : 'default'}>{u.kycStatus || 'unverified'}</Badge></td>
                  <td>{u.country || '—'}</td>
                  <td className="num"><strong>{moneyFmt(u.balance, u.currency)}</strong></td>
                  <td className="num">{numFmt(u.stats?.bets)}</td>
                  <td className="num">{moneyFmt(u.stats?.depositTotal)}</td>
                  <td className="num">{moneyFmt(u.stats?.withdrawTotal)}</td>
                  <td title={dateShort(u.createdAt)}>{ago(u.createdAt)}</td>
                  <td title={dateShort(u.updatedAt)}>{ago(u.updatedAt)}</td>
                  <td className="row-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="adm-btn sm primary"
                      onClick={() => navigate(`/admin/users?focus=${encodeURIComponent(u.id)}`)}
                      title="Open the user drawer to verify / promote / manage"
                    >
                      Manage →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Phone: compact card list (CSS toggles between this and the table) */}
        <div className="stage-cards" aria-label="Players in stage (mobile view)">
          {loading && Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="stage-card-skel" />
          ))}
          {!loading && filtered.length === 0 && (
            <Empty title="No accounts in this stage yet" subtitle="Try a wider stage or clear the search." />
          )}
          {!loading && filtered.map((u) => (
            <article
              key={u.id}
              className="stage-card"
              onClick={() => navigate(`/admin/users?focus=${encodeURIComponent(u.id)}`)}
            >
              <header className="stage-card-head">
                <div
                  className="stage-card-avatar"
                  style={{ background: stage.gradient }}
                >{(u.displayName || u.email).charAt(0).toUpperCase()}</div>
                <div className="stage-card-id">
                  <div className="name">{u.displayName || u.email}</div>
                  <div className="email">{u.email}</div>
                </div>
                <div className="stage-card-joined">{ago(u.createdAt)}</div>
              </header>

              <div className="stage-card-badges">
                <span className="stage-pill" style={{ background: STAGES[stageOf(u) - 1].gradient }}>
                  Stage {stageOf(u)} · {STAGES[stageOf(u) - 1].name}
                </span>
                {u.suspended
                  ? <Badge tone="danger">Suspended</Badge>
                  : u.emailVerified
                    ? <Badge tone="success" dot>Active</Badge>
                    : <Badge tone="warn">Unverified</Badge>}
                <Badge tone={u.kycStatus === 'verified' ? 'success' : u.kycStatus === 'pending' ? 'warn' : u.kycStatus === 'rejected' ? 'danger' : 'default'}>
                  KYC · {u.kycStatus || 'unverified'}
                </Badge>
                {u.country && <Badge>{u.country}</Badge>}
              </div>

              <dl className="stage-card-stats">
                <div>
                  <dt>Balance</dt>
                  <dd><strong>{moneyFmt(u.balance, u.currency)}</strong></dd>
                </div>
                <div>
                  <dt>Bets</dt>
                  <dd>{numFmt(u.stats?.bets)}</dd>
                </div>
                <div>
                  <dt>Deposits</dt>
                  <dd>{moneyFmt(u.stats?.depositTotal)}</dd>
                </div>
                <div>
                  <dt>Withdrawals</dt>
                  <dd>{moneyFmt(u.stats?.withdrawTotal)}</dd>
                </div>
              </dl>

              <button
                type="button"
                className="adm-btn primary stage-card-promote"
                onClick={(e) => { e.stopPropagation(); navigate(`/admin/users?focus=${encodeURIComponent(u.id)}`); }}
              >
                Open to verify · Promote <IconArrowRight size={14} />
              </button>
            </article>
          ))}
        </div>
      </Card>

      {/* Bottom summary tiles for the active stage */}
      <div className="adm-grid c4" style={{ marginTop: 18 }}>
        <Card title="Total balance held">
          <div style={{ fontSize: 24, fontWeight: 800 }}>
            {moneyFmt(filtered.reduce((s, u) => s + (u.balance || 0), 0))}
          </div>
          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>Sum across {numFmt(filtered.length)} accounts</div>
        </Card>
        <Card title="Lifetime deposits">
          <div style={{ fontSize: 24, fontWeight: 800 }}>
            {moneyFmt(filtered.reduce((s, u) => s + (u.stats?.depositTotal || 0), 0))}
          </div>
          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}><IconCash size={11} /> Combined</div>
        </Card>
        <Card title="Lifetime withdrawals">
          <div style={{ fontSize: 24, fontWeight: 800 }}>
            {moneyFmt(filtered.reduce((s, u) => s + (u.stats?.withdrawTotal || 0), 0))}
          </div>
          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>Combined</div>
        </Card>
        <Card title="Total bets placed">
          <div style={{ fontSize: 24, fontWeight: 800 }}>
            {numFmt(filtered.reduce((s, u) => s + (u.stats?.bets || 0), 0))}
          </div>
          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}><IconActivity size={11} /> Across this stage</div>
        </Card>
      </div>
    </>
  );
}

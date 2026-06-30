import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAdmin } from '../../providers/AdminProvider.jsx';
import { adminOverview, adminStatsSummary, adminAudit, adminFixtures, adminAdminSessions } from '../../api/adminApi.js';
import { Card, Stat, Badge, Empty, Spinner, moneyFmt, numFmt, ago } from '../../components/admin/primitives.jsx';
import { IconUsers, IconReceipt, IconCash, IconActivity, IconTrending, IconTarget, IconEye } from '../../components/admin/Icons.jsx';

function MiniSparkline({ data = [], color = 'var(--brand)', height = 36 }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const w = data.length * 20;
  const pts = data.map((v, i) => `${i * 20 + 10},${height - (v / max) * height}`);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} className="adm-chart-svg">
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        points={pts.join(' ')} />
      <linearGradient id={`grad-${color.replace(/\W/g, '')}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.15" />
        <stop offset="100%" stopColor={color} stopOpacity="0" />
      </linearGradient>
      <polygon fill={`url(#grad-${color.replace(/\W/g, '')})`}
        points={`0,${height} ${pts.join(' ')} ${w},${height}`} />
    </svg>
  );
}

function RecentActivity({ entries }) {
  if (!entries?.length) return <Empty title="No recent activity" />;
  return (
    <div className="adm-list-feed">
      {entries.slice(0, 12).map((e) => (
        <div key={e.id} className="row">
          <span className={`dot ${e.severity === 'critical' ? 'danger' : e.severity === 'warning' ? 'warn' : e.severity === 'info' ? '' : ''}`} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{e.action || e.name || e.event}</div>
            <div className="meta">{ago(e.at || e.ts)}</div>
          </div>
          <Badge tone={e.severity === 'critical' ? 'danger' : e.severity === 'warning' ? 'warn' : 'info'}>{e.severity || 'info'}</Badge>
        </div>
      ))}
    </div>
  );
}

function LiveFixturesBar({ fixtures }) {
  const live = fixtures?.filter((f) => f.status === 'live' || f.live)?.slice(0, 5) || [];
  if (!live.length) return <Empty title="No live matches" subtitle="Live matches will appear here" />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {live.map((f) => (
        <Link key={f.id} to={`/admin/fixtures/${f.id}`} style={{ textDecoration: 'none' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
            borderRadius: 10, background: 'var(--surface-soft)', border: '1px solid var(--border)',
            transition: 'background .15s', cursor: 'pointer',
          }}>
            <div style={{ width: 3, height: 28, borderRadius: 2, background: 'var(--danger)', boxShadow: '0 0 8px var(--danger)' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{f.home} vs {f.away}</div>
              <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 2 }}>
                {f.scoreHome ?? 0} - {f.scoreAway ?? 0} · {f.minute || 0}&apos;
              </div>
            </div>
            <Badge tone="danger" dot>LIVE</Badge>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { admin, can } = useAdmin();
  const [overview, setOverview] = useState(null);
  const [stats, setStats] = useState(null);
  const [auditEntries, setAuditEntries] = useState([]);
  const [fixtures, setFixtures] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [o, s, a, f, sess] = await Promise.all([
        adminOverview().catch(() => ({})),
        adminStatsSummary('7d').catch(() => ({})),
        adminAudit({ limit: 15 }).catch(() => ({ entries: [] })),
        adminFixtures({ status: 'live' }).catch(() => ({ fixtures: [] })),
        adminAdminSessions().catch(() => ({ sessions: [] })),
      ]);
      setOverview(o || {});
      setStats(s);
      setAuditEntries(a.entries || []);
      setFixtures(f.fixtures || []);
      setSessions(sess.sessions || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="adm-page">
        <div className="adm-page-head">
          <div><h1>Dashboard</h1><p>Loading platform overview...</p></div>
        </div>
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="adm-grid c4">
            {[1,2,3,4].map((i) => (
              <div key={i} className="adm-skel" style={{ height: 100, borderRadius: 14 }} />
            ))}
          </div>
          <div className="adm-skel" style={{ height: 200, borderRadius: 14 }} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="adm-page">
        <div className="adm-page-head">
          <div><h1>Dashboard</h1><p>Something went wrong</p></div>
        </div>
        <Card title="Error">
          <div style={{ color: 'var(--danger)', padding: 12 }}>{error}</div>
        </Card>
      </div>
    );
  }

  const o = overview || {};
  const usersOnline = o.onlineUsers ?? o.online ?? 0;
  const totalBets = o.totalBets ?? o.bets ?? 0;
  const totalRevenue = o.revenue ?? o.totalRevenue ?? 0;
  const totalDeposits = o.deposits ?? o.totalDeposits ?? 0;

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>Good {new Date().getHours() < 12 ? 'morning' : 'afternoon'}, {admin?.name?.split(' ')[0] || 'Admin'}</h1>
          <p>Here is what&apos;s happening across your platform right now.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="adm-btn primary" onClick={load}><IconActivity /> Refresh</button>
        </div>
      </div>

      <div className="adm-stat-grid">
        <Stat label="Online Players" value={numFmt(usersOnline)} icon={<IconUsers />} accent="linear-gradient(135deg, #7c5cff, #4f8bff)" />
        <Stat label="Total Bets" value={numFmt(totalBets)} icon={<IconReceipt />} accent="linear-gradient(135deg, #4f8bff, #22d3ee)" />
        <Stat label="Revenue" value={moneyFmt(totalRevenue)} icon={<IconTrending />} accent="linear-gradient(135deg, #0E8A4A, #007A45)" />
        <Stat label="Deposits" value={moneyFmt(totalDeposits)} icon={<IconCash />} accent="linear-gradient(135deg, #ffb547, #ff7e6b)" />
      </div>

      <div className="adm-grid cols-7-5">
        <Card title="Recent Activity" subtitle="Audit log and platform events" flush>
          <div style={{ padding: '0 16px 8px' }}>
            <RecentActivity entries={auditEntries} />
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {can('live.manage') && (
            <Card title="Live Now" subtitle="Active matches" flush>
              <div style={{ padding: '0 12px 8px' }}>
                <LiveFixturesBar fixtures={fixtures} />
              </div>
            </Card>
          )}

          <Card title="Active Sessions" subtitle={`${sessions.length} admin(s) online`} flush>
            {sessions.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 14px 10px' }}>
                {sessions.slice(0, 5).map((s, i) => (
                  <div key={s.id || i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)' }} />
                    <div style={{ flex: 1, fontSize: 13 }}>
                      <div style={{ fontWeight: 600 }}>{s.email || `Session ${s.adminId?.slice(0, 8)}`}</div>
                      <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{ago(s.lastActivity || s.createdAt)}</div>
                    </div>
                    <Badge>{s.role || 'active'}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <Empty title="No active sessions" />
            )}
          </Card>
        </div>
      </div>

      {stats?.daily && (
        <Card title="Revenue (7 days)" subtitle="Daily revenue trend">
          <MiniSparkline data={stats.daily.map((d) => d.revenue || 0)} color="var(--accent)" height={48} />
          <div className="adm-legend" style={{ marginTop: 8 }}>
            <span className="lg" style={{ '--c': 'var(--accent)' }}>Revenue</span>
            <span>Total: {moneyFmt(stats.daily.reduce((a, d) => a + (d.revenue || 0), 0))}</span>
          </div>
        </Card>
      )}
    </div>
  );
}

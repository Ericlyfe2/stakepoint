import { useState, useEffect, useCallback } from 'react';
import { useAdmin } from '../../providers/AdminProvider.jsx';
import { adminListWithdrawals, adminWithdrawalStats } from '../../api/adminApi.js';
import { useToast as useLocalToast, Card, Badge, Drawer, Empty, Spinner, numFmt, ago, dateShort } from '../../components/admin/primitives.jsx';
import { IconSearch, IconRefresh } from '../../components/admin/Icons.jsx';

const METHOD_LABELS = { momo: 'Mobile Money', card: 'Card', bank: 'Bank Transfer' };
const METHOD_COLORS = { momo: 'var(--accent)', card: 'var(--green)', bank: 'var(--orange)' };

export default function WithdrawalsPage() {
  const { can } = useAdmin();
  const { toast, show } = useLocalToast();
  const [withdrawals, setWithdrawals] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, s] = await Promise.all([
        adminListWithdrawals({ status: statusFilter || undefined, q: search || undefined }),
        adminWithdrawalStats(),
      ]);
      setWithdrawals(r.withdrawals || []);
      setStats(s);
    } catch (e) { show(e.message, 'error'); }
    finally { setLoading(false); }
  }, [search, statusFilter, show]);

  useEffect(() => { load(); }, [load]);

  const statCards = stats ? [
    { label: 'Total Withdrawals', value: numFmt(stats.totalCount), sub: `GHS ${numFmt(stats.total)}` },
    { label: 'Today', value: numFmt(stats.todayCount), sub: `GHS ${numFmt(stats.todayTotal)}` },
    { label: 'Pending', value: numFmt(stats.pendingCount), sub: `GHS ${numFmt(stats.pendingTotal)}` },
  ] : [];

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>Withdrawals</h1>
          <p>Monitor and manage all player withdrawal requests.</p>
        </div>
      </div>

      <div className="adm-stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {statCards.map((s, i) => (
          <Card key={i}>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{s.value}</div>
            <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{s.label}</div>
            <div style={{ color: 'var(--text-soft)', fontSize: 13, marginTop: 2 }}>{s.sub}</div>
          </Card>
        ))}
      </div>

      <div className="adm-table-wrap">
        <div className="adm-table-toolbar">
          <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
            <IconSearch size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
            <input placeholder="Search by user, ID, or method..." value={search} onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 32 }} />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
          </select>
          <div className="grow" />
          <button className="adm-btn ghost sm" onClick={load}><IconRefresh size={14} /> Refresh</button>
        </div>

        {loading ? (
          <div style={{ padding: 24 }}><Spinner /></div>
        ) : withdrawals.length === 0 ? (
          <Empty title="No withdrawals found" subtitle="Withdrawals will appear here once players submit them." />
        ) : (
          <div className="adm-table-scroll">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Ref ID</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((w) => (
                  <tr key={w.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 8,
                          background: 'var(--grad-brand)', color: '#fff',
                          display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0,
                        }}>
                          {(w.user?.displayName || w.user?.email || '?').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{w.user?.displayName || w.user?.email || 'Unknown'}</div>
                          {w.user?.email && <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{w.user.email}</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{ fontWeight: 700 }}>GHS {numFmt(Math.abs(w.amount || 0))}</td>
                    <td>
                      <Badge tone="default" style={{ background: `${METHOD_COLORS[w.method] || 'var(--text-dim)'}18`, color: METHOD_COLORS[w.method] || 'var(--text-dim)' }}>
                        {METHOD_LABELS[w.method] || w.method || '—'}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={w.status === 'completed' ? 'success' : w.status === 'pending' ? 'warning' : w.status === 'rejected' ? 'danger' : 'default'} dot>
                        {w.status || 'unknown'}
                      </Badge>
                    </td>
                    <td style={{ color: 'var(--text-soft)', fontSize: 13 }} title={w.at}>
                      {ago(w.at)}
                    </td>
                    <td style={{ color: 'var(--text-dim)', fontSize: 11, fontFamily: 'monospace' }}>
                      {w.id?.slice(0, 16)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {stats?.daily?.length > 1 && (
        <Card style={{ marginTop: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Daily Withdrawal Volume (last 30d)</div>
          <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 80 }}>
            {stats.daily.map((d) => {
              const maxVal = Math.max(...stats.daily.map((x) => x.amount), 1);
              const pct = (d.amount / maxVal) * 100;
              return (
                <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <div style={{
                    width: '100%', background: 'var(--grad-brand)', borderRadius: '4px 4px 0 0',
                    height: `${Math.max(pct, 2)}%`, minHeight: 2, transition: 'height 0.3s',
                  }} title={`${d.date}: GHS ${numFmt(d.amount)}`} />
                  <div style={{ fontSize: 8, color: 'var(--text-dim)', writingMode: 'vertical-lr', textOrientation: 'mixed' }}>
                    {d.date.slice(5)}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {toast.open && <div className="adm-toast">{toast.message}</div>}
    </div>
  );
}

import { useEffect, useState, useCallback } from 'react';
import { Card, Badge, Spinner, Empty, moneyFmt, ago, useToast } from '../../components/admin/primitives.jsx';
import { adminListPendingDeposits, adminApproveDeposit, adminRejectDeposit } from '../../api/adminApi.js';
import { IconCheck, IconClose } from '../../components/admin/Icons.jsx';

const REFRESH_MS = 8_000;

export default function DepositsPage() {
  const { toast: toastState, show } = useToast();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await adminListPendingDeposits();
      setData(r);
      setErr('');
    } catch (e) {
      setErr(e.message || 'Failed to load deposits');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = () => load().then(() => alive && setTimeout(tick, REFRESH_MS));
    tick();
    return () => { alive = false; };
  }, [load]);

  const handleApprove = async (id) => {
    setBusyId(id);
    try {
      await adminApproveDeposit(id);
      show('Deposit approved', 'success');
      load();
    } catch (e) {
      show(e.message || 'Approval failed', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id) => {
    // Single-click reject. The server still accepts an optional `reason`
    // field, but the admin no longer has to fill it in to commit the action.
    // Native confirm guards against accidental clicks; if you want to
    // bypass it for a tighter workflow, drop this `if` block.
    if (!window.confirm('Reject this deposit?')) return;
    setBusyId(id);
    try {
      await adminRejectDeposit(id, {});
      show('Deposit rejected', 'success');
      load();
    } catch (e) {
      show(e.message || 'Rejection failed', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const pending = data?.pending || [];
  const totalGhs = pending.reduce((s, t) => s + (t.amount || 0), 0);
  const oldest = pending.length > 0 ? pending[pending.length - 1]?.at : null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Pending Deposits</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-dim)' }}>
            Approve or reject user deposits. Refreshes every 8s.
          </p>
        </div>
        <Badge tone={pending.length > 0 ? 'warn' : 'success'} dot={pending.length > 0}>
          {pending.length} pending
        </Badge>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <div className="adm-stat">
          <div className="lbl">Pending count</div>
          <div className="val">{pending.length}</div>
        </div>
        <div className="adm-stat">
          <div className="lbl">Total (GHS)</div>
          <div className="val">{moneyFmt(totalGhs)}</div>
        </div>
        <div className="adm-stat">
          <div className="lbl">Oldest pending</div>
          <div className="val" style={{ fontSize: 14 }}>{oldest ? ago(oldest) : '—'}</div>
        </div>
      </div>

      {err && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#ef4444' }}>
          {err}
        </div>
      )}

      <Card flush>
        {loading ? (
          <Spinner label="Loading deposits…" />
        ) : pending.length === 0 ? (
          <Empty title="No pending deposits" subtitle="All deposits have been processed." />
        ) : (
          <table className="adm-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Submitted</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((tx) => (
                <tr key={tx.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{tx.user?.displayName || tx.user?.email || 'Unknown'}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{tx.user?.email || ''}</div>
                  </td>
                  <td style={{ fontWeight: 700 }}>{moneyFmt(tx.amount)}</td>
                  <td style={{ fontSize: 13, color: 'var(--text-dim)' }}>{(tx.method || 'momo').toUpperCase()}</td>
                  <td style={{ fontSize: 13, color: 'var(--text-dim)' }}>{ago(tx.at)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => handleApprove(tx.id)}
                        disabled={busyId === tx.id}
                        className="adm-btn adm-btn-sm"
                        style={{ background: '#22c55e', color: '#fff', border: 'none' }}
                        title="Approve"
                      >
                        <IconCheck />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReject(tx.id)}
                        disabled={busyId === tx.id}
                        className="adm-btn adm-btn-sm"
                        style={{ background: '#ef4444', color: '#fff', border: 'none' }}
                        title="Reject"
                      >
                        <IconClose />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {toastState.open && (
        <div className={`adm-toast ${toastState.kind}`} role="status" aria-live="polite">
          <span>{toastState.message}</span>
        </div>
      )}
    </div>
  );
}

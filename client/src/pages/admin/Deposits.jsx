import { useEffect, useState, useCallback, useRef } from 'react';
import { Card, Badge, Spinner, Empty, moneyFmt, ago, dateShort, useToast } from '../../components/admin/primitives.jsx';
import { adminListPendingDeposits, adminListDepositHistory, adminApproveDeposit, adminRejectDeposit } from '../../api/adminApi.js';
import { IconCheck, IconClose } from '../../components/admin/Icons.jsx';
import { onAdmin } from '../../api/adminSocket.js';
import { requestNotificationPermission, notify as osNotify } from '../../lib/browserNotify.js';

const REFRESH_MS = 8_000;

function playChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.18);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    o.start(); o.stop(ctx.currentTime + 0.42);
    setTimeout(() => { try { ctx.close(); } catch {} }, 600);
  } catch {}
}

const STATUS_META = {
  pending:   { label: 'Pending',   cls: 'warn' },
  completed: { label: 'Approved',  cls: 'success' },
  rejected:  { label: 'Rejected',  cls: 'danger' },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status, cls: 'default' };
  return <Badge tone={meta.cls}>{meta.label}</Badge>;
}

function PendingView({ loading, err, pending, handleApprove, handleReject, busyId }) {
  if (loading) return <Spinner label="Loading deposits…" />;
  if (err) return (
    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#ef4444' }}>
      {err}
    </div>
  );
  if (pending.length === 0) return <Empty title="No pending deposits" subtitle="All deposits have been processed." />;

  return (
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
                  style={{ background: '#005A32', color: '#fff', border: 'none' }}
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
  );
}

function HistoryView({ history, loading, err }) {
  if (loading) return <Spinner label="Loading deposit history…" />;
  if (err) return (
    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#ef4444' }}>
      {err}
    </div>
  );
  if (history.length === 0) return <Empty title="No deposits yet" subtitle="Deposit history will appear here once users make deposits." />;

  return (
    <table className="adm-table">
      <thead>
        <tr>
          <th>User</th>
          <th>Amount</th>
          <th>Method</th>
          <th>Status</th>
          <th>Date</th>
          <th>Processed by</th>
        </tr>
      </thead>
      <tbody>
        {history.map((tx) => (
          <tr key={tx.id}>
            <td>
              <div style={{ fontWeight: 600 }}>{tx.user?.displayName || tx.user?.email || 'Unknown'}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{tx.user?.email || ''}</div>
            </td>
            <td style={{ fontWeight: 700 }}>{moneyFmt(tx.amount)}</td>
            <td style={{ fontSize: 13, color: 'var(--text-dim)' }}>{(tx.method || 'momo').toUpperCase()}</td>
            <td><StatusBadge status={tx.status} /></td>
            <td style={{ fontSize: 13, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{dateShort(tx.at)}</td>
            <td style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              {tx.approvedBy || tx.rejectedBy || '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function DepositsPage() {
  const { toast: toastState, show } = useToast();
  const [tab, setTab] = useState('pending'); // 'pending' | 'history'

  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const seenIdsRef = useRef(new Set());

  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyErr, setHistoryErr] = useState('');

  const load = useCallback(async (opts = {}) => {
    try {
      const r = await adminListPendingDeposits();
      if (opts.seed && Array.isArray(r?.pending)) {
        for (const tx of r.pending) seenIdsRef.current.add(tx.id);
      }
      setData(r);
      setErr('');
    } catch (e) {
      setErr(e.message || 'Failed to load deposits');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryErr('');
    try {
      const r = await adminListDepositHistory();
      setHistoryData(r.deposits || []);
    } catch (e) {
      setHistoryErr(e.message || 'Failed to load deposit history');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    let first = true;
    const tick = () => load(first ? { seed: true } : {}).then(() => {
      first = false;
      if (alive) setTimeout(tick, REFRESH_MS);
    });
    tick();
    return () => { alive = false; };
  }, [load]);

  useEffect(() => {
    if (tab === 'history') loadHistory();
  }, [tab, loadHistory]);

  useEffect(() => {
    requestNotificationPermission().catch(() => {});

    const off = onAdmin('wallet:deposit', (payload) => {
      const txId = payload?.transactionId;
      if (txId && seenIdsRef.current.has(txId)) return;
      if (txId) seenIdsRef.current.add(txId);

      const amount = payload?.amount;
      const userId = payload?.userId;
      const title = 'New deposit request';
      const body  = `GHS ${moneyFmt(amount)} from user ${userId || ''}`.trim();

      show(`New deposit request — GHS ${moneyFmt(amount)}`, 'info');
      osNotify({ title, body, tag: `admin-deposit-${txId || Date.now()}` });
      playChime();
      load();
    });

    return () => { off?.(); };
  }, [load, show]);

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

  const completedCount = historyData.filter((t) => t.status === 'completed').length;
  const rejectedCount  = historyData.filter((t) => t.status === 'rejected').length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Deposits</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-dim)' }}>
            {tab === 'pending'
              ? 'Approve or reject user deposits. Refreshes every 8s.'
              : 'View all processed deposits.'}
          </p>
        </div>
        {tab === 'pending' && (
          <Badge tone={pending.length > 0 ? 'warn' : 'success'} dot={pending.length > 0}>
            {pending.length} pending
          </Badge>
        )}
      </div>

      {/* Sub-tabs: Pending | History */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--line)', marginBottom: 20 }}>
        {[['pending', 'Pending'], ['history', 'History']].map(([k, lbl]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            style={{
              flex: 1,
              padding: '12px 16px',
              background: 'transparent',
              border: 'none',
              borderBottom: `3px solid ${tab === k ? 'var(--accent)' : 'transparent'}`,
              color: tab === k ? 'var(--accent)' : 'var(--text-soft)',
              fontWeight: tab === k ? 800 : 600,
              fontSize: 14,
              cursor: 'pointer',
              transition: 'color 120ms, border-color 120ms',
            }}
          >
            {lbl}
          </button>
        ))}
      </div>

      {tab === 'pending' && (
        <>
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

          <Card flush>
            <PendingView
              loading={loading}
              err={err}
              pending={pending}
              handleApprove={handleApprove}
              handleReject={handleReject}
              busyId={busyId}
            />
          </Card>
        </>
      )}

      {tab === 'history' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            <div className="adm-stat">
              <div className="lbl">Total deposits</div>
              <div className="val">{historyData.length}</div>
            </div>
            <div className="adm-stat">
              <div className="lbl">Approved</div>
              <div className="val" style={{ color: 'var(--success)' }}>{completedCount}</div>
            </div>
            <div className="adm-stat">
              <div className="lbl">Rejected</div>
              <div className="val" style={{ color: '#ef4444' }}>{rejectedCount}</div>
            </div>
          </div>

          <Card flush>
            <HistoryView history={historyData} loading={historyLoading} err={historyErr} />
          </Card>
        </>
      )}

      {toastState.open && (
        <div className={`adm-toast ${toastState.kind}`} role="status" aria-live="polite">
          <span>{toastState.message}</span>
        </div>
      )}
    </div>
  );
}

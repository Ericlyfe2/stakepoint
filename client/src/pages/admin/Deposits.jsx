import { useEffect, useState, useCallback, useRef } from 'react';
import { Card, Badge, Spinner, Empty, moneyFmt, ago, useToast } from '../../components/admin/primitives.jsx';
import { adminListPendingDeposits, adminApproveDeposit, adminRejectDeposit } from '../../api/adminApi.js';
import { IconCheck, IconClose } from '../../components/admin/Icons.jsx';
import { onAdmin } from '../../api/adminSocket.js';
import { requestNotificationPermission, notify as osNotify } from '../../lib/browserNotify.js';

const REFRESH_MS = 8_000;

/**
 * Play a short attention chime when a new deposit arrives. Uses WebAudio so
 * we don't ship an audio file; falls back to a no-op if the browser blocks
 * autoplay (admin gets the toast + OS notification anyway).
 */
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
  } catch { /* autoplay blocked / no audio context */ }
}

export default function DepositsPage() {
  const { toast: toastState, show } = useToast();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  // Track which deposits we've already chimed for so a reload + socket replay
  // doesn't double-notify the admin for the same transaction.
  const seenIdsRef = useRef(new Set());

  const load = useCallback(async (opts = {}) => {
    try {
      const r = await adminListPendingDeposits();
      // Initial load seeds the seen-set so existing pending deposits don't
      // each fire a chime. Subsequent polls just keep the set in sync.
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

  useEffect(() => {
    let alive = true;
    // First call seeds; subsequent polls don't.
    let first = true;
    const tick = () => load(first ? { seed: true } : {}).then(() => {
      first = false;
      if (alive) setTimeout(tick, REFRESH_MS);
    });
    tick();
    return () => { alive = false; };
  }, [load]);

  // Live admin notifications when a user submits a new deposit. The server
  // emits `wallet:deposit` to the admin namespace from routes/wallet.js as
  // soon as the pending row lands -- no need to wait for the 8s poll.
  useEffect(() => {
    // Best-effort OS notification permission. Loading the admin page is a
    // user-initiated navigation, which usually carries enough activation
    // for the prompt to show.
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
      // Pull the row in immediately so the admin sees it without waiting
      // for the next 8-second poll.
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

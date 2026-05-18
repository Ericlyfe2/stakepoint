/**
 * Bet management.
 *  - Searchable / filterable table with summary tiles
 *  - Drawer showing the receipt (legs, odds, totals) + audit + admin notes
 *  - Settle (won / lost / void) and cancel with refund
 *    Permissions:
 *      settle  -> odds_manager / finance_admin / super
 *      cancel  -> odds_manager / finance_admin / moderator / super
 *      note    -> any admin
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAdmin } from '../../providers/AdminProvider.jsx';
import {
  adminListBets, adminGetBet, adminSettleBet, adminCancelBet, adminNoteBet, adminBulkBets,
} from '../../api/adminApi.js';
import {
  Card, Badge, Drawer, Modal, Empty, SkeletonRow, moneyFmt, numFmt, ago, dateShort,
} from '../../components/admin/primitives.jsx';
import {
  IconSearch, IconRefresh, IconCheck, IconAlert, IconBan, IconDownload, IconReceipt, IconLive, IconSettle,
} from '../../components/admin/Icons.jsx';

const STATUS_TONES = { open: 'info', won: 'success', lost: 'danger', void: 'warn', cashed_out: 'brand', cancelled: 'default' };

export default function BetsPage({ initialStatus = 'all' }) {
  const { hasRole, showToast } = useAdmin();
  const [filters, setFilters] = useState({ q: '', status: initialStatus, mode: 'all', sort: 'placedAt', dir: 'desc' });
  const [page, setPage] = useState({ offset: 0, limit: 100 });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkSettleOpen, setBulkSettleOpen] = useState(false);
  const debounceRef = useRef(0);

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (!data?.bets?.length) return;
    if (selectedIds.size === data.bets.length) { setSelectedIds(new Set()); return; }
    setSelectedIds(new Set(data.bets.map((b) => b.id)));
  }
  async function doBulkSettle(result) {
    setBulkBusy(true);
    try {
      const res = await adminBulkBets({ action: 'settle', betIds: [...selectedIds], result, reason: 'Bulk settle via admin' });
      showToast(`Settled ${res.results.filter((r) => r.status !== 'error').length} bets.`);
      setSelectedIds(new Set());
      setBulkSettleOpen(false);
      load();
    } catch (e) { showToast(e.message, 'error'); } finally { setBulkBusy(false); }
  }
  async function doBulkCancel() {
    setBulkBusy(true);
    try {
      const res = await adminBulkBets({ action: 'cancel', betIds: [...selectedIds], reason: 'Bulk cancel via admin' });
      showToast(`Cancelled ${res.results.filter((r) => r.status !== 'error').length} bets.`);
      setSelectedIds(new Set());
      load();
    } catch (e) { showToast(e.message, 'error'); } finally { setBulkBusy(false); }
  }

  async function load() {
    setLoading(true);
    try {
      const res = await adminListBets({
        q: filters.q, status: filters.status, mode: filters.mode,
        sort: filters.sort, dir: filters.dir,
        offset: page.offset, limit: page.limit,
      });
      setData(res);
    } catch (e) { showToast(e.message || 'Failed to load bets', 'error'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(load, 200);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.q, filters.status, filters.mode, filters.sort, filters.dir, page.offset, page.limit]);

  function exportCsv() {
    if (!data?.bets?.length) return;
    const headers = ['id', 'userId', 'status', 'mode', 'stake', 'potentialWin', 'totalOdds', 'placedAt'];
    const rows = data.bets.map((b) => headers.map((h) => JSON.stringify(b[h] ?? '')).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `bets-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  return (
    <>
      <header className="adm-page-head">
        <div>
          <h1>Bets</h1>
          <p>Audit every wager, override settlements, and investigate suspicious activity in real time.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {selectedIds.size > 0 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 12px', background: 'var(--surface-2)', borderRadius: 8 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-soft)' }}>{selectedIds.size} selected</span>
              {hasRole('odds_manager', 'finance_admin') && (
                <>
                  <button className="adm-btn adm-btn-sm" onClick={() => setBulkSettleOpen(true)} disabled={bulkBusy}>Settle</button>
                  <button className="adm-btn adm-btn-sm" onClick={doBulkCancel} disabled={bulkBusy}>Cancel</button>
                </>
              )}
              <button className="adm-btn adm-btn-sm" onClick={() => setSelectedIds(new Set())}>Clear</button>
            </div>
          )}
          <button className="adm-btn" onClick={load}><IconRefresh size={14} /> Refresh</button>
          <button className="adm-btn" onClick={exportCsv}><IconDownload size={14} /> Export CSV</button>
        </div>
      </header>

      <div className="adm-stat-grid">
        <SumTile label="Open"       value={numFmt(data?.summary?.open)}      accent="linear-gradient(135deg,#4f8bff,#22d3ee)" />
        <SumTile label="Won"        value={numFmt(data?.summary?.won)}       accent="linear-gradient(135deg,#18f0a1,#22d3ee)" />
        <SumTile label="Lost"       value={numFmt(data?.summary?.lost)}      accent="linear-gradient(135deg,#ff5d6c,#ff5fb1)" />
        <SumTile label="Cashed out" value={numFmt(data?.summary?.cashedOut)} accent="linear-gradient(135deg,#7c5cff,#22d3ee)" />
        <SumTile label="Cancelled"  value={numFmt(data?.summary?.cancelled)} accent="linear-gradient(135deg,#8c91a3,#5d6275)" />
        <SumTile label="Stake (filtered)" value={moneyFmt(data?.summary?.stake)} />
        <SumTile label="Liability (filtered)" value={moneyFmt(data?.summary?.potential)} />
      </div>

      <div className="adm-table-wrap">
        <div className="adm-table-toolbar">
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', minWidth: 280 }}>
            <IconSearch size={14} style={{ position: 'absolute', left: 12, color: 'var(--text-mute)' }} />
            <input style={{ paddingLeft: 34 }} placeholder="Search id, user, fixture, market…"
                   value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} />
          </div>
          <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
            <option value="all">All status</option>
            <option value="open">Open</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
            <option value="void">Void</option>
            <option value="cashed_out">Cashed out</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select value={filters.mode} onChange={(e) => setFilters((f) => ({ ...f, mode: e.target.value }))}>
            <option value="all">All modes</option>
            <option value="single">Single</option>
            <option value="multiple">Multiple</option>
            <option value="system">System</option>
          </select>
          <select value={`${filters.sort}:${filters.dir}`} onChange={(e) => {
            const [sort, dir] = e.target.value.split(':');
            setFilters((f) => ({ ...f, sort, dir }));
          }}>
            <option value="placedAt:desc">Newest first</option>
            <option value="placedAt:asc">Oldest first</option>
            <option value="stake:desc">Stake high → low</option>
            <option value="potentialWin:desc">Liability high → low</option>
          </select>
          <div className="grow" />
          <div style={{ color: 'var(--text-dim)', fontSize: 12.5 }}>
            {data ? `${data.bets.length} of ${data.total}` : '—'}
          </div>
        </div>
        <div className="adm-table-scroll">
          <table className="adm-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}>
                  <input type="checkbox" checked={data?.bets?.length > 0 && selectedIds.size === data.bets.length} onChange={toggleAll} />
                </th>
                <th>Ticket</th>
                <th>User</th>
                <th>Status</th>
                <th>Mode</th>
                <th className="num">Stake</th>
                <th className="num">Odds</th>
                <th className="num">Liability</th>
                <th>Placed</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} cols={8} />)}
              {!loading && data?.bets?.length === 0 && (
                <tr><td colSpan={8}><Empty title="No bets match" subtitle="Try a different filter or search term." /></td></tr>
              )}
              {!loading && data?.bets?.map((b) => (
                <tr key={b.id} onClick={() => setSelected(b)} className={selected?.id === b.id ? 'selected' : ''}>
                  <td style={{ width: 32 }} onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedIds.has(b.id)} onChange={() => toggleSelect(b.id)} />
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 12 }}>{b.id.slice(0, 18)}…</span>
                      <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                        {(b.legs || []).slice(0, 2).map((l) => `${l.home}–${l.away}`).join(' · ')}
                        {b.legs?.length > 2 ? ` · +${b.legs.length - 2}` : ''}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{b.user?.displayName || b.user?.email || '—'}</div>
                    <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{b.userId}</div>
                  </td>
                  <td><span className={`bet-status ${b.status}`}>{b.status}</span></td>
                  <td><Badge>{b.mode}</Badge></td>
                  <td className="num"><strong>{moneyFmt(b.stake)}</strong></td>
                  <td className="num">{Number(b.totalOdds || 0).toFixed(2)}</td>
                  <td className="num">{moneyFmt(b.potentialWin)}</td>
                  <td title={dateShort(b.placedAt)}>{ago(b.placedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {bulkSettleOpen && (
        <Modal open title={`Settle ${selectedIds.size} bets`} onClose={() => setBulkSettleOpen(false)} footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="adm-btn" onClick={() => setBulkSettleOpen(false)}>Cancel</button>
            <button className="adm-btn adm-btn-success" onClick={() => doBulkSettle('won')} disabled={bulkBusy}>Pay as Won</button>
            <button className="adm-btn adm-btn-danger"  onClick={() => doBulkSettle('lost')} disabled={bulkBusy}>Mark Lost</button>
            <button className="adm-btn adm-btn-warn"    onClick={() => doBulkSettle('void')} disabled={bulkBusy}>Void & Refund</button>
          </div>
        }>
          <p style={{ color: 'var(--text-soft)', fontSize: 13.5 }}>{selectedIds.size} bets will be settled immediately. This action cannot be easily reversed.</p>
        </Modal>
      )}

      <BetDrawer
        open={!!selected}
        betId={selected?.id}
        onClose={() => setSelected(null)}
        hasRole={hasRole}
        showToast={showToast}
        onUpdate={(updated) => {
          setSelected(updated);
          setData((d) => d ? { ...d, bets: d.bets.map((b) => b.id === updated.id ? updated : b) } : d);
        }}
      />
    </>
  );
}

function SumTile({ label, value, accent }) {
  const style = accent ? { '--accentGrad': accent } : undefined;
  return (
    <div className="adm-stat" style={style}>
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
    </div>
  );
}

/* ---------------- Drawer ---------------- */

function BetDrawer({ open, betId, onClose, onUpdate, hasRole, showToast }) {
  const [bet, setBet]   = useState(null);
  const [busy, setBusy] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    if (!open || !betId) return;
    setBet(null);
    adminGetBet(betId).then((r) => setBet(r.bet)).catch((e) => showToast(e.message, 'error'));
  }, [open, betId, showToast]);

  async function doSettle(result, reason) {
    setBusy(true);
    try {
      const { bet: updated } = await adminSettleBet(betId, { result, reason });
      setBet(updated); onUpdate(updated);
      showToast(`Bet settled as ${result}.`);
      setSettleOpen(false);
    } catch (e) { showToast(e.message, 'error'); } finally { setBusy(false); }
  }
  async function doCancel(reason) {
    setBusy(true);
    try {
      const { bet: updated } = await adminCancelBet(betId, reason);
      setBet(updated); onUpdate(updated);
      showToast('Bet cancelled & refunded.');
      setCancelOpen(false);
    } catch (e) { showToast(e.message, 'error'); } finally { setBusy(false); }
  }
  async function addNote() {
    if (!noteText.trim()) return;
    try {
      const { bet: updated } = await adminNoteBet(betId, noteText.trim());
      setBet(updated); onUpdate(updated);
      setNoteText('');
    } catch (e) { showToast(e.message, 'error'); }
  }

  if (!open) return null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={bet ? `Ticket · ${bet.id.slice(0, 16)}…` : 'Loading bet…'}
      width={680}
      footer={bet && bet.status === 'open' && hasRole('odds_manager', 'finance_admin', 'moderator') ? (
        <>
          {hasRole('odds_manager', 'finance_admin') && (
            <button className="adm-btn primary" onClick={() => setSettleOpen(true)} disabled={busy}>
              <IconSettle size={14} /> Settle
            </button>
          )}
          <button className="adm-btn danger" onClick={() => setCancelOpen(true)} disabled={busy}>
            <IconBan size={14} /> Cancel + refund
          </button>
        </>
      ) : null}
    >
      {!bet ? <div className="adm-skel" style={{ height: 200 }} /> : (
        <>
          <Card>
            <dl className="adm-kv">
              <dt>Status</dt><dd><span className={`bet-status ${bet.status}`}>{bet.status}</span></dd>
              <dt>Mode</dt><dd>{bet.mode}</dd>
              <dt>User</dt><dd>{bet.user?.displayName || bet.user?.email || bet.userId}</dd>
              <dt>Stake</dt><dd><strong>{moneyFmt(bet.stake, bet.currency)}</strong></dd>
              <dt>Odds</dt><dd>{Number(bet.totalOdds).toFixed(4)}</dd>
              <dt>Potential</dt><dd><strong>{moneyFmt(bet.potentialWin, bet.currency)}</strong></dd>
              <dt>Bonus</dt><dd>{Math.round((bet.bonusRate || 0) * 100)}%</dd>
              <dt>Placed</dt><dd>{dateShort(bet.placedAt)}</dd>
              {bet.settledAt && (<><dt>Settled</dt><dd>{dateShort(bet.settledAt)} by {bet.settledBy}</dd></>)}
              {bet.cashOut && (<><dt>Cash-out</dt><dd>{moneyFmt(bet.cashOut)}</dd></>)}
              {bet.cancelReason && (<><dt>Cancel reason</dt><dd>{bet.cancelReason}</dd></>)}
            </dl>
          </Card>

          <Card title={`Legs (${bet.legs?.length || 0})`}>
            <table className="adm-table">
              <thead><tr><th>Fixture</th><th>Market</th><th>Pick</th><th className="num">Odds</th></tr></thead>
              <tbody>
                {(bet.legs || []).map((l, i) => (
                  <tr key={i}>
                    <td>{l.home} — {l.away}</td>
                    <td>{l.marketName || l.market}</td>
                    <td><Badge tone="brand">{l.outcome}</Badge></td>
                    <td className="num">{Number(l.odds).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title="Internal notes" subtitle="Visible to admins only">
            {(bet.adminNotes || []).length === 0 && <Empty title="No notes yet" />}
            <div className="adm-list-feed">
              {(bet.adminNotes || []).map((n, i) => (
                <div key={i} className="row">
                  <span className="dot" />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{n.note}</div>
                    <div className="meta">{n.by}</div>
                  </div>
                  <div className="meta">{ago(n.at)}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <input className="adm-input" placeholder="Add a note…"
                     value={noteText} onChange={(e) => setNoteText(e.target.value)}
                     onKeyDown={(e) => e.key === 'Enter' && addNote()} />
              <button className="adm-btn primary" onClick={addNote}>Post</button>
            </div>
          </Card>
        </>
      )}

      <SettleModal open={settleOpen} onClose={() => setSettleOpen(false)} onSubmit={doSettle} busy={busy} bet={bet} />
      <CancelModal open={cancelOpen} onClose={() => setCancelOpen(false)} onSubmit={doCancel} busy={busy} bet={bet} />
    </Drawer>
  );
}

function SettleModal({ open, onClose, onSubmit, busy, bet }) {
  const [result, setResult] = useState('won');
  const [reason, setReason] = useState('');
  useEffect(() => { if (open) { setResult('won'); setReason(''); } }, [open]);
  if (!bet) return null;
  return (
    <Modal open={open} onClose={onClose}
           title="Settle bet"
           description={`Bet ${bet.id.slice(0, 16)}…  ·  ${moneyFmt(bet.stake)} stake at ${Number(bet.totalOdds).toFixed(2)}x`}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {[['won', 'Won', 'success'], ['lost', 'Lost', 'danger'], ['void', 'Void (refund stake)', 'warn']].map(([k, l, t]) => (
          <button key={k} type="button" className={`adm-btn ${result === k ? t : 'ghost'}`} onClick={() => setResult(k)}>{l}</button>
        ))}
      </div>
      <div className="adm-field" style={{ marginBottom: 12 }}>
        <label>Reason (optional, audited)</label>
        <input className="adm-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. match void by league" />
      </div>
      <div style={{ background: 'var(--surface-soft)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, fontSize: 13 }}>
        Settling as <strong>{result}</strong> will {result === 'won' ? `credit ${moneyFmt(bet.potentialWin)} to the player.` : result === 'void' ? `refund ${moneyFmt(bet.stake)} stake.` : 'finalise the bet with no payout.'}
      </div>
      <div className="adm-modal-actions">
        <button className="adm-btn ghost" type="button" onClick={onClose}>Cancel</button>
        <button className="adm-btn primary" type="button" onClick={() => onSubmit(result, reason)} disabled={busy}>
          {busy ? 'Working…' : `Confirm ${result}`}
        </button>
      </div>
    </Modal>
  );
}

function CancelModal({ open, onClose, onSubmit, busy, bet }) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (open) setReason(''); }, [open]);
  if (!bet) return null;
  return (
    <Modal open={open} onClose={onClose}
           title="Cancel bet & refund"
           description={`Refund of ${moneyFmt(bet.stake)} will be credited to the player.`}>
      <div className="adm-field">
        <label>Reason (required)</label>
        <input className="adm-input" value={reason} onChange={(e) => setReason(e.target.value)} minLength={2} required />
      </div>
      <div className="adm-modal-actions">
        <button className="adm-btn ghost" type="button" onClick={onClose}>Back</button>
        <button className="adm-btn danger" type="button" onClick={() => reason.length >= 2 && onSubmit(reason)} disabled={busy || reason.length < 2}>
          {busy ? 'Refunding…' : 'Cancel and refund'}
        </button>
      </div>
    </Modal>
  );
}

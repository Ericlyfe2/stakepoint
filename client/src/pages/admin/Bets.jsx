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
  adminDeleteBet, adminRestoreBet, adminSettlementAudit, adminSettlementUnpaid, adminSettlementRepay,
  adminEditBet,
} from '../../api/adminApi.js';

function toBookingCode(id = '') {
  const s = String(id).replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (!s) return 'XX00000';
  const letters = (s.match(/[A-Z]/g) || ['X', 'X']).slice(0, 2).join('').padEnd(2, 'X');
  const digits  = (s.match(/[0-9]/g) || ['0']).slice(-5).join('').padStart(5, '0');
  return letters + digits;
}
import {
  Card, Badge, Drawer, Modal, Empty, SkeletonRow, moneyFmt, numFmt, ago, dateShort,
} from '../../components/admin/primitives.jsx';
import {
  IconSearch, IconRefresh, IconCheck, IconAlert, IconBan, IconDownload, IconReceipt, IconLive, IconSettle,
  IconEdit, IconPlus, IconTrash,
} from '../../components/admin/Icons.jsx';
import { SYSTEM_TYPES, maxSystemReturn } from '../../lib/systemBets.js';

const STATUS_TONES = { open: 'info', won: 'success', lost: 'danger', void: 'warn', cashed_out: 'brand', cancelled: 'default' };

export default function BetsPage({ initialStatus = 'all' }) {
  const { hasRole, showToast } = useAdmin();
  const [filters, setFilters] = useState({ q: '', status: initialStatus, mode: 'all', sort: 'placedAt', dir: 'desc', showDeleted: false });
  const [page, setPage] = useState({ offset: 0, limit: 100 });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkSettleOpen, setBulkSettleOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [unpaidOpen, setUnpaidOpen] = useState(false);
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
        showDeleted: filters.showDeleted ? 1 : undefined,
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
  }, [filters.q, filters.status, filters.mode, filters.sort, filters.dir, filters.showDeleted, page.offset, page.limit]);

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
          {hasRole('odds_manager', 'finance_admin') && (
            <button className="adm-btn warn" onClick={() => setAuditOpen(true)}><IconAlert size={14} /> Settlement audit</button>
          )}
          {hasRole('finance_admin') && (
            <button className="adm-btn warn" onClick={() => setUnpaidOpen(true)}><IconAlert size={14} /> Unpaid wins</button>
          )}
        </div>
      </header>

      {auditOpen && (
        <SettlementAuditModal
          onClose={() => setAuditOpen(false)}
          showToast={showToast}
          onFixed={load}
        />
      )}

      {unpaidOpen && (
        <UnpaidPayoutsModal
          onClose={() => setUnpaidOpen(false)}
          showToast={showToast}
          onPaid={load}
        />
      )}

      <div className="adm-stat-grid">
        <SumTile label="Open"       value={numFmt(data?.summary?.open)}      accent="linear-gradient(135deg,#4f8bff,#22d3ee)" />
        <SumTile label="Won"        value={numFmt(data?.summary?.won)}       accent="linear-gradient(135deg,#0E8A4A,#22d3ee)" />
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
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-soft)' }}>
            <input type="checkbox" checked={filters.showDeleted}
                   onChange={(e) => setFilters((f) => ({ ...f, showDeleted: e.target.checked }))} />
            Show deleted
          </label>
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
                <th>Code / Ticket</th>
                <th>User</th>
                <th>Status</th>
                <th>Mode</th>
                <th className="num">Stake</th>
                <th className="num">Odds</th>
                <th className="num">Liability</th>
                <th>Placed</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} cols={10} />)}
              {!loading && data?.bets?.length === 0 && (
                <tr><td colSpan={10}><Empty title="No bets match" subtitle="Try a different filter or search term." /></td></tr>
              )}
              {!loading && data?.bets?.map((b) => {
                const code = b.bookingCode || toBookingCode(b.id);
                return (
                  <tr key={b.id} onClick={() => setSelected(b)} className={selected?.id === b.id ? 'selected' : ''}
                      style={b.deleted ? { opacity: 0.55 } : undefined}>
                    <td style={{ width: 32 }} onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.has(b.id)} onChange={() => toggleSelect(b.id)} />
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 13, fontWeight: 700 }}>{code}</span>
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
                    <td>
                      <span className={`bet-status ${b.status}`}>{b.status}</span>
                      {b.deleted && <span style={{ marginLeft: 6 }}><Badge tone="danger">Deleted</Badge></span>}
                    </td>
                    <td><Badge>{b.mode}</Badge></td>
                    <td className="num"><strong>{moneyFmt(b.stake)}</strong></td>
                    <td className="num">{Number(b.totalOdds || 0).toFixed(2)}</td>
                    <td className="num">{moneyFmt(b.potentialWin)}</td>
                    <td title={dateShort(b.placedAt)}>{ago(b.placedAt)}</td>
                    <td className="row-actions" onClick={(e) => e.stopPropagation()}>
                      {hasRole('moderator', 'odds_manager', 'finance_admin') && (
                        b.deleted ? (
                          <button className="adm-btn sm success" onClick={async () => {
                            try { await adminRestoreBet(b.id); showToast('Bet restored.'); load(); }
                            catch (e) { showToast(e.message || 'Restore failed.', 'error'); }
                          }}>Restore</button>
                        ) : (
                          <button className="adm-btn sm danger" onClick={async () => {
                            const reason = window.prompt(`Reason for deleting ${code}? (optional)`) || '';
                            try { await adminDeleteBet(b.id, reason); showToast('Bet deleted.'); load(); }
                            catch (e) { showToast(e.message || 'Delete failed.', 'error'); }
                          }}>Delete</button>
                        )
                      )}
                    </td>
                  </tr>
                );
              })}
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
  const [editOpen, setEditOpen] = useState(false);
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
  async function doSlipEdit(body) {
    setBusy(true);
    try {
      const { bet: updated } = await adminEditBet(betId, body);
      setBet(updated); onUpdate(updated);
      showToast('Bet slip updated.');
      setEditOpen(false);
    } catch (e) { showToast(e.message, 'error'); } finally { setBusy(false); }
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
            <button className="adm-btn" onClick={() => setEditOpen(true)} disabled={busy}>
              <IconEdit size={14} /> Edit slip
            </button>
          )}
          {hasRole('odds_manager', 'finance_admin') && (
            <button className="adm-btn primary" onClick={() => setSettleOpen(true)} disabled={busy}>
              <IconSettle size={14} /> Settle
            </button>
          )}
          <button className="adm-btn danger" onClick={() => setCancelOpen(true)} disabled={busy}>
            <IconBan size={14} /> Cancel + refund
          </button>
        </>
      ) : bet && ['won', 'lost', 'void'].includes(bet.status) && hasRole('odds_manager', 'finance_admin') ? (
        <>
          <button className="adm-btn" onClick={() => setEditOpen(true)} disabled={busy}>
            <IconEdit size={14} /> Edit slip
          </button>
          <button className="adm-btn warn" onClick={() => setSettleOpen(true)} disabled={busy}>
            <IconSettle size={14} /> Correct settlement
          </button>
        </>
      ) : bet && hasRole('odds_manager', 'finance_admin') && (
        <button className="adm-btn" onClick={() => setEditOpen(true)} disabled={busy}>
          <IconEdit size={14} /> Edit slip
        </button>
      )}
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
      <EditSlipModal open={editOpen} onClose={() => setEditOpen(false)} onSubmit={doSlipEdit} busy={busy} bet={bet} />
    </Drawer>
  );
}

function SettleModal({ open, onClose, onSubmit, busy, bet }) {
  const [result, setResult] = useState('won');
  const [reason, setReason] = useState('');
  useEffect(() => { if (open) { setResult('won'); setReason(''); } }, [open]);
  if (!bet) return null;
  const isCorrection = bet.status !== 'open';
  const newCredit = result === 'won' ? (bet.potentialWin || 0) : result === 'void' ? (bet.stake || 0) : 0;
  const previousCredit = isCorrection ? (bet.settledPayout ?? bet.totalReturn ?? 0) : 0;
  const delta = Number((newCredit - previousCredit).toFixed(2));
  const reasonMissing = isCorrection && !reason.trim();
  return (
    <Modal open={open} onClose={onClose}
           title={isCorrection ? 'Correct settlement' : 'Settle bet'}
           description={`Bet ${bet.id.slice(0, 16)}…  ·  ${moneyFmt(bet.stake)} stake at ${Number(bet.totalOdds).toFixed(2)}x${isCorrection ? `  ·  currently ${bet.status}` : ''}`}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {[['won', 'Won', 'success'], ['lost', 'Lost', 'danger'], ['void', 'Void (refund stake)', 'warn']].map(([k, l, t]) => (
          <button key={k} type="button" className={`adm-btn ${result === k ? t : 'ghost'}`} onClick={() => setResult(k)}>{l}</button>
        ))}
      </div>
      <div className="adm-field" style={{ marginBottom: 12 }}>
        <label>Reason {isCorrection ? '(required, audited)' : '(optional, audited)'}</label>
        <input className="adm-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. match void by league" />
      </div>
      <div style={{ background: 'var(--surface-soft)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, fontSize: 13 }}>
        {isCorrection ? (
          <>Correcting to <strong>{result}</strong> will {delta > 0 ? `credit an additional ${moneyFmt(delta)}` : delta < 0 ? `debit ${moneyFmt(Math.abs(delta))} back` : 'change nothing about the payout'} (already paid {moneyFmt(previousCredit)} as {bet.status}).</>
        ) : (
          <>Settling as <strong>{result}</strong> will {result === 'won' ? `credit ${moneyFmt(bet.potentialWin)} to the player.` : result === 'void' ? `refund ${moneyFmt(bet.stake)} stake.` : 'finalise the bet with no payout.'}</>
        )}
      </div>
      <div className="adm-modal-actions">
        <button className="adm-btn ghost" type="button" onClick={onClose}>Cancel</button>
        <button className="adm-btn primary" type="button" onClick={() => onSubmit(result, reason)} disabled={busy || reasonMissing}>
          {busy ? 'Working…' : `Confirm ${result}`}
        </button>
      </div>
    </Modal>
  );
}

/**
 * Re-checks every already-settled bet against the current grading logic and
 * lists any whose stored status disagrees — the fallout of a legWon() bug
 * that's since been fixed but never retroactively re-applied (settleNow()
 * only ever revisits `open` bets). Each row can be corrected individually;
 * "Fix all" runs them one at a time so a failure on one doesn't block the rest.
 */
function SettlementAuditModal({ onClose, showToast, onFixed }) {
  const [loading, setLoading] = useState(true);
  const [scanned, setScanned] = useState(0);
  const [mismatches, setMismatches] = useState([]);
  const [fixingId, setFixingId] = useState(null);
  const [fixingAll, setFixingAll] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await adminSettlementAudit();
      setScanned(r.scanned || 0);
      setMismatches(r.mismatches || []);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function fixOne(m) {
    setFixingId(m.betId);
    try {
      await adminSettleBet(m.betId, {
        result: m.correctStatus,
        reason: `Settlement audit correction — ${m.legs?.[0]?.market || 'market'} was mis-graded (stored ${m.currentStatus}, should be ${m.correctStatus}).`,
      });
      setMismatches((prev) => prev.filter((x) => x.betId !== m.betId));
      showToast(`Corrected ${m.bookingCode || m.betId} to ${m.correctStatus}.`);
      onFixed?.();
    } catch (e) {
      showToast(`${m.bookingCode || m.betId}: ${e.message}`, 'error');
    } finally {
      setFixingId(null);
    }
  }

  async function fixAll() {
    setFixingAll(true);
    for (const m of [...mismatches]) {
      // eslint-disable-next-line no-await-in-loop
      await fixOne(m);
    }
    setFixingAll(false);
  }

  return (
    <Modal open title="Settlement audit" onClose={onClose}
           description={loading ? 'Scanning settled bets…' : `Scanned ${numFmt(scanned)} settled bets — ${mismatches.length} disagree with the current grading logic.`}>
      {!loading && mismatches.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <button className="adm-btn primary" onClick={fixAll} disabled={fixingAll || !!fixingId}>
            {fixingAll ? 'Fixing…' : `Fix all ${mismatches.length}`}
          </button>
        </div>
      )}
      {loading ? (
        <div className="adm-skel" style={{ height: 120, borderRadius: 12 }} />
      ) : mismatches.length === 0 ? (
        <Empty title="No mismatches found" subtitle="Every settled bet agrees with the current grading logic." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '55vh', overflowY: 'auto' }}>
          {mismatches.map((m) => (
            <div key={m.betId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', background: 'var(--surface-soft)', border: '1px solid var(--border)', borderRadius: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>
                  {m.bookingCode || m.betId.slice(0, 14)}
                  {m.legs?.[0] && <span style={{ color: 'var(--text-soft)', fontWeight: 500 }}> · {m.legs[0].home} — {m.legs[0].away} · {m.legs[0].market} {m.legs[0].outcome}</span>}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-soft)', marginTop: 2 }}>
                  {m.legsStaleOnly ? (
                    <>Payout is correct (<strong className={`bet-status ${m.currentStatus}`}>{m.currentStatus}</strong>, {moneyFmt(m.currentPayout)}) but the per-match ✓/✗ display is stale — no money moves, just re-syncs the ticket page.</>
                  ) : (
                    <>Stored <strong className={`bet-status ${m.currentStatus}`}>{m.currentStatus}</strong> ({moneyFmt(m.currentPayout)}) → should be <strong className={`bet-status ${m.correctStatus}`}>{m.correctStatus}</strong> ({moneyFmt(m.correctPayout)})
                    {m.delta !== 0 && <> — {m.delta > 0 ? `owes ${moneyFmt(m.delta)} more` : `overpaid ${moneyFmt(Math.abs(m.delta))}`}</>}</>
                  )}
                </div>
              </div>
              <button className="adm-btn sm primary" onClick={() => fixOne(m)} disabled={fixingAll || fixingId === m.betId}>
                {fixingId === m.betId ? 'Fixing…' : 'Fix'}
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

/**
 * Won / refunded bets that were settled but never reached the player's wallet
 * (the old settle-then-credit ordering could strand them). Search by phone,
 * email, booking code or bet id, then pay one out: it credits the exact
 * winnings once and re-triggers the player's "You won" trophy. Paying is a
 * two-step click so a stray tap can't move money.
 */
function UnpaidPayoutsModal({ onClose, showToast, onPaid }) {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [armedId, setArmedId] = useState(null);
  const [payingId, setPayingId] = useState(null);

  async function load(query = q) {
    setLoading(true);
    try {
      const r = await adminSettlementUnpaid({ q: query.trim() || undefined });
      setRows(r.payouts || []);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(''); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A first click "arms" a row for 5s; only a second click pays.
  useEffect(() => {
    if (!armedId) return undefined;
    const t = setTimeout(() => setArmedId(null), 5000);
    return () => clearTimeout(t);
  }, [armedId]);

  async function pay(row) {
    if (armedId !== row.betId) { setArmedId(row.betId); return; }
    setPayingId(row.betId);
    setArmedId(null);
    try {
      const r = await adminSettlementRepay(row.betId);
      setRows((prev) => prev.filter((x) => x.betId !== row.betId));
      showToast(r.credited > 0
        ? `Paid ${moneyFmt(r.credited)} to ${row.userEmail || row.userId}.${row.status === 'won' ? ' Their win trophy will show now.' : ''}`
        : 'Already credited — marked as paid and the win trophy re-armed.');
      onPaid?.();
    } catch (e) {
      showToast(`${row.bookingCode || row.betId}: ${e.message}`, 'error');
    } finally {
      setPayingId(null);
    }
  }

  return (
    <Modal open title="Unpaid wins" onClose={onClose}
           description="Won or refunded bets with no matching wallet entry. Check the player's wallet history before paying — a cleared history can look the same.">
      <form onSubmit={(e) => { e.preventDefault(); load(); }} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input className="adm-input" style={{ flex: 1 }} value={q} onChange={(e) => setQ(e.target.value)}
               placeholder="Phone, email, booking code or bet id" />
        <button className="adm-btn" type="submit" disabled={loading}><IconSearch size={14} /> Search</button>
      </form>
      {loading ? (
        <div className="adm-skel" style={{ height: 120, borderRadius: 12 }} />
      ) : rows.length === 0 ? (
        <Empty title="No unpaid wins found" subtitle="Every settled win in this search has a matching wallet entry." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '55vh', overflowY: 'auto' }}>
          {rows.map((r) => {
            const armed = armedId === r.betId;
            return (
              <div key={r.betId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', background: 'var(--surface-soft)', border: `1px solid ${armed ? 'var(--warn, #f5a623)' : 'var(--border)'}`, borderRadius: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>
                    {r.bookingCode || r.betId.slice(0, 14)}
                    {r.legs?.[0] && <span style={{ color: 'var(--text-soft)', fontWeight: 500 }}> · {r.legs[0].home} — {r.legs[0].away} · {r.legs[0].market} {r.legs[0].outcome}</span>}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-soft)', marginTop: 2 }}>
                    {r.userEmail || r.userId}{r.displayName ? ` (${r.displayName})` : ''} · <strong className={`bet-status ${r.status}`}>{r.status}</strong> · owed <strong>{moneyFmt(r.owed)}</strong>
                    {!r.userExists && <span style={{ color: 'var(--danger, #d63a2c)' }}> · player no longer exists</span>}
                  </div>
                </div>
                <button className={`adm-btn sm ${armed ? 'danger' : 'primary'}`} onClick={() => pay(r)}
                        disabled={!!payingId || !r.userExists}>
                  {payingId === r.betId ? 'Paying…' : armed ? `Confirm: pay ${moneyFmt(r.owed)}` : (r.status === 'won' ? 'Pay & show trophy' : 'Refund')}
                </button>
              </div>
            );
          })}
        </div>
      )}
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

/* ---------------- Edit slip ---------------- */

const EMPTY_LEG = { matchId: '', market: '', outcome: '', odds: '', home: '', away: '', marketName: '' };

const STATUS_OPTIONS = [
  ['open', 'Open'],
  ['booked', 'Booked'],
  ['won', 'Won'],
  ['lost', 'Lost'],
  ['void', 'Void'],
];

// ISO-8601 UTC string → local <input type="date">/<input type="time"> values.
// The whole schema stores timestamps as ISO UTC strings; converting to the
// browser's local wall-clock for editing and back to ISO on save guarantees
// a round-trip with no timezone offset (the same 21 Sept 2026, 11:38 PM the
// admin types is the instant that persists, and whatever zone renders the
// bet later sees its own correct conversion — exactly like dateShort()).
function toLocalInput(iso) {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  const p = (n) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    time: `${p(d.getHours())}:${p(d.getMinutes())}`,
  };
}

function buildIso(date, time) {
  if (!date || !time) return undefined;
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) return undefined;
  const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
  return Number.isNaN(dt.getTime()) ? undefined : dt.toISOString();
}

function legFingerprint(l) {
  return [l.home, l.away, l.market, l.outcome, l.marketName, Number(l.odds)].join('~');
}

function EditSlipModal({ open, onClose, onSubmit, busy, bet }) {
  const [status, setStatus] = useState('');
  const [mode, setMode] = useState('');
  const [stake, setStake] = useState('');
  const [bonusPct, setBonusPct] = useState('');
  const [placedStr, setPlacedStr] = useState({ date: '', time: '' });
  const [settledStr, setSettledStr] = useState({ date: '', time: '' });
  const [legs, setLegs] = useState([]);
  const [reason, setReason] = useState('');
  const [armed, setArmed] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);

  useEffect(() => {
    if (!open || !bet) return;
    setStatus(bet.status || 'open');
    setMode(bet.mode || 'single');
    setStake(String(bet.stake ?? ''));
    setBonusPct(String(Math.round((bet.bonusRate || 0) * 100)));
    setPlacedStr(toLocalInput(bet.placedAt));
    setSettledStr(toLocalInput(bet.settledAt));
    setLegs((bet.legs || []).map((l) => ({
      matchId: l.matchId || '', market: l.market || '', outcome: l.outcome || '',
      odds: String(l.odds ?? ''), home: l.home || '', away: l.away || '',
      marketName: l.marketName || l.market || '',
      kickoff: l.kickoff || '', day: l.day || '', league: l.league || '',
    })));
    setReason('');
    setArmed(false);
    setRemoveTarget(null);
  }, [open, bet]);

  // Any edit after the confirm step has been armed returns to the safe
  // "review" state — a confirmation is only good for the exact current draft.
  useEffect(() => { setArmed(false); }, [status, mode, stake, bonusPct, legs, reason, placedStr, settledStr]);

  if (!bet) return null;

  const alreadySettled = bet.status !== 'open';
  const draftSettles = status !== 'open' && status !== 'booked';

  const stakeNum = Number(stake);
  const bonusNum = Number(bonusPct);
  const bonusRate = Number.isFinite(bonusNum) && bonusNum >= 0 ? Math.min(bonusNum, 100) / 100 : (bet.bonusRate || 0);

  const validLegs = legs.filter((l) => l.home.trim() && l.away.trim() && l.market.trim() && l.outcome.trim() && Number(l.odds) > 0);
  const allLegsValid = legs.length > 0 && validLegs.length === legs.length;

  // Live totals — mirrors the server placement math (single/multiple/system).
  let draftTotalOdds = 0;
  let draftPotential = 0;
  let draftNote = null;
  if (allLegsValid) {
    const odds = validLegs.map((l) => Number(l.odds));
    if (mode === 'system') {
      const key = String(bet.systemType || '').toLowerCase();
      const def = SYSTEM_TYPES[key];
      if (def && odds.length === def.selections && stakeNum > 0) {
        const stakePerLine = stakeNum / def.totalLines;
        draftPotential = Number(maxSystemReturn(odds, key, stakePerLine).toFixed(2));
        draftTotalOdds = Number((draftPotential / stakeNum).toFixed(4));
      } else if (!def || odds.length !== def.selections) {
        draftNote = `System bet needs exactly ${def ? def.selections : 'its'} selections.`;
      }
    } else {
      draftTotalOdds = mode === 'single'
        ? odds[0]
        : Number(odds.reduce((p, o) => p * o, 1).toFixed(4));
      draftPotential = Number((stakeNum * draftTotalOdds * (1 + bonusRate)).toFixed(2));
    }
  }

  const draftPlacedIso = buildIso(placedStr.date, placedStr.time);
  const draftSettledIso = buildIso(settledStr.date, settledStr.time);
  // Settled timestamp semantics:
  //  - already-settled bet left blank → keep the stored settlement instant
  //  - new settlement left blank → "auto", set at reconciliation time
  //  - filled in → that exact instant (persisted in the DB)
  let settledPayload = draftSettledIso;
  if (bet.settledAt && !draftSettledIso) settledPayload = bet.settledAt;
  if (!bet.settledAt && !draftSettledIso) settledPayload = undefined;

  const origFp = (bet.legs || []).map(legFingerprint).join('|');
  const draftFp = legs.map(legFingerprint).join('|');

  // ---- change summary (every editable field, before → after) ----
  const changed = [];
  const addChange = (label, from, to) => { if (from !== to) changed.push({ label, from: from ?? '—', to: to ?? '—' }); };
  addChange('Status', bet.status, status);
  addChange('Mode', bet.mode, mode);
  addChange('Stake', moneyFmt(bet.stake, bet.currency), Number.isFinite(stakeNum) && stakeNum > 0 ? moneyFmt(stakeNum, bet.currency) : '—');
  addChange('Bonus', `${Math.round((bet.bonusRate || 0) * 100)}%`, `${Number.isFinite(bonusNum) ? bonusNum : 0}%`);
  addChange('Placed', dateShort(bet.placedAt), draftPlacedIso ? dateShort(draftPlacedIso) : '—');
  addChange('Settled',
    bet.settledAt ? dateShort(bet.settledAt) : '—',
    settledPayload ? dateShort(settledPayload) : (draftSettles ? 'auto (settlement time)' : '—'));
  if (origFp !== draftFp || legs.length !== (bet.legs || []).length) {
    addChange('Legs', `${(bet.legs || []).length} selection(s)`, `${legs.length} selection(s)`);
  }
  addChange('Total odds', Number(bet.totalOdds || 0).toFixed(4), draftTotalOdds ? draftTotalOdds.toFixed(4) : '—');
  addChange('Potential', moneyFmt(bet.potentialWin, bet.currency), draftPotential ? moneyFmt(draftPotential, bet.currency) : '—');

  const dateOrderOk = !draftPlacedIso || !settledPayload || Date.parse(settledPayload) >= Date.parse(draftPlacedIso);
  const reasonMissing = !reason.trim() || reason.trim().length < 2;
  const canSave = changed.length > 0 && allLegsValid && stakeNum > 0 && !reasonMissing && dateOrderOk && !draftNote;

  function setLeg(i, patch) {
    setLegs((prev) => prev.map((l, x) => (x === i ? { ...l, ...patch } : l)));
  }
  function addLeg() {
    setLegs((prev) => [...prev, { ...EMPTY_LEG, matchId: `m-${Date.now()}-${prev.length}-${Math.random().toString(36).slice(2, 6)}` }]);
  }
  function confirmRemove(i) { setRemoveTarget(i); }
  function doRemove(i) {
    setLegs((prev) => prev.filter((_, x) => x !== i));
    setRemoveTarget(null);
  }

  function submit() {
    if (!canSave) return;
    if (!armed) { setArmed(true); return; }
    const body = {
      expectedVersion: bet.updatedAt || '',
      status,
      mode,
      stake: Number(stakeNum.toFixed(2)),
      bonusRate: Number(bonusRate.toFixed(4)),
      placedAt: draftPlacedIso || undefined,
      ...(settledPayload !== undefined ? { settledAt: settledPayload } : {}),
      legs: validLegs.map((l) => ({
        matchId: l.matchId.trim() || `m-${Date.now()}-0-${Math.random().toString(36).slice(2, 6)}`,
        home: l.home.trim(), away: l.away.trim(),
        market: l.market.trim(), outcome: l.outcome.trim(),
        odds: Number(l.odds),
        ...(l.marketName && l.marketName.trim() ? { marketName: l.marketName.trim() } : {}),
        ...(l.kickoff ? { kickoff: l.kickoff } : {}),
        ...(l.day ? { day: l.day } : {}),
        ...(l.league ? { league: l.league } : {}),
      })),
      reason: reason.trim(),
    };
    onSubmit(body);
  }

  return (
    <Modal open={open} onClose={onClose}
           title="Edit bet slip"
           description={`Ticket ${bet.id} · ${moneyFmt(bet.stake, bet.currency)} at ${Number(bet.totalOdds || 0).toFixed(4)}x · currently ${bet.status}`}>
      <div style={{ maxHeight: '62vh', overflowY: 'auto', paddingRight: 4 }}>
        {alreadySettled && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'rgba(245,166,35,.12)', border: '1px solid rgba(245,166,35,.4)', borderRadius: 10, padding: '10px 12px', fontSize: 13, marginBottom: 12 }}>
            <IconAlert size={16} style={{ flexShrink: 0, marginTop: 1, color: '#f5a623' }} />
            <span>
              <strong>This bet has already been settled ({bet.status}).</strong> Changing status, stake, odds, legs or bonus
              reconciles the wallet through the settlement engine — only the payout delta is credited or debited, exactly once.
              An audit reason is required and the original values are preserved in the audit log.
            </span>
          </div>
        )}

        <div className="adm-field">
          <label>Status</label>
          <select className="adm-input" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 10 }}>
          <div className="adm-field">
            <label>Mode</label>
            <select className="adm-input" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="single">Single</option>
              <option value="multiple">Multiple</option>
              <option value="system">System</option>
            </select>
          </div>
          <div className="adm-field">
            <label>Stake ({bet.currency || 'GHS'})</label>
            <input className="adm-input" type="number" min="0" step="0.01" value={stake} onChange={(e) => setStake(e.target.value)} />
          </div>
          <div className="adm-field">
            <label>Bonus (%)</label>
            <input className="adm-input" type="number" min="0" max="100" step="1" value={bonusPct} onChange={(e) => setBonusPct(e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
          <div className="adm-field">
            <label>Placed date</label>
            <input className="adm-input" type="date" value={placedStr.date} onChange={(e) => setPlacedStr((s) => ({ ...s, date: e.target.value }))} />
          </div>
          <div className="adm-field">
            <label>Placed time</label>
            <input className="adm-input" type="time" value={placedStr.time} onChange={(e) => setPlacedStr((s) => ({ ...s, time: e.target.value }))} />
          </div>
          <div className="adm-field">
            <label>Settled date</label>
            <input className="adm-input" type="date" value={settledStr.date}
                   onChange={(e) => setSettledStr((s) => ({ ...s, date: e.target.value }))}
                   disabled={!draftSettles && !bet.settledAt} />
          </div>
          <div className="adm-field">
            <label>Settled time</label>
            <input className="adm-input" type="time" value={settledStr.time}
                   onChange={(e) => setSettledStr((s) => ({ ...s, time: e.target.value }))}
                   disabled={!draftSettles && !bet.settledAt} />
          </div>
        </div>
        {!dateOrderOk && (
          <div style={{ color: 'var(--danger, #d63a2c)', fontSize: 12.5, marginTop: 6 }}>
            Settled date/time cannot be earlier than the placed date/time.
          </div>
        )}

        <div className="adm-field" style={{ marginTop: 12 }}>
          <label>Bet legs ({legs.length})</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {legs.map((l, i) => (
              <div key={i} style={{ background: 'var(--surface-soft)', border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
                {removeTarget === i ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                    <span>Remove this leg from the slip?</span>
                    <span style={{ display: 'flex', gap: 6 }}>
                      <button className="adm-btn sm danger" type="button" onClick={() => doRemove(i)}>Remove</button>
                      <button className="adm-btn sm ghost" type="button" onClick={() => setRemoveTarget(null)}>Keep</button>
                    </span>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                      <input className="adm-input" placeholder="Home" value={l.home} onChange={(e) => setLeg(i, { home: e.target.value })} />
                      <input className="adm-input" placeholder="Away" value={l.away} onChange={(e) => setLeg(i, { away: e.target.value })} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px 36px', gap: 8 }}>
                      <input className="adm-input" placeholder="Market" value={l.market} onChange={(e) => setLeg(i, { market: e.target.value })} />
                      <input className="adm-input" placeholder="Pick" value={l.outcome} onChange={(e) => setLeg(i, { outcome: e.target.value })} />
                      <input className="adm-input" type="number" min="0.01" step="0.01" placeholder="Odds" value={l.odds} onChange={(e) => setLeg(i, { odds: e.target.value })} />
                      <button className="adm-icon-btn" type="button" onClick={() => confirmRemove(i)} aria-label="Remove leg" title="Remove leg">
                        <IconTrash size={14} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
          <button className="adm-btn sm" type="button" onClick={addLeg} style={{ marginTop: 8 }}>
            <IconPlus size={14} /> Add leg
          </button>
          {draftNote && <div style={{ color: 'var(--warn, #f5a623)', fontSize: 12.5, marginTop: 6 }}>{draftNote}</div>}
        </div>

        <div style={{ display: 'flex', gap: 18, background: 'var(--surface-soft)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px', fontSize: 13, marginTop: 12 }}>
          <div>Total odds <strong style={{ display: 'block', fontSize: 14 }}>{draftTotalOdds ? draftTotalOdds.toFixed(4) : '—'}</strong></div>
          <div>Bonus <strong style={{ display: 'block', fontSize: 14 }}>{bonusNum}%</strong></div>
          <div>Potential <strong style={{ display: 'block', fontSize: 14 }}>{draftPotential ? moneyFmt(draftPotential, bet.currency) : '—'}</strong></div>
        </div>

        {changed.length > 0 && (
          <div style={{ background: 'rgba(79,139,255,.08)', border: '1px solid rgba(79,139,255,.35)', borderRadius: 12, padding: '10px 12px', marginTop: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Review changes {armed ? <span style={{ color: '#f5a623' }}>· press Confirm to apply</span> : null}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }}>
              {changed.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ width: 84, flexShrink: 0, color: 'var(--text-soft)' }}>{c.label}</span>
                  <span style={{ color: 'var(--text-dim)', textDecoration: 'line-through' }}>{c.from}</span>
                  <span>→</span>
                  <strong>{c.to}</strong>
                </div>
              ))}
            </div>
          </div>
        )}
        {changed.length === 0 && (
          <div style={{ color: 'var(--text-dim)', fontSize: 12.5, marginTop: 12 }}>No changes made yet.</div>
        )}

        <div className="adm-field" style={{ marginTop: 12 }}>
          <label>Reason for edit (required, audited)</label>
          <input className="adm-input" value={reason} onChange={(e) => setReason(e.target.value)}
                 placeholder="e.g. wrong odds entered at placement; customer mis-typed stake" />
          {reasonMissing && <div style={{ color: 'var(--danger, #d63a2c)', fontSize: 12, marginTop: 4 }}>A reason of at least 2 characters is required to save.</div>}
        </div>
      </div>

      <div className="adm-modal-actions">
        <button className="adm-btn ghost" type="button" onClick={() => { setArmed(false); onClose(); }}>Cancel</button>
        <button className="adm-btn primary" type="button" onClick={submit} disabled={busy || !canSave}>
          {busy ? 'Saving…' : armed ? 'Confirm changes' : 'Save changes'}
        </button>
      </div>
    </Modal>
  );
}

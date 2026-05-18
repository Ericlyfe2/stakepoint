/**
 * Sports & odds admin.
 *  - Fixtures table with sport / league / status filters
 *  - Create fixture modal
 *  - Drawer to: edit kickoff / live / scores, override per-selection odds,
 *    suspend whole match / market / selection, record final score + auto-settle.
 *  - Quick "Settle now" runs the global engine on demand.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  adminFixtures, adminFixture, adminCreateFixture, adminPatchFixture, adminDeleteFixture,
  adminPatchOdds, adminResetOdds, adminSuspend, adminClearSuspend,
  adminRecordResult, adminTriggerSettle, adminLeagues, adminCreateLeague,
  adminAddMarket, adminRemoveMarket, adminBulkFixtures,
} from '../../api/adminApi.js';
import { useAdmin } from '../../providers/AdminProvider.jsx';
import { Card, Badge, Drawer, Modal, Empty, SkeletonRow, moneyFmt, numFmt, ago } from '../../components/admin/primitives.jsx';
import {
  IconSearch, IconRefresh, IconLive, IconBan, IconCheck, IconSettle, IconBook, IconAlert, IconClose,
} from '../../components/admin/Icons.jsx';

export default function SportsAdmin() {
  const { hasRole, showToast } = useAdmin();
  const [filters, setFilters] = useState({ q: '', sport: '', leagueId: '', status: '' });
  const [data, setData] = useState(null);
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [leagueOpen, setLeagueOpen] = useState(false);
  const [selectedFixtures, setSelectedFixtures] = useState(new Set());
  const [bulkScoreOpen, setBulkScoreOpen] = useState(false);
  const [bulkScoreHome, setBulkScoreHome] = useState('');
  const [bulkScoreAway, setBulkScoreAway] = useState('');

  function toggleFixture(id) {
    setSelectedFixtures((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  async function doBulkFixtures(action, payload) {
    try {
      const res = await adminBulkFixtures({ action, fixtureIds: [...selectedFixtures], payload });
      showToast(`Bulk ${action}: ${res.results.filter((r) => r.status !== 'error').length} ok, ${res.results.filter((r) => r.status === 'error').length} failed.`);
      setSelectedFixtures(new Set());
      setBulkScoreOpen(false);
      load();
    } catch (e) { showToast(e.message, 'error'); }
  }

  async function load() {
    setLoading(true);
    try {
      const [fx, lg] = await Promise.all([adminFixtures(filters), adminLeagues()]);
      setData(fx); setLeagues(lg.leagues || []);
    } catch (e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [filters.q, filters.sport, filters.leagueId, filters.status]); // eslint-disable-line

  const filteredLeagues = useMemo(() =>
    leagues.filter((l) => !filters.sport || l.sport === filters.sport),
    [leagues, filters.sport]
  );

  async function settleEverything() {
    try {
      // call /sports/fixtures/dummy/settle just to trigger; backend ignores id
      await adminTriggerSettle('all');
      showToast('Settlement sweep triggered.');
      load();
    } catch (e) { showToast(e.message, 'error'); }
  }

  return (
    <>
      <header className="adm-page-head">
        <div>
          <h1>Sports & odds</h1>
          <p>Fixtures, markets, real-time odds intervention, and manual results. All actions audited.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {selectedFixtures.size > 0 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 12px', background: 'var(--surface-2)', borderRadius: 8 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-soft)' }}>{selectedFixtures.size} selected</span>
              {hasRole('odds_manager') && (
                <>
                  <button className="adm-btn adm-btn-sm" onClick={() => doBulkFixtures('suspend')}>Suspend</button>
                  <button className="adm-btn adm-btn-sm" onClick={() => doBulkFixtures('unsuspend')}>Unsuspend</button>
                  <button className="adm-btn adm-btn-sm" onClick={() => doBulkFixtures('mark-live')}>Mark live</button>
                  <button className="adm-btn adm-btn-sm" onClick={() => doBulkFixtures('mark-upcoming')}>Mark upcoming</button>
                  <button className="adm-btn adm-btn-sm" onClick={() => setBulkScoreOpen(true)}>Set result</button>
                </>
              )}
              <button className="adm-btn adm-btn-sm" onClick={() => setSelectedFixtures(new Set())}>Clear</button>
            </div>
          )}
          <button className="adm-btn" onClick={load}><IconRefresh size={14} /> Refresh</button>
          {hasRole('odds_manager') && <button className="adm-btn" onClick={() => setLeagueOpen(true)}><IconBook size={14} /> New league</button>}
          {hasRole('odds_manager') && <button className="adm-btn primary" onClick={() => setCreateOpen(true)}><IconCheck size={14} /> New fixture</button>}
          {hasRole('odds_manager') && <button className="adm-btn warn" onClick={settleEverything}><IconSettle size={14} /> Settle now</button>}
        </div>
      </header>

      <div className="adm-stat-grid">
        <StatTile label="Total fixtures" value={numFmt(data?.total)} />
        <StatTile label="Live now" value={numFmt(data?.fixtures?.filter((f) => f.isLive).length)} />
        <StatTile label="Finished" value={numFmt(data?.fixtures?.filter((f) => f.finished).length)} />
        <StatTile label="Suspended" value={numFmt(data?.fixtures?.filter((f) => f.suspended).length)} />
      </div>

      <div className="adm-table-wrap">
        <div className="adm-table-toolbar">
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', minWidth: 240 }}>
            <IconSearch size={14} style={{ position: 'absolute', left: 12, color: 'var(--text-mute)' }} />
            <input style={{ paddingLeft: 34 }} placeholder="Search fixtures…"
                   value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} />
          </div>
          <select value={filters.sport} onChange={(e) => setFilters((f) => ({ ...f, sport: e.target.value, leagueId: '' }))}>
            <option value="">All sports</option>
            <option value="football">Football</option>
            <option value="basketball">Basketball</option>
            <option value="tennis">Tennis</option>
          </select>
          <select value={filters.leagueId} onChange={(e) => setFilters((f) => ({ ...f, leagueId: e.target.value }))}>
            <option value="">All leagues</option>
            {filteredLeagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
            <option value="">Any status</option>
            <option value="live">Live</option>
            <option value="upcoming">Upcoming</option>
            <option value="finished">Finished</option>
            <option value="suspended">Suspended</option>
          </select>
          <div className="grow" />
          <div style={{ color: 'var(--text-dim)', fontSize: 12.5 }}>{data?.total ?? '—'} fixtures</div>
        </div>

        <div className="adm-table-scroll">
          <table className="adm-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}></th>
                <th>Fixture</th>
                <th>League</th>
                <th>Status</th>
                <th>Kick-off</th>
                <th className="num">Home</th>
                <th className="num">Draw</th>
                <th className="num">Away</th>
                <th>Markets</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} cols={8} />)}
              {!loading && data?.fixtures?.length === 0 && (
                <tr><td colSpan={9}><Empty title="No fixtures match" subtitle="Adjust filters or create a new fixture." /></td></tr>
              )}
              {!loading && data?.fixtures?.map((m) => {
                const main = m.markets?.['1X2'] || m.markets?.['ML'];
                const home = main?.selections?.find((s) => s.key === '1');
                const draw = main?.selections?.find((s) => s.key === 'X');
                const away = main?.selections?.find((s) => s.key === '2');
                const status = m.finished ? 'finished' : m.isLive ? 'live' : m.suspended ? 'suspended' : 'upcoming';
                return (
                  <tr key={m.id} onClick={() => setSelected(m)} className={selected?.id === m.id ? 'selected' : ''}>
                    <td style={{ width: 32 }} onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedFixtures.has(m.id)} onChange={() => toggleFixture(m.id)} />
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{m.home} — {m.away}</div>
                      <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{m.sport} · {m.id}</div>
                    </td>
                    <td>{m.leagueName || m.leagueId}</td>
                    <td>
                      {status === 'live' && <Badge tone="danger" dot>Live {m.minute || ''}</Badge>}
                      {status === 'upcoming' && <Badge tone="info">Upcoming</Badge>}
                      {status === 'finished' && <Badge tone="success">Finished {m.scoreHome}-{m.scoreAway}</Badge>}
                      {status === 'suspended' && <Badge tone="warn">Suspended</Badge>}
                    </td>
                    <td>{m.day} {m.kickoff || ''}</td>
                    <td className="num">{home ? home.odds.toFixed(2) : '—'}</td>
                    <td className="num">{draw ? draw.odds.toFixed(2) : '—'}</td>
                    <td className="num">{away ? away.odds.toFixed(2) : '—'}</td>
                    <td>{m.moreMarkets || Object.keys(m.markets || {}).length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <FixtureDrawer
        open={!!selected}
        fixtureId={selected?.id}
        onClose={() => setSelected(null)}
        hasRole={hasRole}
        showToast={showToast}
        onChange={load}
      />

      {bulkScoreOpen && (
        <Modal open title={`Set result for ${selectedFixtures.size} fixtures`} onClose={() => setBulkScoreOpen(false)} footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="adm-btn" onClick={() => setBulkScoreOpen(false)}>Cancel</button>
            <button className="adm-btn primary" onClick={() => doBulkFixtures('set-result', { scoreHome: Number(bulkScoreHome) || 0, scoreAway: Number(bulkScoreAway) || 0 })}>Apply</button>
          </div>
        }>
          <div className="adm-field"><label>Home score</label><input className="adm-input" type="number" min="0" value={bulkScoreHome} onChange={(e) => setBulkScoreHome(e.target.value)} /></div>
          <div className="adm-field"><label>Away score</label><input className="adm-input" type="number" min="0" value={bulkScoreAway} onChange={(e) => setBulkScoreAway(e.target.value)} /></div>
        </Modal>
      )}

      <CreateFixtureModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        leagues={leagues}
        onCreated={() => { setCreateOpen(false); load(); showToast('Fixture created.'); }}
        showToast={showToast}
      />

      <CreateLeagueModal
        open={leagueOpen}
        onClose={() => setLeagueOpen(false)}
        onCreated={() => { setLeagueOpen(false); load(); showToast('League created.'); }}
        showToast={showToast}
      />
    </>
  );
}

function StatTile({ label, value }) {
  return (
    <div className="adm-stat" style={{ '--accentGrad': 'linear-gradient(135deg,#7c5cff,#22d3ee)' }}>
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
    </div>
  );
}

/* ----------- drawer ----------- */

function FixtureDrawer({ open, fixtureId, onClose, hasRole, showToast, onChange }) {
  const [fx, setFx] = useState(null);
  const [resultModal, setResultModal] = useState(false);
  const [addMarketOpen, setAddMarketOpen] = useState(false);

  async function reload() {
    if (!fixtureId) return;
    try { const r = await adminFixture(fixtureId); setFx(r.fixture); } catch (e) { showToast(e.message, 'error'); }
  }
  useEffect(() => { if (open) reload(); /* eslint-disable-next-line */ }, [open, fixtureId]);

  if (!open) return null;

  async function setLive(isLive) {
    try { const r = await adminPatchFixture(fx.id, { isLive }); setFx(r.fixture); onChange?.(); }
    catch (e) { showToast(e.message, 'error'); }
  }
  async function changeOdds(market, key, odds) {
    try { await adminPatchOdds(fx.id, { market, key, odds: Number(odds) }); await reload(); onChange?.(); showToast('Odds updated.'); }
    catch (e) { showToast(e.message, 'error'); }
  }
  async function resetOdds() {
    try { await adminResetOdds(fx.id); await reload(); onChange?.(); showToast('Odds reset.'); }
    catch (e) { showToast(e.message, 'error'); }
  }
  async function toggleSuspendAll() {
    try {
      if (fx.suspended) await adminClearSuspend(fx.id);
      else              await adminSuspend(fx.id, { all: true });
      await reload(); onChange?.();
    } catch (e) { showToast(e.message, 'error'); }
  }
  async function suspendMarket(mk) {
    try { await adminSuspend(fx.id, { market: mk }); await reload(); onChange?.(); }
    catch (e) { showToast(e.message, 'error'); }
  }
  async function suspendSelection(mk, key) {
    try { await adminSuspend(fx.id, { selection: `${mk}:${key}` }); await reload(); onChange?.(); }
    catch (e) { showToast(e.message, 'error'); }
  }
  async function deleteFx() {
    if (!confirm('Delete this fixture? Only admin-created fixtures can be removed.')) return;
    try { await adminDeleteFixture(fx.id); showToast('Fixture deleted.'); onClose(); onChange?.(); }
    catch (e) { showToast(e.message, 'error'); }
  }
  async function recordResult(h, a) {
    try {
      const r = await adminRecordResult(fx.id, { scoreHome: Number(h), scoreAway: Number(a), autoSettle: true });
      setResultModal(false);
      showToast(`Result recorded. Settled ${r.settled?.settledWins || 0}w / ${r.settled?.settledLoss || 0}l.`);
      await reload(); onChange?.();
    } catch (e) { showToast(e.message, 'error'); }
  }
  async function removeMarket(mk) {
    if (!confirm(`Remove market "${mk}"?`)) return;
    try { await adminRemoveMarket(fx.id, mk); await reload(); onChange?.(); showToast(`Market "${mk}" removed.`); }
    catch (e) { showToast(e.message, 'error'); }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={fx ? `${fx.home} — ${fx.away}` : 'Loading…'}
      width={720}
      footer={fx && hasRole('odds_manager') ? (
        <>
          {fx.adminCreated && <button className="adm-btn ghost" onClick={deleteFx}>Delete</button>}
          <button className="adm-btn warn" onClick={toggleSuspendAll}><IconBan size={14} /> {fx.suspended ? 'Unsuspend' : 'Suspend all'}</button>
          <button className="adm-btn primary" onClick={() => setResultModal(true)}><IconSettle size={14} /> Record result & settle</button>
        </>
      ) : null}
    >
      {!fx ? <div className="adm-skel" style={{ height: 200 }} /> : (
        <>
          <Card>
            <dl className="adm-kv">
              <dt>Fixture id</dt><dd style={{ fontFamily: 'var(--ff-mono)', fontSize: 12 }}>{fx.id}</dd>
              <dt>Sport · League</dt><dd>{fx.sport} · {fx.leagueName || fx.leagueId}</dd>
              <dt>Kick-off</dt><dd>{fx.day} {fx.kickoff}</dd>
              <dt>Status</dt><dd>
                {fx.finished ? <Badge tone="success">Finished {fx.scoreHome}-{fx.scoreAway}</Badge>
                  : fx.isLive ? <Badge tone="danger" dot>Live {fx.minute || ''}</Badge>
                  : <Badge tone="info">Upcoming</Badge>}
              </dd>
              {fx.suspended && <><dt>Suspended</dt><dd><Badge tone="warn">All markets suspended</Badge></dd></>}
            </dl>
            {hasRole('odds_manager') && !fx.finished && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="adm-btn sm" onClick={() => setLive(!fx.isLive)}>
                  <IconLive size={12} /> {fx.isLive ? 'Mark not live' : 'Mark live'}
                </button>
                <button className="adm-btn sm" onClick={resetOdds}><IconRefresh size={12} /> Reset odds</button>
              </div>
            )}
          </Card>

          {Object.entries(fx.markets || {}).map(([mk, market]) => (
            <Card key={mk} title={market.name || mk}
                  action={hasRole('odds_manager') && !fx.finished && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="adm-btn sm warn" onClick={() => suspendMarket(mk)}><IconBan size={12} /> Suspend</button>
                      <button className="adm-btn sm ghost" onClick={() => removeMarket(mk)}><IconClose size={10} /></button>
                    </div>
                  )}
                  pill={market.suspended ? <Badge tone="warn">Suspended</Badge> : null}>
              <table className="adm-table">
                <thead><tr><th>Selection</th><th className="num">Odds</th><th></th></tr></thead>
                <tbody>
                  {(market.selections || []).map((sel) => (
                    <SelectionRow key={sel.key} mk={mk} sel={sel} disabled={!hasRole('odds_manager') || fx.finished}
                                  onChange={(odds) => changeOdds(mk, sel.key, odds)}
                                  onSuspend={() => suspendSelection(mk, sel.key)} />
                  ))}
                </tbody>
              </table>
            </Card>
          ))}

          {hasRole('odds_manager') && !fx.finished && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
              <button className="adm-btn" onClick={() => setAddMarketOpen(true)}>
                + Add market
              </button>
            </div>
          )}
        </>
      )}

      <ResultModal open={resultModal} onClose={() => setResultModal(false)} fx={fx} onSubmit={recordResult} />
      <AddMarketModal open={addMarketOpen} onClose={() => setAddMarketOpen(false)} fx={fx} onSubmit={async (data) => {
        try { await adminAddMarket(fx.id, data); setAddMarketOpen(false); await reload(); onChange?.(); showToast(`Market "${data.marketKey}" added.`); }
        catch (e) { showToast(e.message, 'error'); }
      }} />
    </Drawer>
  );
}

function SelectionRow({ mk, sel, disabled, onChange, onSuspend }) {
  const [val, setVal] = useState(String(sel.odds));
  useEffect(() => { setVal(String(sel.odds)); }, [sel.odds]);
  return (
    <tr>
      <td>
        <strong>{sel.label || sel.key}</strong>
        {sel.suspended && <> <Badge tone="warn">Locked</Badge></>}
      </td>
      <td className="num">
        <input
          className="adm-input"
          style={{ height: 32, width: 90, textAlign: 'right' }}
          type="number" step="0.01" min="1.01" max="999"
          value={val} onChange={(e) => setVal(e.target.value)}
          onBlur={() => Number(val) !== sel.odds && Number(val) > 1 && onChange(val)}
          disabled={disabled}
        />
      </td>
      <td>
        <button className="adm-btn sm warn" onClick={onSuspend} disabled={disabled || sel.suspended}>
          <IconBan size={12} /> {sel.suspended ? 'Locked' : 'Lock'}
        </button>
      </td>
    </tr>
  );
}

function ResultModal({ open, onClose, fx, onSubmit }) {
  const [h, setH] = useState('0');
  const [a, setA] = useState('0');
  useEffect(() => { if (open) { setH(String(fx?.scoreHome ?? 0)); setA(String(fx?.scoreAway ?? 0)); } }, [open, fx]);
  if (!fx) return null;
  return (
    <Modal open={open} onClose={onClose}
           title="Record final result"
           description={`This will lock the fixture and run settlement on every open bet that touches it.`}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'space-around', marginTop: 8 }}>
        <Side label={fx.home} value={h} onChange={setH} />
        <div style={{ fontWeight: 700, fontSize: 22, color: 'var(--text-dim)' }}>—</div>
        <Side label={fx.away} value={a} onChange={setA} />
      </div>
      <div className="adm-modal-actions">
        <button className="adm-btn ghost" onClick={onClose}>Cancel</button>
        <button className="adm-btn primary" onClick={() => onSubmit(h, a)}>Record & settle</button>
      </div>
    </Modal>
  );
}
function Side({ label, value, onChange }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>{label}</div>
      <input className="adm-input" style={{ width: 80, textAlign: 'center', height: 44, fontSize: 22, fontWeight: 700 }}
             type="number" min="0" max="199" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/* ----------- add market modal ----------- */

function AddMarketModal({ open, onClose, fx, onSubmit }) {
  const [marketKey, setMarketKey] = useState('');
  const [name, setName] = useState('');
  const [selections, setSelections] = useState([{ key: '', label: '', odds: '2.00' }, { key: '', label: '', odds: '2.00' }]);

  useEffect(() => { if (open) { setMarketKey(''); setName(''); setSelections([{ key: '', label: '', odds: '2.00' }, { key: '', label: '', odds: '2.00' }]); } }, [open]);

  const addSel = () => setSelections((s) => [...s, { key: '', label: '', odds: '2.00' }]);
  const rmSel = (i) => setSelections((s) => s.filter((_, idx) => idx !== i));
  const updSel = (i, field, val) => setSelections((s) => s.map((sel, idx) => idx === i ? { ...sel, [field]: val } : sel));

  const marketOpts = [
    { key: '1X2', name: 'Match Result (1/X/2)' },
    { key: 'OU25', name: 'Over/Under 2.5' },
    { key: 'OU05', name: 'Over/Under 0.5' },
    { key: 'OU15', name: 'Over/Under 1.5' },
    { key: 'OU35', name: 'Over/Under 3.5' },
    { key: 'OU45', name: 'Over/Under 4.5' },
    { key: 'BTTS', name: 'Both Teams To Score' },
    { key: 'DC', name: 'Double Chance (1X/X2/12)' },
    { key: 'ML', name: 'Money Line' },
    { key: 'TP', name: 'Total Points' },
    { key: 'HCAP', name: 'Handicap' },
    { key: 'CS', name: 'Correct Score' },
  ];

  const pickPreset = (mk) => {
    setMarketKey(mk);
    const presets = {
      '1X2': { name: 'Match Result', selections: [{ key: '1', label: 'Home', odds: '2.10' }, { key: 'X', label: 'Draw', odds: '3.40' }, { key: '2', label: 'Away', odds: '3.10' }] },
      'OU25': { name: 'Over/Under 2.5', selections: [{ key: 'Over', label: 'Over 2.5', odds: '1.95' }, { key: 'Under', label: 'Under 2.5', odds: '1.85' }] },
      'OU05': { name: 'Over/Under 0.5', selections: [{ key: 'Over', label: 'Over 0.5', odds: '1.15' }, { key: 'Under', label: 'Under 0.5', odds: '5.50' }] },
      'OU15': { name: 'Over/Under 1.5', selections: [{ key: 'Over', label: 'Over 1.5', odds: '1.55' }, { key: 'Under', label: 'Under 1.5', odds: '2.40' }] },
      'OU35': { name: 'Over/Under 3.5', selections: [{ key: 'Over', label: 'Over 3.5', odds: '2.50' }, { key: 'Under', label: 'Under 3.5', odds: '1.50' }] },
      'OU45': { name: 'Over/Under 4.5', selections: [{ key: 'Over', label: 'Over 4.5', odds: '4.00' }, { key: 'Under', label: 'Under 4.5', odds: '1.22' }] },
      'BTTS': { name: 'Both Teams To Score', selections: [{ key: 'Yes', label: 'Yes', odds: '1.78' }, { key: 'No', label: 'No', odds: '1.98' }] },
      'DC': { name: 'Double Chance', selections: [{ key: '1X', label: 'Home or Draw', odds: '1.25' }, { key: 'X2', label: 'Draw or Away', odds: '1.35' }, { key: '12', label: 'Home or Away', odds: '1.20' }] },
      'ML': { name: 'Money Line', selections: [{ key: '1', label: 'Home', odds: '2.10' }, { key: '2', label: 'Away', odds: '1.70' }] },
      'TP': { name: 'Total Points', selections: [{ key: 'Over', label: 'Over', odds: '1.90' }, { key: 'Under', label: 'Under', odds: '1.90' }] },
      'HCAP': { name: 'Handicap', selections: [{ key: '1H', label: 'Home', odds: '1.90' }, { key: '2H', label: 'Away', odds: '1.90' }] },
      'CS': { name: 'Correct Score', selections: [{ key: '1-0', label: '1-0', odds: '7.00' }, { key: '2-0', label: '2-0', odds: '9.00' }, { key: '2-1', label: '2-1', odds: '8.00' }, { key: '0-0', label: '0-0', odds: '6.00' }, { key: '1-1', label: '1-1', odds: '6.50' }, { key: '0-1', label: '0-1', odds: '7.50' }, { key: '0-2', label: '0-2', odds: '10.00' }, { key: '1-2', label: '1-2', odds: '9.00' }] },
    };
    const p = presets[mk];
    if (p) { setName(p.name); setSelections(p.selections); }
  };

  async function submit(e) {
    e.preventDefault();
    if (!marketKey || !name) return;
    const parsed = selections.map((s) => ({ key: s.key, label: s.label || s.key, odds: Number(s.odds) }));
    if (parsed.some((s) => !s.key || !Number.isFinite(s.odds) || s.odds < 1.01)) return;
    await onSubmit({ marketKey, name, selections: parsed });
  }

  return (
    <Modal open={open} onClose={onClose} title="Add market" description={`Add a new market to ${fx ? `${fx.home} — ${fx.away}` : 'this fixture'}.`}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="adm-field">
          <label>Market preset</label>
          <select className="adm-select" value="" onChange={(e) => e.target.value && pickPreset(e.target.value)}>
            <option value="">— pick a preset —</option>
            {marketOpts.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="adm-field"><label>Market key</label><input className="adm-input" value={marketKey} onChange={(e) => setMarketKey(e.target.value)} required placeholder="e.g. OU25" /></div>
          <div className="adm-field"><label>Display name</label><input className="adm-input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Over/Under 2.5" /></div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.1em', marginTop: 4 }}>Selections</div>
        {selections.map((sel, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 90px 30px', gap: 6, alignItems: 'center' }}>
            <input className="adm-input" placeholder="Key" value={sel.key} onChange={(e) => updSel(i, 'key', e.target.value)} required style={{ fontFamily: 'var(--ff-mono)', fontSize: 12 }} />
            <input className="adm-input" placeholder="Label" value={sel.label} onChange={(e) => updSel(i, 'label', e.target.value)} />
            <input className="adm-input" type="number" step="0.01" min="1.01" placeholder="Odds" value={sel.odds} onChange={(e) => updSel(i, 'odds', e.target.value)} required style={{ textAlign: 'right' }} />
            <button type="button" className="adm-btn sm ghost" onClick={() => rmSel(i)} disabled={selections.length <= 2}><IconClose size={12} /></button>
          </div>
        ))}
        <button type="button" className="adm-btn sm" onClick={addSel}>+ Add selection</button>
        <div className="adm-modal-actions" style={{ marginTop: 4 }}>
          <button type="button" className="adm-btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="adm-btn primary">Add market</button>
        </div>
      </form>
    </Modal>
  );
}

/* ----------- create modals ----------- */

function CreateFixtureModal({ open, onClose, leagues, onCreated, showToast }) {
  const [form, setForm] = useState({ sport: 'football', leagueId: '', home: '', away: '', kickoff: '', day: 'Today', isLive: false, homeOdds: '2.10', drawOdds: '3.40', awayOdds: '3.10', ouOver: '1.95', ouUnder: '1.85', bttsYes: '1.78', bttsNo: '1.98', dc1X: '1.25', dcX2: '1.35', dc12: '1.20' });
  const eligible = leagues.filter((l) => l.sport === form.sport);
  useEffect(() => { if (open) setForm((f) => ({ ...f, leagueId: '' })); }, [open]);

  async function submit(e) {
    e.preventDefault();
    if (!form.leagueId) return showToast('Pick a league.', 'error');
    if (!form.home || !form.away) return showToast('Both teams required.', 'error');
    try {
      await adminCreateFixture({
        sport: form.sport,
        leagueId: form.leagueId,
        home: form.home, away: form.away,
        kickoff: form.kickoff || undefined,
        day: form.day || undefined,
        isLive: !!form.isLive,
        odds: {
          home: Number(form.homeOdds),
          draw: form.sport === 'football' ? Number(form.drawOdds) : undefined,
          away: Number(form.awayOdds),
        },
        extraMarkets: form.sport === 'football' ? [
          { market: 'OU25', type: 'overunder', over: Number(form.ouOver), under: Number(form.ouUnder) },
          { market: 'BTTS', type: 'yesno', yes: Number(form.bttsYes), no: Number(form.bttsNo) },
          { market: 'DC', type: 'dc', '1X': Number(form.dc1X), X2: Number(form.dcX2), '12': Number(form.dc12) },
        ] : form.sport === 'basketball' ? [
          { market: 'TP', type: 'overunder', over: Number(form.ouOver), under: Number(form.ouUnder) },
        ] : [],
      });
      onCreated();
    } catch (e) { showToast(e.message, 'error'); }
  }

  return (
    <Modal open={open} onClose={onClose} title="New fixture" description="Create a custom fixture (e.g. friendlies, special events).">
      <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="adm-field"><label>Sport</label>
          <select className="adm-select" value={form.sport} onChange={(e) => setForm((f) => ({ ...f, sport: e.target.value, leagueId: '' }))}>
            <option value="football">Football</option>
            <option value="basketball">Basketball</option>
            <option value="tennis">Tennis</option>
          </select>
        </div>
        <div className="adm-field"><label>League</label>
          <select className="adm-select" value={form.leagueId} onChange={(e) => setForm((f) => ({ ...f, leagueId: e.target.value }))}>
            <option value="">— select —</option>
            {eligible.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="adm-field"><label>Home team</label><input className="adm-input" value={form.home} onChange={(e) => setForm((f) => ({ ...f, home: e.target.value }))} required /></div>
        <div className="adm-field"><label>Away team</label><input className="adm-input" value={form.away} onChange={(e) => setForm((f) => ({ ...f, away: e.target.value }))} required /></div>
        <div className="adm-field"><label>Day</label>
          <select className="adm-select" value={form.day} onChange={(e) => setForm((f) => ({ ...f, day: e.target.value }))}>
            <option>Today</option><option>Tomorrow</option><option>In 2 days</option><option>In 3 days</option>
          </select>
        </div>
        <div className="adm-field"><label>Kick-off (HH:MM)</label><input className="adm-input" placeholder="20:00" value={form.kickoff} onChange={(e) => setForm((f) => ({ ...f, kickoff: e.target.value }))} /></div>
        <details style={{ gridColumn: '1 / -1', fontSize: 13 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--text-soft)' }}>Main market odds</summary>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
            <div className="adm-field"><label>{form.sport === 'football' ? 'Home (1)' : 'Home'} odds</label><input className="adm-input" type="number" step="0.01" min="1.01" value={form.homeOdds} onChange={(e) => setForm((f) => ({ ...f, homeOdds: e.target.value }))} /></div>
            {form.sport === 'football' && (
              <div className="adm-field"><label>Draw (X) odds</label><input className="adm-input" type="number" step="0.01" min="1.01" value={form.drawOdds} onChange={(e) => setForm((f) => ({ ...f, drawOdds: e.target.value }))} /></div>
            )}
            <div className="adm-field"><label>Away {form.sport === 'football' ? '(2)' : ''} odds</label><input className="adm-input" type="number" step="0.01" min="1.01" value={form.awayOdds} onChange={(e) => setForm((f) => ({ ...f, awayOdds: e.target.value }))} /></div>
          </div>
        </details>
        {(form.sport === 'football' || form.sport === 'basketball') && (
          <details style={{ gridColumn: '1 / -1', fontSize: 13 }} open>
            <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--text-soft)' }}>Additional market odds</summary>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
              <div className="adm-field"><label>Over {form.sport === 'basketball' ? 'points' : '2.5'}</label><input className="adm-input" type="number" step="0.01" min="1.01" value={form.ouOver} onChange={(e) => setForm((f) => ({ ...f, ouOver: e.target.value }))} /></div>
              <div className="adm-field"><label>Under {form.sport === 'basketball' ? 'points' : '2.5'}</label><input className="adm-input" type="number" step="0.01" min="1.01" value={form.ouUnder} onChange={(e) => setForm((f) => ({ ...f, ouUnder: e.target.value }))} /></div>
              {form.sport === 'football' && (
                <>
                  <div className="adm-field"><label>BTTS Yes</label><input className="adm-input" type="number" step="0.01" min="1.01" value={form.bttsYes} onChange={(e) => setForm((f) => ({ ...f, bttsYes: e.target.value }))} /></div>
                  <div className="adm-field"><label>BTTS No</label><input className="adm-input" type="number" step="0.01" min="1.01" value={form.bttsNo} onChange={(e) => setForm((f) => ({ ...f, bttsNo: e.target.value }))} /></div>
                  <div className="adm-field"><label>DC 1X (Home/Draw)</label><input className="adm-input" type="number" step="0.01" min="1.01" value={form.dc1X} onChange={(e) => setForm((f) => ({ ...f, dc1X: e.target.value }))} /></div>
                  <div className="adm-field"><label>DC X2 (Draw/Away)</label><input className="adm-input" type="number" step="0.01" min="1.01" value={form.dcX2} onChange={(e) => setForm((f) => ({ ...f, dcX2: e.target.value }))} /></div>
                  <div className="adm-field"><label>DC 12 (Home/Away)</label><input className="adm-input" type="number" step="0.01" min="1.01" value={form.dc12} onChange={(e) => setForm((f) => ({ ...f, dc12: e.target.value }))} /></div>
                </>
              )}
            </div>
          </details>
        )}
        <div className="adm-field" style={{ gridColumn: '1 / -1' }}>
          <label><input type="checkbox" checked={form.isLive} onChange={(e) => setForm((f) => ({ ...f, isLive: e.target.checked }))} /> Mark as live now</label>
        </div>
        <div className="adm-modal-actions" style={{ gridColumn: '1 / -1' }}>
          <button type="button" className="adm-btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="adm-btn primary">Create fixture</button>
        </div>
      </form>
    </Modal>
  );
}

function CreateLeagueModal({ open, onClose, onCreated, showToast }) {
  const [form, setForm] = useState({ name: '', sport: 'football', region: '', countryMeta: '' });
  useEffect(() => { if (open) setForm({ name: '', sport: 'football', region: '', countryMeta: '' }); }, [open]);
  async function submit(e) {
    e.preventDefault();
    try { await adminCreateLeague(form); onCreated(); }
    catch (e) { showToast(e.message, 'error'); }
  }
  return (
    <Modal open={open} onClose={onClose} title="New league" description="Add a custom competition.">
      <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="adm-field" style={{ gridColumn: '1 / -1' }}><label>Name</label><input className="adm-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required /></div>
        <div className="adm-field"><label>Sport</label>
          <select className="adm-select" value={form.sport} onChange={(e) => setForm((f) => ({ ...f, sport: e.target.value }))}>
            <option value="football">Football</option>
            <option value="basketball">Basketball</option>
            <option value="tennis">Tennis</option>
          </select>
        </div>
        <div className="adm-field"><label>Region</label><input className="adm-input" value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} placeholder="europe / africa / americas" /></div>
        <div className="adm-field" style={{ gridColumn: '1 / -1' }}><label>Meta line</label><input className="adm-input" value={form.countryMeta} onChange={(e) => setForm((f) => ({ ...f, countryMeta: e.target.value }))} placeholder="GHA · MATCHWEEK 18" /></div>
        <div className="adm-modal-actions" style={{ gridColumn: '1 / -1' }}>
          <button type="button" className="adm-btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="adm-btn primary">Create league</button>
        </div>
      </form>
    </Modal>
  );
}

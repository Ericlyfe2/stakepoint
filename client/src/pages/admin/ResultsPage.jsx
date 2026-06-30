import { useState, useEffect, useCallback } from 'react';
import { useAdmin } from '../../providers/AdminProvider.jsx';
import { adminSettlementQueue, adminSettlementRecordResult, adminSettlementTrigger, adminSettlementSettleBet, adminSettlementBulk } from '../../api/adminApi.js';
import { useToast as useLocalToast, Card, Badge, Drawer, Modal, Empty, Spinner, moneyFmt, ago } from '../../components/admin/primitives.jsx';
import { IconRefresh, IconSearch, IconCheck } from '../../components/admin/Icons.jsx';

export default function ResultsPage() {
  const { can } = useAdmin();
  const { toast, show } = useLocalToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('pending');
  const [search, setSearch] = useState('');
  const [resultDrawer, setResultDrawer] = useState(null);
  const [confirmSettle, setConfirmSettle] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminSettlementQueue();
      setData(r);
    } catch (e) { show(e.message, 'error'); }
    finally { setLoading(false); }
  }, [show]);

  useEffect(() => { load(); }, [load]);

  const handleRecordResult = async (matchId, body) => {
    try {
      await adminSettlementRecordResult(matchId, body);
      show('Result recorded');
      setResultDrawer(null);
      load();
    } catch (e) { show(e.message, 'error'); }
  };

  const handleTriggerSettle = async (matchId) => {
    try {
      await adminSettlementTrigger(matchId);
      show('Settlement triggered');
      setConfirmSettle(null);
      load();
    } catch (e) { show(e.message, 'error'); }
  };

  const filterList = (list) => {
    if (!search) return list || [];
    const lq = search.toLowerCase();
    return (list || []).filter((f) =>
      f.matchId?.toLowerCase().includes(lq) ||
      f.home?.toLowerCase().includes(lq) ||
      f.away?.toLowerCase().includes(lq) ||
      f.fixture?.home?.toLowerCase().includes(lq) ||
      f.fixture?.away?.toLowerCase().includes(lq)
    );
  };

  const renderQueue = (items, emptyMsg) => {
    const filtered = filterList(items);
    if (filtered.length === 0) return <Empty title={emptyMsg} subtitle="All clear — no items to display." />;
    return (
      <div className="adm-table-scroll">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Fixture</th>
              <th>Open Bets</th>
              <th>Total Stake</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((f) => (
              <tr key={f.matchId}>
                <td>
                  <div style={{ fontWeight: 600 }}>{f.fixture?.home || f.home} vs {f.fixture?.away || f.away}</div>
                  <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{f.matchId}</div>
                  {f.result && (
                    <div style={{ color: 'var(--accent)', fontSize: 12 }}>
                      Result: {f.result.scoreHome} – {f.result.scoreAway}
                      {f.result.source && ` (${f.result.source})`}
                    </div>
                  )}
                </td>
                <td><Badge tone="info">{f.betCount}</Badge></td>
                <td style={{ fontWeight: 600 }}>GHS {moneyFmt(f.totalStake)}</td>
                <td>
                  {f.finished ? (
                    <Badge tone="success" dot>Finished</Badge>
                  ) : f.isLive ? (
                    <Badge tone="danger" dot>Live</Badge>
                  ) : (
                    <Badge tone="warning" dot>Upcoming</Badge>
                  )}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <div className="row-actions">
                    {can('sports.edit') && !f.finished && (
                      <button className="adm-btn primary sm" onClick={() => setResultDrawer(f)}>
                        <IconCheck size={12} /> Enter Result
                      </button>
                    )}
                    {can('sports.edit') && f.finished && (
                      <button className="adm-btn ghost sm" onClick={() => setConfirmSettle(f)}>
                        Settle
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const tabs = [
    { key: 'pending', label: 'Pending Results', count: data?.pending?.length || 0 },
    { key: 'awaiting', label: 'Awaiting Settlement', count: data?.awaitingSettle?.length || 0 },
    { key: 'recent', label: 'Recent Settlements', count: data?.settled?.length || 0 },
  ];

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>Results &amp; Settlement</h1>
          <p>Enter fixture results, manage settlement queue, and review settlement history.</p>
        </div>
        <button className="adm-btn ghost sm" onClick={load}><IconRefresh size={14} /> Refresh</button>
      </div>

      <div className="adm-stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <Card>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{(data?.pending?.length || 0) + (data?.awaitingSettle?.length || 0)}</div>
          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>Pending Items</div>
        </Card>
        <Card>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--orange)' }}>{data?.pending?.length || 0}</div>
          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>Awaiting Result</div>
        </Card>
        <Card>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)' }}>{data?.awaitingSettle?.length || 0}</div>
          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>Awaiting Settlement</div>
        </Card>
        <Card>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)' }}>{data?.settled?.length || 0}</div>
          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>Recently Settled</div>
        </Card>
      </div>

      <div className="adm-tabs" style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {tabs.map((t) => (
          <button key={t.key} className={`adm-tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label} <Badge tone="default">{t.count}</Badge>
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ position: 'relative', width: 240 }}>
          <IconSearch size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
          <input placeholder="Search fixtures..." value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 32, fontSize: 13 }} />
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 24 }}><Spinner /></div>
      ) : tab === 'pending' ? (
        <div className="adm-table-wrap">
          <div className="adm-table-toolbar">
            <div style={{ fontWeight: 600, fontSize: 14 }}>Fixtures with open bets, awaiting result</div>
          </div>
          {renderQueue(data?.pending, 'No fixtures awaiting results')}
        </div>
      ) : tab === 'awaiting' ? (
        <div className="adm-table-wrap">
          <div className="adm-table-toolbar">
            <div style={{ fontWeight: 600, fontSize: 14 }}>Finished fixtures with unsettled bets</div>
          </div>
          {renderQueue(data?.awaitingSettle, 'No fixtures awaiting settlement')}
        </div>
      ) : (
        <div className="adm-table-wrap">
          <div className="adm-table-toolbar">
            <div style={{ fontWeight: 600, fontSize: 14 }}>Recently settled bets</div>
          </div>
          <div className="adm-table-scroll">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Bet ID</th>
                  <th>Fixture</th>
                  <th>Stake</th>
                  <th>Payout</th>
                  <th>Status</th>
                  <th>Settled</th>
                </tr>
              </thead>
              <tbody>
                {(data?.settled || []).length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>No recent settlements</td></tr>
                ) : (data?.settled || []).map((b) => (
                  <tr key={b.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-dim)' }}>{b.id?.slice(0, 20)}…</td>
                    <td>
                      {(b.legs || []).slice(0, 2).map((l, i) => (
                        <div key={i} style={{ fontSize: 13 }}>
                          {l.home} vs {l.away} <span style={{ color: 'var(--text-dim)' }}>({l.market}: {l.outcome})</span>
                        </div>
                      ))}
                      {(b.legs || []).length > 2 && <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>+{b.legs.length - 2} more legs</div>}
                    </td>
                    <td>GHS {moneyFmt(b.stake)}</td>
                    <td style={{ fontWeight: 700, color: b.payout > 0 ? 'var(--green)' : 'var(--text-dim)' }}>
                      GHS {moneyFmt(b.payout)}
                    </td>
                    <td>
                      <Badge tone={b.status === 'won' ? 'success' : b.status === 'lost' ? 'danger' : b.status === 'void' ? 'warning' : 'default'} dot>
                        {b.status}
                      </Badge>
                    </td>
                    <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{ago(b.settledAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Drawer
        open={!!resultDrawer}
        title={`Enter Result — ${resultDrawer?.fixture?.home || resultDrawer?.home} vs ${resultDrawer?.fixture?.away || resultDrawer?.away}`}
        onClose={() => setResultDrawer(null)}
        width="min(400px, 100%)"
      >
        <ResultForm
          fixture={resultDrawer}
          onSubmit={(body) => handleRecordResult(resultDrawer.matchId, body)}
          onClose={() => setResultDrawer(null)}
        />
      </Drawer>

      <Modal
        open={!!confirmSettle}
        title="Trigger Settlement"
        description={`Settle all open bets for "${confirmSettle?.fixture?.home || confirmSettle?.home} vs ${confirmSettle?.fixture?.away || confirmSettle?.away}"? This will run the full settlement engine.`}
        onClose={() => setConfirmSettle(null)}
        footer={
          <>
            <button className="adm-btn" onClick={() => setConfirmSettle(null)}>Cancel</button>
            <button className="adm-btn primary" onClick={() => handleTriggerSettle(confirmSettle.matchId)}>Settle Now</button>
          </>
        }
      />

      {toast.open && <div className="adm-toast">{toast.message}</div>}
    </div>
  );
}

function ResultForm({ fixture, onSubmit, onClose }) {
  const [scoreHome, setScoreHome] = useState('');
  const [scoreAway, setScoreAway] = useState('');
  const [autoSettle, setAutoSettle] = useState(true);
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    const h = parseInt(scoreHome, 10);
    const a = parseInt(scoreAway, 10);
    if (isNaN(h) || isNaN(a)) { setError('Enter valid scores'); return; }
    if (h < 0 || a < 0) { setError('Scores cannot be negative'); return; }
    onSubmit({ scoreHome: h, scoreAway: a, autoSettle });
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && <div className="adm-auth-form err">{error}</div>}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <div className="adm-field">
          <label>{fixture?.fixture?.home || fixture?.home}</label>
          <input className="adm-input" type="number" min="0" max="199" value={scoreHome}
            onChange={(e) => setScoreHome(e.target.value)} placeholder="0" required
            autoFocus style={{ fontSize: 24, fontWeight: 800, textAlign: 'center', height: 60 }} />
        </div>
        <div className="adm-field">
          <label>{fixture?.fixture?.away || fixture?.away}</label>
          <input className="adm-input" type="number" min="0" max="199" value={scoreAway}
            onChange={(e) => setScoreAway(e.target.value)} placeholder="0" required
            style={{ fontSize: 24, fontWeight: 800, textAlign: 'center', height: 60 }} />
        </div>
      </div>
      <div className="adm-field">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={autoSettle} onChange={(e) => setAutoSettle(e.target.checked)} />
          Auto-settle bets after recording result
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
        <button type="button" className="adm-btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="adm-btn primary">{autoSettle ? 'Record & Settle' : 'Record Result'}</button>
      </div>
    </form>
  );
}

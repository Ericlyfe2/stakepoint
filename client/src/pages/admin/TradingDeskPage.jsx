import { useState, useEffect, useCallback } from 'react';
import { useAdmin } from '../../providers/AdminProvider.jsx';
import { adminExposureOverview, adminExposureFixtures } from '../../api/adminApi.js';
import { useToast as useLocalToast, Card, Badge, Spinner, moneyFmt, ago } from '../../components/admin/primitives.jsx';
import { IconRefresh } from '../../components/admin/Icons.jsx';

const MODE_LABELS = { singles: 'Singles', multiples: 'Multiples', systems: 'System Bets' };

export default function TradingDeskPage() {
  const { can } = useAdmin();
  const { toast, show } = useLocalToast();
  const [overview, setOverview] = useState(null);
  const [fixtures, setFixtures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedFixture, setExpandedFixture] = useState(null);
  const [expandedMarket, setExpandedMarket] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, f] = await Promise.all([
        adminExposureOverview(),
        adminExposureFixtures(),
      ]);
      setOverview(o);
      setFixtures(f.fixtures || []);
    } catch (e) { show(e.message, 'error'); }
    finally { setLoading(false); }
  }, [show]);

  useEffect(() => { load(); }, [load]);

  const toggleFixture = (id) => setExpandedFixture(expandedFixture === id ? null : id);
  const toggleMarket = (k) => setExpandedMarket(expandedMarket === k ? null : k);

  if (loading && !overview) {
    return <div className="adm-page"><div style={{ padding: 40 }}><Spinner /></div></div>;
  }

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>Trading Desk</h1>
          <p>Real-time exposure monitoring, liability tracking, and risk management.</p>
        </div>
        <button className="adm-btn ghost sm" onClick={load}><IconRefresh size={14} /> Refresh</button>
      </div>

      <div className="adm-stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <Card>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{overview?.totalBets ?? '—'}</div>
          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>Open Bets</div>
        </Card>
        <Card>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)' }}>GHS {moneyFmt(overview?.totalStake)}</div>
          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>Total Stake</div>
        </Card>
        <Card>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--orange)' }}>GHS {moneyFmt(overview?.totalLiability)}</div>
          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>House Liability</div>
        </Card>
        <Card>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)' }}>GHS {moneyFmt(overview?.totalPotentialPayout)}</div>
          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>Max Payout</div>
        </Card>
      </div>

      {overview?.breakdown && (
        <div className="adm-stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginTop: 4 }}>
          {Object.entries(overview.breakdown).map(([key, b]) => (
            <Card key={key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{MODE_LABELS[key] || key}</span>
                <Badge tone="default">{b.count}</Badge>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-soft)' }}>Stake</span>
                <span>GHS {moneyFmt(b.stake)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-soft)' }}>Liability</span>
                <span style={{ color: b.liability > 0 ? 'var(--orange)' : 'var(--text-soft)' }}>GHS {moneyFmt(b.liability)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="adm-table-wrap" style={{ marginTop: 12 }}>
        <div className="adm-table-toolbar">
          <div style={{ fontWeight: 600, fontSize: 16 }}>Fixtures by Exposure</div>
          <div className="grow" />
          <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>
            {fixtures.length} active fixtures · GHS {moneyFmt(fixtures.reduce((s, f) => s + f.totalLiability, 0))} total liability
          </span>
        </div>

        <div className="adm-table-scroll">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Fixture</th>
                <th>Open Bets</th>
                <th>Total Stake</th>
                <th>Liability</th>
                <th>Markets</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {fixtures.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>No open bets to display</td></tr>
              ) : fixtures.map((f) => (
                <>
                  <tr key={f.matchId} style={{ cursor: 'pointer' }} onClick={() => toggleFixture(f.matchId)}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{f.home} vs {f.away}</div>
                      <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{f.matchId}</div>
                    </td>
                    <td><Badge tone="info">{f.totalBets}</Badge></td>
                    <td style={{ fontWeight: 600 }}>GHS {moneyFmt(f.totalStake)}</td>
                    <td style={{ fontWeight: 700, color: f.totalLiability > 0 ? 'var(--orange)' : 'var(--text-soft)' }}>
                      GHS {moneyFmt(f.totalLiability)}
                    </td>
                    <td style={{ color: 'var(--text-dim)', fontSize: 13 }}>{Object.keys(f.markets).length}</td>
                    <td style={{ color: 'var(--text-dim)', fontSize: 18, textAlign: 'center' }}>
                      {expandedFixture === f.matchId ? '−' : '+'}
                    </td>
                  </tr>
                  {expandedFixture === f.matchId && Object.entries(f.markets).map(([mk, m]) => (
                    <tr key={`${f.matchId}-${mk}`} style={{ background: 'var(--bg-card)' }}>
                      <td colSpan={6} style={{ padding: '4px 12px 4px 48px' }}>
                        <div style={{ cursor: 'pointer' }} onClick={() => toggleMarket(`${f.matchId}-${mk}`)}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                            <span style={{ fontWeight: 600, fontSize: 14 }}>{m.marketName}</span>
                            <div style={{ display: 'flex', gap: 20, fontSize: 13 }}>
                              <span><span style={{ color: 'var(--text-dim)' }}>Bets:</span> {m.totalBets}</span>
                              <span><span style={{ color: 'var(--text-dim)' }}>Stake:</span> GHS {moneyFmt(m.totalStake)}</span>
                              <span style={{ color: m.totalLiability > 0 ? 'var(--orange)' : 'var(--text-dim)' }}>
                                <span style={{ color: 'var(--text-dim)' }}>Liability:</span> GHS {moneyFmt(m.totalLiability)}
                              </span>
                              <span style={{ color: 'var(--text-dim)', fontSize: 16 }}>{expandedMarket === `${f.matchId}-${mk}` ? '−' : '+'}</span>
                            </div>
                          </div>
                        </div>
                        {expandedMarket === `${f.matchId}-${mk}` && (
                          <div style={{ padding: '4px 0 8px 16px', borderTop: '1px solid var(--border)', marginTop: 4 }}>
                            <table className="adm-table" style={{ fontSize: 13 }}>
                              <thead>
                                <tr>
                                  <th>Selection</th>
                                  <th>Bets</th>
                                  <th>Stake</th>
                                  <th>Liability</th>
                                </tr>
                              </thead>
                              <tbody>
                                {Object.values(m.selections).map((s) => (
                                  <tr key={s.outcome}>
                                    <td style={{ fontWeight: 600 }}>{s.label || s.outcome}</td>
                                    <td><Badge tone="default">{s.totalBets}</Badge></td>
                                    <td>GHS {moneyFmt(s.totalStake)}</td>
                                    <td style={{ color: s.totalLiability > 0 ? 'var(--orange)' : 'var(--text-soft)' }}>
                                      GHS {moneyFmt(s.totalLiability)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {toast.open && <div className="adm-toast">{toast.message}</div>}
    </div>
  );
}

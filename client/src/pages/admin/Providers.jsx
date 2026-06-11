/**
 * Provider observability page. Shows each integration's:
 *   - enabled / dormant state (driven by env keys)
 *   - last success / last error
 *   - call rates over 1m / 5m / 1h windows
 *   - recent API log entries
 *   - one-click test + global refresh
 *
 * Subscribes to /admin socket for live `provider:health`, `audit:event` and
 * `bet:placed` / `bet:settled` events that flow through the platform.
 */
import { useEffect, useState } from 'react';
import {
  adminProviders, adminProviderLogs, adminProviderRefresh, adminProviderTest,
} from '../../api/adminApi.js';
import { onAdmin } from '../../api/adminSocket.js';
import { useAdmin } from '../../providers/AdminProvider.jsx';
import { Card, Badge, Empty, Spinner, ago, dateShort, numFmt } from '../../components/admin/primitives.jsx';
import {
  IconRefresh, IconActivity, IconBot, IconAlert, IconShield, IconCheck, IconBan,
} from '../../components/admin/Icons.jsx';

export default function ProvidersPage() {
  const { showToast } = useAdmin();
  const [data, setData] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logFilter, setLogFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [liveLines, setLiveLines] = useState([]);

  async function load() {
    try {
      const [d, l] = await Promise.all([adminProviders(), adminProviderLogs(undefined, 100)]);
      setData(d); setLogs(l.logs || []);
    } catch (e) { showToast(e.message, 'error'); }
  }
  useEffect(() => { load(); const i = setInterval(load, 15_000); return () => clearInterval(i); }, []);

  useEffect(() => {
    const offHealth = onAdmin('provider:health', (snap) => {
      setData((d) => d ? { ...d, providers: snap } : d);
    });
    const offAudit = onAdmin('audit:event', (e) => {
      setLiveLines((cur) => [{ k: 'audit', ...e }, ...cur].slice(0, 30));
    });
    const offPlaced = onAdmin('bet:placed', (e) => {
      setLiveLines((cur) => [{ k: 'bet:placed', at: new Date().toISOString(), ...e }, ...cur].slice(0, 30));
    });
    const offSettled = onAdmin('bet:settled', (e) => {
      setLiveLines((cur) => [{ k: 'bet:settled', at: new Date().toISOString(), ...e }, ...cur].slice(0, 30));
    });
    return () => { offHealth?.(); offAudit?.(); offPlaced?.(); offSettled?.(); };
  }, []);

  async function refresh() {
    setBusy(true);
    try {
      const r = await adminProviderRefresh();
      showToast(`Refresh: ${r.providers ?? 0} providers, ${r.fixtures ?? 0} fixtures`);
      await load();
    } catch (e) { showToast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  async function test(id) {
    try {
      const r = await adminProviderTest(id);
      showToast(`${id}: ${r.count} rows`, r.ok ? 'success' : 'error');
      await load();
    } catch (e) { showToast(e.message, 'error'); }
  }

  const filteredLogs = logFilter ? logs.filter((l) => l.provider === logFilter) : logs;

  return (
    <>
      <header className="adm-page-head">
        <div>
          <h1>API providers</h1>
          <p>Real-time health of every external sportsbook/data integration. Latency, success rate, and last error per provider.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="adm-btn" onClick={load}><IconRefresh size={14} /> Reload</button>
          <button className="adm-btn primary" onClick={refresh} disabled={busy}>
            <IconBot size={14} /> {busy ? 'Refreshing…' : 'Trigger aggregation'}
          </button>
        </div>
      </header>

      {!data ? <Spinner /> : (
        <>
          <div className="adm-stat-grid">
            <Tile label="Providers" value={numFmt(data.providers?.length)} />
            <Tile label="Enabled"   value={numFmt(data.providers?.filter((p) => p.enabled).length)} />
            <Tile label="Live sockets" value={numFmt(data.realtime?.liveSockets)} />
            <Tile label="Admin sockets" value={numFmt(data.realtime?.adminSockets)} />
            <Tile label="Cache items" value={numFmt(data.cache?.live)} />
          </div>

          <div className="adm-grid c2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}>
            {(data.providers || []).map((p) => {
              const s1m = data.summary?.['1m']?.[p.id];
              const s5m = data.summary?.['5m']?.[p.id];
              const s1h = data.summary?.['1h']?.[p.id];
              return (
                <Card key={p.id}
                      title={p.label}
                      subtitle={p.sports.join(' · ')}
                      pill={p.enabled
                        ? <Badge tone="success" dot>Active</Badge>
                        : <Badge tone="warn"><IconBan size={12} /> Dormant</Badge>}>
                  <dl className="adm-kv">
                    <dt>ID</dt><dd style={{ fontFamily: 'var(--ff-mono)', fontSize: 12 }}>{p.id}</dd>
                    <dt>Last success</dt><dd>{p.lastSuccessAt ? ago(p.lastSuccessAt) : <span style={{ color: 'var(--text-mute)' }}>—</span>}</dd>
                    <dt>Last error</dt><dd>{p.lastErrorAt ? <><Badge tone="danger">{ago(p.lastErrorAt)}</Badge> <span style={{ color: 'var(--text-dim)' }}>{p.lastError}</span></> : <span style={{ color: 'var(--text-mute)' }}>—</span>}</dd>
                    <dt>Success rate</dt><dd>
                      <div className="adm-progress" style={{ marginTop: 4 }}>
                        <i style={{ width: `${p.successPct}%`, background: p.successPct > 90 ? 'var(--grad-success)' : p.successPct > 60 ? 'var(--grad-warn)' : 'var(--grad-danger)' }} />
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-dim)' }}>{p.successPct}% · {p.calls} calls</div>
                    </dd>
                  </dl>
                  <div className="adm-grid c3" style={{ marginTop: 12, gap: 8 }}>
                    <Mini label="1m"  v={s1m ? `${s1m.calls}c · ${s1m.avgLatency}ms` : '—'} />
                    <Mini label="5m"  v={s5m ? `${s5m.calls}c · ${s5m.avgLatency}ms` : '—'} />
                    <Mini label="1h"  v={s1h ? `${s1h.calls}c · ${s1h.avgLatency}ms` : '—'} />
                  </div>
                  <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                    <button className="adm-btn sm" onClick={() => test(p.id)} disabled={!p.enabled}>
                      <IconCheck size={12} /> Test call
                    </button>
                    <button className="adm-btn sm" onClick={() => setLogFilter(logFilter === p.id ? '' : p.id)}>
                      <IconActivity size={12} /> {logFilter === p.id ? 'All logs' : 'Filter logs'}
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>

          <div className="adm-grid cols-7-5">
            <Card title={logFilter ? `API call log — ${logFilter}` : 'API call log'}
                  subtitle="Recent outbound calls to providers. Sensitive params are scrubbed."
                  action={logFilter && <button className="adm-btn sm ghost" onClick={() => setLogFilter('')}>Clear filter</button>}>
              {filteredLogs.length === 0 ? <Empty title="No calls logged yet" subtitle="Provider keys are dormant or the aggregator hasn't ticked yet." /> : (
                <div className="adm-table-scroll" style={{ maxHeight: 480 }}>
                  <table className="adm-table">
                    <thead><tr><th>When</th><th>Provider</th><th>Endpoint</th><th className="num">Status</th><th className="num">Latency</th></tr></thead>
                    <tbody>
                      {filteredLogs.map((l) => (
                        <tr key={l.id}>
                          <td>{ago(l.at)}</td>
                          <td><Badge tone="brand">{l.provider}</Badge></td>
                          <td style={{ fontFamily: 'var(--ff-mono)', fontSize: 12, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.endpoint}</td>
                          <td className="num">
                            <Badge tone={l.status >= 200 && l.status < 300 ? 'success' : l.status >= 400 ? 'danger' : 'default'}>
                              {l.status || '—'}
                            </Badge>
                          </td>
                          <td className="num">{l.latencyMs}ms</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card title="Realtime stream" subtitle="Live admin events as they fire" pill={<Badge tone="brand" dot>Live</Badge>}>
              {liveLines.length === 0 ? <Empty title="No live events yet" subtitle="Place a bet or run a settlement to see events stream in." /> : (
                <div className="adm-list-feed" style={{ maxHeight: 480, overflowY: 'auto' }}>
                  {liveLines.map((l, i) => (
                    <div key={i} className="row">
                      <span className={`dot ${l.k === 'audit' ? '' : l.k === 'bet:placed' ? 'success' : 'warn'}`} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{l.k === 'audit' ? (l.action || 'audit') : l.k}</div>
                        <div className="meta">{l.actorId || l.userId || ''} {l.betId ? `· ${l.betId.slice(0, 18)}` : ''}</div>
                      </div>
                      <div className="meta">{ago(l.at)}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card subtitle="" title="Adding more keys">
            <p style={{ color: 'var(--text-soft)', margin: 0 }}>
              All five providers are wired. To activate one, set the matching env var on the API server and restart:
            </p>
            <ul style={{ fontFamily: 'var(--ff-mono)', fontSize: 12.5, marginTop: 10, paddingLeft: 18 }}>
              <li>The Odds API — <strong>ODDS_API_KEY</strong></li>
              <li>API Football — <strong>APIFOOTBALL_KEY</strong></li>
              <li>SportMonks — <strong>SPORTMONKS_TOKEN</strong></li>
              <li>SharpAPI — <strong>SHARPAPI_KEY</strong></li>
              <li>SportsGameOdds — <strong>SPORTSGAMEODDS_KEY</strong></li>
            </ul>
          </Card>
        </>
      )}
    </>
  );
}

function Tile({ label, value }) {
  return (
    <div className="adm-stat" style={{ '--accentGrad': 'linear-gradient(135deg,#7c5cff,#22d3ee)' }}>
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
    </div>
  );
}

function Mini({ label, v }) {
  return (
    <div style={{ padding: '8px 10px', borderRadius: 10, background: 'var(--surface-soft)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 10.5, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '.14em' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>{v}</div>
    </div>
  );
}

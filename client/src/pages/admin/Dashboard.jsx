/**
 * Operations dashboard.
 *  - KPI tiles for revenue / bets / users / pending withdrawals
 *  - Revenue & bets-by-day chart
 *  - User growth area chart
 *  - Sport mix donut
 *  - Status distribution
 *  - Heatmap of betting activity (7 days x 24 hours)
 *  - System health + alerts feed
 * Auto-refreshes every 30 seconds.
 */
import { useEffect, useState, useMemo } from 'react';
import { adminOverview } from '../../api/adminApi.js';
import { Card, Stat, Badge, Empty, Spinner, moneyFmt, numFmt, ago } from '../../components/admin/primitives.jsx';
import { LineChart, BarChart, PieChart, Heatmap } from '../../components/admin/charts.jsx';
import {
  IconUsers, IconReceipt, IconCash, IconArrowUp, IconAlert, IconLive, IconRefresh,
  IconSparkles, IconActivity, IconShield,
} from '../../components/admin/Icons.jsx';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    setRefreshing(silent);
    try {
      const res = await adminOverview();
      setData(res);
      setErr('');
    } catch (e) {
      setErr(e.message || 'Failed to load dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    const i = setInterval(() => load(true), 30_000);
    return () => clearInterval(i);
  }, []);

  const charts = data?.charts;

  const moneyShort = (n) => {
    const v = Number(n) || 0;
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000)     return `${(v / 1_000).toFixed(1)}K`;
    return v.toFixed(0);
  };

  return (
    <>
      <header className="adm-page-head">
        <div>
          <h1>Mission control</h1>
          <p>Realtime revenue, players, risk and platform health for the last 30 days. Auto-refreshes every 30s.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="adm-btn" onClick={() => load(true)} disabled={refreshing}>
            <IconRefresh size={14} /> {refreshing ? 'Refreshing' : 'Refresh'}
          </button>
          <button className="adm-btn primary"><IconSparkles size={14} /> Ask AI insights</button>
        </div>
      </header>

      {err && <div className="adm-card" style={{ borderColor: 'rgba(255,93,108,.4)' }}>{err}</div>}

      {/* KPI strip */}
      <div className="adm-stat-grid">
        <Stat label="GGR · 24h"   value={moneyFmt(data?.kpis?.ggr24h)}  icon={<IconCash size={16} />} accent="linear-gradient(135deg,#7c5cff,#22d3ee)" delta={{ direction: 'up', label: '12.4%' }} />
        <Stat label="Stake · 24h" value={moneyFmt(data?.kpis?.stake24h)} icon={<IconReceipt size={16} />} accent="linear-gradient(135deg,#22d3ee,#0E8A4A)" delta={{ direction: 'up', label: '8.1%' }} />
        <Stat label="Active users" prefix="" value={numFmt(data?.kpis?.onlineUsers)} icon={<IconUsers size={16} />} accent="linear-gradient(135deg,#0E8A4A,#7c5cff)" />
        <Stat label="Bets · 24h"  value={numFmt(data?.kpis?.bets24h)}   icon={<IconLive size={16} />}    accent="linear-gradient(135deg,#ffb547,#ff5d6c)" delta={{ direction: 'up', label: '3.7%' }} />
      </div>

      <div className="adm-stat-grid">
        <Stat label="Total users"          value={numFmt(data?.kpis?.usersTotal)}     icon={<IconUsers size={16} />} />
        <Stat label="New users · 7d"       value={numFmt(data?.kpis?.usersNew7d)}     icon={<IconArrowUp size={16} />} />
        <Stat label="Deposits · 24h"       value={moneyFmt(data?.kpis?.depositSum24h)} icon={<IconCash size={16} />} />
        <Stat label="Withdrawals · 24h"    value={moneyFmt(data?.kpis?.withdrawSum24h)} icon={<IconCash size={16} />} />
        <Stat label="Pending withdrawals"  value={numFmt(data?.kpis?.pendingWithdrawals)} icon={<IconAlert size={16} />} accent="linear-gradient(135deg,#ffb547,#ff5d6c)" />
        <Stat label="Open bets"            value={numFmt(data?.kpis?.betsOpen)}       icon={<IconReceipt size={16} />} />
        <Stat label="Live matches"         value={numFmt(data?.kpis?.liveMatches)}    icon={<IconLive size={16} />} />
        <Stat label="Fraud alerts · 24h"   value={numFmt((data?.kpis?.auditCritical24h || 0) + (data?.kpis?.auditWarning24h || 0))} icon={<IconShield size={16} />} accent="linear-gradient(135deg,#ff5d6c,#ff5fb1)" />
      </div>

      {/* main charts */}
      <div className="adm-grid cols-8-4">
        <Card title="Revenue & stake — last 30 days" subtitle="GGR vs gross stake, daily."
              pill={<Badge tone="brand" dot>Live</Badge>}>
          {loading ? <ChartSkeleton h={260} /> : (
            <>
              <div className="adm-legend" style={{ marginBottom: 8 }}>
                <span className="lg" style={{ '--c': '#7c5cff' }}>GGR</span>
                <span className="lg" style={{ '--c': '#22d3ee' }}>Stake</span>
              </div>
              <LineChart
                height={260}
                yFormat={moneyShort}
                series={[
                  { key: 'ggr',   label: 'GGR',   color: '#7c5cff', data: (charts?.revenueByDay || []).map((d) => ({ date: d.date, y: d.revenue })) },
                  { key: 'stake', label: 'Stake', color: '#22d3ee', data: (charts?.betsByDay     || []).map((d) => ({ date: d.date, y: d.stake })) },
                ]}
              />
            </>
          )}
        </Card>

        <Card title="System health" subtitle="Realtime platform vitals">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <HealthRow label="API"          ok={data?.health?.api === 'ok'} value="200 OK · all routes" />
            <HealthRow label="Odds feed"    ok={data?.health?.oddsApi?.enabled ?? false} value={data?.health?.oddsApi?.enabled ? `Live · ${data?.health?.oddsApi?.lastFetchAt || '—'}` : 'Using cached fixtures'} />
            <HealthRow label="SMTP"         ok={data?.health?.smtp} value={data?.health?.smtp ? 'Outbound mail OK' : 'Console mode (dev)'} />
            <HealthRow label="Google OAuth" ok={data?.health?.google} value={data?.health?.google ? 'Configured' : 'Disabled'} />
            <div className="adm-kv">
              <dt>Uptime</dt><dd>{prettyUptime(data?.health?.uptimeSec)}</dd>
              <dt>Memory</dt><dd>{data?.health?.memoryMb ?? '—'} MB</dd>
              <dt>Online admins</dt><dd>{numFmt(data?.kpis?.onlineAdmins)}</dd>
              <dt>Audit events</dt><dd>{numFmt(data?.kpis?.auditTotal)}</dd>
            </div>
          </div>
        </Card>
      </div>

      <div className="adm-grid cols-7-5">
        <Card title="Daily bets" subtitle="Count of placed bets per day">
          {loading ? <ChartSkeleton h={220} /> : (
            <BarChart height={220} color="#22d3ee" data={(charts?.betsByDay || []).map((d) => ({ date: d.date, value: d.bets }))} />
          )}
        </Card>
        <Card title="User growth" subtitle="New signups per day">
          {loading ? <ChartSkeleton h={220} /> : (
            <LineChart height={220} series={[{ key: 'g', label: 'Signups', color: '#0E8A4A', data: (charts?.userGrowth || []).map((d) => ({ date: d.date, y: d.value })) }]} />
          )}
        </Card>
      </div>

      <div className="adm-grid cols-7-5">
        <Card title="Bet status distribution" subtitle="All-time mix of bet outcomes">
          {loading ? <ChartSkeleton h={220} /> : (
            <PieChart data={(charts?.statusMix || []).map((s) => ({ label: s.status, value: s.count }))} />
          )}
        </Card>
        <Card title="Sport mix" subtitle="Share of stake by sport">
          {loading ? <ChartSkeleton h={220} /> : (
            <PieChart data={(charts?.sportShare || []).map((s) => ({ label: s.sport, value: s.stake }))} />
          )}
        </Card>
      </div>

      <Card title="Betting activity heatmap" subtitle="Bets placed per hour-of-day in the last 7 days">
        {loading ? <ChartSkeleton h={170} /> : <Heatmap matrix={charts?.heatmap || []} />}
      </Card>

      <div className="adm-grid cols-7-5">
        <Card title="Recent activity" subtitle="Latest user-side events"
              action={<Badge tone="info"><IconActivity size={12} /> Live</Badge>}>
          {!data?.recent?.length ? <Empty title="No activity yet" subtitle="Once players sign in and place bets you'll see them here." /> : (
            <div className="adm-list-feed">
              {data.recent.map((r, i) => (
                <div key={i} className="row">
                  <span className={`dot ${r.kind?.includes('failed') ? 'danger' : r.kind?.includes('cash') ? 'success' : r.kind?.includes('admin') ? 'warn' : ''}`} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{prettyKind(r.kind)}</div>
                    <div className="meta">{r.user}</div>
                  </div>
                  <div className="meta">{ago(r.at)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Risk & fraud alerts" subtitle="Audit events flagged by AI / rules"
              action={<Badge tone="danger" dot>{data?.kpis?.auditCritical24h || 0} critical</Badge>}>
          {!data?.alerts?.length ? <Empty title="No alerts" subtitle="The platform looks clean for the past 24h." /> : (
            <div className="adm-list-feed">
              {data.alerts.map((a) => (
                <div key={a.id} className="row">
                  <span className={`dot ${a.severity === 'critical' ? 'danger' : 'warn'}`} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{a.action}</div>
                    <div className="meta">{a.target || '—'} · {a.meta?.signal || a.severity}</div>
                  </div>
                  <div className="meta">{ago(a.at)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div style={{ color: 'var(--text-mute)', fontSize: 12, textAlign: 'right' }}>
        Snapshot generated {data?.generatedAt ? ago(data.generatedAt) : '—'}{refreshing && <> · <Spinner label="syncing" /></>}
      </div>
    </>
  );
}

function HealthRow({ label, ok, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{
        width: 10, height: 10, borderRadius: 50,
        background: ok ? 'var(--accent)' : 'var(--warn)',
        boxShadow: `0 0 0 4px ${ok ? 'rgba(14,138,74,.16)' : 'rgba(255,181,71,.16)'}`,
      }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{value}</div>
      </div>
    </div>
  );
}

function ChartSkeleton({ h = 220 }) {
  return <div className="adm-skel" style={{ height: h, borderRadius: 12 }} />;
}

function prettyUptime(sec) {
  if (!sec && sec !== 0) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

function prettyKind(k) {
  if (!k) return 'Event';
  return String(k).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

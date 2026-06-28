/**
 * Deep analytics dashboard. Live data, fully responsive.
 */
import { useEffect, useState } from 'react';
import {
  adminStatsSummary, adminStatsDaily, adminStatsTopPlayers,
  adminStatsSports, adminStatsCohorts, adminStatsFunnel,
} from '../../api/adminApi.js';
import { Card, Stat, Badge, Empty, moneyFmt, numFmt } from '../../components/admin/primitives.jsx';
import { LineChart, BarChart, PieChart } from '../../components/admin/charts.jsx';
import {
  IconChart, IconCash, IconUsers, IconActivity, IconArrowUp, IconSparkles, IconRefresh,
} from '../../components/admin/Icons.jsx';

export default function StatsAdmin() {
  const [windowDays, setWindowDays] = useState(30);
  const [summary, setSummary] = useState(null);
  const [daily, setDaily]     = useState([]);
  const [top, setTop]         = useState({ topStakers: [], topWinners: [], topLosers: [] });
  const [sports, setSports]   = useState([]);
  const [cohorts, setCohorts] = useState([]);
  const [funnel, setFunnel]   = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [s, d, t, sp, c, f] = await Promise.all([
        adminStatsSummary(windowDays),
        adminStatsDaily(windowDays),
        adminStatsTopPlayers(),
        adminStatsSports(),
        adminStatsCohorts(8),
        adminStatsFunnel(),
      ]);
      setSummary(s); setDaily(d.series || []); setTop(t);
      setSports(sp.sports || []); setCohorts(c.cohorts || []); setFunnel(f.funnel || []);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [windowDays]);

  const moneyShort = (n) => {
    const v = Number(n) || 0;
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return v.toFixed(0);
  };

  return (
    <>
      <header className="adm-page-head">
        <div>
          <h1>Analytics</h1>
          <p>Deep behavioural, financial and risk analytics. Time window updates everything below.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="adm-select" style={{ height: 36 }} value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button className="adm-btn" onClick={load}><IconRefresh size={14} /> Refresh</button>
        </div>
      </header>

      <div className="adm-stat-grid">
        <Stat label="GGR" value={moneyFmt(summary?.ggr)} icon={<IconCash size={16} />} accent="linear-gradient(135deg,#7c5cff,#22d3ee)" delta={summary?.ggr >= 0 ? { direction: 'up', label: `${summary?.hold || 0}% hold` } : { direction: 'down', label: 'negative' }} />
        <Stat label="Stake" value={moneyFmt(summary?.stake)} icon={<IconActivity size={16} />} accent="linear-gradient(135deg,#22d3ee,#0E8A4A)" />
        <Stat label="ARPU" value={moneyFmt(summary?.arpu)} icon={<IconArrowUp size={16} />} />
        <Stat label="Active players" value={numFmt(summary?.playerCount)} icon={<IconUsers size={16} />} />
        <Stat label="New signups" value={numFmt(summary?.newSignups)} icon={<IconSparkles size={16} />} />
        <Stat label="Net deposits" value={moneyFmt(summary?.netDeposits)} icon={<IconCash size={16} />} />
        <Stat label="Settle rate" value={`${summary?.settleRate ?? 0}%`} icon={<IconChart size={16} />} />
        <Stat label="Payouts" value={moneyFmt(summary?.payouts)} icon={<IconCash size={16} />} />
      </div>

      <div className="adm-grid cols-7-5">
        <Card title={`DAU vs new signups · last ${windowDays} days`} subtitle="Daily active bettors against new registrations">
          <div className="adm-legend" style={{ marginBottom: 8 }}>
            <span className="lg" style={{ '--c': '#7c5cff' }}>DAU</span>
            <span className="lg" style={{ '--c': '#0E8A4A' }}>New signups</span>
          </div>
          <LineChart
            height={260}
            yFormat={(v) => v}
            series={[
              { key: 'dau', label: 'DAU', color: '#7c5cff', data: daily.map((d) => ({ date: d.date, y: d.dau })) },
              { key: 'sgn', label: 'Signups', color: '#0E8A4A', data: daily.map((d) => ({ date: d.date, y: d.newSignups })) },
            ]}
          />
        </Card>
        <Card title="Acquisition funnel" subtitle="From signup to repeat betting">
          {funnel.length === 0 ? <Empty title="No data" /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {funnel.map((step, i) => {
                const top = funnel[0]?.value || 1;
                const pct = (step.value / top) * 100;
                return (
                  <div key={step.stage}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, marginBottom: 4 }}>
                      <span>{step.stage}</span>
                      <strong>{numFmt(step.value)}<span style={{ color: 'var(--text-dim)', fontWeight: 400 }}> · {pct.toFixed(1)}%</span></strong>
                    </div>
                    <div className="adm-progress"><i style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <div className="adm-grid cols-7-5">
        <Card title="Daily bets" subtitle="Volume per day">
          <BarChart height={220} data={daily.map((d) => ({ date: d.date, value: d.bets }))} />
        </Card>
        <Card title="Sport mix · GGR" subtitle="Hold by sport">
          {sports.length === 0 ? <Empty title="No data" /> : (
            <PieChart data={sports.map((s) => ({ label: s.sport, value: s.ggr }))} />
          )}
        </Card>
      </div>

      <Card title="Cohort retention" subtitle="Weekly cohorts × weeks since signup. Cell = % returning to bet that week.">
        {cohorts.length === 0 ? <Empty title="Not enough data yet" /> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Week</th>
                  <th className="num">Size</th>
                  {Array.from({ length: cohorts[0]?.retention?.length || 8 }).map((_, i) => (
                    <th key={i} className="num">W+{i}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohorts.map((c) => (
                  <tr key={c.week}>
                    <td>{c.week}</td>
                    <td className="num">{c.size}</td>
                    {c.retention.map((r, i) => {
                      const pct = r.pct;
                      const bg = pct === 0 ? 'transparent' : `rgba(124,92,255,${0.1 + Math.min(pct / 100, 0.9)})`;
                      return (
                        <td key={i} className="num" style={{ background: bg, fontWeight: pct > 0 ? 600 : 400 }}>
                          {pct > 0 ? `${pct}%` : '·'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="adm-grid c2">
        <Card title="Top stakers">
          <PlayersTable rows={top.topStakers} kind="stake" />
        </Card>
        <Card title="Top winners (net)">
          <PlayersTable rows={top.topWinners} kind="net" tone="success" />
        </Card>
      </div>

      <Card title="Sportsbook performance">
        {sports.length === 0 ? <Empty title="No sport data yet" /> : (
          <table className="adm-table">
            <thead><tr><th>Sport</th><th className="num">Bets</th><th className="num">Stake</th><th className="num">Payouts</th><th className="num">GGR</th><th className="num">Hold %</th><th className="num">Win rate</th></tr></thead>
            <tbody>
              {sports.map((s) => (
                <tr key={s.sport}>
                  <td><Badge tone="brand">{s.sport}</Badge></td>
                  <td className="num">{numFmt(s.bets)}</td>
                  <td className="num">{moneyFmt(s.stake)}</td>
                  <td className="num">{moneyFmt(s.payouts)}</td>
                  <td className="num"><strong style={{ color: s.ggr >= 0 ? 'var(--accent)' : 'var(--danger)' }}>{moneyFmt(s.ggr)}</strong></td>
                  <td className="num">{s.holdPct}%</td>
                  <td className="num">{s.winRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

function PlayersTable({ rows, kind, tone }) {
  if (!rows?.length) return <Empty title="No players yet" />;
  return (
    <table className="adm-table">
      <thead><tr><th>Player</th><th className="num">Bets</th><th className="num">Stake</th><th className="num">Net</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.userId}>
            <td>
              <div style={{ fontWeight: 600 }}>{r.displayName || r.email}</div>
              <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{r.userId}</div>
            </td>
            <td className="num">{numFmt(r.bets)}</td>
            <td className="num">{moneyFmt(r.stake)}</td>
            <td className="num">
              <strong style={{ color: r.net >= 0 ? 'var(--accent)' : 'var(--danger)' }}>{moneyFmt(r.net)}</strong>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Health dashboard: 24-hour rolling charts for request volume, p95
 * latency, error rate, and odds-feed lag. Data comes from
 * /api/admin/dashboard/health/metrics — a per-minute ring buffer
 * filled by the request-metrics middleware and the odds aggregator.
 *
 * Charts are vanilla SVG sparklines so the page has zero chart-lib
 * dependency cost. Refreshes every 30 seconds.
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, Badge, Spinner, Empty } from '../../components/admin/primitives.jsx';
import { adminHealthMetrics } from '../../api/adminApi.js';
import { IconActivity, IconAlert, IconLive, IconBot } from '../../components/admin/Icons.jsx';

const REFRESH_MS = 30_000;

function fmtMs(n) {
  if (!n) return '—';
  if (n < 10)   return `${n.toFixed(1)} ms`;
  if (n < 1000) return `${Math.round(n)} ms`;
  return `${(n / 1000).toFixed(2)} s`;
}

function fmtPct(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return `${(n * 100).toFixed(2)}%`;
}

function Sparkline({ data, height = 56, stroke = '#7c5cff', fill = 'rgba(124,92,255,0.18)' }) {
  if (!data || data.length === 0) return <div style={{ height, color: 'var(--text-dim)', fontSize: 12 }}>No data</div>;
  const max = Math.max(1, ...data);
  const w = 600;
  const stepX = w / Math.max(1, data.length - 1);
  let d = '';
  data.forEach((v, i) => {
    const x = i * stepX;
    const y = height - (v / max) * (height - 4) - 2;
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)} `;
  });
  const dFill = `${d} L${(data.length - 1) * stepX},${height} L0,${height} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" width="100%" height={height} aria-hidden="true">
      <path d={dFill} fill={fill} />
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function tone(value, { warnAt, dangerAt }) {
  if (value == null) return 'default';
  if (value >= dangerAt) return 'danger';
  if (value >= warnAt)   return 'warn';
  return 'success';
}

export default function HealthPage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () => adminHealthMetrics()
      .then((r) => { if (alive) { setData(r); setErr(''); } })
      .catch((e) => { if (alive) setErr(e.message || 'Could not load metrics.'); });
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const series = useMemo(() => {
    if (!data?.buckets) return null;
    return {
      reqs:    data.buckets.map((b) => b.reqs),
      p95:     data.buckets.map((b) => b.p95Ms),
      errPct:  data.buckets.map((b) => b.errorRate * 100),
      oddsLag: data.buckets.map((b) => b.oddsP50Ms),
    };
  }, [data]);

  const s = data?.summary;
  const r = data?.runtime;

  return (
    <>
      <header className="adm-page-head">
        <div>
          <h1>Health</h1>
          <p>Request volume, latency, error rate, and odds-feed lag over the last 24 hours.</p>
        </div>
        <Badge tone="info" dot>Refreshes 30s</Badge>
      </header>

      {err && <div className="err" style={{ marginBottom: 12 }}>{err}</div>}
      {!data && !err && <Spinner />}

      {data && (
        <>
          <div className="adm-grid c4" style={{ marginBottom: 18 }}>
            <Card title="Uptime (24h)">
              <div style={{ fontSize: 28, fontWeight: 800 }}>
                {s ? `${s.uptimePct.toFixed(2)}%` : '—'}
              </div>
              <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                Active minutes without 5xx errors
              </div>
            </Card>
            <Card title="p95 latency (24h)">
              <div style={{ fontSize: 28, fontWeight: 800 }}>{fmtMs(s?.p95Ms)}</div>
              <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                p50 {fmtMs(s?.p50Ms)} · p99 {fmtMs(s?.p99Ms)}
              </div>
            </Card>
            <Card title="Error rate (24h)">
              <div style={{ fontSize: 28, fontWeight: 800 }}>{s ? fmtPct(s.errorRate24h) : '—'}</div>
              <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                {s ? `${s.errors24h} / ${s.requests24h} requests` : '—'} · 4xx {s?.clientErrors24h ?? 0}
              </div>
            </Card>
            <Card title="Odds-feed lag (24h)">
              <div style={{ fontSize: 28, fontWeight: 800 }}>{fmtMs(s?.oddsP95Ms)}</div>
              <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                p50 {fmtMs(s?.oddsP50Ms)} · max {fmtMs(s?.oddsMaxMs)} · {s?.oddsSamples ?? 0} samples
              </div>
            </Card>
          </div>

          <div className="adm-grid c2" style={{ marginBottom: 18 }}>
            <Card title="Requests per minute" subtitle="Last 24h" pill={<Badge tone="brand"><IconActivity size={12} /> Traffic</Badge>}>
              {series && series.reqs.some((v) => v > 0)
                ? <Sparkline data={series.reqs} stroke="#7c5cff" fill="rgba(124,92,255,0.18)" />
                : <Empty title="No traffic yet" subtitle="Charts populate once requests are recorded." />}
            </Card>
            <Card title="p95 latency (ms)" subtitle="Last 24h" pill={<Badge tone={tone(s?.p95Ms, { warnAt: 500, dangerAt: 1500 })} dot>p95 {fmtMs(s?.p95Ms)}</Badge>}>
              {series && series.p95.some((v) => v > 0)
                ? <Sparkline data={series.p95} stroke="#18f0a1" fill="rgba(24,240,161,0.15)" />
                : <Empty title="No latency samples" />}
            </Card>
            <Card title="Error rate (%)" subtitle="Last 24h" pill={<Badge tone={tone(s?.errorRate24h * 100, { warnAt: 1, dangerAt: 5 })} dot>{s ? fmtPct(s.errorRate24h) : '—'}</Badge>}>
              {series && series.errPct.some((v) => v > 0)
                ? <Sparkline data={series.errPct} stroke="#ff5d5d" fill="rgba(255,93,93,0.18)" />
                : <Empty title="No errors recorded" subtitle="That's the goal — keep it that way." />}
            </Card>
            <Card title="Odds-feed lag (ms)" subtitle="Last 24h · per-provider fetch" pill={<Badge tone={tone(s?.oddsP95Ms, { warnAt: 1500, dangerAt: 5000 })} dot><IconBot size={12} /> p95 {fmtMs(s?.oddsP95Ms)}</Badge>}>
              {series && series.oddsLag.some((v) => v > 0)
                ? <Sparkline data={series.oddsLag} stroke="#f5a623" fill="rgba(245,166,35,0.18)" />
                : <Empty title="No odds samples" subtitle="Aggregator hasn't logged a fetch yet." />}
            </Card>
          </div>

          <div className="adm-grid c2">
            <Card title="Runtime">
              <dl className="adm-kv">
                <dt>Uptime</dt><dd>{r ? `${Math.floor(r.uptimeSec / 60)} min` : '—'}</dd>
                <dt>Memory (RSS)</dt><dd>{r?.memoryMb ?? '—'} MB</dd>
                <dt>Node</dt><dd>{r?.nodeVersion || '—'}</dd>
                <dt>PID</dt><dd>{r?.pid ?? '—'}</dd>
                <dt>SMTP</dt><dd>{r?.smtp ? <Badge tone="success">Configured</Badge> : <Badge tone="warn">Console</Badge>}</dd>
                <dt>Google OAuth</dt><dd>{r?.google ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}</dd>
              </dl>
            </Card>
            <Card title="Odds API">
              <dl className="adm-kv">
                <dt>Key</dt><dd>{r?.oddsApi?.keyConfigured ? <Badge tone="success">Configured</Badge> : <Badge tone="warn">Missing</Badge>}</dd>
                <dt>Requests remaining</dt><dd>{r?.oddsApi?.requestsRemaining ?? '—'}</dd>
                <dt>Requests used</dt><dd>{r?.oddsApi?.requestsUsed ?? '—'}</dd>
                <dt>Cache entries</dt><dd>{r?.oddsApi?.cacheSize ?? '—'}</dd>
                <dt>Cache TTL</dt><dd>{r?.oddsApi?.ttlMinutes ?? '—'} min</dd>
              </dl>
            </Card>
          </div>

          <div style={{ marginTop: 14, color: 'var(--text-dim)', fontSize: 12 }}>
            Generated {data.generatedAt ? new Date(data.generatedAt).toLocaleTimeString() : '—'}
            {' · '}
            <span style={{ marginLeft: 4 }}>
              <IconLive size={12} /> Window: {data.windowMinutes} min · Bucket: {Math.round((data.bucketMs || 60000) / 1000)} s
            </span>
            {/* IconAlert kept available for future per-bucket drilldown */}
            <IconAlert size={1} style={{ opacity: 0 }} />
          </div>
        </>
      )}
    </>
  );
}

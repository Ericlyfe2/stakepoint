/**
 * Pure-SVG charts. No external deps — keeps the bundle small and the visuals
 * fully under our control. Each chart accepts plain arrays of points and
 * renders a sharp, responsive vector.
 */
import { useMemo, useState } from 'react';

const NS = 'http://www.w3.org/2000/svg';

function pathSmooth(points) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const cpx = (p0.x + p1.x) / 2;
    d += ` C${cpx},${p0.y} ${cpx},${p1.y} ${p1.x},${p1.y}`;
  }
  return d;
}

function niceMax(v) {
  if (!Number.isFinite(v) || v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = v / Math.pow(10, exp);
  const nice = base <= 1 ? 1 : base <= 2 ? 2 : base <= 5 ? 5 : 10;
  return nice * Math.pow(10, exp);
}

export function Sparkline({ data = [], width = 120, height = 36, stroke = '#7c5cff', fill = 'rgba(124,92,255,.18)' }) {
  if (!data.length) return <svg className="adm-spark" viewBox={`0 0 ${width} ${height}`} width="100%" height={height} />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;
  const pts = data.map((v, i) => ({ x: i * stepX, y: height - ((v - min) / span) * (height - 4) - 2 }));
  const line = pathSmooth(pts);
  const area = `${line} L${width},${height} L0,${height} Z`;
  return (
    <svg className="adm-spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" width="100%" height={height}>
      <path d={area} fill={fill} />
      <path d={line} stroke={stroke} strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Multi-series line / area chart with hover tooltip.
 * series = [{ key, label, color, data: [{ x: 'date', y: number }] }]
 */
export function LineChart({
  series = [],
  height = 220,
  area = true,
  yFormat = (v) => v,
  labelKey = 'date',
}) {
  const W = 800;
  const padL = 38, padR = 12, padT = 14, padB = 26;
  const innerW = W - padL - padR;
  const innerH = height - padT - padB;

  const all = series.flatMap((s) => s.data || []);
  const xs = all.map((p) => p[labelKey]);
  const uniqXs = Array.from(new Set(xs));
  const max = niceMax(Math.max(0, ...all.map((p) => Number(p.y) || 0)));
  const yTicks = [0, max * 0.25, max * 0.5, max * 0.75, max];

  const xIdx = new Map(uniqXs.map((x, i) => [x, i]));
  const xStep = uniqXs.length > 1 ? innerW / (uniqXs.length - 1) : innerW;

  const [hover, setHover] = useState(null);

  const seriesGeom = useMemo(() => series.map((s) => {
    const points = (s.data || []).map((p) => ({
      x: padL + xIdx.get(p[labelKey]) * xStep,
      y: padT + innerH - (Number(p.y) || 0) / max * innerH,
      raw: p,
    }));
    const linePath = pathSmooth(points);
    const areaPath = points.length
      ? `${linePath} L${padL + (points.length - 1) * xStep},${padT + innerH} L${padL},${padT + innerH} Z`
      : '';
    return { ...s, points, linePath, areaPath };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [series, max, xStep, innerH, innerW]);

  function onMove(e) {
    const svg = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - svg.left) / svg.width) * W;
    if (!uniqXs.length) return;
    const i = Math.max(0, Math.min(uniqXs.length - 1, Math.round((x - padL) / xStep)));
    const xv = uniqXs[i];
    const values = series.map((s) => s.data?.find((p) => p[labelKey] === xv));
    setHover({ x: padL + i * xStep, label: xv, values });
  }

  return (
    <div style={{ position: 'relative' }} onMouseLeave={() => setHover(null)}>
      <svg className="adm-chart-svg" viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none"
           onMouseMove={onMove}>
        {/* grid + y axis */}
        {yTicks.map((t, i) => {
          const y = padT + innerH - (t / max) * innerH;
          return (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="rgba(255,255,255,.05)" />
              <text x={padL - 8} y={y + 3} fontSize="10" fill="rgba(180,185,210,.65)" textAnchor="end">{yFormat(t)}</text>
            </g>
          );
        })}
        {/* x ticks (sparse) */}
        {uniqXs.map((x, i) => {
          if (i % Math.ceil(uniqXs.length / 7) !== 0 && i !== uniqXs.length - 1) return null;
          const xx = padL + i * xStep;
          return <text key={i} x={xx} y={height - 8} fontSize="10" fill="rgba(180,185,210,.7)" textAnchor="middle">{String(x).slice(5)}</text>;
        })}

        {/* series */}
        {seriesGeom.map((s, idx) => (
          <g key={s.key || idx}>
            {area && <path d={s.areaPath} fill={s.color || '#7c5cff'} opacity=".14" />}
            <path d={s.linePath} fill="none" stroke={s.color || '#7c5cff'} strokeWidth="2.2" strokeLinecap="round" />
            {hover && (() => {
              const idx2 = uniqXs.indexOf(hover.label);
              const pt = s.points[idx2];
              return pt ? <circle cx={pt.x} cy={pt.y} r="4" fill={s.color || '#7c5cff'} stroke="rgba(0,0,0,.5)" strokeWidth="1.5" /> : null;
            })()}
          </g>
        ))}

        {hover && <line x1={hover.x} x2={hover.x} y1={padT} y2={padT + innerH} stroke="rgba(255,255,255,.18)" strokeDasharray="3 3" />}
      </svg>
      {hover && (
        <div className="adm-chart-tip" style={{ left: `${(hover.x / W) * 100}%`, top: 8, transform: 'translateX(-50%)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>{hover.label}</div>
          {series.map((s, i) => (
            <div key={s.key || i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color || '#7c5cff', display: 'inline-block' }} />
              <span style={{ color: 'var(--text-dim)' }}>{s.label || s.key}</span>
              <strong style={{ marginLeft: 'auto' }}>{yFormat(hover.values[i]?.y ?? 0)}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function BarChart({ data = [], height = 220, color = '#22d3ee', yFormat = (v) => v, labelKey = 'date', valueKey = 'value' }) {
  const W = 800;
  const padL = 38, padR = 12, padT = 14, padB = 26;
  const innerW = W - padL - padR;
  const innerH = height - padT - padB;
  const values = data.map((d) => Number(d[valueKey]) || 0);
  const max = niceMax(Math.max(0, ...values));
  const yTicks = [0, max * 0.5, max];
  const bw = Math.max(2, (innerW / Math.max(data.length, 1)) - 4);
  const [hover, setHover] = useState(null);

  return (
    <div style={{ position: 'relative' }} onMouseLeave={() => setHover(null)}>
      <svg className="adm-chart-svg" viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none">
        {yTicks.map((t, i) => {
          const y = padT + innerH - (t / max) * innerH;
          return (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="rgba(255,255,255,.05)" />
              <text x={padL - 8} y={y + 3} fontSize="10" fill="rgba(180,185,210,.65)" textAnchor="end">{yFormat(t)}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const v = Number(d[valueKey]) || 0;
          const x = padL + (innerW / Math.max(data.length, 1)) * i + 2;
          const h = (v / max) * innerH;
          const y = padT + innerH - h;
          return (
            <g key={i}
               onMouseEnter={() => setHover({ x: x + bw / 2, label: d[labelKey], value: v })}
               onMouseLeave={() => setHover(null)}>
              <rect x={x} y={y} width={bw} height={h} rx="3" fill={color} opacity=".82" />
              <rect x={x} y={padT} width={bw} height={innerH} fill="transparent" />
            </g>
          );
        })}
        {/* x labels */}
        {data.map((d, i) => {
          if (i % Math.ceil(data.length / 7) !== 0 && i !== data.length - 1) return null;
          const x = padL + (innerW / Math.max(data.length, 1)) * i + bw / 2 + 2;
          return <text key={i} x={x} y={height - 8} fontSize="10" fill="rgba(180,185,210,.7)" textAnchor="middle">{String(d[labelKey]).slice(5)}</text>;
        })}
      </svg>
      {hover && (
        <div className="adm-chart-tip" style={{ left: `${(hover.x / W) * 100}%`, top: 4, transform: 'translateX(-50%)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{hover.label}</div>
          <strong>{yFormat(hover.value)}</strong>
        </div>
      )}
    </div>
  );
}

export function PieChart({ data = [], size = 200, donut = 0.62, palette = ['#7c5cff', '#22d3ee', '#0E8A4A', '#ffb547', '#ff5d6c', '#ff5fb1', '#4f8bff'] }) {
  const total = data.reduce((s, d) => s + (Number(d.value) || 0), 0) || 1;
  let a = -Math.PI / 2;
  const r = size / 2;
  const ri = r * donut;
  const slices = data.map((d, i) => {
    const v = Number(d.value) || 0;
    const ang = (v / total) * Math.PI * 2;
    const a0 = a;
    const a1 = a + ang;
    a = a1;
    const large = ang > Math.PI ? 1 : 0;
    const x0 = r + r * Math.cos(a0), y0 = r + r * Math.sin(a0);
    const x1 = r + r * Math.cos(a1), y1 = r + r * Math.sin(a1);
    const xi1 = r + ri * Math.cos(a1), yi1 = r + ri * Math.sin(a1);
    const xi0 = r + ri * Math.cos(a0), yi0 = r + ri * Math.sin(a0);
    const path = `M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} L${xi1},${yi1} A${ri},${ri} 0 ${large} 0 ${xi0},${yi0} Z`;
    return { path, color: d.color || palette[i % palette.length], label: d.label, value: v, pct: (v / total * 100).toFixed(1) };
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        {slices.map((s, i) => <path key={i} d={s.path} fill={s.color} stroke="var(--bg-1)" strokeWidth="1.5" />)}
      </svg>
      <div className="adm-legend" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
        {slices.map((s, i) => (
          <span key={i} className="lg" style={{ '--c': s.color }}>
            {s.label} · <strong style={{ color: 'var(--text)' }}>{s.pct}%</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

export function Heatmap({ matrix = [], rows = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] }) {
  const max = Math.max(1, ...matrix.flat());
  const intensityFor = (v) => {
    if (!v) return 0;
    const r = v / max;
    if (r > 0.66) return 4;
    if (r > 0.33) return 3;
    if (r > 0.16) return 2;
    return 1;
  };
  return (
    <div className="adm-heatmap">
      <div className="h-lbl" />
      {Array.from({ length: 24 }).map((_, i) => (
        <div key={i} className="h-lbl" style={{ textAlign: 'center' }}>{i % 4 === 0 ? `${i.toString().padStart(2, '0')}:00` : ''}</div>
      ))}
      {matrix.flatMap((row, ri) => [
        <div key={`r${ri}`} className="h-lbl">{rows[ri]}</div>,
        ...row.map((v, ci) => (
          <div key={`${ri}-${ci}`} className="cell" data-int={intensityFor(v)} title={`${rows[ri]} ${ci}:00 — ${v} bets`} />
        )),
      ])}
    </div>
  );
}

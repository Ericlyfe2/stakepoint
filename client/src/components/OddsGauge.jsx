import { useEffect, useRef, useState } from 'react';

export default function OddsGauge({ odds = 0, size = 80 }) {
  const [animOdds, setAnimOdds] = useState(0);
  const prevOdds = useRef(0);

  useEffect(() => {
    const start = prevOdds.current;
    const end = odds;
    const duration = 600;
    const startTime = performance.now();

    const tick = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimOdds(start + (end - start) * eased);
      if (t < 1) requestAnimationFrame(tick);
      else prevOdds.current = end;
    };
    requestAnimationFrame(tick);
  }, [odds]);

  const r = (size - 10) / 2;
  const circumference = 2 * Math.PI * r;
  const maxOdds = 100;
  const pct = Math.min(animOdds / maxOdds, 1);
  const dashOffset = circumference * (1 - pct);

  return (
    <div className="odds-gauge" style={{ width: size, height: size, position: 'relative' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-2, #1a2421)"
          strokeWidth="5"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent, #c5ff3d)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{
            transition: 'stroke-dashoffset 0.6s cubic-bezier(.4,0,.2,1)',
            filter: 'drop-shadow(0 0 6px rgba(197, 255, 61, 0.4))',
          }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
        }}
      >
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 800,
            fontSize: size * 0.22,
            color: 'var(--text, #ecf0ee)',
            lineHeight: 1,
          }}
        >
          {animOdds.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

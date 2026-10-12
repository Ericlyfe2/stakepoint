import { useMemo } from 'react';
import { momentumBlocks } from './stitchSeed.js';
import { Ic } from './parts.jsx';

/* ---------------------------------------------------------------------------
   Live-tracker visualisations (Stitch screen 12d2c727…)

   PitchVisualizer  tactical radar canvas — markings, heat bloom, attack vector,
                    pulsing ball, free-kick beacon, HUD rows.
   MomentumChart    15 five-minute pressure blocks derived from the fixture's
                    real goal events.
   StatBar          symmetric possession / shots / attacks / corners / cards.
   EventTimeline    reverse-chronological match feed.
   ------------------------------------------------------------------------- */

export function PitchVisualizer({ alert, homeName, awayName }) {
  return (
    <div className="stx-pitchbox">
      <div className="stx-pitch-lines" aria-hidden="true">
        <span className="stx-pl-mid" />
        <span className="stx-pl-circle" />
        <span className="stx-pl-dot" />
        <span className="stx-pl-box stx-pl-box--l" />
        <span className="stx-pl-box stx-pl-box--r" />
        <span className="stx-pl-goal" />
      </div>

      <div className="stx-pitch-heat" aria-hidden="true" />

      <div className="stx-pitch-hud">
        <span className="stx-hud-chip">
          <Ic name="◉" size="sm" /> LIVE RADAR — ILLUSTRATIVE PITCH MAP
        </span>
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span className="stx-hud-chip">
            <i className="stx-leg-dot stx-leg-dot--home" /> {homeName || 'Home'}
          </span>
          <span className="stx-hud-chip">
            <i className="stx-leg-dot stx-leg-dot--away" /> {awayName || 'Away'}
          </span>
        </span>
      </div>

      <div className="stx-pitch-nodes">
        <div className="stx-attack" aria-hidden="true">
          <span className="stx-attack-vec" />
          <span className="stx-ball">
            <span className="stx-ball-ring" />
            <span className="stx-ball-dot" />
          </span>
        </div>

        {alert && (
          <div className="stx-fk">
            <b><Ic name="⚑" size="sm" /> {alert.title}</b>
            <span>{alert.note}</span>
          </div>
        )}
      </div>

      <div className="stx-pitch-foot">
        <span>
          The radar is illustrative. The live feed supplies scores, the event
          timeline and in-play odds — not player positional tracking.
        </span>
      </div>
    </div>
  );
}

export function MomentumChart({ events, minute }) {
  const blocks = useMemo(() => momentumBlocks(events), [events]);

  return (
    <div className="stx-momentum">
      <div className="stx-momentum-head">
        <span className="stx-momentum-title">
          <Ic name="◱" size="sm" /> MATCH MOMENTUM — EVENT FEED (0&apos; – {minute || 0}&apos;)
        </span>
        <span className="stx-momentum-legend">
          <span className="stx-lg-home"><i /> Home events</span>
          <span className="stx-lg-away"><i /> Away events</span>
        </span>
      </div>

      <div className="stx-bars">
        {blocks.map((b) => {
          if (b.empty) {
            return (
              <span
                key={b.from}
                className="stx-bar stx-bar--none"
                style={{ height: '8%' }}
                title={`${b.from}–${b.to}' — no feed events`}
              />
            );
          }
          const home = b.home;
          const away = 1 - home;
          const homeLead = home >= away;
          const strength = Math.max(home, away);
          const cls = strength > 0.8 ? 'stx-bar--strong' : strength < 0.42 ? 'stx-bar--soft' : '';
          return (
            <span
              key={b.from}
              className={[
                'stx-bar',
                homeLead ? 'stx-bar--home' : 'stx-bar--away',
                cls,
              ].filter(Boolean).join(' ')}
              style={{ height: `${Math.round(strength * 100)}%` }}
              title={`${b.from}–${b.to}' ${homeLead ? 'Home' : 'Away'} ${Math.round(strength * 100)}% of events`}
            />
          );
        })}
      </div>

      <div className="stx-axis" aria-hidden="true">
        {blocks.map((b, i) => (
          <span key={b.from}>
            {i % 3 === 0 ? `${b.from}'` : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

const STAT_KEYS = [
  { key: 'goals', label: 'Goals' },
  { key: 'cards', label: 'Cards' },
];

export function StatBar({ stats }) {
  return (
    <div className="stx-stats">
      {STAT_KEYS.filter((k) => stats?.[k.key] != null).map((k) => {
        const home = Number(stats[k.key]?.home || 0);
        const away = Number(stats[k.key]?.away || 0);
        const sum = home + away;
        const pct = sum > 0 ? Math.round((home / sum) * 100) : 50;
        return (
          <div className="stx-stat" key={k.key}>
            <span className="stx-stat-v stx-stat-k--r">{home}{k.suffix || ''}</span>
            <span className="stx-stat-k">{k.label}</span>
            <span className="stx-stat-v">{away}{k.suffix || ''}</span>
            <span className="stx-stat-bar">
              <i style={{ width: `${pct}%` }} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

const KIND_ICON = {
  goal: '⚽',
  card: '▮',
  free_kick: '⚑',
  sub: '⇄',
  penalty: '⚽',
};

const KIND_CLASS = {
  goal: 'stx-tl--goal',
  card: 'stx-tl--card',
  free_kick: '',
  sub: '',
  penalty: 'stx-tl--goal',
};

export function EventTimeline({ events, minute }) {
  const list = useMemo(() => {
    if (!Array.isArray(events) || !events.length) return [];
    return [...events].sort((a, b) => (b.minute || 0) - (a.minute || 0));
  }, [events]);

  return (
    <div className="stx-timeline">
      <div className="stx-tl-head">
        <Ic name="◷" size="sm" /> TIMELINE: {minute}&apos;
      </div>
      <div className="stx-tl-list">
        {list.length === 0 && (
          <div className="stx-tl-item stx-tl--home">
            <span className="stx-tl-min">—</span>
            <span className="stx-tl-body">No in-play events yet.</span>
          </div>
        )}
        {list.map((e, i) => (
          <div
            className={[
              'stx-tl-item',
              KIND_CLASS[e.kind] || '',
              e.team === 'away' ? 'stx-tl--away' : 'stx-tl--home',
            ].filter(Boolean).join(' ')}
            key={`${e.kind}-${e.minute}-${i}`}
          >
            <span className="stx-tl-min">{e.minute}&apos;</span>
            <span className="stx-tl-body">
              <Ic name={KIND_ICON[e.kind] || '•'} size="sm" />
              {e.note || e.kind}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

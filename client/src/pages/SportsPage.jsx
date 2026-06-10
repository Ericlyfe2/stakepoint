/**
 * Sports — the "AZ Menu" tab from the Claude Design Oddsify.html port.
 * Sport-type pill row, segmented Live / Today / All filter, vertical match
 * list. Reads from /api/bet/matches (currently football only — when more
 * sports are wired, switch on the selected pill).
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchMatches } from '../api/betApi.js';
import { useSlip } from '../providers/SlipProvider.jsx';
import {
  T,
  OddPageHeader, OddSegmented, OddMatchCard, OddIcon,
} from '../components/odd/primitives.jsx';
import { flattenLeagues } from '../components/odd/normalize.js';

const SPORTS = [
  { id: 'football',   name: 'Soccer',     icon: 'soccer', enabled: true  },
  { id: 'basketball', name: 'Basketball', icon: 'basket', enabled: false },
  { id: 'tennis',     name: 'Tennis',     icon: 'tennis', enabled: false },
  { id: 'baseball',   name: 'Baseball',   icon: 'star',   enabled: false },
];

export default function SportsPage() {
  const navigate = useNavigate();
  const { picks, togglePick } = useSlip();
  const [activeSport, setActiveSport] = useState('football');
  const [matches, setMatches] = useState([]);
  const [filter, setFilter] = useState('live');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchMatches(activeSport)
      .then(d => { if (alive) setMatches(flattenLeagues(d)); })
      .catch(() => { if (alive) setMatches([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [activeSport]);

  const liveCount = useMemo(() => matches.filter(m => m.isLive).length, [matches]);
  const filtered = useMemo(() => {
    if (filter === 'live') return matches.filter(m => m.isLive);
    if (filter === 'soon') return matches.filter(m => !m.isLive);
    return matches;
  }, [filter, matches]);

  return (
    <div style={{ background: T.bg, minHeight: '100vh', paddingBottom: 120 }}>
      <OddPageHeader title="Sports" subtitle="Markets & live matches"
        right={
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '8px 12px 8px 10px', borderRadius: 999,
            background: T.greenBright, color: T.goldDark,
            fontWeight: 700, fontSize: 12,
          }}>
            <OddIcon name="bolt" size={14} color={T.goldDark} strokeWidth={2} />
            {liveCount} LIVE
          </div>
        }
      />

      {/* sport-type pills */}
      <div className="odd-pane" style={{
        padding: '14px 16px 0',
        display: 'flex', gap: 8, overflowX: 'auto',
      }}>
        {SPORTS.map(s => {
          const active = s.id === activeSport;
          return (
            <button key={s.id} type="button"
              disabled={!s.enabled}
              onClick={() => s.enabled && setActiveSport(s.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 12px', borderRadius: 999,
                background: active ? T.greenBright : T.surface,
                color: active ? T.goldDark : (s.enabled ? T.ink : T.inkDim),
                border: `1px solid ${active ? T.greenBright : T.line}`,
                whiteSpace: 'nowrap', flexShrink: 0,
                fontSize: 12, fontWeight: 600,
                cursor: s.enabled ? 'pointer' : 'not-allowed',
                opacity: s.enabled ? 1 : 0.6,
              }}>
              <OddIcon name={s.icon} size={14} color={active ? T.goldDark : T.ink} />
              {s.name}
              {!s.enabled && <span style={{
                fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 4,
                background: T.surfaceAlt, color: T.inkSoft, marginLeft: 2,
              }}>SOON</span>}
            </button>
          );
        })}
      </div>

      {/* live/today/all filter */}
      <div style={{
        padding: '14px 16px 8px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <OddSegmented
          options={[
            { value: 'live', label: `Live · ${liveCount}` },
            { value: 'soon', label: 'Today' },
            { value: 'all',  label: 'All' },
          ]}
          value={filter} onChange={setFilter}
        />
        <button type="button" aria-label="Sort"
          style={{
            width: 36, height: 36, borderRadius: 10,
            background: T.surface, border: `1px solid ${T.line}`,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: T.ink,
          }}>
          <OddIcon name="menu" size={16} color={T.ink} />
        </button>
      </div>

      <div style={{ padding: '6px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          [0, 1, 2].map(i => (
            <div key={i} style={{
              height: 168, borderRadius: 16, background: T.greenDeep,
              border: '1px solid rgba(255,255,255,0.05)', opacity: 0.5 + i * 0.15,
            }} />
          ))
        ) : filtered.length === 0 ? (
          <div style={{
            padding: '14px', borderRadius: 12, background: T.surface,
            border: `1px solid ${T.line}`, color: T.inkSoft,
            fontSize: 12, textAlign: 'center',
          }}>
            {filter === 'live' ? 'No live matches right now.' : 'Nothing scheduled.'}
          </div>
        ) : (
          filtered.map(m => (
            <OddMatchCard key={m.id} match={m} picks={picks}
              onPick={togglePick} />
          ))
        )}
      </div>
    </div>
  );
}

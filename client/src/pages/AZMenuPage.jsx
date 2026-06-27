import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const SPORTS = [
  { key: 'football', label: 'Football', icon: '⚽' },
  { key: 'basketball', label: 'Basketball', icon: '🏀' },
  { key: 'tennis', label: 'Tennis', icon: '🎾' },
  { key: 'volleyball', label: 'Beach Volleyball', icon: '🏐' },
  { key: 'futsal', label: 'Futsal', icon: '⚽' },
  { key: 'rugby', label: 'Rugby', icon: '🏉' },
  { key: 'snooker', label: 'Snooker', icon: '🎱' },
  { key: 'basketball3x3', label: 'Basketball 3x3', icon: '🏀' },
  { key: 'csgo', label: 'ESport Counter-Strike', icon: '🎮' },
  { key: 'dota', label: 'ESport Dota', icon: '🎮' },
  { key: 'lol', label: 'ESport League of Legends', icon: '🎮' },
  { key: 'icehockey', label: 'eIce Hockey', icon: '🏒' },
  { key: 'handball', label: 'Handball', icon: '🤾' },
  { key: 'cricket', label: 'Cricket', icon: '🏏' },
  { key: 'boxing', label: 'Boxing', icon: '🥊' },
  { key: 'mma', label: 'MMA', icon: '🥋' },
  { key: 'baseball', label: 'Baseball', icon: '⚾' },
  { key: 'tableTennis', label: 'Table Tennis', icon: '🏓' },
];

const SUB_ITEMS = {
  football: [
    { label: "Today's Football", filter: 'today' },
    { label: 'Football In Next 3 Hours', filter: '3h' },
    { label: 'WORLD CUP', filter: 'worldcup' },
    { label: 'English Premier League', filter: 'epl' },
    { label: 'La Liga', filter: 'laliga' },
    { label: 'Serie A', filter: 'seriea' },
    { label: 'Bundesliga', filter: 'bundesliga' },
    { label: 'Ligue 1', filter: 'ligue1' },
    { label: 'Champions League', filter: 'ucl' },
  ],
  basketball: [
    { label: 'NBA', filter: 'nba' },
    { label: 'WNBA', filter: 'wnba' },
    { label: 'EuroLeague', filter: 'euroleague' },
  ],
  tennis: [
    { label: 'ATP/WTA', filter: 'atp' },
    { label: 'Grand Slam', filter: 'grandslam' },
  ],
  baseball: [
    { label: 'MLB', filter: 'mlb' },
  ],
};

const TABS = [
  { key: 'sports', label: 'Sports' },
  { key: 'live', label: 'Live', badge: null },
  { key: 'promos', label: 'Promotions', badge: null },
  { key: 'features', label: 'Features' },
];

const QUICK_LINKS = [
  { label: 'Virtuals', icon: '🎰', to: '/virtuals' },
  { label: 'Jackpot', icon: '💰', to: '/jackpot' },
  { label: 'Livescore', icon: '📊', to: '/live' },
  { label: 'Results', icon: '📋', to: '/' },
  { label: 'App', icon: '📱', to: '/' },
];

const CSS = `
.az-page { min-height: calc(100vh - 120px); background: var(--bg); }
.az-search { display: flex; align-items: center; gap: 8px; margin: 0 12px 0; padding: 10px 14px; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; }
.az-search-icon { color: var(--text-dim); flex-shrink: 0; }
.az-search-input { flex: 1; background: none; border: none; outline: none; color: var(--text); font-size: 13px; font-family: inherit; }
.az-search-input::placeholder { color: var(--text-dim); }

.az-quick { display: flex; justify-content: space-around; padding: 14px 8px 10px; }
.az-quick-item { display: flex; flex-direction: column; align-items: center; gap: 5px; text-decoration: none; color: var(--text-soft); font-size: 10px; font-weight: 600; cursor: pointer; background: none; border: none; font-family: inherit; }
.az-quick-icon { width: 40px; height: 40px; border-radius: 10px; background: var(--accent); display: flex; align-items: center; justify-content: center; font-size: 18px; }

.az-tabs { display: flex; background: var(--surface); border-bottom: 2px solid var(--accent); overflow-x: auto; }
.az-tab { padding: 11px 16px; background: none; border: none; color: var(--text-dim); font-size: 12.5px; font-weight: 700; cursor: pointer; font-family: inherit; white-space: nowrap; position: relative; }
.az-tab.active { color: #fff; background: var(--accent); border-radius: 0; }
.az-tab-badge { background: var(--text-dim); color: #fff; font-size: 9px; font-weight: 800; padding: 1px 5px; border-radius: 8px; margin-left: 4px; vertical-align: middle; }

.az-body { display: flex; min-height: 400px; }
.az-sports-col { width: 48%; border-right: 1px solid var(--line); overflow-y: auto; max-height: calc(100vh - 280px); }
.az-leagues-col { width: 52%; overflow-y: auto; max-height: calc(100vh - 280px); }

.az-sport-item { display: flex; align-items: center; gap: 10px; padding: 13px 14px; color: var(--text-soft); font-size: 13px; font-weight: 600; cursor: pointer; border-bottom: 1px solid var(--line); background: none; border-left: none; border-right: none; border-top: none; width: 100%; text-align: left; font-family: inherit; }
.az-sport-item:hover, .az-sport-item.active { background: var(--surface); color: var(--text); }
.az-sport-item.active { border-left: 3px solid var(--accent); padding-left: 11px; }
.az-sport-icon { font-size: 16px; width: 20px; text-align: center; }

.az-league-item { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; color: var(--text-soft); font-size: 13px; font-weight: 600; cursor: pointer; border-bottom: 1px solid var(--line); background: none; border-left: none; border-right: none; border-top: none; width: 100%; text-align: left; font-family: inherit; }
.az-league-item:hover { background: var(--surface); color: var(--text); }
.az-league-chevron { color: var(--text-dim); font-size: 12px; }

.az-empty { padding: 40px 16px; text-align: center; color: var(--text-dim); font-size: 13px; }
`;

export default function AZMenuPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('sports');
  const [activeSport, setActiveSport] = useState('football');
  const [search, setSearch] = useState('');
  const [liveCounts, setLiveCounts] = useState({});

  useEffect(() => {
    setLiveCounts({ live: 103, promos: 8 });
  }, []);

  const filteredSports = useMemo(() => {
    if (!search.trim()) return SPORTS;
    const q = search.toLowerCase();
    return SPORTS.filter(s => s.label.toLowerCase().includes(q));
  }, [search]);

  const leagues = SUB_ITEMS[activeSport] || [];

  const handleSportClick = (key) => {
    setActiveSport(key);
  };

  const handleLeagueClick = (sport, filter) => {
    navigate(`/?sport=${sport}&filter=${filter}`);
  };

  const handleTabClick = (key) => {
    if (key === 'live') { navigate('/live'); return; }
    if (key === 'promos') { navigate('/promos'); return; }
    setActiveTab(key);
  };

  return (
    <div className="az-page">
      <style>{CSS}</style>

      {/* Search */}
      <div className="az-search">
        <svg className="az-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          className="az-search-input"
          placeholder="Teams/Players, League, Game ID"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: '#7d8b97', cursor: 'pointer', fontSize: 16 }}>✕</button>
        )}
      </div>

      {/* Quick links row */}
      <div className="az-quick">
        {QUICK_LINKS.map((q) => (
          <button key={q.label} className="az-quick-item" onClick={() => navigate(q.to)}>
            <span className="az-quick-icon">{q.icon}</span>
            {q.label}
          </button>
        ))}
      </div>

      {/* Tab bar */}
      <div className="az-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`az-tab ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => handleTabClick(t.key)}
          >
            {t.label}
            {t.key === 'live' && liveCounts.live && (
              <span className="az-tab-badge">{liveCounts.live}</span>
            )}
            {t.key === 'promos' && liveCounts.promos && (
              <span className="az-tab-badge">{liveCounts.promos}</span>
            )}
          </button>
        ))}
      </div>

      {/* Two-column body */}
      {activeTab === 'sports' && (
        <div className="az-body">
          <div className="az-sports-col">
            {filteredSports.map((s) => (
              <button
                key={s.key}
                className={`az-sport-item ${activeSport === s.key ? 'active' : ''}`}
                onClick={() => handleSportClick(s.key)}
              >
                <span className="az-sport-icon">{s.icon}</span>
                {s.label}
              </button>
            ))}
          </div>
          <div className="az-leagues-col">
            {leagues.length > 0 ? leagues.map((l) => (
              <button
                key={l.filter}
                className="az-league-item"
                onClick={() => handleLeagueClick(activeSport, l.filter)}
              >
                {l.label}
                <span className="az-league-chevron">›</span>
              </button>
            )) : (
              <div className="az-empty">No leagues available</div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'features' && (
        <div className="az-empty">Coming soon</div>
      )}
    </div>
  );
}

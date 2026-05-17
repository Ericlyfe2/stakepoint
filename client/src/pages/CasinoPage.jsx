import { useEffect, useState, useMemo } from 'react';
import { fetchCasinoGames } from '../api/betApi.js';
import { useToast, useAccount } from '../layout/AppShell.jsx';
import Skeleton from '../components/Skeleton.jsx';
import PageBack from '../components/PageBack.jsx';

const CATEGORIES = ['All', 'Slots', 'Live', 'Crash'];

export default function CasinoPage() {
  const { toast } = useToast();
  const { account, adjustBalance } = useAccount();
  const [games, setGames] = useState(null);
  const [active, setActive] = useState('All');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setGames(null);
    fetchCasinoGames(active === 'All' ? undefined : active.toLowerCase())
      .then((d) => setGames(d.games || []))
      .catch(() => setGames([]));
  }, [active]);

  const filtered = useMemo(
    () => (games || []).filter((g) => g.title.toLowerCase().includes(search.toLowerCase())),
    [games, search]
  );
  const isLoading = games === null;

  const launch = (g) => {
    if (!account) { toast('Sign in to play casino games.'); return; }
    if (account.balance < 1) { toast('Top up to play.'); return; }
    adjustBalance(-1, `Loading ${g.title}…`);
    setTimeout(() => toast(`${g.title} session started · stake debited GHS 1.00`), 600);
  };

  return (
    <main className="page-wrap">
      <PageBack />
      <div className="page-head">
        <p className="eyebrow">CASINO</p>
        <h1>Play and win, instantly.</h1>
        <p className="lede">Slots, live tables, and crash games from Pragmatic, Evolution, and Spribe — all certified RTPs.</p>
      </div>

      <div className="page-toolbar">
        <div className="filter-bar" style={{ marginBottom: 0 }}>
          {CATEGORIES.map((c) => (
            <button key={c} type="button" className={`chip${active === c ? ' active' : ''}`} onClick={() => setActive(c)}>{c}</button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Search games…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
        />
      </div>

      <div className="casino-grid">
        {isLoading && Array.from({ length: 8 }).map((_, i) => <Skeleton.Card key={i} aspect="1.6 / 1" />)}
        {!isLoading && filtered.map((g) => (
          <article key={g.id} className="casino-card" style={{ '--hue': g.hue }}>
            <div className="casino-thumb" style={{ background: `linear-gradient(135deg, ${g.hue}, #0a0a0a)` }}>
              {g.hot && <span className="badge-hot">HOT</span>}
              <span className="casino-title-overlay">{g.title}</span>
            </div>
            <div className="casino-meta">
              <div>
                <strong>{g.title}</strong>
                <div className="casino-sub">{g.provider} · {g.category}</div>
              </div>
              <div className="casino-rtp">RTP {g.rtp.toFixed(1)}%</div>
            </div>
            <button type="button" className="btn btn-primary casino-play" onClick={() => launch(g)}>Play now</button>
          </article>
        ))}
        {!isLoading && filtered.length === 0 && <p style={{ color: 'var(--text-dim)', padding: 24 }}>No games match your search.</p>}
      </div>
    </main>
  );
}

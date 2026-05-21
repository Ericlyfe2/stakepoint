import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchCasinoGames } from '../api/betApi.js';
import { useAccount, useToast } from '../layout/AppShell.jsx';
import Skeleton from '../components/Skeleton.jsx';
import PageBack from '../components/PageBack.jsx';

export default function CasinoPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { account } = useAccount();
  const [games, setGames] = useState(null);

  useEffect(() => {
    fetchCasinoGames()
      .then((d) => setGames(d.games || []))
      .catch(() => setGames([]));
  }, []);

  const launch = (g) => {
    if (!account) { toast('Sign in to play casino games.'); navigate(`/login?next=${encodeURIComponent(g.route || '/casino')}`); return; }
    if (g.route) navigate(g.route);
    else toast(`${g.title} is coming soon.`);
  };

  const isLoading = games === null;

  return (
    <main className="page-wrap">
      <PageBack />
      <div className="page-head">
        <p className="eyebrow">CASINO</p>
        <h1>Instant games. Real wins.</h1>
        <p className="lede">Three fast Xenbet originals — pick a card, roll the dice, or place chips on the Spin2Win grid.</p>
      </div>

      <div className="casino-grid">
        {isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton.Card key={i} aspect="1.6 / 1" />)}
        {!isLoading && games.map((g) => (
          <article key={g.id} className="casino-card" style={{ '--hue': g.hue }}>
            <div className="casino-thumb" style={{ background: `linear-gradient(135deg, ${g.hue}, #0a0a0a)` }}>
              {g.hot && <span className="badge-hot">HOT</span>}
              <span className="casino-title-overlay">{g.title}</span>
            </div>
            <div className="casino-meta">
              <div>
                <strong>{g.title}</strong>
                <div className="casino-sub">{g.tagline || `${g.provider} · ${g.category}`}</div>
              </div>
              <div className="casino-rtp">RTP {g.rtp.toFixed(1)}%</div>
            </div>
            <button type="button" className="btn btn-primary casino-play" onClick={() => launch(g)}>Play now</button>
          </article>
        ))}
        {!isLoading && games.length === 0 && <p style={{ color: 'var(--text-dim)', padding: 24 }}>No games available right now.</p>}
      </div>
    </main>
  );
}

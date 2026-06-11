import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchCasinoGames } from '../api/betApi.js';
import { useAccount, useToast } from '../layout/AppShell.jsx';
import PageBack from '../components/PageBack.jsx';

// ─── Bespoke SVG art per game ───────────────────────────────────────────────

function DiceArt() {
  return (
    <svg viewBox="0 0 320 220" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="d-face1" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e2e8f0" />
        </linearGradient>
        <linearGradient id="d-face2" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#fde68a" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
        <filter id="d-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="8" floodOpacity="0.4" />
        </filter>
      </defs>
      {/* Back die (gold) */}
      <g transform="translate(150 30) rotate(-12)" filter="url(#d-shadow)">
        <rect x="0" y="0" width="120" height="120" rx="22" fill="url(#d-face2)" />
        <rect x="0" y="0" width="120" height="120" rx="22" fill="none" stroke="#b45309" strokeWidth="2" opacity="0.4" />
        {[ [30,30],[90,30],[30,60],[60,60],[90,60],[30,90],[90,90] ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="9" fill="#7c2d12" />
        ))}
      </g>
      {/* Front die (white w/ red pips) */}
      <g transform="translate(40 70) rotate(8)" filter="url(#d-shadow)">
        <rect x="0" y="0" width="130" height="130" rx="24" fill="url(#d-face1)" />
        <rect x="0" y="0" width="130" height="130" rx="24" fill="none" stroke="#94a3b8" strokeWidth="2" opacity="0.5" />
        {[ [32,32],[98,32],[65,65],[32,98],[98,98] ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="10" fill="#dc2626" />
        ))}
      </g>
    </svg>
  );
}

function Spin2WinArt() {
  // Mini roulette wheel with a ball about to drop into a slot
  return (
    <svg viewBox="0 0 320 220" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <radialGradient id="s-felt" cx="0.5" cy="0.5" r="0.6">
          <stop offset="0" stopColor="#1f8049" />
          <stop offset="1" stopColor="#062a17" />
        </radialGradient>
        <filter id="s-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="8" floodOpacity="0.45" />
        </filter>
      </defs>
      <g transform="translate(160 110)" filter="url(#s-shadow)">
        {/* Outer ring */}
        <circle r="92" fill="#0b1410" stroke="#ffd166" strokeWidth="3" />
        <circle r="92" fill="url(#s-felt)" />
        {/* Color segments (12 wedges alternating red/black with one green) */}
        {Array.from({ length: 12 }).map((_, i) => {
          const start = (i * 30) - 90;
          const end = start + 30;
          const a0 = (start * Math.PI) / 180;
          const a1 = (end * Math.PI) / 180;
          const r = 88;
          const x0 = Math.cos(a0) * r, y0 = Math.sin(a0) * r;
          const x1 = Math.cos(a1) * r, y1 = Math.sin(a1) * r;
          const color = i === 0 ? '#15803d' : i % 2 === 0 ? '#c81e1e' : '#1a1a1a';
          return (
            <path key={i} d={`M0 0 L${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1} Z`} fill={color} stroke="#ffd166" strokeWidth="1" opacity="0.92" />
          );
        })}
        {/* Hub */}
        <circle r="34" fill="#0b1410" stroke="#ffd166" strokeWidth="2" />
        <circle r="20" fill="#1f2937" />
        <text textAnchor="middle" y="6" fill="#ffd166" fontSize="14" fontWeight="900" fontFamily="Bricolage Grotesque, sans-serif">2W</text>
        {/* Ball */}
        <circle cx="0" cy="-78" r="8" fill="#fff" />
        <circle cx="0" cy="-78" r="3" fill="#cbd5e1" />
      </g>
    </svg>
  );
}

function RedBlackArt() {
  // Two cards fanned — one red heart, one black spade
  return (
    <svg viewBox="0 0 320 220" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="rb-red" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ef3b3b" />
          <stop offset="1" stopColor="#a31c1c" />
        </linearGradient>
        <linearGradient id="rb-blk" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2a2a2a" />
          <stop offset="1" stopColor="#0a0a0a" />
        </linearGradient>
        <filter id="rb-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="8" stdDeviation="10" floodOpacity="0.5" />
        </filter>
      </defs>
      {/* Black card (back) */}
      <g transform="translate(170 30) rotate(14)" filter="url(#rb-shadow)">
        <rect x="0" y="0" width="110" height="160" rx="14" fill="url(#rb-blk)" stroke="#ffd166" strokeWidth="2" />
        <text x="14" y="32" fill="#fff" fontSize="22" fontWeight="900" fontFamily="Bricolage Grotesque, sans-serif">A</text>
        <text x="14" y="52" fill="#fff" fontSize="18">♠</text>
        <text x="55" y="100" fill="#fff" fontSize="56" fontWeight="900" textAnchor="middle" fontFamily="Bricolage Grotesque, sans-serif">♠</text>
        <text x="96" y="148" fill="#fff" fontSize="22" fontWeight="900" textAnchor="end" fontFamily="Bricolage Grotesque, sans-serif" transform="rotate(180 96 148)">A</text>
      </g>
      {/* Red card (front) */}
      <g transform="translate(50 50) rotate(-10)" filter="url(#rb-shadow)">
        <rect x="0" y="0" width="110" height="160" rx="14" fill="url(#rb-red)" stroke="#ffd166" strokeWidth="2" />
        <text x="14" y="32" fill="#fff" fontSize="22" fontWeight="900" fontFamily="Bricolage Grotesque, sans-serif">A</text>
        <text x="14" y="52" fill="#fff" fontSize="18">♥</text>
        <text x="55" y="100" fill="#fff" fontSize="56" fontWeight="900" textAnchor="middle" fontFamily="Bricolage Grotesque, sans-serif">♥</text>
        <text x="96" y="148" fill="#fff" fontSize="22" fontWeight="900" textAnchor="end" fontFamily="Bricolage Grotesque, sans-serif" transform="rotate(180 96 148)">A</text>
      </g>
    </svg>
  );
}

const ART = { dice: DiceArt, spin2win: Spin2WinArt, 'red-black': RedBlackArt };
const CARD_TINT = { dice: '#0c4a2a', spin2win: '#3b0d0d', 'red-black': '#0c2a4a' };

// Synthetic live winners — refreshed when the page mounts.
function generateWinners() {
  const names = ['Kwame A.', 'Ama O.', 'Yaw B.', 'Akua M.', 'Kojo S.', 'Adwoa P.', 'Kofi N.', 'Esi T.'];
  const games = [
    { id: 'dice',     name: 'Dice'      },
    { id: 'spin2win', name: 'Spin2Win'  },
    { id: 'red-black',name: 'Red Black' },
  ];
  const pool = Array.from({ length: 4 }).map(() => {
    const n = names[Math.floor(Math.random() * names.length)];
    const g = games[Math.floor(Math.random() * games.length)];
    const amt = (Math.random() * 1800 + 80);
    return { name: n, game: g.name, amount: amt, key: `${n}-${g.id}-${Math.random()}` };
  });
  return pool;
}

function fmtCedi(n) {
  return Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CasinoPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { account } = useAccount();
  const [games, setGames] = useState(null);
  const [winners, setWinners] = useState(() => generateWinners());

  useEffect(() => {
    fetchCasinoGames()
      .then((d) => setGames(d.games || []))
      .catch(() => setGames([]));
    // Refresh winners every 8s for live feel
    const t = setInterval(() => setWinners(generateWinners()), 8000);
    return () => clearInterval(t);
  }, []);

  const featured = useMemo(() => (games || []).find((g) => g.hot) || (games || [])[0], [games]);
  const rest = useMemo(() => (games || []).filter((g) => g !== featured), [games, featured]);

  const launch = (g) => {
    if (!account) { toast('Sign in to play casino games.'); navigate(`/login?next=${encodeURIComponent(g.route || '/casino')}`); return; }
    if (g.route) navigate(g.route);
    else toast(`${g.title} is coming soon.`);
  };

  const FeaturedArt = featured ? ART[featured.id] : null;
  const isLoading = games === null;

  return (
    <main className="cv2">
      <div className="cv-sparkle" />
      <div className="cv-wrap">
        <div style={{ marginBottom: 4 }}>
          <PageBack />
        </div>

        {/* Hero */}
        <header className="cv-hero">
          <span className="cv-eyebrow">Xenbet Originals · Instant Play</span>
          <h1 className="cv-title">The <em>Casino</em> floor,<br />in your pocket.</h1>
          <p className="cv-lede">
            Three flagship games engineered for fast rounds and big swings — pick your card,
            roll the dice, or stack chips on the Spin2Win grid. Real wallet, instant payouts.
          </p>
        </header>

        {/* Stats strip */}
        <div className="cv-stats" role="status" aria-label="Casino stats">
          <div className="cv-stat">
            <div className="cv-stat-val">2,418</div>
            <div className="cv-stat-label">Playing now</div>
          </div>
          <div className="cv-stat">
            <div className="cv-stat-val">GHS 18,420</div>
            <div className="cv-stat-label">Biggest win today</div>
          </div>
          <div className="cv-stat">
            <div className="cv-stat-val">GHS 1.2M</div>
            <div className="cv-stat-label">Paid out · 24h</div>
          </div>
        </div>

        {/* Featured tile */}
        {isLoading && <div className="cv-skel" style={{ height: 230, marginBottom: 28 }} />}
        {!isLoading && featured && (
          <section className="cv-featured" onClick={() => launch(featured)} role="button" tabIndex={0}>
            <div className="cv-featured-text">
              <span className="cv-featured-tag">🔥 Featured · RTP {featured.rtp.toFixed(1)}%</span>
              <h2>{featured.title}</h2>
              <p>{featured.tagline || 'High volatility. Fast rounds. Pure adrenaline.'}</p>
              <button type="button" className="cv-play" onClick={(e) => { e.stopPropagation(); launch(featured); }}>
                Play now
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
            <div className="cv-featured-art">
              {FeaturedArt && <FeaturedArt />}
            </div>
          </section>
        )}

        {/* Games grid */}
        <div className="cv-section-head">
          <h3>All games</h3>
          <span className="cv-count">{games ? `${games.length} live` : ''}</span>
        </div>
        <div className="cv-grid">
          {isLoading && Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="cv-skel" style={{ height: 240 }} />
          ))}
          {!isLoading && rest.map((g) => {
            const Art = ART[g.id];
            return (
              <article key={g.id} className="cv-card" onClick={() => launch(g)}>
                {g.hot && <span className="cv-hot">Hot</span>}
                <span className="cv-rtp">RTP {g.rtp.toFixed(1)}%</span>
                <div className="cv-card-art" style={{ '--card-tint': CARD_TINT[g.id] || '#0c4a2a' }}>
                  {Art && <Art />}
                </div>
                <div className="cv-card-meta">
                  <h4>{g.title}</h4>
                  <p className="cv-tagline">{g.tagline || `${g.provider} · ${g.category}`}</p>
                </div>
                <button type="button" className="cv-card-cta" onClick={(e) => { e.stopPropagation(); launch(g); }}>
                  Play now
                </button>
              </article>
            );
          })}
        </div>

        {/* Live winners */}
        <div className="cv-winners">
          <div className="cv-winners-head">
            <span className="dot" /> Live wins
          </div>
          <div className="cv-winners-list">
            {winners.map((w) => (
              <div className="cv-winner-row" key={w.key}>
                <div className="cv-winner-avatar">{w.name.charAt(0)}</div>
                <div className="cv-winner-info">
                  <div className="name">{w.name}</div>
                  <div className="game">won on {w.game}</div>
                </div>
                <div className="cv-winner-amt">+GHS {fmtCedi(w.amount)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

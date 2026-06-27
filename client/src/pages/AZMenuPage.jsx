import { useState, useMemo } from 'react';
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

/* ── SVG banner graphics ── */
function MissionBanner() {
  return (
    <svg viewBox="0 0 400 140" className="az-banner-svg">
      <defs>
        <linearGradient id="gm1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#1a1a2e"/><stop offset="50%" stopColor="#16213e"/><stop offset="100%" stopColor="#0f3460"/></linearGradient>
        <linearGradient id="gm1a" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffd700"/><stop offset="100%" stopColor="#ff8c00"/></linearGradient>
      </defs>
      <rect width="400" height="140" fill="url(#gm1)"/>
      <circle cx="50" cy="70" r="55" fill="rgba(255,215,0,.06)"/>
      <circle cx="360" cy="30" r="40" fill="rgba(255,140,0,.05)"/>
      <circle cx="340" cy="110" r="30" fill="rgba(255,215,0,.04)"/>
      {/* Target icon */}
      <circle cx="200" cy="42" r="18" fill="none" stroke="#ff4444" strokeWidth="3"/>
      <circle cx="200" cy="42" r="11" fill="none" stroke="#ff6666" strokeWidth="2.5"/>
      <circle cx="200" cy="42" r="4" fill="#ff4444"/>
      <line x1="200" y1="20" x2="200" y2="26" stroke="#ff4444" strokeWidth="2"/>
      <line x1="200" y1="58" x2="200" y2="64" stroke="#ff4444" strokeWidth="2"/>
      <line x1="178" y1="42" x2="184" y2="42" stroke="#ff4444" strokeWidth="2"/>
      <line x1="216" y1="42" x2="222" y2="42" stroke="#ff4444" strokeWidth="2"/>
      {/* Stars */}
      <text x="100" y="35" fontSize="14" fill="rgba(255,215,0,.4)">★</text>
      <text x="300" y="50" fontSize="10" fill="rgba(255,215,0,.3)">★</text>
      <text x="70" y="100" fontSize="8" fill="rgba(255,215,0,.25)">★</text>
      <text x="330" y="95" fontSize="12" fill="rgba(255,215,0,.3)">★</text>
      <text x="200" y="85" textAnchor="middle" fill="url(#gm1a)" fontSize="18" fontWeight="900" fontFamily="sans-serif">GOALS MISSION MANIA</text>
      <text x="200" y="105" textAnchor="middle" fill="rgba(255,255,255,.6)" fontSize="9" fontWeight="600" fontFamily="sans-serif">STAKE and CLAIM FREE BET up to GHS 100 on Quick Games</text>
      {/* Soccer balls */}
      <circle cx="55" cy="60" r="8" fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="1.5"/>
      <circle cx="345" cy="75" r="6" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="1.2"/>
    </svg>
  );
}

function FreeBetsBanner() {
  return (
    <svg viewBox="0 0 400 140" className="az-banner-svg">
      <defs>
        <linearGradient id="fb1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#1a0a2e"/><stop offset="50%" stopColor="#2d1b69"/><stop offset="100%" stopColor="#5b21b6"/></linearGradient>
      </defs>
      <rect width="400" height="140" fill="url(#fb1)"/>
      {/* Rain drops */}
      {[40,90,140,190,240,290,340].map((x,i) => (
        <g key={i} opacity={0.3 + (i % 3) * 0.15}>
          <line x1={x} y1={5 + i*8} x2={x-3} y2={18 + i*8} stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1={x+20} y1={25 + i*5} x2={x+17} y2={38 + i*5} stroke="#c4b5fd" strokeWidth="1" strokeLinecap="round"/>
        </g>
      ))}
      {/* Gift box */}
      <rect x="177" y="18" width="46" height="32" rx="4" fill="#e11d48" stroke="#fb7185" strokeWidth="1.5"/>
      <rect x="177" y="18" width="46" height="10" rx="3" fill="#f43f5e"/>
      <line x1="200" y1="18" x2="200" y2="50" stroke="#fda4af" strokeWidth="2"/>
      <path d="M200 18 Q190 8 182 18" fill="none" stroke="#fda4af" strokeWidth="2"/>
      <path d="M200 18 Q210 8 218 18" fill="none" stroke="#fda4af" strokeWidth="2"/>
      {/* Coins */}
      <circle cx="80" cy="55" r="10" fill="#fbbf24" stroke="#f59e0b" strokeWidth="1.5"/>
      <text x="80" y="59" textAnchor="middle" fontSize="10" fontWeight="900" fill="#92400e">$</text>
      <circle cx="320" cy="45" r="8" fill="#fbbf24" stroke="#f59e0b" strokeWidth="1.2"/>
      <text x="320" y="49" textAnchor="middle" fontSize="8" fontWeight="900" fill="#92400e">$</text>
      <circle cx="105" cy="85" r="6" fill="#fbbf24" opacity=".5"/>
      <circle cx="300" cy="90" r="7" fill="#fbbf24" opacity=".4"/>
      <text x="200" y="80" textAnchor="middle" fill="#fff" fontSize="16" fontWeight="900" fontFamily="sans-serif">RAINING FREE BETS DAILY</text>
      <text x="200" y="100" textAnchor="middle" fill="#c4b5fd" fontSize="9.5" fontWeight="700" fontFamily="sans-serif">2,000,000 GHS FREE BETS to claim every match</text>
      <text x="200" y="118" textAnchor="middle" fill="rgba(255,255,255,.35)" fontSize="8" fontWeight="600" fontFamily="sans-serif">BetXentra GH</text>
    </svg>
  );
}

function WorldCupBanner() {
  return (
    <svg viewBox="0 0 400 140" className="az-banner-svg">
      <defs>
        <linearGradient id="wc1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#0c2e0c"/><stop offset="50%" stopColor="#145214"/><stop offset="100%" stopColor="#1a7a1a"/></linearGradient>
        <linearGradient id="wc1g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffd700"/><stop offset="100%" stopColor="#b8860b"/></linearGradient>
      </defs>
      <rect width="400" height="140" fill="url(#wc1)"/>
      {/* Field lines */}
      <circle cx="200" cy="70" r="50" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="1.5"/>
      <line x1="200" y1="0" x2="200" y2="140" stroke="rgba(255,255,255,.04)" strokeWidth="1"/>
      {/* Trophy */}
      <path d="M188 25 L188 40 Q188 55 200 58 Q212 55 212 40 L212 25 Z" fill="url(#wc1g)" stroke="#daa520" strokeWidth="1.5"/>
      <rect x="194" y="58" width="12" height="6" rx="1" fill="#daa520"/>
      <rect x="190" y="63" width="20" height="4" rx="2" fill="#b8860b"/>
      <path d="M188 30 Q175 32 178 42 Q180 48 188 45" fill="none" stroke="#daa520" strokeWidth="2"/>
      <path d="M212 30 Q225 32 222 42 Q220 48 212 45" fill="none" stroke="#daa520" strokeWidth="2"/>
      {/* Stars */}
      <text x="165" y="35" fontSize="10" fill="rgba(255,215,0,.5)">★</text>
      <text x="230" y="35" fontSize="10" fill="rgba(255,215,0,.5)">★</text>
      <text x="150" y="55" fontSize="7" fill="rgba(255,215,0,.3)">★</text>
      <text x="245" y="55" fontSize="7" fill="rgba(255,215,0,.3)">★</text>
      {/* Soccer ball */}
      <circle cx="85" cy="90" r="14" fill="#fff" opacity=".12"/>
      <circle cx="85" cy="90" r="14" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="1"/>
      <circle cx="330" cy="80" r="10" fill="#fff" opacity=".08"/>
      <text x="200" y="92" textAnchor="middle" fill="#fff" fontSize="18" fontWeight="900" fontFamily="sans-serif">WORLD CUP</text>
      <text x="200" y="112" textAnchor="middle" fill="rgba(255,255,255,.55)" fontSize="9" fontWeight="600" fontFamily="sans-serif">Enhanced odds on all group stage matches</text>
    </svg>
  );
}

function CasinoBanner() {
  return (
    <svg viewBox="0 0 400 140" className="az-banner-svg">
      <defs>
        <linearGradient id="cb1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#2e1a0a"/><stop offset="50%" stopColor="#693b1b"/><stop offset="100%" stopColor="#b66221"/></linearGradient>
      </defs>
      <rect width="400" height="140" fill="url(#cb1)"/>
      {/* Slot machine */}
      <rect x="170" y="15" width="60" height="50" rx="6" fill="rgba(0,0,0,.3)" stroke="#fbbf24" strokeWidth="1.5"/>
      <rect x="178" y="23" width="14" height="18" rx="2" fill="#1a1a1a"/><text x="185" y="37" textAnchor="middle" fill="#22c55e" fontSize="12" fontWeight="900">7</text>
      <rect x="194" y="23" width="14" height="18" rx="2" fill="#1a1a1a"/><text x="201" y="37" textAnchor="middle" fill="#ef4444" fontSize="12" fontWeight="900">7</text>
      <rect x="210" y="23" width="14" height="18" rx="2" fill="#1a1a1a"/><text x="217" y="37" textAnchor="middle" fill="#fbbf24" fontSize="12" fontWeight="900">7</text>
      <rect x="175" y="48" width="50" height="8" rx="3" fill="#fbbf24"/>
      <text x="200" y="55" textAnchor="middle" fill="#92400e" fontSize="6" fontWeight="800">JACKPOT</text>
      {/* Chips */}
      <circle cx="80" cy="70" r="14" fill="#e11d48" stroke="#fb7185" strokeWidth="2"/><circle cx="80" cy="70" r="8" fill="none" stroke="#fb7185" strokeWidth="1"/>
      <circle cx="320" cy="60" r="12" fill="#2563eb" stroke="#60a5fa" strokeWidth="2"/><circle cx="320" cy="60" r="7" fill="none" stroke="#60a5fa" strokeWidth="1"/>
      <circle cx="100" cy="100" r="10" fill="#16a34a" stroke="#4ade80" strokeWidth="1.5"/>
      <text x="200" y="85" textAnchor="middle" fill="#fff" fontSize="16" fontWeight="900" fontFamily="sans-serif">CASINO WELCOME BONUS</text>
      <text x="200" y="103" textAnchor="middle" fill="rgba(255,255,255,.6)" fontSize="10" fontWeight="700" fontFamily="sans-serif">100% BONUS ON FIRST DEPOSIT</text>
      <text x="200" y="120" textAnchor="middle" fill="rgba(255,255,255,.35)" fontSize="8" fontFamily="sans-serif">Play slots, table games and more</text>
    </svg>
  );
}

function SpinBanner() {
  return (
    <svg viewBox="0 0 400 140" className="az-banner-svg">
      <defs>
        <linearGradient id="sp1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#0a2e2e"/><stop offset="50%" stopColor="#1b5e69"/><stop offset="100%" stopColor="#21a5b6"/></linearGradient>
      </defs>
      <rect width="400" height="140" fill="url(#sp1)"/>
      {/* Wheel */}
      <circle cx="200" cy="48" r="30" fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="3"/>
      {[0,45,90,135,180,225,270,315].map((a,i) => {
        const r = 30, cx = 200, cy = 48;
        const x2 = cx + r * Math.cos(a * Math.PI / 180);
        const y2 = cy + r * Math.sin(a * Math.PI / 180);
        return <line key={i} x1={cx} y1={cy} x2={x2} y2={y2} stroke="rgba(255,255,255,.1)" strokeWidth="1"/>;
      })}
      <circle cx="200" cy="48" r="8" fill="#fbbf24"/>
      <text x="200" y="52" textAnchor="middle" fill="#92400e" fontSize="8" fontWeight="900">$</text>
      {/* Sparkles */}
      <text x="140" y="35" fontSize="12" fill="rgba(255,215,0,.4)">✦</text>
      <text x="260" y="40" fontSize="9" fill="rgba(255,215,0,.35)">✦</text>
      <text x="120" y="80" fontSize="7" fill="rgba(255,215,0,.25)">✦</text>
      <text x="280" y="75" fontSize="10" fill="rgba(255,215,0,.3)">✦</text>
      <text x="200" y="98" textAnchor="middle" fill="#fff" fontSize="18" fontWeight="900" fontFamily="sans-serif">SPIN & WIN</text>
      <text x="200" y="116" textAnchor="middle" fill="rgba(255,255,255,.55)" fontSize="9.5" fontWeight="600" fontFamily="sans-serif">Win up to GHS 5,000 every day</text>
    </svg>
  );
}

function FreeBetGiftBanner() {
  return (
    <svg viewBox="0 0 400 140" className="az-banner-svg">
      <defs>
        <linearGradient id="fg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#5b0e0e"/><stop offset="50%" stopColor="#8b1a1a"/><stop offset="100%" stopColor="#c82333"/></linearGradient>
      </defs>
      <rect width="400" height="140" fill="url(#fg1)"/>
      {/* Gift box */}
      <rect x="175" y="20" width="50" height="38" rx="4" fill="#fbbf24" stroke="#f59e0b" strokeWidth="1.5"/>
      <rect x="175" y="20" width="50" height="12" rx="3" fill="#f59e0b"/>
      <line x1="200" y1="20" x2="200" y2="58" stroke="#fff" strokeWidth="2.5"/>
      <path d="M200 20 Q188 8 178 20" fill="none" stroke="#fff" strokeWidth="2.5"/>
      <path d="M200 20 Q212 8 222 20" fill="none" stroke="#fff" strokeWidth="2.5"/>
      {/* Sparkle bursts */}
      {[{x:145,y:30},{x:255,y:25},{x:130,y:55},{x:270,y:50},{x:160,y:65},{x:240,y:65}].map((p,i) => (
        <text key={i} x={p.x} y={p.y} fontSize={8 + (i%3)*2} fill={`rgba(255,215,0,${0.3 + (i%3)*0.1})`}>✦</text>
      ))}
      <text x="200" y="82" textAnchor="middle" fill="#fff" fontSize="17" fontWeight="900" fontFamily="sans-serif">UNLOCK YOUR FREE BET GIFT</text>
      <text x="200" y="100" textAnchor="middle" fill="rgba(255,255,255,.55)" fontSize="10" fontWeight="600" fontFamily="sans-serif">FROM BETXENTRA LOYALTY</text>
      {/* Tag */}
      <rect x="160" y="108" width="80" height="20" rx="10" fill="rgba(255,255,255,.12)"/>
      <text x="200" y="122" textAnchor="middle" fill="#fbbf24" fontSize="9" fontWeight="700" fontFamily="sans-serif">CLAIM NOW →</text>
    </svg>
  );
}

function LiveBoostBanner() {
  return (
    <svg viewBox="0 0 400 140" className="az-banner-svg">
      <defs>
        <linearGradient id="lb1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#0a1e0a"/><stop offset="50%" stopColor="#145214"/><stop offset="100%" stopColor="#1a8a1a"/></linearGradient>
      </defs>
      <rect width="400" height="140" fill="url(#lb1)"/>
      {/* Lightning bolt */}
      <polygon points="200,10 185,55 198,55 190,85 215,40 202,40 210,10" fill="#fbbf24" stroke="#f59e0b" strokeWidth="1"/>
      {/* LIVE badge */}
      <rect x="155" y="15" width="35" height="16" rx="4" fill="#ef4444"/>
      <text x="172" y="27" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="800" fontFamily="sans-serif">LIVE</text>
      {/* Boost arrows */}
      <path d="M100 90 L120 60 L140 75 L160 45" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <polygon points="160,45 155,52 162,50" fill="#22c55e"/>
      <path d="M240 85 L260 55 L280 68 L300 40" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity=".5"/>
      <polygon points="300,40 295,47 302,45" fill="#4ade80" opacity=".5"/>
      <text x="200" y="105" textAnchor="middle" fill="#fff" fontSize="16" fontWeight="900" fontFamily="sans-serif">LIVE ODDS BOOST</text>
      <text x="200" y="123" textAnchor="middle" fill="rgba(255,255,255,.55)" fontSize="9.5" fontWeight="600" fontFamily="sans-serif">BOOST YOUR WINNINGS ON LIVE MATCHES</text>
    </svg>
  );
}

function CashOutBanner() {
  return (
    <svg viewBox="0 0 400 140" className="az-banner-svg">
      <defs>
        <linearGradient id="co1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#1e1a0a"/><stop offset="50%" stopColor="#524a14"/><stop offset="100%" stopColor="#8a7a1a"/></linearGradient>
      </defs>
      <rect width="400" height="140" fill="url(#co1)"/>
      {/* Money/coins */}
      <circle cx="200" cy="40" r="22" fill="#fbbf24" stroke="#daa520" strokeWidth="2"/>
      <text x="200" y="47" textAnchor="middle" fill="#92400e" fontSize="18" fontWeight="900">$</text>
      <circle cx="160" cy="55" r="12" fill="#22c55e" opacity=".4"/><circle cx="240" cy="50" r="10" fill="#22c55e" opacity=".3"/>
      {/* Arrow out */}
      <path d="M200 62 L200 80" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round"/>
      <polygon points="194,76 200,86 206,76" fill="#fbbf24"/>
      <text x="200" y="105" textAnchor="middle" fill="#fff" fontSize="16" fontWeight="900" fontFamily="sans-serif">PARTIAL CASH OUT</text>
      <text x="200" y="123" textAnchor="middle" fill="rgba(255,255,255,.55)" fontSize="9" fontWeight="600" fontFamily="sans-serif">Control your risk, lock in profits</text>
    </svg>
  );
}

function BetBuilderBanner() {
  return (
    <svg viewBox="0 0 400 140" className="az-banner-svg">
      <defs>
        <linearGradient id="bb1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#0a0a2e"/><stop offset="50%" stopColor="#1b1b69"/><stop offset="100%" stopColor="#2121b6"/></linearGradient>
      </defs>
      <rect width="400" height="140" fill="url(#bb1)"/>
      {/* Wrench/tool icon */}
      <circle cx="200" cy="38" r="16" fill="none" stroke="#60a5fa" strokeWidth="2.5"/>
      <circle cx="200" cy="38" r="6" fill="#60a5fa"/>
      <line x1="200" y1="54" x2="200" y2="70" stroke="#60a5fa" strokeWidth="3" strokeLinecap="round"/>
      {/* Connecting dots */}
      {[{x:145,y:35},{x:160,y:55},{x:240,y:50},{x:255,y:30}].map((p,i) => (
        <g key={i}><circle cx={p.x} cy={p.y} r="4" fill="#a78bfa" opacity=".5"/><line x1={p.x} y1={p.y} x2={200} y2={38} stroke="#a78bfa" strokeWidth=".8" opacity=".25"/></g>
      ))}
      <text x="200" y="92" textAnchor="middle" fill="#fff" fontSize="17" fontWeight="900" fontFamily="sans-serif">BET BUILDER</text>
      <text x="200" y="110" textAnchor="middle" fill="rgba(255,255,255,.55)" fontSize="9.5" fontWeight="600" fontFamily="sans-serif">Combine multiple selections in one bet</text>
    </svg>
  );
}

function QuickBetBanner() {
  return (
    <svg viewBox="0 0 400 140" className="az-banner-svg">
      <defs>
        <linearGradient id="qb1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#2e0a1e"/><stop offset="50%" stopColor="#691b4a"/><stop offset="100%" stopColor="#b62175"/></linearGradient>
      </defs>
      <rect width="400" height="140" fill="url(#qb1)"/>
      {/* Lightning double */}
      <polygon points="195,15 183,50 193,50 187,72 207,38 197,38 203,15" fill="#fbbf24" opacity=".8"/>
      <polygon points="210,20 200,48 208,48 203,65 220,40 212,40 217,20" fill="#fbbf24" opacity=".5"/>
      {/* Speed lines */}
      {[30,50,70,90,110].map((y,i) => (
        <line key={i} x1={80-i*5} y1={y} x2={120-i*3} y2={y} stroke="rgba(255,255,255,.08)" strokeWidth="2" strokeLinecap="round"/>
      ))}
      {[30,50,70,90,110].map((y,i) => (
        <line key={i} x1={280+i*5} y1={y} x2={320+i*3} y2={y} stroke="rgba(255,255,255,.08)" strokeWidth="2" strokeLinecap="round"/>
      ))}
      <text x="200" y="95" textAnchor="middle" fill="#fff" fontSize="18" fontWeight="900" fontFamily="sans-serif">QUICK BET</text>
      <text x="200" y="113" textAnchor="middle" fill="rgba(255,255,255,.55)" fontSize="9.5" fontWeight="600" fontFamily="sans-serif">One-tap betting for fast action</text>
    </svg>
  );
}

function MultiBetBanner() {
  return (
    <svg viewBox="0 0 400 140" className="az-banner-svg">
      <defs>
        <linearGradient id="mb1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#0a2e1e"/><stop offset="50%" stopColor="#1b694a"/><stop offset="100%" stopColor="#21b675"/></linearGradient>
      </defs>
      <rect width="400" height="140" fill="url(#mb1)"/>
      {/* Stacked tickets */}
      <rect x="172" y="12" width="56" height="35" rx="4" fill="rgba(255,255,255,.08)" transform="rotate(-5 200 30)"/>
      <rect x="172" y="16" width="56" height="35" rx="4" fill="rgba(255,255,255,.12)" transform="rotate(0 200 33)"/>
      <rect x="172" y="20" width="56" height="35" rx="4" fill="rgba(255,255,255,.18)" transform="rotate(5 200 37)"/>
      <text x="200" y="42" textAnchor="middle" fill="#22c55e" fontSize="12" fontWeight="900">×250%</text>
      {/* Sparkles */}
      <text x="140" y="40" fontSize="10" fill="rgba(255,215,0,.4)">✦</text>
      <text x="260" y="35" fontSize="8" fill="rgba(255,215,0,.35)">✦</text>
      <text x="200" y="80" textAnchor="middle" fill="#fff" fontSize="17" fontWeight="900" fontFamily="sans-serif">MULTI BET BONUS</text>
      <text x="200" y="98" textAnchor="middle" fill="rgba(255,255,255,.55)" fontSize="9.5" fontWeight="600" fontFamily="sans-serif">Up to 250% bonus on 30+ selections</text>
      <rect x="155" y="106" width="90" height="18" rx="9" fill="rgba(34,197,94,.2)" stroke="#22c55e" strokeWidth="1"/>
      <text x="200" y="119" textAnchor="middle" fill="#4ade80" fontSize="8" fontWeight="700" fontFamily="sans-serif">ACCUMULATOR BOOST</text>
    </svg>
  );
}

function ZeroGoalsBanner() {
  return (
    <svg viewBox="0 0 400 140" className="az-banner-svg">
      <defs>
        <linearGradient id="zg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#1a1a1a"/><stop offset="50%" stopColor="#333"/><stop offset="100%" stopColor="#555"/></linearGradient>
      </defs>
      <rect width="400" height="140" fill="url(#zg1)"/>
      {/* Goal net */}
      <rect x="155" y="15" width="90" height="55" rx="3" fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="2"/>
      {[165,180,195,210,225,240].map((x,i) => <line key={`v${i}`} x1={x} y1="15" x2={x} y2="70" stroke="rgba(255,255,255,.06)" strokeWidth="1"/>)}
      {[25,35,45,55,65].map((y,i) => <line key={`h${i}`} x1="155" y1={y} x2="245" y2={y} stroke="rgba(255,255,255,.06)" strokeWidth="1"/>)}
      <text x="200" y="52" textAnchor="middle" fill="rgba(255,255,255,.5)" fontSize="24" fontWeight="900" fontFamily="sans-serif">0 - 0</text>
      <text x="200" y="92" textAnchor="middle" fill="#fff" fontSize="17" fontWeight="900" fontFamily="sans-serif">ZERO GOALS REFUND</text>
      <text x="200" y="110" textAnchor="middle" fill="rgba(255,255,255,.55)" fontSize="9.5" fontWeight="600" fontFamily="sans-serif">Get your stake back on 0-0 draws</text>
    </svg>
  );
}

function ReferralBanner() {
  return (
    <svg viewBox="0 0 400 140" className="az-banner-svg">
      <defs>
        <linearGradient id="rf1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#2e1a0a"/><stop offset="50%" stopColor="#694a1b"/><stop offset="100%" stopColor="#b67521"/></linearGradient>
      </defs>
      <rect width="400" height="140" fill="url(#rf1)"/>
      {/* People icons */}
      <circle cx="180" cy="28" r="10" fill="rgba(255,255,255,.2)"/>
      <path d="M168 55 Q168 42 180 42 Q192 42 192 55" fill="rgba(255,255,255,.15)"/>
      <circle cx="220" cy="28" r="10" fill="rgba(255,255,255,.2)"/>
      <path d="M208 55 Q208 42 220 42 Q232 42 232 55" fill="rgba(255,255,255,.15)"/>
      {/* Arrow between */}
      <line x1="192" y1="35" x2="208" y2="35" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round"/>
      <polygon points="206,31 212,35 206,39" fill="#fbbf24"/>
      {/* GHS 50 badge */}
      <rect x="172" y="58" width="56" height="18" rx="9" fill="#fbbf24"/>
      <text x="200" y="71" textAnchor="middle" fill="#92400e" fontSize="10" fontWeight="800" fontFamily="sans-serif">GHS 50</text>
      <text x="200" y="98" textAnchor="middle" fill="#fff" fontSize="17" fontWeight="900" fontFamily="sans-serif">REFER A FRIEND</text>
      <text x="200" y="116" textAnchor="middle" fill="rgba(255,255,255,.55)" fontSize="9.5" fontWeight="600" fontFamily="sans-serif">Unlimited referrals, unlimited earnings</text>
    </svg>
  );
}

function StatsBanner() {
  return (
    <svg viewBox="0 0 400 140" className="az-banner-svg">
      <defs>
        <linearGradient id="st1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#0a1e2e"/><stop offset="50%" stopColor="#1b4a69"/><stop offset="100%" stopColor="#2175b6"/></linearGradient>
      </defs>
      <rect width="400" height="140" fill="url(#st1)"/>
      {/* Bar chart */}
      <rect x="160" y="45" width="14" height="25" rx="2" fill="#3b82f6" opacity=".7"/>
      <rect x="178" y="35" width="14" height="35" rx="2" fill="#3b82f6" opacity=".8"/>
      <rect x="196" y="20" width="14" height="50" rx="2" fill="#3b82f6"/>
      <rect x="214" y="40" width="14" height="30" rx="2" fill="#3b82f6" opacity=".75"/>
      <rect x="232" y="30" width="14" height="40" rx="2" fill="#3b82f6" opacity=".85"/>
      {/* Trend line */}
      <polyline points="167,42 185,30 203,18 221,36 239,26" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <text x="200" y="90" textAnchor="middle" fill="#fff" fontSize="16" fontWeight="900" fontFamily="sans-serif">MATCH STATS & ANALYSIS</text>
      <text x="200" y="108" textAnchor="middle" fill="rgba(255,255,255,.55)" fontSize="9.5" fontWeight="600" fontFamily="sans-serif">Head-to-head, form guide, lineups</text>
    </svg>
  );
}

function TrackerBanner() {
  return (
    <svg viewBox="0 0 400 140" className="az-banner-svg">
      <defs>
        <linearGradient id="tr1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#1e0a2e"/><stop offset="50%" stopColor="#4a1b69"/><stop offset="100%" stopColor="#7521b6"/></linearGradient>
      </defs>
      <rect width="400" height="140" fill="url(#tr1)"/>
      {/* Mini pitch */}
      <rect x="140" y="15" width="120" height="60" rx="3" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="1.5"/>
      <line x1="200" y1="15" x2="200" y2="75" stroke="rgba(255,255,255,.15)" strokeWidth="1"/>
      <circle cx="200" cy="45" r="12" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="1"/>
      {/* Player dots */}
      <circle cx="165" cy="35" r="3.5" fill="#3b82f6"/><circle cx="175" cy="50" r="3.5" fill="#3b82f6"/><circle cx="160" cy="60" r="3.5" fill="#3b82f6"/>
      <circle cx="230" cy="30" r="3.5" fill="#ef4444"/><circle cx="225" cy="55" r="3.5" fill="#ef4444"/><circle cx="240" cy="45" r="3.5" fill="#ef4444"/>
      {/* Ball */}
      <circle cx="200" cy="45" r="3" fill="#fff"/>
      {/* LIVE badge */}
      <rect x="248" y="18" width="28" height="12" rx="3" fill="#ef4444"/>
      <text x="262" y="27" textAnchor="middle" fill="#fff" fontSize="7" fontWeight="800" fontFamily="sans-serif">LIVE</text>
      <text x="200" y="96" textAnchor="middle" fill="#fff" fontSize="17" fontWeight="900" fontFamily="sans-serif">MATCH TRACKER</text>
      <text x="200" y="114" textAnchor="middle" fill="rgba(255,255,255,.55)" fontSize="9.5" fontWeight="600" fontFamily="sans-serif">Follow live match action in real-time</text>
    </svg>
  );
}

function EarlyPayoutBanner() {
  return (
    <svg viewBox="0 0 400 140" className="az-banner-svg">
      <defs>
        <linearGradient id="ep1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#2e0a0a"/><stop offset="50%" stopColor="#691b1b"/><stop offset="100%" stopColor="#b62121"/></linearGradient>
      </defs>
      <rect width="400" height="140" fill="url(#ep1)"/>
      {/* Scoreboard */}
      <rect x="155" y="15" width="90" height="48" rx="6" fill="rgba(0,0,0,.3)" stroke="rgba(255,255,255,.15)" strokeWidth="1.5"/>
      <text x="185" y="46" textAnchor="middle" fill="#22c55e" fontSize="22" fontWeight="900" fontFamily="sans-serif">2</text>
      <text x="200" y="44" textAnchor="middle" fill="rgba(255,255,255,.4)" fontSize="14" fontWeight="700" fontFamily="sans-serif">-</text>
      <text x="215" y="46" textAnchor="middle" fill="rgba(255,255,255,.5)" fontSize="22" fontWeight="900" fontFamily="sans-serif">0</text>
      {/* Check mark */}
      <circle cx="200" cy="32" r="6" fill="#22c55e"/>
      <polyline points="196,32 199,35 204,29" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Money flying */}
      <text x="130" y="45" fontSize="14" fill="rgba(255,215,0,.35)">💸</text>
      <text x="260" y="40" fontSize="12" fill="rgba(255,215,0,.3)">💸</text>
      <text x="200" y="85" textAnchor="middle" fill="#fff" fontSize="17" fontWeight="900" fontFamily="sans-serif">EARLY PAYOUT</text>
      <text x="200" y="103" textAnchor="middle" fill="rgba(255,255,255,.55)" fontSize="9.5" fontWeight="600" fontFamily="sans-serif">Win paid out if your team leads by 2</text>
      <rect x="160" y="110" width="80" height="16" rx="8" fill="rgba(34,197,94,.2)"/>
      <text x="200" y="122" textAnchor="middle" fill="#4ade80" fontSize="8" fontWeight="700" fontFamily="sans-serif">FOOTBALL ONLY</text>
    </svg>
  );
}

const BANNER_MAP = {
  missions: MissionBanner,
  freebets: FreeBetsBanner,
  worldcup: WorldCupBanner,
  'casino-bonus': CasinoBanner,
  spin: SpinBanner,
  freebet: FreeBetGiftBanner,
  liveboost: LiveBoostBanner,
  cashout: CashOutBanner,
  betbuilder: BetBuilderBanner,
  quickbet: QuickBetBanner,
  multibet: MultiBetBanner,
  zerogoals: ZeroGoalsBanner,
  referral: ReferralBanner,
  stats: StatsBanner,
  tracker: TrackerBanner,
  earlypo: EarlyPayoutBanner,
};

const PROMOS = [
  { id: 'missions', tag: 'all', desc: 'Complete missions. Claim Rewards' },
  { id: 'freebets', tag: 'all', desc: 'Catch the drop before it\'s gone!' },
  { id: 'worldcup', tag: 'all', desc: 'Bet on every World Cup match' },
  { id: 'casino-bonus', tag: 'games', desc: 'Get 100% bonus on first deposit' },
  { id: 'spin', tag: 'games', desc: 'Free daily spins with real prizes' },
];

const FEATURES = [
  { id: 'freebet', desc: 'Place bet to earn your reward!' },
  { id: 'liveboost', desc: 'Live Odds Boost - Get Enhanced Odds Instantly' },
  { id: 'cashout', desc: 'Cash out part of your bet anytime' },
  { id: 'betbuilder', desc: 'Create custom bets on any match' },
  { id: 'quickbet', desc: 'One-tap betting for fast action' },
  { id: 'multibet', desc: 'Extra winnings on accumulator bets' },
  { id: 'zerogoals', desc: 'Get your stake back on 0-0 draws' },
  { id: 'referral', desc: 'Earn GHS 50 for every friend who joins' },
  { id: 'stats', desc: 'In-depth stats for smarter betting' },
  { id: 'tracker', desc: 'Follow live match action in real-time' },
  { id: 'earlypo', desc: 'Win paid out if your team leads by 2' },
];

const QUICK_LINKS = [
  { label: 'Virtuals', icon: '🎰', to: '/virtuals' },
  { label: 'Jackpot', icon: '💰', to: '/jackpot' },
  { label: 'Livescore', icon: '📊', to: '/live' },
  { label: 'Results', icon: '📋', to: '/' },
  { label: 'App', icon: '📱', to: '/' },
];

const CSS = `
.az-page { min-height: calc(100vh - 120px); background: var(--bg); padding-bottom: 20px; }
.az-search { display: flex; align-items: center; gap: 8px; margin: 0 12px; padding: 10px 14px; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; }
.az-search-icon { color: var(--text-dim); flex-shrink: 0; }
.az-search-input { flex: 1; background: none; border: none; outline: none; color: var(--text); font-size: 13px; font-family: inherit; }
.az-search-input::placeholder { color: var(--text-dim); }
.az-search-clear { background: none; border: none; color: var(--text-dim); cursor: pointer; font-size: 16px; padding: 0 2px; }

.az-quick { display: flex; justify-content: space-around; padding: 14px 8px 10px; }
.az-quick-item { display: flex; flex-direction: column; align-items: center; gap: 5px; text-decoration: none; color: var(--text-soft); font-size: 10px; font-weight: 600; cursor: pointer; background: none; border: none; font-family: inherit; }
.az-quick-icon { width: 40px; height: 40px; border-radius: 10px; background: var(--accent); display: flex; align-items: center; justify-content: center; font-size: 18px; }

.az-tabs { display: flex; background: var(--surface); border-bottom: 2px solid var(--accent); overflow-x: auto; }
.az-tab { padding: 11px 16px; background: none; border: none; color: var(--text-dim); font-size: 12.5px; font-weight: 700; cursor: pointer; font-family: inherit; white-space: nowrap; }
.az-tab.active { color: #fff; background: var(--accent); }
.az-tab-badge { background: var(--text-dim); color: #fff; font-size: 9px; font-weight: 800; padding: 1px 5px; border-radius: 8px; margin-left: 4px; vertical-align: middle; }

.az-body { display: flex; min-height: 400px; }
.az-sports-col { width: 48%; border-right: 1px solid var(--line); overflow-y: auto; max-height: calc(100vh - 280px); }
.az-leagues-col { width: 52%; overflow-y: auto; max-height: calc(100vh - 280px); }

.az-sport-item { display: flex; align-items: center; gap: 10px; padding: 13px 14px; color: var(--text-soft); font-size: 13px; font-weight: 600; cursor: pointer; border: none; border-bottom: 1px solid var(--line); background: none; width: 100%; text-align: left; font-family: inherit; }
.az-sport-item:hover, .az-sport-item.active { background: var(--surface); color: var(--text); }
.az-sport-item.active { border-left: 3px solid var(--accent); padding-left: 11px; }
.az-sport-icon { font-size: 16px; width: 20px; text-align: center; }

.az-league-item { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; color: var(--text-soft); font-size: 13px; font-weight: 600; cursor: pointer; border: none; border-bottom: 1px solid var(--line); background: none; width: 100%; text-align: left; font-family: inherit; }
.az-league-item:hover { background: var(--surface); color: var(--text); }
.az-league-chevron { color: var(--text-dim); font-size: 14px; }

.az-empty { padding: 40px 16px; text-align: center; color: var(--text-dim); font-size: 13px; }

.az-sub-tabs { display: flex; border-bottom: 1px solid var(--line); }
.az-sub-tab { flex: 1; padding: 12px 0; background: none; border: none; color: var(--text-dim); font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; text-align: center; position: relative; }
.az-sub-tab.active { color: var(--text); }
.az-sub-tab.active::after { content: ''; position: absolute; bottom: -1px; left: 20%; right: 20%; height: 2px; background: var(--accent); border-radius: 1px; }

.az-cards { padding: 12px 14px; display: flex; flex-direction: column; gap: 14px; }
.az-card { border-radius: 12px; overflow: hidden; cursor: pointer; border: 1px solid var(--line); }
.az-banner-svg { display: block; width: 100%; height: auto; }
.az-card-body { background: var(--surface); padding: 13px 14px; display: flex; align-items: center; justify-content: space-between; }
.az-card-desc { color: var(--text); font-size: 13px; font-weight: 700; }
.az-card-arrow { color: var(--text-dim); font-size: 18px; width: 28px; height: 28px; border-radius: 50%; background: var(--bg); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
`;

export default function AZMenuPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('sports');
  const [activeSport, setActiveSport] = useState('football');
  const [search, setSearch] = useState('');
  const [promoFilter, setPromoFilter] = useState('all');

  const filteredSports = useMemo(() => {
    if (!search.trim()) return SPORTS;
    const q = search.toLowerCase();
    return SPORTS.filter(s => s.label.toLowerCase().includes(q));
  }, [search]);

  const leagues = SUB_ITEMS[activeSport] || [];

  const filteredPromos = useMemo(() => {
    if (promoFilter === 'all') return PROMOS;
    return PROMOS.filter(p => p.tag === promoFilter);
  }, [promoFilter]);

  const renderCard = (item) => {
    const Banner = BANNER_MAP[item.id];
    return (
      <div key={item.id} className="az-card" onClick={() => navigate('/promos')}>
        {Banner && <Banner />}
        <div className="az-card-body">
          <span className="az-card-desc">{item.desc}</span>
          <span className="az-card-arrow">›</span>
        </div>
      </div>
    );
  };

  return (
    <div className="az-page">
      <style>{CSS}</style>

      <div className="az-search">
        <svg className="az-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input className="az-search-input" placeholder="Teams/Players, League, Game ID" value={search} onChange={(e) => setSearch(e.target.value)} />
        {search && <button className="az-search-clear" onClick={() => setSearch('')}>✕</button>}
      </div>

      <div className="az-quick">
        {QUICK_LINKS.map((q) => (
          <button key={q.label} className="az-quick-item" onClick={() => navigate(q.to)}>
            <span className="az-quick-icon">{q.icon}</span>
            {q.label}
          </button>
        ))}
      </div>

      <div className="az-tabs">
        {[
          { key: 'sports', label: 'Sports' },
          { key: 'live', label: 'Live', badge: 103 },
          { key: 'promos', label: 'Promotions', badge: PROMOS.length },
          { key: 'features', label: 'Features', badge: FEATURES.length },
        ].map((t) => (
          <button
            key={t.key}
            className={`az-tab ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => {
              if (t.key === 'live') { navigate('/live'); return; }
              setActiveTab(t.key);
            }}
          >
            {t.label}
            {t.badge != null && <span className="az-tab-badge">{t.badge}</span>}
          </button>
        ))}
      </div>

      {activeTab === 'sports' && (
        <div className="az-body">
          <div className="az-sports-col">
            {filteredSports.map((s) => (
              <button key={s.key} className={`az-sport-item ${activeSport === s.key ? 'active' : ''}`} onClick={() => setActiveSport(s.key)}>
                <span className="az-sport-icon">{s.icon}</span>
                {s.label}
              </button>
            ))}
          </div>
          <div className="az-leagues-col">
            {leagues.length > 0 ? leagues.map((l) => (
              <button key={l.filter} className="az-league-item" onClick={() => navigate(`/?sport=${activeSport}&filter=${l.filter}`)}>
                {l.label}
                <span className="az-league-chevron">›</span>
              </button>
            )) : (
              <div className="az-empty">No leagues available</div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'promos' && (
        <>
          <div className="az-sub-tabs">
            <button className={`az-sub-tab ${promoFilter === 'all' ? 'active' : ''}`} onClick={() => setPromoFilter('all')}>All</button>
            <button className={`az-sub-tab ${promoFilter === 'games' ? 'active' : ''}`} onClick={() => setPromoFilter('games')}>Games</button>
          </div>
          <div className="az-cards">{filteredPromos.map(renderCard)}</div>
        </>
      )}

      {activeTab === 'features' && (
        <div className="az-cards">{FEATURES.map(renderCard)}</div>
      )}
    </div>
  );
}

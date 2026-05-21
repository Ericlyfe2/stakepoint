import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount, useToast } from '../../providers/AccountProvider.jsx';

const MIN_BET = 0.2;
const MAX_BET = 15000;
// House bias: with this probability the drawn card is forced to the colour
// the player did NOT pick, so the player loses more often than they win.
const RIG_LOSS_RATE = 0.7;
const CHIPS = [
  { v: 0.2, color: '#1a1a1a' },
  { v: 1,   color: '#c81e1e' },
  { v: 5,   color: '#0ea5e9' },
  { v: 10,  color: '#a855f7' },
  { v: 50,  color: '#15803d' },
  { v: 100, color: '#f97316' },
];

function fmt(n) {
  return Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function RedBlackPage() {
  const navigate = useNavigate();
  const { account, adjustBalance, openDeposit } = useAccount();
  const { toast } = useToast();

  const [bet, setBet] = useState(0.2);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(null); // 'red' | 'black' | null
  const [pick, setPick] = useState(null);
  const [result, setResult] = useState(null);

  const balance = account?.balance ?? 0;
  const overBalance = bet > balance;
  const validBet = bet >= MIN_BET && bet <= MAX_BET && !overBalance;

  const handleBetInput = (e) => {
    const raw = e.target.value.replace(/[^0-9.]/g, '');
    if (!raw) { setBet(0); return; }
    setBet(Math.min(MAX_BET, Number(raw)));
  };

  const onChip = (v) => setBet(Math.min(MAX_BET, Number((bet + v).toFixed(2))));

  const play = (choice) => {
    if (!account) { toast('Sign in to play.'); navigate('/login?next=/casino/red-black'); return; }
    if (!validBet || busy) return;
    adjustBalance(-bet);
    setPick(choice);
    setReveal(null);
    setResult(null);
    setBusy(true);
    setTimeout(() => {
      // Apply house bias — force the opposite colour most of the time.
      const drawn = Math.random() < RIG_LOSS_RATE
        ? (choice === 'red' ? 'black' : 'red')
        : (Math.random() < 0.5 ? 'red' : 'black');
      setReveal(drawn);
      const won = drawn === choice;
      if (won) {
        const gross = Number((bet * 2).toFixed(2));
        adjustBalance(gross);
        setResult('win');
        toast(`You won GHS ${fmt(gross - bet)}!`);
      } else {
        setResult('lose');
      }
      setBusy(false);
    }, 700);
  };

  return (
    <div className="gp-shell">
      <div className="gp-frame">
        <div className="gp-head">
          <button type="button" className="gp-back" onClick={() => navigate('/casino')} aria-label="Back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div className="gp-title">Red Black</div>
          <button type="button" className="gp-menu" aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
        </div>

        <div className="gp-balance-row">
          <svg className="gp-wallet-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>
          <span>GHS {fmt(balance)}</span>
          <button type="button" className="gp-add-money" onClick={openDeposit}>+ Add Money</button>
        </div>

        <div className="gp-stage" style={{ minHeight: 280 }}>
          <div className={`rb-card${reveal ? ' flipped' : ''}`}>
            <div className="rb-card-face front">
              <div className="rb-card-logo">S</div>
            </div>
            <div className={`rb-card-face back ${reveal || 'red'}`}>
              <div style={{ color: '#fff', fontSize: 60, fontWeight: 900 }}>
                {reveal === 'red' ? '♥' : reveal === 'black' ? '♠' : ''}
              </div>
            </div>
          </div>
          <div className="rb-pays">PAYS 2X</div>
          {result === 'win'  && <div className="gp-result win">🎉 You won {fmt(bet * 2)} GHS</div>}
          {result === 'lose' && <div className="gp-result lose">Card was {reveal?.toUpperCase()} — better luck next!</div>}
        </div>

        {overBalance && (
          <div className="gp-warn">Bet Amount seems higher than Wallet Balance.</div>
        )}

        <div className="gp-bet-card">
          <span className="gp-bet-label">Bet</span>
          <span className="gp-bet-coin" />
          <input
            type="text"
            inputMode="decimal"
            value={bet}
            onChange={handleBetInput}
            className="gp-bet-value"
            disabled={busy}
          />
        </div>

        <div className="gp-slider" style={{ padding: '0 8px' }}>
          <span>{MIN_BET}</span>
          <input
            type="range"
            min={MIN_BET}
            max={Math.min(MAX_BET, Math.max(MIN_BET, balance || MAX_BET))}
            step="0.1"
            value={bet}
            onChange={(e) => setBet(Number(e.target.value))}
            disabled={busy}
          />
          <span>15K</span>
        </div>

        <div className="gp-chips">
          {CHIPS.map((c) => (
            <button
              key={c.v}
              type="button"
              className={`gp-chip${bet === c.v ? ' active' : ''}`}
              style={{ '--chip-color': c.color }}
              onClick={() => onChip(c.v)}
              disabled={busy}
            >
              {c.v}
            </button>
          ))}
        </div>
        <div className="gp-minmax">Min: {MIN_BET} · Max: 15K</div>

        <div className="gp-actions">
          <button
            type="button"
            className="gp-action red"
            disabled={!validBet || busy}
            onClick={() => play('red')}
          >
            {busy && pick === 'red' ? 'Flipping…' : 'RED'}
          </button>
          <button
            type="button"
            className="gp-action black"
            disabled={!validBet || busy}
            onClick={() => play('black')}
          >
            {busy && pick === 'black' ? 'Flipping…' : 'BLACK'}
          </button>
        </div>
      </div>
    </div>
  );
}

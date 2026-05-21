import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount, useToast } from '../../providers/AccountProvider.jsx';

const MIN_BET = 0.2;
const MAX_BET = 15000;
const CHIPS = [0.2, 1, 5, 10, 50, 100];
// House bias: with this probability the wheel is forced to land on a
// number that loses every bet the player has placed (when one exists),
// so the player loses more often than they win.
const RIG_LOSS_RATE = 0.65;

// European-style roulette colours (0 is green).
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const colorOf = (n) => (n === 0 ? 'green' : RED_NUMBERS.has(n) ? 'red' : 'black');

// Numbers laid out in 6 columns × 6 rows, matching the reference image
// (1,7,13,19,25,31 / 2,8,14,20,26,32 / ...).
const ROWS = [
  [1, 7, 13, 19, 25, 31],
  [2, 8, 14, 20, 26, 32],
  [3, 9, 15, 21, 27, 33],
  [4, 10, 16, 22, 28, 34],
  [5, 11, 17, 23, 29, 35],
  [6, 12, 18, 24, 30, 36],
];
const COLUMNS = [
  ['A', [1, 7, 13, 19, 25, 31]],
  ['B', [2, 8, 14, 20, 26, 32]],
  ['C', [3, 9, 15, 21, 27, 33]],
  ['D', [4, 10, 16, 22, 28, 34]],
  ['E', [5, 11, 17, 23, 29, 35]],
  ['F', [6, 12, 18, 24, 30, 36]],
];

// Bet keys & payouts (multiplier of bet, e.g. 36 means total return is 36x stake).
const PAYOUTS = {
  number:    36,  // single number
  dozen:      3,  // 1-12 / 13-24 / 25-36
  evenOdd:    2,  // EVEN / ODD
  color:      2,  // RED / BLACK
  zero:      36,  // 0 GREEN
  column:     6,  // A-F columns of 6
  lowHigh:    2,  // LOW (1-18) / HIGH (19-36)
  combo:      4,  // LOW RED / HIGH RED / LOW BLACK / HIGH BLACK
};

function fmt(n) {
  return Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function winsFor(key, roll) {
  const c = colorOf(roll);
  if (key === 'zero') return roll === 0;
  if (roll === 0) return false; // every non-zero bet loses on green
  if (key.startsWith('n-'))      return roll === Number(key.slice(2));
  if (key === 'dozen-1')         return roll >= 1  && roll <= 12;
  if (key === 'dozen-2')         return roll >= 13 && roll <= 24;
  if (key === 'dozen-3')         return roll >= 25 && roll <= 36;
  if (key === 'even')            return roll % 2 === 0;
  if (key === 'odd')             return roll % 2 === 1;
  if (key === 'red')             return c === 'red';
  if (key === 'black')           return c === 'black';
  if (key === 'low')             return roll >= 1  && roll <= 18;
  if (key === 'high')            return roll >= 19 && roll <= 36;
  if (key === 'low-red')         return c === 'red'   && roll <= 18;
  if (key === 'high-red')        return c === 'red'   && roll >= 19;
  if (key === 'low-black')       return c === 'black' && roll <= 18;
  if (key === 'high-black')      return c === 'black' && roll >= 19;
  if (key.startsWith('col-'))    return COLUMNS.find(([id]) => id === key.slice(4))?.[1].includes(roll);
  return false;
}

function payoutFor(key) {
  if (key === 'zero') return PAYOUTS.zero;
  if (key.startsWith('n-')) return PAYOUTS.number;
  if (key.startsWith('dozen-')) return PAYOUTS.dozen;
  if (key === 'even' || key === 'odd') return PAYOUTS.evenOdd;
  if (key === 'red' || key === 'black') return PAYOUTS.color;
  if (key === 'low' || key === 'high') return PAYOUTS.lowHigh;
  if (key.startsWith('col-')) return PAYOUTS.column;
  if (key.includes('-red') || key.includes('-black')) return PAYOUTS.combo;
  return 0;
}

export default function Spin2WinPage() {
  const navigate = useNavigate();
  const { account, adjustBalance, openDeposit } = useAccount();
  const { toast } = useToast();

  const [chip, setChip] = useState(1);
  const [bets, setBets] = useState({}); // { betKey: stake }
  const [roll, setRoll] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [resultMsg, setResultMsg] = useState('');

  const totalStake = useMemo(
    () => Object.values(bets).reduce((s, v) => s + v, 0),
    [bets]
  );
  const balance = account?.balance ?? 0;
  const canSpin = !spinning && totalStake >= MIN_BET && totalStake <= balance;

  const placeBet = (key) => {
    if (spinning) return;
    setResultMsg('');
    setRoll(null);
    setBets((cur) => {
      const next = { ...cur };
      next[key] = Number(((next[key] || 0) + chip).toFixed(2));
      return next;
    });
  };

  const clearBets = () => { if (!spinning) { setBets({}); setResultMsg(''); setRoll(null); } };

  const spin = () => {
    if (!account) { toast('Sign in to play.'); navigate('/login?next=/casino/spin2win'); return; }
    if (!canSpin) return;
    adjustBalance(-totalStake);
    setSpinning(true);
    setResultMsg('');
    setRoll(null);
    setTimeout(() => {
      // Apply house bias — prefer a number that loses every placed bet.
      let r;
      if (Math.random() < RIG_LOSS_RATE) {
        const losing = [];
        for (let n = 0; n <= 36; n++) {
          const winsAny = Object.keys(bets).some((key) => winsFor(key, n));
          if (!winsAny) losing.push(n);
        }
        r = losing.length > 0
          ? losing[Math.floor(Math.random() * losing.length)]
          : Math.floor(Math.random() * 37);
      } else {
        r = Math.floor(Math.random() * 37); // 0–36
      }
      setRoll(r);
      // Calculate winnings
      let gross = 0;
      for (const [key, stake] of Object.entries(bets)) {
        if (winsFor(key, r)) gross += stake * payoutFor(key);
      }
      if (gross > 0) {
        adjustBalance(Number(gross.toFixed(2)));
        const net = gross - totalStake;
        setResultMsg(`Landed on ${r} — you won GHS ${fmt(gross)}${net > 0 ? ` (profit GHS ${fmt(net)})` : ''}!`);
        toast(`Won GHS ${fmt(gross)} on Spin2Win!`);
      } else {
        setResultMsg(`Landed on ${r}. No winning bets.`);
      }
      setSpinning(false);
    }, 800);
  };

  const cellClass = (n) => {
    const c = colorOf(n);
    const has = bets[`n-${n}`];
    const winning = roll === n;
    return `s2w-cell ${c}${has ? ' has-bet' : ''}${winning ? ' winning' : ''}`;
  };

  return (
    <div className="gp-shell">
      <div className="gp-frame">
        <div className="gp-head">
          <button type="button" className="gp-back" onClick={() => navigate('/casino')} aria-label="Back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div className="gp-title">Spin2Win</div>
          <button type="button" className="gp-menu" aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
        </div>

        <div className="gp-balance-row">
          <svg className="gp-wallet-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>
          <span>GHS {fmt(balance)}</span>
          <button type="button" className="gp-add-money" onClick={openDeposit}>+ Add Money</button>
        </div>

        {/* Number grid 1-36 (six rows of six, matching the reference) */}
        <div className="s2w-grid">
          {ROWS.flat().map((n) => (
            <button
              key={n}
              type="button"
              className={cellClass(n)}
              onClick={() => placeBet(`n-${n}`)}
            >
              {n}
              {bets[`n-${n}`] && <span className="chip-marker">{bets[`n-${n}`]}</span>}
            </button>
          ))}
        </div>

        <div className="s2w-rows">
          <div className="row cols-3">
            {[['dozen-1', '1-12'], ['dozen-2', '13-24'], ['dozen-3', '25-36']].map(([k, lbl]) => (
              <button key={k} type="button" className={`s2w-bet-tile green${bets[k] ? ' has-bet' : ''}`} onClick={() => placeBet(k)}>
                {lbl}{bets[k] && <span className="chip-marker">{bets[k]}</span>}
              </button>
            ))}
          </div>
          <div className="row cols-2">
            {[['even', 'EVEN'], ['odd', 'ODD']].map(([k, lbl]) => (
              <button key={k} type="button" className={`s2w-bet-tile green${bets[k] ? ' has-bet' : ''}`} onClick={() => placeBet(k)}>
                {lbl}{bets[k] && <span className="chip-marker">{bets[k]}</span>}
              </button>
            ))}
          </div>
          <div className="row cols-3">
            <button type="button" className={`s2w-bet-tile red${bets.red ? ' has-bet' : ''}`} onClick={() => placeBet('red')}>
              RED{bets.red && <span className="chip-marker">{bets.red}</span>}
            </button>
            <button type="button" className={`s2w-bet-tile black${bets.black ? ' has-bet' : ''}`} onClick={() => placeBet('black')}>
              BLACK{bets.black && <span className="chip-marker">{bets.black}</span>}
            </button>
            <button type="button" className={`s2w-bet-tile green${bets.zero ? ' has-bet' : ''}`} onClick={() => placeBet('zero')}>
              0, GREEN{bets.zero && <span className="chip-marker">{bets.zero}</span>}
            </button>
          </div>
          <div className="row cols-6">
            {COLUMNS.map(([id]) => {
              const k = `col-${id}`;
              return (
                <button key={k} type="button" className={`s2w-bet-tile green${bets[k] ? ' has-bet' : ''}`} onClick={() => placeBet(k)}>
                  {id}{bets[k] && <span className="chip-marker">{bets[k]}</span>}
                </button>
              );
            })}
          </div>
          <div className="row cols-2">
            {[['low', 'LOW'], ['high', 'HIGH']].map(([k, lbl]) => (
              <button key={k} type="button" className={`s2w-bet-tile green${bets[k] ? ' has-bet' : ''}`} onClick={() => placeBet(k)}>
                {lbl}{bets[k] && <span className="chip-marker">{bets[k]}</span>}
              </button>
            ))}
          </div>
          <div className="row cols-4">
            {[
              ['low-red',    'LOW\nRED',    'red'],
              ['high-red',   'HIGH\nRED',   'red'],
              ['low-black',  'LOW\nBLACK',  'black'],
              ['high-black', 'HIGH\nBLACK', 'black'],
            ].map(([k, lbl, color]) => (
              <button
                key={k}
                type="button"
                className={`s2w-bet-tile ${color}${bets[k] ? ' has-bet' : ''}`}
                style={{ whiteSpace: 'pre-line' }}
                onClick={() => placeBet(k)}
              >
                {lbl}{bets[k] && <span className="chip-marker">{bets[k]}</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="gp-bet-card">
          <span className="gp-bet-label">Total stake</span>
          <span className="gp-bet-coin" />
          <span className="gp-bet-value" style={{ display: 'inline-block', width: 'auto' }}>{fmt(totalStake)}</span>
        </div>

        {totalStake > balance && (
          <div className="gp-warn">Total stake exceeds your wallet balance.</div>
        )}

        <div className="gp-chips" style={{ marginTop: 8 }}>
          {CHIPS.map((v, i) => (
            <button
              key={v}
              type="button"
              className={`gp-chip${chip === v ? ' active' : ''}`}
              style={{ '--chip-color': ['#1a1a1a', '#c81e1e', '#0ea5e9', '#a855f7', '#15803d', '#f97316'][i] }}
              onClick={() => setChip(v)}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="gp-minmax">Min: {MIN_BET} · Max: 15K · Tap a cell to stake the selected chip</div>

        {resultMsg && (
          <div className="s2w-result-banner">{resultMsg}</div>
        )}

        <div className="gp-actions">
          <button type="button" className="s2w-clear" onClick={clearBets} disabled={spinning || !totalStake}>
            Clear bets
          </button>
          <button
            type="button"
            className="gp-action gold"
            disabled={!canSpin}
            onClick={spin}
          >
            {spinning ? 'Spinning…' : `Spin · ${fmt(totalStake)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

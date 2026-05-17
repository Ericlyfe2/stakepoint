import { useEffect, useState } from 'react';
import { fetchVirtuals, placeBet } from '../api/betApi.js';
import { useToast, useAccount } from '../layout/AppShell.jsx';
import PageBack from '../components/PageBack.jsx';

function formatAmt(n) {
  return Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function VirtualsPage() {
  const { toast } = useToast();
  const { account, adjustBalance } = useAccount();
  const [leagues, setLeagues] = useState([]);
  const [selections, setSelections] = useState({});
  const [stake, setStake] = useState('20');
  const [countdown, setCountdown] = useState(60);

  useEffect(() => {
    fetchVirtuals().then((d) => setLeagues(d.leagues || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setInterval(() => setCountdown((c) => (c <= 1 ? 60 : c - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const pickedCount = Object.values(selections).filter(Boolean).length;
  const totalOdds = Object.entries(selections).reduce((acc, [matchId, key]) => {
    if (!key) return acc;
    for (const lg of leagues) {
      const m = lg.matches.find((x) => x.id === matchId);
      if (m && m.odds[key]) return acc * m.odds[key];
    }
    return acc;
  }, 1);

  const placeVirtual = async () => {
    const st = parseFloat(stake);
    if (!Number.isFinite(st) || st <= 0) { toast('Enter a stake.'); return; }
    if (!account) { toast('Sign in to play virtuals.'); return; }
    if (st > account.balance) { toast('Insufficient balance.'); return; }
    if (pickedCount === 0) { toast('Pick at least one virtual fixture.'); return; }
    adjustBalance(-st, `Virtual ticket placed · GHS ${formatAmt(st)}`);
    setSelections({});
    setTimeout(() => {
      const won = Math.random() > 0.55;
      if (won) {
        const win = Number((st * totalOdds).toFixed(2));
        adjustBalance(win, `Virtuals won · GHS ${formatAmt(win)}`);
      } else {
        toast('Virtuals settled · ticket lost.');
      }
    }, 3500);
  };

  return (
    <main className="page-wrap">
      <PageBack />
      <div className="page-head">
        <p className="eyebrow">VIRTUALS</p>
        <h1>Football, every minute.</h1>
        <p className="lede">A new draw every {countdown}s. Pick winners across simulated fixtures and settle in real time.</p>
      </div>

      <div className="virtuals-grid">
        {leagues.map((lg) => (
          <section key={lg.id} className="virtuals-league">
            <header>
              <h3>{lg.name}</h3>
              <span className="countdown">Next draw · 0:{countdown.toString().padStart(2, '0')}</span>
            </header>
            <div className="odds-headers"><span>Match</span><span>1</span><span>X</span><span>2</span></div>
            {lg.matches.map((m) => (
              <div key={m.id} className="match" style={{ gridTemplateColumns: '1fr 60px 60px 60px' }}>
                <div className="teams-stack">
                  <div className="team-line">{m.home}</div>
                  <div className="team-line">{m.away}</div>
                </div>
                {(['1', 'X', '2']).map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={`odd-btn${selections[m.id] === k ? ' selected' : ''}`}
                    onClick={() => setSelections((p) => ({ ...p, [m.id]: p[m.id] === k ? null : k }))}
                  >
                    <span className="ol">{k}</span>
                    <span className="ov">{m.odds[k].toFixed(2)}</span>
                  </button>
                ))}
              </div>
            ))}
          </section>
        ))}
      </div>

      <aside className="virtuals-slip">
        <h4>Virtual ticket</h4>
        <div className="sum-row"><span className="lbl">Selections</span><span className="val">{pickedCount}</span></div>
        <div className="sum-row"><span className="lbl">Total odds</span><span className="val">{pickedCount ? totalOdds.toFixed(2) : '—'}</span></div>
        <label className="dlg-label">Stake (GHS)</label>
        <input
          type="number"
          min="1"
          value={stake}
          onChange={(e) => setStake(e.target.value)}
          className="search-input"
        />
        <div className="sum-row payout">
          <span className="lbl">Potential</span>
          <span className="val">{pickedCount ? `GHS ${formatAmt(parseFloat(stake) * totalOdds)}` : '—'}</span>
        </div>
        <button type="button" className="place-bet" onClick={placeVirtual} style={{ marginTop: 12 }}>
          Place virtual bet
        </button>
      </aside>
    </main>
  );
}

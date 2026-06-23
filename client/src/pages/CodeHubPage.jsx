import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchMatches, fetchBetByCode } from '../api/betApi.js';
import { useToast, useAccount } from '../providers/AccountProvider.jsx';
import OddsGauge from '../components/OddsGauge.jsx';

function formatAmt(n) {
  return Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CodeHubPage() {
  const { toast } = useToast();
  const { account } = useAccount();
  const navigate = useNavigate();

  const [tab, setTab] = useState('code-hub');
  const [bookingCode, setBookingCode] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMatches('football')
      .then(setSnapshot)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const recommendedCodes = useMemo(() => {
    if (!snapshot?.leagues?.length) return [];

    const flat = [];
    for (const lg of snapshot.leagues) {
      for (const m of lg.matches || []) {
        if (m.finished || m.suspended) continue;
        flat.push({ league: lg, match: m });
      }
    }
    if (!flat.length) return [];

    const buildLeg = (match, market, outcome) => {
      const mk = match.markets?.[market];
      if (!mk) return null;
      const sel = mk.selections?.find((s) => s.key === outcome);
      if (!sel) return null;
      return {
        matchId: match.id,
        market,
        outcome,
        odds: sel.odds,
        home: match.home,
        away: match.away,
        pick: `${market === 'OU25' ? `${outcome} 2.5` : market === 'BTTS' ? `BTTS ${outcome}` : outcome === '1' ? 'Home' : outcome === '2' ? 'Away' : 'Draw'} @${sel.odds.toFixed(2)}`,
        type: market === '1X2' ? '1X2' : market === 'OU25' ? 'Over/Under' : market,
        matchLabel: `${match.home} vs ${match.away}`,
        time: match.isLive ? `LIVE ${match.minute || ''}` : `${match.day || 'Today'} ${match.kickoff || ''}`.trim(),
      };
    };

    const cards = [];

    // Card 1: Top picks (low odds favourites)
    const favs = flat
      .map(({ match }) => {
        const m = match.markets?.['1X2'];
        if (!m) return null;
        const best = m.selections.reduce((a, b) => (a.odds < b.odds ? a : b));
        return { match, outcome: best.key, odds: best.odds };
      })
      .filter(Boolean)
      .filter((x) => x.odds >= 1.2 && x.odds <= 2.0)
      .sort((a, b) => a.odds - b.odds)
      .slice(0, 5);

    if (favs.length >= 3) {
      const legs = favs.map(({ match, outcome }) => buildLeg(match, '1X2', outcome)).filter(Boolean);
      if (legs.length >= 3) {
        const odds = legs.reduce((acc, l) => acc * l.odds, 1);
        cards.push({
          id: 'safe-picks',
          folds: legs.length,
          odds: Number(odds.toFixed(2)),
          legs,
        });
      }
    }

    // Card 2: Over 2.5 goals
    const overs = flat
      .map(({ match }) => {
        const m = match.markets?.['OU25'];
        if (!m) return null;
        const over = m.selections.find((s) => s.key === 'Over');
        return over ? { match, odds: over.odds } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.odds - b.odds)
      .slice(0, 4);

    if (overs.length >= 2) {
      const legs = overs.map(({ match }) => buildLeg(match, 'OU25', 'Over')).filter(Boolean);
      if (legs.length >= 2) {
        const odds = legs.reduce((acc, l) => acc * l.odds, 1);
        cards.push({
          id: 'goals-galore',
          folds: legs.length,
          odds: Number(odds.toFixed(2)),
          legs,
        });
      }
    }

    // Card 3: BTTS
    const btts = flat
      .map(({ match }) => {
        const m = match.markets?.['BTTS'];
        if (!m) return null;
        const yes = m.selections.find((s) => s.key === 'Yes');
        return yes ? { match, odds: yes.odds } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.odds - b.odds)
      .slice(0, 4);

    if (btts.length >= 2) {
      const legs = btts.map(({ match }) => buildLeg(match, 'BTTS', 'Yes')).filter(Boolean);
      if (legs.length >= 2) {
        const odds = legs.reduce((acc, l) => acc * l.odds, 1);
        cards.push({
          id: 'btts-special',
          folds: legs.length,
          odds: Number(odds.toFixed(2)),
          legs,
        });
      }
    }

    return cards;
  }, [snapshot]);

  const loadCode = useCallback(async (e) => {
    e?.preventDefault();
    const code = bookingCode.trim().toUpperCase();
    if (!code) return;
    try {
      await fetchBetByCode(code);
      toast(`Code ${code} loaded — redirecting to slip.`);
      navigate(`/?code=${code}`);
    } catch {
      toast(`Booking code ${code} not found.`);
    }
  }, [bookingCode, toast, navigate]);

  const shareCode = async (code) => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Xenbet Code', text: `Check out this bet on Xenbet — code ${code}` });
      } else {
        await navigator.clipboard?.writeText(code);
        toast(`Code ${code} copied.`);
      }
    } catch {/* cancelled */}
  };

  return (
    <div className="codehub">
      {/* Balance bar */}
      <div className="codehub-balance-bar">
        <div className="codehub-mode-toggle">
          <button type="button" className="codehub-mode active">REAL</button>
          <button type="button" className="codehub-mode">SIM</button>
        </div>
        <span className="codehub-bal">GHS {formatAmt(account?.balance || 0)}</span>
      </div>

      {/* Tabs */}
      <div className="codehub-tabs">
        {[
          ['code-hub', 'Code Hub'],
          ['my-pins', 'My Pins'],
          ['multi-maker', 'Multi Maker'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`codehub-tab${tab === key ? ' active' : ''}`}
            onClick={() => setTab(key)}
          >
            {key === 'code-hub' && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 18l6-6-6-6" /><path d="M8 6l-6 6 6 6" />
              </svg>
            )}
            {key === 'my-pins' && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            )}
            {key === 'multi-maker' && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
              </svg>
            )}
            {label}
          </button>
        ))}
      </div>

      {/* Recommended codes */}
      {tab === 'code-hub' && (
        <div className="codehub-content">
          <h3 className="codehub-section-title">Recommended Football Codes</h3>

          {loading && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)' }}>
              Loading codes…
            </div>
          )}

          {!loading && recommendedCodes.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
              No codes available — check back after the next odds refresh.
            </div>
          )}

          {recommendedCodes.map((card) => (
            <div key={card.id} className="codehub-card">
              <div className="codehub-card-header">
                <span className="codehub-card-code">
                  {card.id === 'safe-picks' ? '⭐ Top Picks' : card.id === 'goals-galore' ? '⚽ Over 2.5 Goals' : '🔄 BTTS'}
                </span>
                <div className="codehub-card-meta">
                  <span>Folds: <strong>{card.folds}</strong></span>
                  <span className="codehub-card-odds">
                    <OddsGauge odds={card.odds} size={42} />
                    <span>{formatAmt(card.odds)}</span>
                  </span>
                </div>
              </div>

              {card.legs.map((leg, i) => (
                <div key={i} className="codehub-leg">
                  <span className="codehub-leg-icon">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="var(--accent)" stroke="none">
                      <circle cx="12" cy="12" r="5" />
                    </svg>
                  </span>
                  <div className="codehub-leg-info">
                    <div className="codehub-leg-pick">
                      {leg.pick} | {leg.type}
                    </div>
                    <div className="codehub-leg-match">{leg.matchLabel}</div>
                  </div>
                  <span className="codehub-leg-time">{leg.time}</span>
                </div>
              ))}

              <div className="codehub-card-actions">
                <button
                  type="button"
                  className="codehub-add"
                  onClick={() => {
                    const payload = { legs: card.legs };
                    try {
                      sessionStorage.setItem('sp_recommended_legs', JSON.stringify(payload));
                    } catch { /* ignore */ }
                    navigate('/');
                  }}
                >
                  Add to Betslip
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'my-pins' && (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
          Your pinned codes will appear here.
        </div>
      )}

      {tab === 'multi-maker' && (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
          Build multi-bet combinations here.
        </div>
      )}

      {/* Booking code input */}
      <div className="codehub-footer">
        <div className="codehub-footer-label">Please insert booking code</div>
        <form className="codehub-footer-form" onSubmit={loadCode}>
          <input
            type="text"
            value={bookingCode}
            onChange={(e) => setBookingCode(e.target.value.toUpperCase().replace(/\s+/g, ''))}
            placeholder="Booking Code"
            maxLength={12}
            autoCapitalize="characters"
            spellCheck={false}
            className="codehub-footer-input"
          />
          <button type="submit" className="codehub-footer-load" disabled={!bookingCode.trim()}>
            Load
          </button>
        </form>
      </div>
    </div>
  );
}

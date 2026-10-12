import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useMediaQuery from '../../premium/useMediaQuery.js';
import useStitchFixtures from '../../premium/useStitchFixtures.js';
import { StitchFooter, StitchTopNav } from '../../premium/StitchChrome.jsx';
import { TabBar } from './StitchMobile.jsx';
import { formatAmt } from '../../lib/betslipEngine.js';
import { fetchBetByCode } from '../../api/betApi.js';
import { useAccount, useToast } from '../../providers/AccountProvider.jsx';

/* ---------------------------------------------------------------------------
   Stitch — Code Hub
   Recommended accumulators are DERIVED from the real /bet/matches feed (the
   current odds), never invented. When the live feed is unreachable we show an
   honest unavailable state instead of a designed preview. "Add to Betslip"
   hands the legs to the slip through sessionStorage and returns home.
   ------------------------------------------------------------------------- */

const LEGS_KEY = 'sp_recommended_legs';

function buildRecommended(snapshot) {
  const flat = [];
  for (const lg of snapshot?.leagues || []) {
    for (const m of lg.matches || []) {
      if (m.finished || m.suspended) continue;
      flat.push(m);
    }
  }
  if (!flat.length) return [];

  const buildLeg = (match, market, outcome) => {
    const mk = match.markets?.[market];
    const sel = mk?.selections?.find((s) => s.key === outcome);
    if (!sel) return null;
    const pick = market === 'OU25' ? `${outcome} 2.5`
      : market === 'BTTS' ? `BTTS ${outcome}`
        : outcome === '1' ? 'Home'
          : outcome === '2' ? 'Away' : 'Draw';
    return {
      matchId: match.id,
      market,
      outcome,
      odds: sel.odds,
      home: match.home,
      away: match.away,
      pick: `${pick} @${sel.odds.toFixed(2)}`,
      type: market === '1X2' ? '1X2' : market === 'OU25' ? 'Over/Under' : market,
      matchLabel: `${match.home} vs ${match.away}`,
      time: match.isLive ? `LIVE ${match.minute ?? ''}` : `${match.day || ''} ${match.kickoff || ''}`.trim(),
    };
  };

  const cards = [];

  const favs = flat
    .map((match) => {
      const mk = match.markets?.['1X2'];
      if (!mk?.selections?.length) return null;
      const best = mk.selections.reduce((a, b) => (b.odds < a.odds ? b : a));
      return { match, outcome: best.key, odds: best.odds };
    })
    .filter(Boolean)
    .filter((x) => Number.isFinite(x.odds))
    .sort((a, b) => a.odds - b.odds)
    .slice(0, 5);
  if (favs.length >= 3) {
    const legs = favs.map(({ match, outcome }) => buildLeg(match, '1X2', outcome)).filter(Boolean);
    if (legs.length >= 3) {
      const odds = legs.reduce((acc, l) => acc * l.odds, 1);
      cards.push({ id: 'safe-picks', folds: legs.length, odds: Number(odds.toFixed(2)), legs });
    }
  }

  const overs = flat
    .map((match) => {
      const over = match.markets?.['OU25']?.selections?.find((s) => s.key === 'Over');
      return over ? { match, odds: over.odds } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.odds - b.odds)
    .slice(0, 4);

  if (overs.length >= 2) {
    const legs = overs.map(({ match }) => buildLeg(match, 'OU25', 'Over')).filter(Boolean);
    if (legs.length >= 2) {
      cards.push({ id: 'goals-galore', folds: legs.length, odds: Number(legs.reduce((a, l) => a * l.odds, 1).toFixed(2)), legs });
    }
  }

  const btts = flat
    .map((match) => {
      const mk = match.markets?.['BTTS'];
      const yes = mk?.selections?.find((s) => s.key === 'Yes');
      return yes ? { match, odds: yes.odds } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.odds - b.odds)
    .slice(0, 4);

  if (btts.length >= 2) {
    const legs = btts.map(({ match }) => buildLeg(match, 'BTTS', 'Yes')).filter(Boolean);
    if (legs.length >= 2) {
      cards.push({ id: 'btts-special', folds: legs.length, odds: Number(legs.reduce((a, l) => a * l.odds, 1).toFixed(2)), legs });
    }
  }

  return cards;
}

const TITLES = {
  'safe-picks': '⭐ Top Picks',
  'goals-galore': '⚽ Over 2.5 Goals',
  'btts-special': '🔄 Both Teams To Score',
};

export default function StitchCodeHub() {
  const isMobile = useMediaQuery('(max-width: 1023px)');
  const navigate = useNavigate();
  const { account, openDeposit } = useAccount();
  const { toast } = useToast();
  const { snapshot, loading, usingSeed } = useStitchFixtures('football');

  const [tab, setTab] = useState('code-hub');
  const [bookingCode, setBookingCode] = useState('');

  const recommended = useMemo(
    () => (snapshot && !usingSeed ? buildRecommended(snapshot) : []),
    [snapshot, usingSeed],
  );

  const loadCode = async (e) => {
    e?.preventDefault();
    const code = bookingCode.trim().toUpperCase();
    if (!code) return;
    try {
      const { bet } = await fetchBetByCode(code);
      if (!bet?.legs?.length) { toast(`Booking code ${code} has no selections.`); return; }
      const legs = bet.legs.map((l) => ({
        matchId: l.matchId,
        market: l.market,
        outcome: l.outcome,
        odds: l.odds,
        home: l.home,
        away: l.away,
        marketName: l.marketName,
      }));
      try { sessionStorage.setItem(LEGS_KEY, JSON.stringify({ legs })); } catch { /* ignore */ }
      navigate('/');
      toast(`Loaded ${legs.length} selection${legs.length === 1 ? '' : 's'} from ${code}.`);
    } catch {
      toast(`Booking code ${code} not found.`);
    }
  };

  const shared = (
    <>
      <div className="stx-sectionhead">
        <div>
          <h1 className="stx-h1">Code Hub</h1>
          <p className="stx-sub">Ready-made football accumulators built from live odds.</p>
        </div>
      </div>

      <nav className="stx-mtabs" aria-label="Code Hub views">
        {[
          ['code-hub', 'Code Hub'],
          ['my-pins', 'My Pins'],
          ['multi-maker', 'Multi Maker'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`stx-mtab${tab === key ? ' stx-mtab--on' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'code-hub' && (
        <div className="stx-cgrid">
          {loading && !snapshot && (
            <p className="stx-body-md stx-muted" style={{ textAlign: 'center', padding: '32px 0' }}>Loading codes…</p>
          )}

          {!loading && (usingSeed || recommended.length === 0) && (
            <div className="stx-bets-empty">
              <p className="stx-body-md">
                {usingSeed
                  ? 'Live odds feed unavailable — recommended codes appear when odds are live.'
                  : 'No codes available right now — check back after the next odds refresh.'}
              </p>
            </div>
          )}

          {!usingSeed && recommended.map((card) => (
            <article key={card.id} className="stx-ccard">
              <header className="stx-ccard-head">
                <span className="stx-ccard-title">{TITLES[card.id] || card.id}</span>
                <span className="stx-ccard-odds">
                  <span className="stx-body-sm stx-muted">{card.folds} folds</span>
                  <b>{formatAmt(card.odds)}</b>
                </span>
              </header>

              <ul className="stx-clegs">
                {card.legs.map((leg, i) => (
                  <li key={i} className="stx-cleg">
                    <span className="stx-cleg-dot" aria-hidden="true" />
                    <div className="stx-cleg-info">
                      <div className="stx-cleg-pick">{leg.pick} · <span className="stx-muted">{leg.type}</span></div>
                      <div className="stx-cleg-match">{leg.matchLabel}</div>
                    </div>
                    <span className="stx-cleg-time">{leg.time}</span>
                  </li>
                ))}
              </ul>

              <button type="button" className="stx-cta" onClick={() => addToBetslip(card, navigate, toast)}>
                Add to Betslip
              </button>
            </article>
          ))}
        </div>
      )}

      {tab === 'my-pins' && (
        <div className="stx-bets-empty">
          <p className="stx-body-md">Pinned games you follow will appear here.</p>
        </div>
      )}

      {tab === 'multi-maker' && (
        <div className="stx-bets-empty">
          <p className="stx-body-md">Combine your own selections in the betslip to build a multi.</p>
        </div>
      )}

      <form className="stx-cform" onSubmit={loadCode}>
        <label className="stx-cform-label" htmlFor="stx-code-input">Insert a booking code</label>
        <div className="stx-cform-row">
          <input
            id="stx-code-input"
            className="stx-cform-input"
            type="text"
            value={bookingCode}
            onChange={(e) => setBookingCode(e.target.value.toUpperCase().replace(/\s+/g, ''))}
            placeholder="Booking Code"
            maxLength={12}
            autoCapitalize="characters"
            spellCheck={false}
          />
          <button type="submit" className="stx-cta" disabled={!bookingCode.trim()}>Load</button>
        </div>
      </form>
    </>
  );

  if (isMobile) {
    return (
      <div className="stx">
        <div className="stx-mob">
          <header className="stx-mob-head">
            <Link to="/" className="stx-brand" style={{ fontSize: 17 }}>
              <span className="stx-brand-mark" style={{ width: 26, height: 26 }}>
                <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 15, height: 15 }} aria-hidden="true">
                  <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" />
                </svg>
              </span>
              BetXentra
            </Link>
            <div className="stx-right">
              <span className="stx-mob-bal"><span>BAL</span> GHS {formatAmt(account?.balance || 0)}</span>
              <button type="button" className="stx-depbtn" onClick={openDeposit}>+ ADD</button>
            </div>
          </header>
          <div className="stx-mob-body">{shared}</div>
        </div>
        <TabBar current="/codes" />
      </div>
    );
  }

  return (
    <div className="stx">
      <StitchTopNav slip={{ account, openDeposit }} current="/codes" />
      <div className="stx-page">{shared}</div>
      <StitchFooter current="/codes" />
    </div>
  );
}

function addToBetslip(card, navigate, toast) {
  try { sessionStorage.setItem(LEGS_KEY, JSON.stringify({ legs: card.legs })); } catch { /* ignore */ }
  toast?.(`${card.folds}-fold added to your betslip.`);
  navigate('/');
}

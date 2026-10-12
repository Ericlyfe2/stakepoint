import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useStitchFixtures from '../../premium/useStitchFixtures.js';
import useStitchSlip from '../../premium/useStitchSlip.js';
import useStitchCashout from '../../premium/useStitchCashout.js';
import { BetslipRail, SlipToast } from '../../premium/StitchBetslip.jsx';
import { StitchFooter, StitchSideRail, StitchTopNav } from '../../premium/StitchChrome.jsx';
import { EventTimeline, MomentumChart, PitchVisualizer, StatBar } from '../../premium/StitchPitch.jsx';
import { LiveMinute, MarketOdds } from '../../premium/parts.jsx';
import { formatAmt } from '../../lib/betslipEngine.js';

/* ---------------------------------------------------------------------------
   Stitch screen 03 — Live Match Radar & In-Play Betting
   12d2c727d26240b0912075fbb5970d49

   Left rail · centre tactical canvas · right rail betslip with the live
   cash-out panel injected above the stake block.

   Everything on this screen is fed by the live fixtures API + socket:
   markets, the event timeline, the score and the cash-out offer. The pitch
   radar is labelled illustrative because the feed carries no positional
   tracking, and the cash-out panel reads the user's real open bet or shows an
   honest empty state — it never invents a value.
   ------------------------------------------------------------------------- */

/* Only markets the fixture actually ships — no fictional in-play markets. */
const MARKET_TABS = [
  { key: '1X2', label: 'Match Result' },
  { key: 'DC', label: 'Double Chance' },
  { key: 'OU25', label: 'Over/Under 2.5' },
  { key: 'OU35', label: 'Over/Under 3.5' },
  { key: 'BTTS', label: 'Both to Score' },
];

const EVENT_ICON = {
  goal: '⚽',
  penalty: '⚽',
  card: '▮',
  free_kick: '⚑',
  sub: '⇄',
  corner: '⛳',
};

const EVENT_LABEL = {
  goal: 'GOAL',
  card: 'CARD',
  free_kick: 'FREE KICK',
  sub: 'SUBSTITUTION',
  penalty: 'PENALTY',
  corner: 'CORNER',
};

/** Real statistics derivable from the fixture feed — score and events. */
function deriveStats(match) {
  const ev = match.events || [];
  const count = (kind, team) => ev.filter((e) => e.kind === kind && e.team === team).length;
  return {
    goals: { home: match.scoreHome ?? 0, away: match.scoreAway ?? 0 },
    cards: { home: count('card', 'home'), away: count('card', 'away') },
  };
}

/** The real cash-out panel: bound to the user's actual open bet on this match. */
function CashOutPanel({ match }) {
  const { status, bet, currentOffer, autoCashoutTarget, busy, error, execute, setAuto } =
    useStitchCashout(match?.id);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const stake = Number(bet?.stake || 0);
    setPct(stake > 0 && autoCashoutTarget > 0
      ? Math.max(0, Math.round((autoCashoutTarget / stake - 1) * 100))
      : 0);
  }, [bet?.id, autoCashoutTarget]);

  if (status === 'guest') {
    return (
      <div className="stx-cashout">
        <div className="stx-cashout-row"><span>Cash Out</span><b>—</b></div>
        <p className="stx-body-sm" style={{ margin: 0 }}>
          Sign in to see the cash-out value of your open bets.
        </p>
        <Link to="/login" className="stx-cta" style={{ height: 42, justifyContent: 'center' }}>
          Sign in
        </Link>
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <div className="stx-cashout">
        <div className="stx-cashout-row"><span>Cash Out</span><b>…</b></div>
        <p className="stx-body-sm" style={{ margin: 0 }}>Checking for an open bet on this match…</p>
      </div>
    );
  }

  if (status === 'none') {
    return (
      <div className="stx-cashout">
        <div className="stx-cashout-row"><span>Cash Out</span><b>—</b></div>
        <p className="stx-body-sm" style={{ margin: 0 }}>
          No open bet on this match. Place a bet to unlock in-play cash-out.
        </p>
      </div>
    );
  }

  if (status === 'error' || status === 'unavailable' || status === 'locked') {
    const message = status === 'locked'
      ? 'Cash-out is locked for this match. Please try again later.'
      : status === 'unavailable'
        ? "Cash-out isn't available for this bet right now."
        : 'Cash-out value is temporarily unavailable.';
    return (
      <div className="stx-cashout">
        <div className="stx-cashout-row"><span>Cash Out</span><b>—</b></div>
        <p className="stx-body-sm" style={{ margin: 0 }}>{message}</p>
      </div>
    );
  }

  const stake = Number(bet?.stake || 0);
  const potential = Number(bet?.potentialWin ?? stake * (Number(bet?.totalOdds) || 0));
  const profitPct = stake > 0 ? Math.round(((currentOffer - stake) / stake) * 100) : 0;
  const autoTarget = pct > 0 && stake > 0 ? Number((stake * (1 + pct / 100)).toFixed(2)) : 0;
  const commitAuto = () => setAuto(autoTarget);

  return (
    <div className="stx-cashout">
      <div className="stx-cashout-row">
        <span>Stake</span>
        <b>GHS {formatAmt(stake)}</b>
      </div>
      <div className="stx-cashout-row">
        <span>Potential Win</span>
        <b>GHS {formatAmt(potential)}</b>
      </div>
      <div className="stx-cashout-big">
        <span>
          CURRENT CASH OUT
          <br />
          <span className="stx-cashout-profit">
            {profitPct >= 0 ? '+' : ''}{profitPct}% {profitPct >= 0 ? 'PROFIT' : 'LOSS'}
          </span>
        </span>
        <b>GHS {formatAmt(currentOffer)}</b>
      </div>
      <button
        type="button"
        className="stx-cta"
        style={{ height: 42 }}
        onClick={() => execute(1)}
        disabled={busy || !(currentOffer > 0)}
      >
        {busy ? 'Cashing out…' : `💳 Cash Out GHS ${formatAmt(currentOffer)}`}
      </button>

      <label className="stx-cashout-row" style={{ cursor: 'pointer' }}>
        <span>⚙ Auto cash out at</span>
        <input
          className="stx-range"
          type="range"
          min="0"
          max="100"
          step="5"
          value={pct}
          onChange={(e) => setPct(Number(e.target.value))}
          onMouseUp={commitAuto}
          onTouchEnd={commitAuto}
          onKeyUp={commitAuto}
          onBlur={commitAuto}
          aria-label="Auto cash out percentage"
        />
        <b>{pct > 0 ? `+${pct}% (GHS ${formatAmt(autoTarget)})` : 'Off'}</b>
      </label>

      {error && (
        <p className="stx-body-sm" style={{ margin: 0, color: 'var(--stx-odds-down)' }}>{error}</p>
      )}
    </div>
  );
}

export default function StitchLiveTracker() {
  const { snapshot, leagues, liveMatches, liveCount, usingSeed } = useStitchFixtures('football');
  const slip = useStitchSlip({ snapshot });
  const [tab, setTab] = useState(MARKET_TABS[0].key);
  const [selectedId, setSelectedId] = useState(null);

  const match = liveMatches.find((m) => m.id === selectedId)
    || liveMatches[0]
    || leagues[0]?.matches?.[0]
    || null;
  const league = useMemo(
    () => leagues.find((lg) => lg.matches.some((m) => m.id === match?.id)),
    [leagues, match],
  );

  const stats = useMemo(() => (match ? deriveStats(match) : null), [match]);

  if (!match) {
    return (
      <div className="stx">
        <StitchTopNav slip={slip} current="/live" />
        <div className="stx-desk">
          <StitchSideRail liveCount={liveCount} activeSport="football" />
          <main className="stx-stage">
            <div className="stx-panel">
              <h2>No live fixtures</h2>
              <p className="stx-body-sm stx-muted">
                Nothing is in-play right now. Check the sportsbook for upcoming fixtures.
              </p>
              <Link to="/" className="stx-promo-cta" style={{ marginTop: 12 }}>
                Back to Sportsbook
              </Link>
            </div>
          </main>
          <BetslipRail slip={slip} />
        </div>
      </div>
    );
  }

  const homeName = match.home;
  const awayName = match.away;
  const markets = match.markets || {};
  const tabs = MARKET_TABS.filter((t) => markets[t.key]);
  const activeTab = tabs.some((t) => t.key === tab) ? tab : tabs[0]?.key;
  const activeMarket = activeTab ? markets[activeTab] : null;
  const latestEvent = (match.events || [])[0] || null;
  const canSwitch = liveMatches.length > 1;

  const switchMatch = () => {
    const idx = liveMatches.findIndex((m) => m.id === match.id);
    const next = liveMatches[(idx + 1) % liveMatches.length];
    if (next) setSelectedId(next.id);
  };

  return (
    <div className="stx">
      <StitchTopNav slip={slip} current="/live" betCount={slip.selectionCount} />

      <div className="stx-desk">
        <StitchSideRail liveCount={liveCount} activeSport="football" />

        <main className="stx-stage">
          {usingSeed && (
            <p className="stx-badge stx-muted" style={{ margin: 0 }}>
              Showing designed preview fixtures — the live API is unreachable.
            </p>
          )}

          <nav className="stx-crumbs">
            <Link to="/live">Live Sports</Link> /
            <Link to="/">Football</Link> /
            <span>{league?.name}</span> /
            <b>{homeName} vs {awayName}</b>
          </nav>

          <button
            type="button"
            className="stx-switcher"
            onClick={switchMatch}
            disabled={!canSwitch}
          >
            SWITCH MATCH: {homeName} vs {awayName} ({match.minute}&apos; — {match.scoreHome} - {match.scoreAway})
            <span className="stx-right">⌄</span>
          </button>

          <section className="stx-panel">
            <div className="stx-mhero">
              <div className="stx-mhero-team">
                <span className="stx-mhero-crest">{homeName.slice(0, 3).toUpperCase()}</span>
                <div>
                  <div className="stx-mhero-name">{homeName}</div>
                  <div className="stx-mhero-sub">Home{match.period ? ` — ${match.period}` : ''}</div>
                </div>
              </div>

              <div className="stx-mhero-center">
                <div className="stx-mhero-score">
                  {match.scoreHome ?? 0} : {match.scoreAway ?? 0}
                </div>
                <span className="stx-mhero-clock">{match.minute}&apos;</span>
                <span className="stx-mhero-phase">{match.period || 'LIVE'}</span>
              </div>

              <div className="stx-mhero-team">
                <span className="stx-mhero-crest stx-mhero-crest--away">{awayName.slice(0, 3).toUpperCase()}</span>
                <div>
                  <div className="stx-mhero-name">{awayName}</div>
                  <div className="stx-mhero-sub">Away{match.period ? ` — ${match.period}` : ''}</div>
                </div>
              </div>
            </div>

            {latestEvent && (
              <div className="stx-alert">
                <b>{(latestEvent.kind || 'event').replace('_', ' ').toUpperCase()}</b>
                <span>{latestEvent.note || latestEvent.kind}</span>
                <span className="stx-right">{latestEvent.minute}&apos;</span>
              </div>
            )}

            <PitchVisualizer
              homeName={homeName}
              awayName={awayName}
              alert={latestEvent?.kind === 'free_kick'
                ? { title: `FREE KICK (${latestEvent.minute}')`, note: latestEvent.note || 'Free kick in play' }
                : null}
            />

            <MomentumChart events={match.events} minute={match.minute} />
            {stats && <StatBar stats={stats} />}
            <EventTimeline events={match.events} minute={match.minute} />
          </section>

          <section className="stx-panel">
            <div className="stx-sectionhead">
              <div>
              <h2>Main Markets</h2>
              <p className="stx-sub">Live prices for {homeName} vs {awayName}.</p>
              </div>
              <span className="stx-chip">
                <span className="stx-live-dot" /> {liveCount} LIVE
              </span>
            </div>

            <div className="stx-xscroll" style={{ marginBottom: 12 }}>
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={`stx-chip${activeTab === t.key ? ' stx-chip--on' : ''}`}
                  onClick={() => setTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {activeMarket ? (
              <div className="stx-mkt">
                <div className="stx-mkt-head">
                  <b>{activeMarket.name}</b>
                  <LiveMinute minute={match.minute} />
                </div>
                <MarketOdds
                  market={activeTab}
                  match={match}
                  selections={slip.selections}
                  onToggle={slip.toggleSelection}
                  columns={(activeMarket.selections?.length || 0) >= 3 ? 3 : 2}
                />
              </div>
            ) : (
              <p className="stx-body-sm stx-muted">
                No in-play markets are available for this fixture.
              </p>
            )}
          </section>
        </main>

        <BetslipRail slip={slip} cashoutSlot={<CashOutPanel match={match} />} />
      </div>

      <StitchFooter current="/live" />
      <SlipToast slip={slip} />
    </div>
  );
}

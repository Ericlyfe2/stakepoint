import { useMemo, useState } from 'react';
import useStitchFixtures from '../../premium/useStitchFixtures.js';
import useStitchPayouts from '../../premium/useStitchPayouts.js';
import useStitchPromos from '../../premium/useStitchPromos.js';
import useStitchSlip from '../../premium/useStitchSlip.js';
import { BetslipRail, SlipToast } from '../../premium/StitchBetslip.jsx';
import { StitchFooter, StitchSideRail, StitchTopNav } from '../../premium/StitchChrome.jsx';
import { MARKET_FILTERS, SPORT_CATEGORIES } from '../../premium/stitchSeed.js';
import {
  FixtureRow,
  LiveMatchCard,
  MarketChip,
  PromoCard,
  SportPill,
} from '../../premium/parts.jsx';
import { BONUS_RATE, formatAmt } from '../../lib/betslipEngine.js';

/* ---------------------------------------------------------------------------
   Stitch screen 01 — BetXentra Premium Sportsbook Redesign (desktop)
   b275bef02f6f47569194483e7ef48c56
   Three-column workstation: 240 rail · fluid centre · 340 betslip.
   ------------------------------------------------------------------------- */

const LEAGUE_TABS = ['1', 'X', '2', 'All'];

/* Real settled wins only, served by GET /bet/recent-payouts. Never seed or
   invent names here — the backend endpoint only returns masked, verified
   payouts, and a made-up winner would breach that guarantee. */
function PayoutTicker({ payouts, unavailable }) {
  const items = useMemo(
    () => (payouts.length ? [...payouts, ...payouts] : []),
    [payouts],
  );

  return (
    <div className="stx-ticker">
      <span className="stx-ticker-tag">
        <span className="stx-live-dot" /> VERIFIED PAYOUTS
      </span>
      <div className="stx-ticker-track">
        {items.length > 0 ? (
          items.map((p, i) => (
            <span className="stx-ticker-item" key={`${p.id}-${i}`}>
              {p.maskedId} won <b>{p.currency || 'GHS'} {formatAmt(p.amount)}</b>
              {p.sport ? <em className="stx-muted"> · {String(p.sport).toUpperCase()}</em> : null}
            </span>
          ))
        ) : (
          <span className="stx-ticker-item stx-muted">
            {unavailable
              ? 'Payout feed unavailable right now.'
              : 'Loading verified payouts…'}
          </span>
        )}
      </div>
    </div>
  );
}

export default function StitchSportsbook() {
  const { snapshot, leagues, liveMatches, upcomingMatches, liveCount, usingSeed } =
    useStitchFixtures('football');
  const { payouts, unavailable: payoutsUnavailable } = useStitchPayouts();
  const { promos } = useStitchPromos();
  const slip = useStitchSlip({ snapshot });

  const [sport, setSport] = useState('football');
  const [filter, setFilter] = useState('1X2');
  const [railMode, setRailMode] = useState('upcoming');
  const [leagueTabs, setLeagueTabs] = useState({});
  const [query, setQuery] = useState('');

  const onToggle = slip.toggleSelection;

  const q = query.trim().toLowerCase();

  const liveLeagues = useMemo(() => {
    const ids = new Set(liveMatches.map((m) => m.id));
    const hit = (m, lg) => !q
      || String(m.home).toLowerCase().includes(q)
      || String(m.away).toLowerCase().includes(q)
      || String(lg.name).toLowerCase().includes(q);
    return leagues
      .map((lg) => ({ ...lg, matches: lg.matches.filter((m) => ids.has(m.id) && hit(m, lg)) }))
      .filter((lg) => lg.matches.length);
  }, [leagues, liveMatches, q]);

  const upcomingLeagues = useMemo(() => {
    const ids = new Set(upcomingMatches.map((m) => m.id));
    const hit = (m, lg) => !q
      || String(m.home).toLowerCase().includes(q)
      || String(m.away).toLowerCase().includes(q)
      || String(lg.name).toLowerCase().includes(q);
    return leagues
      .map((lg) => ({ ...lg, matches: lg.matches.filter((m) => ids.has(m.id) && hit(m, lg)) }))
      .filter((lg) => lg.matches.length);
  }, [leagues, upcomingMatches, q]);

  return (
    <div className="stx">
      <StitchTopNav slip={slip} current="/" betCount={slip.selectionCount} search={query} onSearch={setQuery} />

      <div className="stx-desk">
        <StitchSideRail
          liveCount={liveCount}
          activeSport={sport}
          onSport={setSport}
          mode={railMode}
          onMode={setRailMode}
        />

        <main className="stx-stage">
          {usingSeed && (
            <p className="stx-badge stx-muted" style={{ margin: 0 }}>
              Showing designed preview fixtures — the live API is unreachable.
            </p>
          )}

          {promos.length > 0 ? (
            <div className="stx-promo">
              {promos.slice(0, 3).map((p) => (
                <PromoCard
                  key={p.id}
                  eyebrow={p.badge}
                  title={p.title}
                  copy={p.body}
                  cta={p.cta}
                  accent={p.accent}
                />
              ))}
            </div>
          ) : (
            <div className="stx-promo">
              <PromoCard
                eyebrow="PROMOTIONS"
                title="No active offers right now"
                copy="New boosts and bonuses appear here the moment they go live."
              />
            </div>
          )}

          <div className="stx-boost">
            <div>
              <h3>Acca Boost — every accumulator, automatically</h3>
              <p>Every multi's potential return already includes the boost. No code, no opt-in.</p>
            </div>
            <div className="stx-right">
              <div className="stx-boost-num">
                <b>+{Math.round(BONUS_RATE * 100)}%</b>
                <span>ALL MULTIPLES</span>
              </div>
            </div>
          </div>

          <PayoutTicker payouts={payouts} unavailable={payoutsUnavailable} />

          <div className="stx-xscroll">
            {SPORT_CATEGORIES.map((s) => (
              <SportPill
                key={s.id}
                item={s}
                active={sport === s.id}
                onClick={() => setSport(s.id)}
              />
            ))}
          </div>

          <div className="stx-xscroll">
            {MARKET_FILTERS.map((m) => (
              <MarketChip
                key={m.id}
                item={m}
                live={m.id === 'live' && liveCount > 0}
                active={filter === m.id}
                onClick={() => setFilter(m.id)}
              />
            ))}
          </div>

          {q && liveLeagues.length === 0 && upcomingLeagues.length === 0 && (
            <p className="stx-badge stx-muted" style={{ margin: 0 }}>
              No fixtures match “{query.trim()}”.
            </p>
          )}

          {liveLeagues.length > 0 && (
            <section>
              <div className="stx-sectionhead">
                <div>
                  <h2>Live Now</h2>
                  <span className="stx-sub">
                    {liveCount} Matches In-Play
                  </span>
                </div>
                <span className="stx-chip stx-chip--live">
                  <span className="stx-live-dot" /> All live ({liveCount})
                </span>
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                {liveLeagues.flatMap((lg) => lg.matches.map((m) => (
                  <LiveMatchCard
                    key={m.id}
                    match={m}
                    league={lg}
                    selections={slip.selections}
                    onToggle={onToggle}
                  />
                )))}
              </div>
            </section>
          )}

          {upcomingLeagues.map((lg) => {
            const tab = leagueTabs[lg.id] || '1';
            return (
              <section className="stx-league" key={lg.id}>
                <header className="stx-league-head">
                  <span
                    className="stx-league-crest"
                    style={{ background: lg.crest?.style || 'var(--stx-sc-high)' }}
                  >
                    {lg.crest?.label || lg.short}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="stx-league-name">{lg.name}</div>
                    <div className="stx-league-meta">{lg.country} — {lg.meta}</div>
                  </div>
                  <div className="stx-right">
                    <span className="stx-league-meta">{lg.matches.length} EVENTS</span>
                  </div>
                </header>

                <nav className="stx-mtabs">
                  {LEAGUE_TABS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`stx-mtab${t === tab ? ' stx-mtab--on' : ''}`}
                      onClick={() => setLeagueTabs((prev) => ({ ...prev, [lg.id]: t }))}
                    >
                      {t}
                    </button>
                  ))}
                </nav>

                {lg.matches.map((m) => {
                  // Tabs 1/X/2 are single outcomes of the 1X2 market; "All"
                  // shows whichever market family the filter chips selected.
                  const market = tab === 'All' ? (filter === 'live' ? '1X2' : filter) : tab;
                  const keys = market === '1' || market === 'X' || market === '2'
                    ? market
                    : null;
                  return (
                    <FixtureRow
                      key={`${m.id}-${market}`}
                      match={m}
                      market={keys ? '1X2' : market}
                      selections={slip.selections}
                      onToggle={onToggle}
                      columns={m.markets?.[keys ? '1X2' : market]?.selections?.length > 3 ? 4 : undefined}
                      tags={
                        <>
                          {m.moreMarkets > 6 && <span className="stx-tag">+{m.moreMarkets} MKTS</span>}
                        </>
                      }
                    />
                  );
                })}
              </section>
            );
          })}
        </main>

        <BetslipRail slip={slip} />
      </div>

      <StitchFooter current="/" />
      <SlipToast slip={slip} />
    </div>
  );
}

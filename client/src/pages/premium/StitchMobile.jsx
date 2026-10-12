import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useStitchFixtures from '../../premium/useStitchFixtures.js';
import useStitchIntake from '../../premium/useStitchIntake.js';
import useStitchPromos from '../../premium/useStitchPromos.js';
import useStitchSlip from '../../premium/useStitchSlip.js';
import { BetslipDock, SlipToast } from '../../premium/StitchBetslip.jsx';
import { SPORT_CATEGORIES } from '../../premium/stitchSeed.js';
import { Crest, Ic, LiveMinute, MarketOdds, PromoCard, SportPill } from '../../premium/parts.jsx';
import { formatAmt } from '../../lib/betslipEngine.js';
import { useToast } from '../../providers/AccountProvider.jsx';

/* ---------------------------------------------------------------------------
   Stitch screens 02 & 04 — BetXentra Mobile App with Bottom Betslip
   df7a90e780644530871318c1601515ac (dark)  ·  0d9410f23cd94f4e93762ad1886a3f19 (light)

   Identical layout; `light` swaps the token set via the .stx-light modifier in
   styles/stitch.css. Odds collapse to 3-way / 2-way split blocks and the
   slip persists as a thumb-accessible dock above the 5-tab bar, per DESIGN.md.
   ------------------------------------------------------------------------- */

const TABS = [
  { to: '/', label: 'Sports', icon: '⚽' },
  { to: '/live', label: 'Live', icon: '◉' },
  { to: '/my-bets', label: 'My Bets', icon: '▤' },
  { to: '/casino', label: 'Casino', icon: '◈' },
  { to: '/profile', label: 'Account', icon: '◍' },
];

export function TabBar({ betCount, current = '/' }) {
  return (
    <nav className="stx-tabbar" aria-label="Primary">
      {TABS.map((t) => (
        <Link
          key={t.label}
          to={t.to}
          className={current === t.to ? 'stx-tabbar--on' : undefined}
        >
          <Ic name={t.icon} size="lg" />
          {t.label}
          {t.label === 'My Bets' && betCount > 0 && (
            <span className="stx-badge-dot">{betCount}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}

export default function StitchMobile({ light = false }) {
  const { snapshot, leagues, liveMatches, liveCount, usingSeed } = useStitchFixtures('football');
  const { promos } = useStitchPromos();
  const slip = useStitchSlip({ snapshot });
  const { toast } = useToast();
  useStitchIntake(slip, toast);
  const [sport, setSport] = useState('football');

  const heroPromo = promos[0] || null;
  const morePromos = promos.slice(1, 3);

  const featured = liveMatches[0] || null;
  const featuredLeague = useMemo(
    () => leagues.find((lg) => lg.matches.some((m) => m.id === featured?.id)),
    [leagues, featured],
  );

  const upcoming = useMemo(
    () => leagues
      .filter((lg) => lg.id !== featuredLeague?.id)
      .map((lg) => ({ ...lg, matches: lg.matches.filter((m) => !m.isLive) }))
      .filter((lg) => lg.matches.length),
    [leagues, featuredLeague],
  );

  return (
    <div className={`stx${light ? ' stx-light' : ''}`}>
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
            <span className="stx-mob-bal">
              <span>BAL</span> GHS {formatAmt(slip.account?.balance || 0)}
            </span>
            <button type="button" className="stx-depbtn" onClick={slip.openDeposit}>
              + ADD
            </button>
          </div>
        </header>
        <div className="stx-mob-body">
          {usingSeed && (
            <p className="stx-badge stx-muted" style={{ margin: 0 }}>
              Designed preview fixtures — live API unreachable.
            </p>
          )}

          {heroPromo ? (
            <div
              className="stx-mob-card"
              style={{ borderColor: heroPromo.accent || 'color-mix(in srgb, var(--stx-primary-container) 34%, transparent)' }}
            >
              <div className="stx-mob-hero-top">
                <Ic name="★" size="sm" /> {heroPromo.badge || 'PROMOTION'}
              </div>
              <div className="stx-promo-title" style={{ marginTop: 4 }}>{heroPromo.title}</div>
              <p className="stx-body-sm stx-muted" style={{ margin: '2px 0 8px' }}>
                {heroPromo.body}
              </p>
              {heroPromo.cta && (
                <Link to="/promos" className="stx-promo-cta">
                  {heroPromo.cta} <Ic name="→" size="sm" />
                </Link>
              )}
            </div>
          ) : (
            <div className="stx-mob-card">
              <div className="stx-mob-hero-top"><Ic name="★" size="sm" /> PROMOTIONS</div>
              <p className="stx-body-sm stx-muted" style={{ margin: '6px 0 0' }}>
                No active offers right now — new bonuses appear here when they launch.
              </p>
            </div>
          )}

          {morePromos.length > 0 && (
            <div style={{ display: 'grid', gap: 8 }}>
              {morePromos.map((p) => (
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
          )}

          <div className="stx-xscroll">
            {SPORT_CATEGORIES.slice(0, 4).map((s) => (
              <SportPill key={s.id} item={s} active={sport === s.id} onClick={() => setSport(s.id)} />
            ))}
          </div>

          <div className="stx-mob-card">
            <div className="stx-mob-hero-top">
              <span className="stx-live-dot" /> LIVE RADAR {String(liveCount).padStart(2, '0')}
              <div className="stx-right">
                <Link to="/live" className="stx-right" style={{ gap: 4 }}>
                  <span className="stx-textbtn">View All</span> <Ic name="›" size="sm" />
                </Link>
              </div>
            </div>
            <p className="stx-body-sm stx-muted" style={{ margin: '6px 0 0' }}>
              Live Now ({liveCount} Matches In-Play)
            </p>
          </div>

          {featured && (
            <div className="stx-mob-hero">
              <div className="stx-mob-hero-top">
                <Crest league={featuredLeague} size={20} />
                {featuredLeague?.name} — {featuredLeague?.meta}
                <div className="stx-right">
                  <LiveMinute minute={featured.minute} />
                </div>
              </div>

              <div className="stx-mob-score">
                <div className="stx-mob-score-team">
                  <b>{featured.home}</b>
                  <span>HOME</span>
                </div>
                <span className="stx-mob-score-num">{featured.scoreHome ?? 0}</span>
                <span className="stx-mob-score-sep">:</span>
                <span className="stx-mob-score-num">{featured.scoreAway ?? 0}</span>
                <div className="stx-mob-score-team">
                  <b>{featured.away}</b>
                  <span>AWAY</span>
                </div>
              </div>

              <MarketOdds
                market="1X2"
                match={featured}
                selections={slip.selections}
                onToggle={slip.toggleSelection}
                columns={3}
              />

              <div className="stx-mob-hstack">
                <span className="stx-mini" style={{ flex: 1 }}>
                  <Ic name="▤" size="sm" /> <b>+{featured.moreMarkets || 0}</b> Markets
                </span>
              </div>
            </div>
          )}

          <div>
            <div className="stx-sectionhead">
              <div>
                <h2>Upcoming Fixtures</h2>
                <span className="stx-sub">Today &amp; Tomorrow</span>
              </div>
            </div>

            {upcoming.map((lg) => (
              <section className="stx-league" key={lg.id} style={{ marginBottom: 12 }}>
                <header className="stx-league-head">
                  <Crest league={lg} />
                  <div className="stx-league-name">{lg.name}</div>
                </header>

                {lg.matches.map((m) => (
                  <article className="stx-mrow" key={m.id}>
                    <div className="stx-mrow-top">
                      <span>{m.day} {m.kickoff}</span>
                      <div className="stx-right">
                        {m.moreMarkets > 6 && <span className="stx-tag">+{m.moreMarkets} MKTS</span>}
                      </div>
                    </div>

                    <div className="stx-mrow-teams">
                      <div className="stx-mrow-team">{m.home}</div>
                      <div className="stx-mrow-team">{m.away}</div>
                    </div>

                    <MarketOdds
                      market="1X2"
                      match={m}
                      selections={slip.selections}
                      onToggle={slip.toggleSelection}
                      columns={3}
                    />
                  </article>
                ))}
              </section>
            ))}
          </div>
        </div>
      </div>

      <BetslipDock slip={slip} />
      <TabBar betCount={slip.selectionCount} />
      <SlipToast slip={slip} />
    </div>
  );
}

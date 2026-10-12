import { useState } from 'react';
import { Link } from 'react-router-dom';
import useMediaQuery from '../../premium/useMediaQuery.js';
import useStitchPromos from '../../premium/useStitchPromos.js';
import { StitchFooter, StitchTopNav } from '../../premium/StitchChrome.jsx';
import { TabBar } from './StitchMobile.jsx';
import { formatAmt } from '../../lib/betslipEngine.js';
import { useAccount, useToast } from '../../providers/AccountProvider.jsx';

/* ---------------------------------------------------------------------------
   Stitch — Promotions
   Real, admin-managed offers from GET /bet/promos. Claiming is a local record
   (localStorage "bv_claimed") exactly like the legacy page — the backend owns
   the actual bonus application, so we never invent a balance or an offer.
   ------------------------------------------------------------------------- */

const ACCENTS = {
  WELCOME:  { hue: 'hsl(95, 90%, 60%)' },
  CASHBACK: { hue: 'hsl(40, 92%, 60%)' },
  BOOST:    { hue: 'hsl(200, 92%, 65%)' },
  FREEBET:  { hue: 'hsl(280, 80%, 70%)' },
  REFERRAL: { hue: 'hsl(160, 75%, 60%)' },
  default:  { hue: 'hsl(152, 60%, 55%)' },
};

function accentFor(p) {
  const key = String(p.tag || p.badge || p.title || '').toUpperCase().split(/\s+/)[0];
  return ACCENTS[key] || ACCENTS.default;
}

const CLAIM_KEY = 'bv_claimed';

export default function StitchPromos() {
  const isMobile = useMediaQuery('(max-width: 1023px)');
  const { account, openDeposit } = useAccount();
  const { toast } = useToast();
  const { promos, loading, unavailable } = useStitchPromos();

  const [claimed, setClaimed] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CLAIM_KEY) || '[]'); } catch { return []; }
  });

  const claim = (p) => {
    if (!account) { toast('Sign in to claim promotions.'); return; }
    if (claimed.includes(p.id)) { toast('Already claimed.'); return; }
    const next = [...claimed, p.id];
    setClaimed(next);
    try { localStorage.setItem(CLAIM_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    toast(`${p.title} activated — see your account for details.`);
  };

  const headline = promos[0];
  const rest = promos.slice(1);

  const hero = (
    <section className="stx-phead">
      <div className="stx-phead-inner">
        <span className="stx-phead-eyebrow">Promotions</span>
        <h1 className="stx-h1">Boosts, bonuses, cashback — claim once.</h1>
        <p className="stx-body-md stx-muted">
          Live offers for new and existing customers. Claiming activates instantly and applies automatically.
        </p>
        <div className="stx-phead-stats">
          <span><b>{promos.length}</b> live offers</span>
          <span className="dot" />
          <span><b>0%</b> wagering fees</span>
          <span className="dot" />
          <span><b>24/7</b> support</span>
        </div>
      </div>
    </section>
  );

  const headlineCard = headline && (
    <article className="stx-pcard stx-pcard--hero" style={{ '--accent': accentFor(headline).hue }}>
      <div className="stx-pcard-tag">{headline.tag || headline.badge || 'Featured'}</div>
      <div className="stx-pcard-hero-grid">
        <div>
          <h2 className="stx-h2">{headline.title}</h2>
          <p className="stx-body-sm stx-muted">{headline.body || headline.subtitle}</p>
          {headline.expires && <span className="stx-pcard-meta">Expires {headline.expires}</span>}
          <button
            type="button"
            className="stx-cta"
            onClick={() => claim(headline)}
            disabled={claimed.includes(headline.id)}
          >
            {claimed.includes(headline.id) ? '✓ Claimed' : (headline.cta || 'Claim now')}
          </button>
        </div>
        <div className="stx-pcard-art" aria-hidden="true">
          <span className="stx-pcard-orb" />
          <span className="stx-pcard-chip">
            +{headline.bonusRate ? `${Math.round(headline.bonusRate * 100)}%` : '100%'}
          </span>
        </div>
      </div>
    </article>
  );

  let grid;
  if (loading && !promos.length) {
    grid = <p className="stx-body-md stx-muted" style={{ textAlign: 'center', padding: '32px 0' }}>Loading promotions…</p>;
  } else if (unavailable) {
    grid = (
      <div className="stx-bets-empty">
        <p className="stx-body-md">Promotions are unavailable right now — please try again shortly.</p>
      </div>
    );
  } else if (!rest.length && !headline) {
    grid = (
      <div className="stx-bets-empty">
        <p className="stx-body-md">No active promotions right now — check back soon.</p>
      </div>
    );
  } else {
    grid = rest.map((p) => {
      const isClaimed = claimed.includes(p.id);
      return (
        <article key={p.id} className="stx-pcard" style={{ '--accent': accentFor(p).hue }}>
          <div className="stx-pcard-tag">{p.tag || p.badge || 'Offer'}</div>
          <h3 className="stx-h4">{p.title}</h3>
          <p className="stx-body-sm stx-muted" style={{ flex: 1 }}>{p.body || p.subtitle}</p>
          <div className="stx-pcard-foot">
            {p.expires && <span className="stx-pcard-meta">Expires {p.expires}</span>}
            <button
              type="button"
              className="stx-cta stx-cta--ghost"
              onClick={() => claim(p)}
              disabled={isClaimed}
            >
              {isClaimed ? '✓ Claimed' : (p.cta || 'Claim')}
            </button>
          </div>
        </article>
      );
    });
  }

  const content = (
    <div className="stx-page">
      {hero}
      {headlineCard}
      <div className="stx-pgrid">{grid}</div>
    </div>
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
          <div className="stx-mob-body">{content}</div>
        </div>
        <TabBar current="/" />
      </div>
    );
  }

  return (
    <div className="stx">
      <StitchTopNav slip={{ account, openDeposit }} current="/promos" />
      {content}
      <StitchFooter current="/promos" />
    </div>
  );
}

import { useEffect, useState } from 'react';
import { fetchPromotions } from '../api/betApi.js';
import { useToast, useAccount } from '../layout/AppShell.jsx';
import PageBack from '../components/PageBack.jsx';

const ACCENTS = {
  WELCOME:  { hue: 'hsl(95, 90%, 60%)', tone: 'accent' },
  CASHBACK: { hue: 'hsl(40, 92%, 60%)', tone: 'warm'   },
  BOOST:    { hue: 'hsl(200, 92%, 65%)', tone: 'cool'  },
  FREEBET:  { hue: 'hsl(280, 80%, 70%)', tone: 'purple' },
  REFERRAL: { hue: 'hsl(160, 75%, 60%)', tone: 'teal'  },
  default:  { hue: 'hsl(120, 30%, 60%)', tone: 'accent' },
};

function accentFor(p) {
  const key = String(p.tag || p.badge || p.title || '').toUpperCase().split(/\s+/)[0];
  return ACCENTS[key] || ACCENTS.default;
}

export default function PromosPage() {
  const { toast } = useToast();
  const { account } = useAccount();
  const [promos, setPromos] = useState([]);
  const [busy, setBusy]     = useState(false);
  const [claimed, setClaimed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('bv_claimed') || '[]'); } catch { return []; }
  });

  useEffect(() => {
    setBusy(true);
    fetchPromotions()
      .then((d) => setPromos(d.promotions || []))
      .catch(() => {})
      .finally(() => setBusy(false));
  }, []);

  const claim = (p) => {
    if (!account) { toast('Sign in to claim promotions.'); return; }
    if (claimed.includes(p.id)) { toast('Already claimed.'); return; }
    const next = [...claimed, p.id];
    setClaimed(next);
    localStorage.setItem('bv_claimed', JSON.stringify(next));
    toast(`${p.title} activated — see your account for details.`);
  };

  const headline = promos[0];
  const rest     = promos.slice(1);

  return (
    <main className="promos-page">
      <div className="promos-shell">
        <PageBack />
        <header className="promos-hero fade-up">
          <div className="promos-hero-bg" aria-hidden />
          <div className="promos-hero-inner">
            <span className="promos-eyebrow">PROMOTIONS</span>
            <h1>Boosts, bonuses, cashback — claim once.</h1>
            <p>Live offers for new and existing customers. Claim activates instantly and applies automatically.</p>
            <div className="promos-hero-stats">
              <div><strong>{promos.length}</strong> <span>live offers</span></div>
              <div className="dot" />
              <div><strong>0%</strong> <span>wagering fees</span></div>
              <div className="dot" />
              <div><strong>24/7</strong> <span>support</span></div>
            </div>
          </div>
        </header>

        {headline && (
          <article className="promo-headline fade-up" style={{ animationDelay: '0.05s', '--accent': accentFor(headline).hue }}>
            <div className="promo-headline-badge">{headline.tag || headline.badge || 'FEATURED'}</div>
            <div className="promo-headline-grid">
              <div className="promo-headline-text">
                <h2>{headline.title}</h2>
                <p>{headline.body || headline.subtitle}</p>
                {headline.expires && (
                  <span className="promo-headline-meta">Expires {headline.expires}</span>
                )}
                <button
                  type="button"
                  className={`btn ${claimed.includes(headline.id) ? 'btn-ghost' : 'btn-primary'} promo-headline-btn`}
                  onClick={() => claim(headline)}
                  disabled={claimed.includes(headline.id)}
                >
                  {claimed.includes(headline.id) ? '✓ Claimed' : (headline.cta || 'Claim now')}
                </button>
              </div>
              <div className="promo-headline-art" aria-hidden>
                <div className="promo-headline-orb" />
                <div className="promo-headline-orb b" />
                <div className="promo-headline-chip">+{headline.bonusRate ? `${Math.round(headline.bonusRate * 100)}%` : '100%'}</div>
              </div>
            </div>
          </article>
        )}

        <div className="promos-grid">
          {busy && !promos.length ? (
            <p className="promos-empty">Loading promotions…</p>
          ) : !rest.length ? (
            !headline && <p className="promos-empty">No active promotions right now — check back soon.</p>
          ) : rest.map((p, i) => {
            const isClaimed = claimed.includes(p.id);
            const a = accentFor(p);
            return (
              <article
                key={p.id || i}
                className="promo-card fade-up"
                style={{ animationDelay: `${0.08 + i * 0.04}s`, '--accent': a.hue }}
              >
                <div className="promo-card-stripe" aria-hidden />
                <div className="promo-card-tag">{p.tag || p.badge || 'OFFER'}</div>
                <h3>{p.title}</h3>
                <p>{p.body || p.subtitle}</p>
                <div className="promo-card-foot">
                  {p.expires && <span className="promo-card-meta">Expires {p.expires}</span>}
                  <button
                    type="button"
                    className={`btn ${isClaimed ? 'btn-ghost' : 'btn-primary'}`}
                    onClick={() => claim(p)}
                    disabled={isClaimed}
                  >
                    {isClaimed ? '✓ Claimed' : (p.cta || 'Claim')}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <style>{PROMOS_CSS}</style>
    </main>
  );
}

const PROMOS_CSS = `
.promos-page { padding: 28px 0 60px; min-height: calc(100vh - 200px); }
.promos-shell { max-width: 1100px; margin: 0 auto; padding: 0 20px; display: flex; flex-direction: column; gap: 22px; }

.promos-hero {
  position: relative; overflow: hidden;
  padding: 32px 28px; border-radius: 22px;
  background: linear-gradient(135deg, var(--surface) 0%, var(--surface-2) 100%);
  border: 1px solid rgba(0, 122, 69, .18);
}
.promos-hero-bg {
  position: absolute; inset: -10%;
  background:
    radial-gradient(500px 280px at 88% -10%, rgba(0, 122, 69, .18), transparent 60%),
    radial-gradient(420px 280px at -5% 110%, rgba(106, 208, 255, .14), transparent 60%);
  pointer-events: none;
}
.promos-hero-inner { position: relative; z-index: 1; max-width: 720px; }
.promos-eyebrow {
  font-size: 11px; letter-spacing: .18em; font-weight: 800;
  color: var(--accent); text-transform: uppercase;
}
.promos-hero-inner h1 {
  margin: 8px 0 6px; font-size: 32px; font-weight: 900;
  letter-spacing: -.02em; line-height: 1.05;
}
.promos-hero-inner p { margin: 0 0 18px; color: var(--text-soft); font-size: 14px; max-width: 540px; }
.promos-hero-stats {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  font-size: 13px; color: var(--text-soft);
}
.promos-hero-stats strong { color: var(--text); font-weight: 800; margin-right: 4px; }
.promos-hero-stats .dot {
  width: 4px; height: 4px; border-radius: 50%; background: var(--text-dim);
}

.promo-headline {
  position: relative; overflow: hidden;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--accent) 22%, var(--surface)) 0%, var(--surface) 60%);
  border: 1px solid color-mix(in srgb, var(--accent) 38%, var(--surface-2));
  border-radius: 22px;
  padding: 22px;
}
.promo-headline-badge {
  display: inline-block;
  font-size: 10px; font-weight: 900; letter-spacing: .18em;
  text-transform: uppercase;
  padding: 5px 10px; border-radius: 999px;
  background: var(--accent);
  color: #0e1330;
  margin-bottom: 10px;
}
.promo-headline-grid {
  display: grid; grid-template-columns: 1fr 200px; gap: 18px; align-items: center;
}
.promo-headline-text h2 {
  margin: 0 0 6px; font-size: 22px; font-weight: 800; letter-spacing: -.01em;
}
.promo-headline-text p { margin: 0 0 14px; color: var(--text-soft); font-size: 14px; }
.promo-headline-meta { display: block; font-size: 12px; color: var(--text-dim); margin-bottom: 14px; }
.promo-headline-btn { min-width: 140px; }

.promo-headline-art {
  position: relative;
  height: 130px;
  display: grid; place-items: center;
}
.promo-headline-orb {
  position: absolute; inset: 0; margin: auto;
  width: 130px; height: 130px;
  border-radius: 50%;
  background: radial-gradient(circle, var(--accent), transparent 70%);
  filter: blur(8px);
  opacity: .55;
  animation: promoOrbFloat 5s ease-in-out infinite;
}
.promo-headline-orb.b {
  width: 80px; height: 80px;
  background: radial-gradient(circle, color-mix(in srgb, var(--accent) 65%, white), transparent 70%);
  animation-delay: 1.2s;
  opacity: .75;
}
@keyframes promoOrbFloat {
  0%, 100% { transform: translate(0, 0); }
  50%      { transform: translate(8px, -10px); }
}
.promo-headline-chip {
  position: relative; z-index: 1;
  font-size: 28px; font-weight: 900;
  color: var(--text);
  letter-spacing: -.02em;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 4px 16px rgba(0, 0, 0, .35);
}

.promos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
}
.promos-empty {
  grid-column: 1 / -1;
  color: var(--text-dim); font-size: 14px; text-align: center; padding: 32px 0;
}

.promo-card {
  position: relative; overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--surface-2);
  border-radius: 16px;
  padding: 18px;
  display: flex; flex-direction: column; gap: 8px;
  transition: transform .2s ease, border-color .2s ease, box-shadow .2s ease;
}
.promo-card:hover {
  transform: translateY(-3px);
  border-color: color-mix(in srgb, var(--accent) 45%, var(--surface-2));
  box-shadow: 0 16px 36px rgba(0, 0, 0, .35);
}
.promo-card-stripe {
  position: absolute; left: 0; top: 0; bottom: 0; width: 4px;
  background: var(--accent);
}
.promo-card-tag {
  align-self: flex-start;
  font-size: 10px; font-weight: 800; letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  padding: 4px 10px; border-radius: 999px;
}
.promo-card h3 { margin: 4px 0 0; font-size: 17px; font-weight: 800; letter-spacing: -.01em; }
.promo-card p  { margin: 0; color: var(--text-soft); font-size: 13.5px; flex: 1; }
.promo-card-foot {
  display: flex; justify-content: space-between; align-items: center;
  gap: 10px; margin-top: 6px;
}
.promo-card-meta { font-size: 11.5px; color: var(--text-dim); }

@media (max-width: 720px) {
  .promos-shell { padding: 0 12px; gap: 16px; }
  .promos-hero { padding: 24px 18px; }
  .promos-hero-inner h1 { font-size: 24px; }
  .promo-headline { padding: 18px; }
  .promo-headline-grid { grid-template-columns: 1fr; gap: 12px; }
  .promo-headline-text h2 { font-size: 18px; }
  .promo-headline-art { height: 100px; }
}
`;

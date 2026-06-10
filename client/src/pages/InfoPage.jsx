import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import PageBack from '../components/PageBack.jsx';

const SECTIONS = [
  { id: 'terms', title: 'Terms & Conditions' },
  { id: 'privacy', title: 'Privacy Policy' },
  { id: 'responsible-gaming', title: 'Responsible Gaming' },
  { id: 'self-exclusion', title: 'Self-Exclusion' },
  { id: 'licence', title: 'Licence Information' },
];

export default function InfoPage() {
  const loc = useLocation();

  useEffect(() => {
    if (!loc.hash) { window.scrollTo({ top: 0 }); return; }
    const el = document.getElementById(loc.hash.slice(1));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loc.hash]);

  return (
    <main className="page-wrap" style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px 80px' }}>
      <PageBack />
      <header className="page-head" style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 36, letterSpacing: '-0.02em' }}>Information &amp; Compliance</h1>
        <p style={{ color: 'var(--text-soft)', marginTop: 6 }}>
          Our legal terms, privacy commitments, and responsible-gaming policies.
        </p>
      </header>

      <nav style={{
        display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 32,
        padding: 14, background: 'var(--surface)',
        border: '1px solid var(--line)', borderRadius: 'var(--r-lg)',
      }}>
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`}
             style={{
               padding: '6px 12px', fontSize: 13, fontWeight: 600,
               color: 'var(--text-soft)', border: '1px solid var(--line-strong)',
               borderRadius: 8, transition: 'color .15s, border-color .15s, background .15s',
             }}
             onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.borderColor = 'var(--accent)'; }}
             onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-soft)'; e.currentTarget.style.borderColor = 'var(--line-strong)'; }}>
            {s.title}
          </a>
        ))}
      </nav>

      <section id="terms" style={sectionStyle}>
        <h2 style={h2Style}>Terms &amp; Conditions</h2>
        <p style={pStyle}>
          By creating a Oddsify account and placing wagers you agree to the following terms.
          You must be 18 years or older and physically located in a jurisdiction where online
          sports wagering is lawful. Oddsify operates under Ghana Gaming Commission licence
          <strong> #ODSGH-2026</strong>. Last updated <strong>20 May 2026</strong>.
        </p>
        <ul style={ulStyle}>
          <li>Only one account is permitted per individual. Accounts may be registered using either an email address or a mobile phone number — the identifier provided is the sole login credential.</li>
          <li>All wagers are final once the relevant event has commenced.</li>
          <li>Settled bets are final. Disputes must be raised within 14 days of settlement.</li>
          <li>Bonus funds carry a wagering requirement and may be voided if abused.</li>
          <li>Withdrawal eligibility requires lifetime deposits of at least 10% of the requested amount.</li>
          <li>Oddsify reserves the right to verify identity and source of funds before processing withdrawals (KYC/AML).</li>
          <li>Multiple accounts, automated betting, odds-arbitrage rings, and collusion are grounds for suspension and bonus clawback.</li>
          <li>Account credentials must be kept confidential. You are responsible for all activity carried out under your login.</li>
        </ul>
      </section>

      <section id="privacy" style={sectionStyle}>
        <h2 style={h2Style}>Privacy Policy</h2>
        <p style={pStyle}>
          Oddsify collects only the information needed to operate your account: the
          identifier used at sign-up (email or phone number), identity details for KYC,
          payment method metadata for deposits and withdrawals, and gameplay records for
          fairness and compliance. Passwords are stored only as one-way bcrypt hashes —
          we never see your plaintext password. We do not sell personal data.
        </p>
        <p style={pStyle}>
          Sessions are secured with short-lived access tokens and rotating refresh tokens.
          Failed login attempts are rate-limited per account and per IP to deter brute-force
          attacks. Transport is encrypted with TLS end-to-end.
        </p>
        <p style={pStyle}>
          You can request a copy or deletion of your data at any time by contacting our
          support team. Data is retained for the period required by Ghanaian financial
          regulations, then permanently erased.
        </p>
      </section>

      <section id="responsible-gaming" style={sectionStyle}>
        <h2 style={h2Style}>Responsible Gaming</h2>
        <p style={pStyle}>
          Wagering should be entertainment, not income. Oddsify provides tools to keep you
          in control:
        </p>
        <ul style={ulStyle}>
          <li><strong>Deposit limits</strong> — daily, weekly and monthly caps you can set from your profile.</li>
          <li><strong>Reality checks</strong> — periodic pop-ups showing time spent and net P/L.</li>
          <li><strong>Cool-off</strong> — short breaks of 24h, 7d, or 30d you can self-trigger.</li>
          <li><strong>Self-exclusion</strong> — see below for our permanent exclusion option.</li>
        </ul>
        <p style={pStyle}>
          Help line (Ghana): <strong>0800-RESPO</strong> · 24/7 confidential.
        </p>
      </section>

      <section id="self-exclusion" style={sectionStyle}>
        <h2 style={h2Style}>Self-Exclusion</h2>
        <p style={pStyle}>
          If you decide to stop wagering, you can request a self-exclusion of 6, 12 or 24
          months — or indefinitely. During this period your account is frozen, marketing
          communications stop, and Oddsify will refuse re-registration attempts.
        </p>
        <p style={pStyle}>
          To self-exclude, sign in and email <a href="mailto:safe@oddsify.gh" style={linkStyle}>safe@oddsify.gh</a> from
          your registered address with the subject &ldquo;Self-exclusion&rdquo; and the duration you want.
        </p>
      </section>

      <section id="licence" style={sectionStyle}>
        <h2 style={h2Style}>Licence Information</h2>
        <p style={pStyle}>
          Oddsify is operated by Oddsify Gaming Limited and licensed by the Gaming Commission
          of Ghana under reference <strong>#ODSGH-2026</strong>. All wagering is governed
          by Ghanaian law. Operator compliance reports are published quarterly and audited
          by an independent third party.
        </p>
      </section>
    </main>
  );
}

const sectionStyle = {
  marginBottom: 40,
  padding: '32px 28px',
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--r-lg)',
  scrollMarginTop: 96,
};
const h2Style = {
  fontSize: 22, letterSpacing: '-0.02em', marginBottom: 12,
  color: 'var(--text)',
};
const pStyle = {
  fontSize: 14, lineHeight: 1.7, color: 'var(--text-soft)', marginBottom: 12,
};
const ulStyle = {
  margin: '8px 0 16px 20px',
  color: 'var(--text-soft)',
  fontSize: 14, lineHeight: 1.7,
};
const linkStyle = { color: 'var(--accent)', textDecoration: 'underline' };

/**
 * Split-screen admin login.
 *  - Step 1 — email + password
 *  - Step 2 — appears only if the account has 2FA enabled (email OTP challenge)
 * Successful sign-in lands on /admin (or ?next=…).
 */
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { adminLogin, adminVerify2fa } from '../../api/adminApi.js';
import { useAdmin } from '../../providers/AdminProvider.jsx';
import {
  IconShield, IconLightning, IconActivity, IconSparkles, IconArrowRight, IconKey,
} from '../../components/admin/Icons.jsx';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { admin, signIn, theme } = useAdmin();

  useEffect(() => {
    if (admin) navigate(params.get('next') || '/admin', { replace: true });
  }, [admin, navigate, params]);

  const [step, setStep] = useState('credentials'); // 'credentials' | '2fa'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [showDemo, setShowDemo] = useState(false);

  async function submitCreds(e) {
    e.preventDefault();
    setErr(''); setOk(''); setBusy(true);
    try {
      const res = await adminLogin({ email, password });
      if (res.requires2fa) {
        setChallenge(res.challenge);
        setStep('2fa');
        setOk(`A 6-digit code was sent to ${res.email}.`);
      } else {
        signIn(res);
        navigate(params.get('next') || '/admin', { replace: true });
      }
    } catch (e) {
      setErr(e.message || 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const res = await adminVerify2fa({ challenge, code });
      signIn(res);
      navigate(params.get('next') || '/admin', { replace: true });
    } catch (e) {
      setErr(e.message || 'Verification failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-admin-root data-theme={theme} className="adm-auth">
      <aside className="adm-auth-art">
        <span className="glow" />
        <div>
          <div className="feature"><IconLightning size={14} /> Enterprise grade · ISO-aligned</div>
          <h1>The control plane for a billion-cedi sportsbook.</h1>
          <p style={{ marginBottom: 28 }}>
            One pane of glass for revenue, risk, trading, KYC, and player ops.
            Every action is signed, audited, and reversible.
          </p>
          <div style={{ display: 'grid', gap: 14 }}>
            {[
              { icon: <IconShield size={16} />, t: 'Hardened auth', d: '2FA, brute-force protection, session forensics.' },
              { icon: <IconActivity size={16} />, t: 'Realtime', d: 'Live odds, deposits, fraud signals.' },
              { icon: <IconSparkles size={16} />, t: 'AI fraud',  d: 'Velocity, device, and pattern scoring.' },
            ].map((f) => (
              <div key={f.t} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{
                  width: 34, height: 34, borderRadius: 10,
                  display: 'inline-grid', placeItems: 'center',
                  background: 'rgba(255,255,255,.08)',
                  border: '1px solid rgba(255,255,255,.12)',
                  color: 'rgba(255,255,255,.92)',
                }}>{f.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{f.t}</div>
                  <div style={{ color: 'rgba(255,255,255,.62)', fontSize: 12.5 }}>{f.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)' }}>
          © {new Date().getFullYear()} Xenbet Gaming · Licensed by the Gaming Commission of Ghana
        </div>
      </aside>

      <section className="adm-auth-form">
        <div className="form-card">
          <h2>{step === 'credentials' ? 'Sign in to admin' : 'Two-factor verification'}</h2>
          <p className="lead">
            {step === 'credentials'
              ? 'Use your platform admin credentials. Activity is logged and signed.'
              : 'Enter the 6-digit code we just emailed you. Codes expire in 10 minutes.'}
          </p>

          {err && <div className="err" style={{ marginBottom: 14 }}>{err}</div>}
          {ok && step === '2fa' && <div className="ok" style={{ marginBottom: 14 }}>{ok}</div>}

          {step === 'credentials' ? (
            <form onSubmit={submitCreds} className="form-grid">
              <div className="adm-field">
                <label htmlFor="al-email">Work email</label>
                <input id="al-email" className="adm-input" type="email" autoComplete="username"
                       value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              </div>
              <div className="adm-field">
                <label htmlFor="al-pass">Password</label>
                <input id="al-pass" className="adm-input" type="password" autoComplete="current-password"
                       value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <button className="adm-btn primary" type="submit" disabled={busy} style={{ justifyContent: 'center', height: 44 }}>
                {busy ? 'Signing in…' : <>Continue <IconArrowRight size={16} /></>}
              </button>
              <div className="smol" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <Link to="/" style={{ color: 'var(--text-soft)' }}>← Back to site</Link>
                <span>
                  Have an invite link? <Link to="/admin/signup" style={{ color: 'var(--text)', fontWeight: 600 }}>Create your account</Link>
                </span>
              </div>
              <div style={{
                marginTop: 14, padding: 12,
                background: 'var(--surface-soft)',
                border: '1px dashed var(--border)', borderRadius: 12,
                fontSize: 12, color: 'var(--text-dim)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span><strong style={{ color: 'var(--text-soft)' }}>Sign-up is invite-only.</strong> Ask a super admin for a link.</span>
                  <button type="button" className="adm-btn ghost sm" onClick={() => setShowDemo((v) => !v)}>{showDemo ? 'Hide' : 'Demo creds'}</button>
                </div>
                {showDemo && (
                  <div style={{ marginTop: 10, fontFamily: 'var(--ff-mono)', fontSize: 11.5, lineHeight: 1.6 }}>
                    Super: <code style={{ color: 'var(--text)' }}>admin@xenbet.gh</code> / <code>Admin@12345</code><br />
                    Finance: <code style={{ color: 'var(--text)' }}>finance@xenbet.gh</code> / <code>Finance@12345</code><br />
                    Odds: <code style={{ color: 'var(--text)' }}>odds@xenbet.gh</code> / <code>Odds@12345</code><br />
                    Support: <code style={{ color: 'var(--text)' }}>support@xenbet.gh</code> / <code>Support@12345</code><br />
                    Moderator: <code style={{ color: 'var(--text)' }}>mod@xenbet.gh</code> / <code>Moderator@12345</code>
                  </div>
                )}
              </div>
            </form>
          ) : (
            <form onSubmit={submitCode} className="form-grid">
              <div className="adm-field">
                <label htmlFor="al-code">6-digit code</label>
                <input id="al-code" className="adm-input" inputMode="numeric" pattern="\d{6}" maxLength={6}
                       value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                       autoFocus style={{ letterSpacing: '.6em', textAlign: 'center', fontSize: 18, fontFamily: 'var(--ff-mono)' }} />
              </div>
              <button className="adm-btn primary" type="submit" disabled={busy || code.length !== 6} style={{ justifyContent: 'center', height: 44 }}>
                {busy ? 'Verifying…' : <><IconKey size={16} /> Verify and sign in</>}
              </button>
              <button className="adm-btn ghost" type="button" onClick={() => { setStep('credentials'); setCode(''); setChallenge(''); }}>
                ← Use a different account
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}

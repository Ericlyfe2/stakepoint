import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { login, register, fetchAuthConfig, googleSignIn } from '../api/betApi.js';
import { setAdminTokens } from '../api/adminApi.js';
import { useAccount, useToast } from '../providers/AccountProvider.jsx';
import CountrySelect from '../components/CountrySelect.jsx';

const PROMO_BENEFITS = [
  ['🎁',  '200% welcome bonus on your first deposit'],
  ['⚡',  'Instant MoMo, Vodafone Cash & card deposits'],
  ['🏆',  'Mega-13 jackpot · GHS 1.84M up for grabs'],
  ['📈',  'Sharper odds across 30+ leagues, live & pre-match'],
];

export default function LoginPage() {
  const navigate = useNavigate();
  const { account, signIn, signOut } = useAccount();
  const { toast } = useToast();
  const [params] = useSearchParams();

  const next = params.get('next') || '/';
  const [mode, setMode]             = useState(params.get('mode') === 'register' ? 'register' : 'signin');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword]     = useState('');
  const [confirm, setConfirm]       = useState('');
  const [country, setCountry]       = useState('GH');
  const [showPw, setShowPw]         = useState(false);
  const [agree, setAgree]           = useState(false);
  const [err, setErr]               = useState('');
  const [busy, setBusy]             = useState(false);
  const [authConfig, setAuthConfig] = useState({ googleEnabled: false, googleClientId: null });

  useEffect(() => {
    if (params.get('logout') === '1') signOut();
    const token = params.get('token');
    if (token) {
      signIn({ accessToken: token });
      navigate(params.get('redirect') || next, { replace: true });
      return;
    }
    if (account) navigate(next, { replace: true });
    fetchAuthConfig().then(setAuthConfig).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!authConfig.googleEnabled) return;
    const id = 'gsi-script';
    if (document.getElementById(id)) { renderGoogle(); return; }
    const s = document.createElement('script');
    s.id = id;
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = renderGoogle;
    document.head.appendChild(s);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authConfig]);

  function renderGoogle() {
    const g = window.google;
    if (!g?.accounts?.id) return;
    g.accounts.id.initialize({
      client_id: authConfig.googleClientId,
      callback: async ({ credential }) => {
        try {
          setBusy(true);
          const data = await googleSignIn(credential, country);
          signIn(data);
          navigate('/', { replace: true });
        } catch (e) {
          setErr(e.message || 'Google sign-in failed.');
        } finally { setBusy(false); }
      },
    });
    const target = document.getElementById('google-btn-mount');
    if (target) {
      target.innerHTML = '';
      g.accounts.id.renderButton(target, { theme: 'filled_black', size: 'large', shape: 'rectangular', width: 200 });
    }
  }

  const isEmail = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier), [identifier]);
  const isPhone = useMemo(() => /^\+?\d{9,15}$/.test(identifier.replace(/\s|-/g, '')), [identifier]);
  const idValid = isEmail || isPhone;

  const pwStrength = useMemo(() => {
    if (!password) return 0;
    let s = 0;
    if (password.length >= 8)  s++;
    if (password.length >= 12) s++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) s++;
    if (/\d/.test(password)) s++;
    if (/[^\w]/.test(password)) s++;
    return Math.min(s, 4);
  }, [password]);

  const reset = () => setErr('');

  const validate = () => {
    if (!identifier.trim())  return 'Enter your phone or email.';
    if (!idValid)            return 'Enter a valid email or phone (e.g. 233241234567).';
    if (!password)           return 'Enter your password.';
    if (!country)            return 'Select your country.';
    if (mode === 'register') {
      if (password.length < 8)         return 'Password must be at least 8 characters.';
      if (!/[A-Z]/.test(password) || !/[a-z]/.test(password)) return 'Password must mix upper- and lower-case letters.';
      if (!/\d/.test(password))        return 'Password must include a digit.';
      if (password !== confirm)        return 'Passwords don’t match.';
      if (!agree)                      return 'Accept the terms to create an account.';
    }
    return null;
  };

  function routeAfterLogin(data) {
    if (data.kind === 'admin') {
      setAdminTokens(data.accessToken, data.refreshToken);
      const target = next && next.startsWith('/admin') ? next : '/admin';
      toast(`Signed in as ${data.admin?.displayName || data.admin?.email} — opening admin panel.`);
      navigate(target, { replace: true });
      return;
    }
    signIn(data);
    navigate(next.startsWith('/admin') ? '/' : next, { replace: true });
  }

  const submit = async (e) => {
    e.preventDefault();
    reset();
    const v = validate();
    if (v) { setErr(v); return; }
    try {
      setBusy(true);
      if (mode === 'register') {
        const data = await register({
          email: identifier.trim(),
          password,
          displayName: identifier.trim(),
          country,
        });
        toast(`Welcome to Xenbet, ${data.account?.displayName || data.account?.email}!`);
        routeAfterLogin(data);
      } else {
        const data = await login({
          email: identifier.trim(),
          password,
          country,
        });
        routeAfterLogin(data);
      }
    } catch (e) {
      setErr(e.message || (mode === 'signin' ? 'Sign in failed.' : 'Sign up failed.'));
    } finally { setBusy(false); }
  };

  return (
    <div className="login-page-v2">
      <Link className="back" to="/">← Back to sports</Link>

      <div className="auth-shell">
        <aside className="auth-aside">
          <div className="logo">
            <div className="logo-mark"><span>X</span></div>
            <div className="logo-text">Xen<em>bet</em></div>
          </div>
          <h2 className="auth-tagline">
            {mode === 'signin' ? 'Welcome back. Your slip is waiting.' : 'Join thousands betting smarter.'}
          </h2>
          <ul className="auth-benefits">
            {PROMO_BENEFITS.map(([icon, text]) => (
              <li key={text}><span className="b-icon">{icon}</span>{text}</li>
            ))}
          </ul>
          <div className="auth-trust">
            <span>🛡️ Licensed by Gaming Commission of Ghana · 18+</span>
          </div>
        </aside>

        <main className="auth-card">
          <div className="auth-tabs">
            <button type="button" className={`auth-tab${mode === 'signin' ? ' active' : ''}`}
                    onClick={() => { setMode('signin'); reset(); }}>Sign in</button>
            <button type="button" className={`auth-tab${mode === 'register' ? ' active' : ''}`}
                    onClick={() => { setMode('register'); reset(); }}>Create account</button>
          </div>

          <h1 className="auth-h1">
            {mode === 'signin' ? 'Sign in to Xenbet' : 'Create your account'}
          </h1>
          <p className="auth-sub">
            {mode === 'signin' ? 'Use your phone or email and password.' : 'Sign up in 30 seconds and claim a GHS 50 starter bonus.'}
          </p>

          <form onSubmit={submit} noValidate>
            <label htmlFor="auth-id">Phone or email</label>
            <div className={`field${identifier && !idValid ? ' invalid' : ''}`}>
              <span className="field-icon">{isEmail ? '✉' : isPhone ? '📱' : '👤'}</span>
              <input id="auth-id" type="text"
                     autoComplete={mode === 'signin' ? 'username' : 'email'}
                     placeholder="233241234567 or you@email.com"
                     value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoFocus />
            </div>

            <label htmlFor="auth-pw">Password</label>
            <div className="field">
              <span className="field-icon">🔒</span>
              <input id="auth-pw" type={showPw ? 'text' : 'password'}
                     autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                     placeholder={mode === 'signin' ? 'Enter your password' : 'At least 8 chars, with a digit and mixed case'}
                     value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" className="field-suffix" onClick={() => setShowPw((v) => !v)}
                      aria-label={showPw ? 'Hide password' : 'Show password'}>{showPw ? 'Hide' : 'Show'}</button>
            </div>

            {mode === 'register' && (
              <>
                <div className="pw-strength">
                  <span className={`s s-${pwStrength}`} />
                  <span className={`s s-${pwStrength}`} />
                  <span className={`s s-${pwStrength}`} />
                  <span className={`s s-${pwStrength}`} />
                  <span className="s-label">{['Too short','Weak','Okay','Strong','Excellent'][pwStrength] || ''}</span>
                </div>
                <label htmlFor="auth-pw2">Confirm password</label>
                <div className={`field${confirm && confirm !== password ? ' invalid' : ''}`}>
                  <span className="field-icon">🔒</span>
                  <input id="auth-pw2" type={showPw ? 'text' : 'password'} autoComplete="new-password"
                         placeholder="Re-enter your password"
                         value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                </div>
              </>
            )}

            <label htmlFor="auth-country" style={{ marginTop: 12 }}>Country</label>
            <CountrySelect
              id="auth-country"
              value={country}
              onChange={setCountry}
              invalid={!country}
              placeholder="Select your country…"
            />

            {mode === 'register' && (
              <label className="check check-block" style={{ marginTop: 14 }}>
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                I am 18+ and accept the <a className="link">Terms</a> and <a className="link">Responsible Gaming Policy</a>.
              </label>
            )}

            <div className="err" aria-live="polite">{err}</div>

            <button type="submit" className="auth-primary" disabled={busy}>
              {busy ? (mode === 'signin' ? 'Signing in…' : 'Creating account…')
                    : (mode === 'signin' ? 'Sign in' : 'Create account')}
            </button>

            <div className="auth-divider"><span>or continue with</span></div>
            {authConfig.googleEnabled
              ? <div id="google-btn-mount" style={{ display: 'flex', justifyContent: 'center' }} />
              : <button type="button" className="provider" onClick={() => setErr('Google sign-in is not configured on this server. Set GOOGLE_CLIENT_ID in .env to enable it.')}>
                  <span className="p-icon">G</span> Continue with Google
                </button>}

            <p className="auth-foot">
              {mode === 'signin'
                ? <>New to Xenbet? <a className="link" onClick={() => { setMode('register'); reset(); }}>Create an account</a></>
                : <>Already have an account? <a className="link" onClick={() => { setMode('signin'); reset(); }}>Sign in</a></>}
            </p>
          </form>
        </main>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { login, register, fetchAuthConfig, googleSignIn } from '../api/betApi.js';
import { setAdminTokens } from '../api/adminApi.js';
import { useAccount, useToast } from '../providers/AccountProvider.jsx';
import CountrySelect from '../components/CountrySelect.jsx';
import PageBack from '../components/PageBack.jsx';

function EyeIcon({ open }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.58 19.58 0 0 1 4.22-5.36" />
      <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a19.5 19.5 0 0 1-2.16 3.19" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function safePath(raw, fallback = '/') {
  if (typeof raw !== 'string') return fallback;
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  return raw;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { account, signIn, signOut } = useAccount();
  const { toast } = useToast();
  const [params] = useSearchParams();

  const next = safePath(params.get('next'), '/');
  const [mode, setMode]             = useState(params.get('mode') === 'register' ? 'register' : 'signin');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword]     = useState('');
  const [confirm, setConfirm]       = useState('');
  const [country, setCountry]       = useState('GH');
  const [showPw, setShowPw]         = useState(false);
  const [showPw2, setShowPw2]       = useState(false);
  const [err, setErr]               = useState('');
  const [busy, setBusy]             = useState(false);
  const [phone, setPhone]           = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [authConfig, setAuthConfig] = useState({ googleEnabled: false, googleClientId: null });

  useEffect(() => {
    if (params.get('logout') === '1') signOut();
    const token = params.get('token');
    if (token) {
      signIn({ accessToken: token });
      navigate(safePath(params.get('redirect'), next), { replace: true });
      return;
    }
    if (account) navigate(next, { replace: true });
    fetchAuthConfig().then(setAuthConfig).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isEmail = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier), [identifier]);
  const isPhone = useMemo(() => /^\+?\d{9,15}$/.test(identifier.replace(/\s|-/g, '')), [identifier]);
  const idValid = isEmail || isPhone;

  const phoneTrim = phone.replace(/\s|-/g, '');
  const phoneValid = /^\+?\d{9,15}$/.test(phoneTrim);
  const regIsEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(phone.trim());
  const regIsPhone = phoneValid;
  const regIdValid = regIsEmail || regIsPhone;

  const reset = () => setErr('');

  const validate = () => {
    if (mode === 'register') {
      if (!country)                     return 'Select your country.';
      if (!phone.trim())                return 'Enter your phone number.';
      if (!regIdValid)                  return 'Enter a valid phone number (e.g. 233241234567).';
      if (!password)                    return 'Enter your password.';
      if (password.length < 8)          return 'Password must be at least 8 characters.';
      if (password !== confirm)         return 'Passwords don’t match.';
      return null;
    }
    if (!country)            return 'Select your country.';
    if (!identifier.trim())  return 'Enter your phone number.';
    if (!idValid)            return 'Enter a valid phone number or email.';
    if (!password)           return 'Enter your password.';
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
        const idValue = regIsEmail ? phone.trim().toLowerCase() : phoneTrim;
        const data = await register({
          email: idValue,
          password,
          displayName: idValue,
          country,
          ...(referralCode.trim() ? { referralCode: referralCode.trim() } : {}),
        });
        toast(`Welcome to BetXentra, ${data.account?.displayName || data.account?.email}!`);
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
      <div className="auth-bg-left" />
      <div className="auth-bg-right" />

      <main className="auth-card">
        <div className="auth-tabs">
          <button type="button" className={`auth-tab${mode === 'register' ? ' active' : ''}`}
                  onClick={() => { setMode('register'); reset(); }}>Register</button>
          <button type="button" className={`auth-tab${mode === 'signin' ? ' active' : ''}`}
                  onClick={() => { setMode('signin'); reset(); }}>Login</button>
        </div>

        <form onSubmit={submit} noValidate>
          <label htmlFor="auth-country">Country</label>
          <CountrySelect
            id="auth-country"
            value={country}
            onChange={setCountry}
            invalid={!country}
            placeholder="Select your country"
          />

          <label htmlFor={mode === 'register' ? 'auth-phone' : 'auth-id'}>Phone Number</label>
          {mode === 'register' ? (
            <div className="field">
              <input id="auth-phone" type="tel"
                     autoComplete="tel"
                     inputMode="tel"
                     placeholder=""
                     value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          ) : (
            <div className="field">
              <input id="auth-id" type="text" autoComplete="username"
                     placeholder=""
                     value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoFocus />
            </div>
          )}

          <label htmlFor="auth-pw">Password</label>
          <div className="field">
            <input id="auth-pw" type={showPw ? 'text' : 'password'}
                   autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                   placeholder=""
                   value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="field-eye" onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}>
              <EyeIcon open={showPw} />
            </button>
          </div>

          {mode === 'register' && (
            <>
              <label htmlFor="auth-pw2">Confirm Password</label>
              <div className="field">
                <input id="auth-pw2" type={showPw2 ? 'text' : 'password'} autoComplete="new-password"
                       placeholder=""
                       value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                <button type="button" className="field-eye" onClick={() => setShowPw2((v) => !v)}
                        aria-label={showPw2 ? 'Hide password' : 'Show password'}>
                  <EyeIcon open={showPw2} />
                </button>
              </div>

              <label htmlFor="auth-ref">Referral Code (optional)</label>
              <div className="field">
                <input id="auth-ref" type="text" autoComplete="off"
                       placeholder=""
                       value={referralCode} onChange={(e) => setReferralCode(e.target.value)} />
              </div>
            </>
          )}

          {err && <div className="err" aria-live="polite">{err}</div>}

          <button type="submit" className="auth-primary" disabled={busy}>
            {busy ? (mode === 'signin' ? 'Logging in…' : 'Registering…')
                  : (mode === 'signin' ? 'Login' : 'Register')}
          </button>

          {mode === 'signin' && (
            <div className="auth-forgot">
              <Link className="forgot-link" to="/forgot-password">Forgot password?</Link>
            </div>
          )}
        </form>
      </main>
    </div>
  );
}

/**
 * Player Dossier — editorial-style profile page.
 *
 * Aesthetic: confidential file-folder spread. Instrument Serif italic for the
 * player's name, JetBrains Mono for data, Bricolage Grotesque for body.
 * Lime/gold accents over a deep dark backdrop. Stamps, file-numbers, dotted
 * borders, and dramatic typographic contrast.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  fetchTransactions, fetchBetHistory,
  updateProfile, changePassword,
} from '../api/betApi.js';
import { useAccount, useToast } from '../providers/AccountProvider.jsx';

// ─── Helpers ────────────────────────────────────────────────────────────────

const STAGE_TIER = {
  0: { code: '00', name: 'NEWCOMER',   tone: '#94a3b8' },
  1: { code: '01', name: 'REGISTERED', tone: '#7c5cff' },
  2: { code: '02', name: 'VERIFIED',   tone: '#f5a623' },
  3: { code: '03', name: 'APPROVED',   tone: '#22d3ee' },
  4: { code: '04', name: 'VIP',        tone: '#ffd166' },
};

const COUNTRY_FLAG = {
  GH: '🇬🇭', NG: '🇳🇬', KE: '🇰🇪', UG: '🇺🇬', TZ: '🇹🇿',
  ZA: '🇿🇦', US: '🇺🇸', GB: '🇬🇧', CI: '🇨🇮', SN: '🇸🇳',
};
const COUNTRY_NAME = {
  GH: 'Ghana', NG: 'Nigeria', KE: 'Kenya', UG: 'Uganda', TZ: 'Tanzania',
  ZA: 'South Africa', US: 'United States', GB: 'United Kingdom', CI: 'Ivory Coast', SN: 'Senegal',
};

function fmtMoney(n) {
  return Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtNum(n) {
  return Number(n || 0).toLocaleString('en-US');
}
function shortDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }).toUpperCase();
}
function longDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GH', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
function maskEmail(email) {
  if (!email) return '—';
  const [name, domain] = String(email).split('@');
  if (!domain) return email;
  return `${name.slice(0, 2)}${'•'.repeat(Math.max(2, name.length - 2))}@${domain}`;
}
function playerNumberFor(id = '') {
  // Deterministic 5-digit ID derived from the user's stable id.
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const n = Math.abs(h) % 100000;
  return String(n).padStart(5, '0');
}

// Tiny count-up hook for the stat numbers — quick, no library.
function useCountUp(target, duration = 900) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    const from = 0;
    const to = Number(target) || 0;
    let raf = 0;
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      setValue(from + (to - from) * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const navigate = useNavigate();
  const { account, refresh, signOut } = useAccount();
  const { toast } = useToast();

  const [tab, setTab]                 = useState('overview');
  const [displayName, setDisplayName] = useState(account?.displayName || '');
  const [phone, setPhone]             = useState(account?.phone || '');
  const [transactions, setTransactions] = useState(null);
  const [bets, setBets]               = useState(null);
  const [pwForm, setPwForm]           = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy]               = useState(false);
  const [err, setErr]                 = useState('');
  const [profileErr, setProfileErr]   = useState('');

  useEffect(() => {
    if (!account) return;
    setDisplayName(account.displayName || '');
    setPhone(account.phone || '');
    fetchTransactions().then((d) => setTransactions(d.transactions || [])).catch(() => setTransactions([]));
    fetchBetHistory().then((d) => setBets(d.bets || [])).catch(() => setBets([]));
  }, [account]);

  // Stats derived from bet history
  const stats = useMemo(() => {
    const list = bets || [];
    const total = list.length;
    const won = list.filter((b) => b.status === 'won' || b.status === 'cashed_out').length;
    const lost = list.filter((b) => b.status === 'lost').length;
    const open = list.filter((b) => b.status === 'open').length;
    const settled = won + lost;
    const winRate = settled > 0 ? Math.round((won / settled) * 100) : null;
    return { total, won, lost, open, settled, winRate };
  }, [bets]);

  const stage = (() => {
    const n = Number(account?.stage);
    if (!Number.isFinite(n)) return 0;
    return Math.min(4, Math.max(0, n));
  })();

  const balance = useCountUp(account?.balance || 0);
  const deposits = useCountUp(account?.totalDeposited || 0);

  if (!account) {
    return (
      <main className="dossier-empty">
        <div className="dossier-empty-card">
          <p className="dossier-eyebrow">PLAYER DOSSIER · LOCKED</p>
          <h1>Sign in to read your file.</h1>
          <p className="dossier-empty-sub">Every player keeps a private file. Sign in to access yours.</p>
          <Link className="dossier-empty-cta" to="/login">Sign in to Xenbet →</Link>
        </div>
        <style>{DOSSIER_CSS}</style>
      </main>
    );
  }

  const saveProfile = async (e) => {
    e.preventDefault();
    setProfileErr('');
    const trimmedPhone = phone.trim();
    if (trimmedPhone && !/^\+?\d[\d\s-]{8,18}$/.test(trimmedPhone)) {
      setProfileErr('Enter a valid phone number (e.g. 0244123456 or +233244123456).');
      return;
    }
    try {
      setBusy(true);
      await updateProfile({ displayName, phone: trimmedPhone });
      await refresh();
      toast('Dossier updated.');
    } catch (e) {
      const msg = e.message || 'Could not save changes.';
      setProfileErr(msg);
      toast(msg);
    } finally { setBusy(false); }
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    setErr('');
    if (pwForm.next.length < 8) { setErr('New password must be at least 8 characters.'); return; }
    if (!/[A-Z]/.test(pwForm.next) || !/[a-z]/.test(pwForm.next)) { setErr('Mix upper- and lower-case letters.'); return; }
    if (!/\d/.test(pwForm.next)) { setErr('Include at least one digit.'); return; }
    if (pwForm.next !== pwForm.confirm) { setErr('Passwords don’t match.'); return; }
    try {
      setBusy(true);
      await changePassword({ currentPassword: pwForm.current, newPassword: pwForm.next });
      setPwForm({ current: '', next: '', confirm: '' });
      toast('Password updated. Other sessions were signed out.');
    } catch (e) {
      setErr(e.message || 'Could not change password.');
    } finally { setBusy(false); }
  };

  const handleSignOut = async () => {
    if (typeof window !== 'undefined' && !window.confirm('Close this dossier and sign out?')) return;
    try { await signOut(); } catch (e) { toast(e?.message || 'Sign-out failed.'); }
  };

  const tier   = STAGE_TIER[stage];
  const player = playerNumberFor(account.id || account.email || '');
  const flag   = COUNTRY_FLAG[account.country] || '🌐';
  const cname  = COUNTRY_NAME[account.country] || account.country || 'Unspecified';
  const initial = (account.displayName || account.email || '?').trim().charAt(0).toUpperCase();

  return (
    <main className="dossier">
      <div className="dossier-grain" aria-hidden />

      {/* Topbar */}
      <header className="dossier-topbar">
        <button type="button" className="dossier-back" onClick={() => navigate(-1)} aria-label="Back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <span className="dossier-crumb">
          <em>Player&nbsp;Dossier</em> · STAKEPOINT
        </span>
        <button type="button" className="dossier-signout" onClick={handleSignOut}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
          Sign&nbsp;out
        </button>
      </header>

      {/* Hero file card */}
      <section className="dossier-file">
        <div className="dossier-file-tabs">
          <span className="dossier-file-tab"><span className="dot" /> CONFIDENTIAL</span>
          <span className="dossier-file-tab"><span className="dot warm" /> FILE&nbsp;#{player}</span>
          <span className="dossier-file-tab dim">CASE OPENED · {shortDate(account.createdAt)}</span>
        </div>

        <div className="dossier-file-body">
          <div className="dossier-headline">
            <div className="dossier-initial" aria-hidden>
              <span>{initial}</span>
              <i className="ring" />
            </div>
            <div className="dossier-name-block">
              <p className="dossier-kicker">Profile · Subject</p>
              <h1 className="dossier-name">
                {account.displayName || account.email}<span className="punct">.</span>
              </h1>
              <p className="dossier-tag">
                {tier.name === 'NEWCOMER' ? 'Newly enrolled player' : `Tier ${tier.code} · ${tier.name.toLowerCase()} player`}
              </p>
            </div>

            {/* Diagonal stage stamp */}
            <div className="dossier-stamp" style={{ '--stamp': tier.tone }}>
              <span className="stamp-bracket">[</span>
              <div className="stamp-inner">
                <span className="stamp-num">{tier.code}</span>
                <span className="stamp-name">{tier.name}</span>
              </div>
              <span className="stamp-bracket">]</span>
            </div>
          </div>

          {/* Bio strip */}
          <dl className="dossier-bio">
            <div>
              <dt>Email</dt>
              <dd>{account.email}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{account.phone || <span className="dim">— not set</span>}</dd>
            </div>
            <div>
              <dt>Country</dt>
              <dd>{flag}&nbsp;&nbsp;{cname}</dd>
            </div>
            <div>
              <dt>Joined</dt>
              <dd>{shortDate(account.createdAt)}</dd>
            </div>
            <div>
              <dt>KYC</dt>
              <dd className="cap">{account.kycStatus || 'unverified'}</dd>
            </div>
            <div>
              <dt>Player ID</dt>
              <dd className="mono">#{player}</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Stats grid */}
      <section className="dossier-stats">
        <StatTile
          label="Wallet balance"
          value={`GHS ${fmtMoney(balance)}`}
          sub="Cash available now"
          tone="lime"
        />
        <StatTile
          label="Lifetime deposits"
          value={`GHS ${fmtMoney(deposits)}`}
          sub={`Across ${transactions ? fmtNum(transactions.filter((t) => t.kind === 'deposit').length) : '—'} top-ups`}
          tone="gold"
        />
        <StatTile
          label="Bets placed"
          value={fmtNum(stats.total)}
          sub={`${fmtNum(stats.open)} open · ${fmtNum(stats.settled)} settled`}
          tone="cyan"
        />
        <StatTile
          label="Win rate"
          value={stats.winRate == null ? '—' : `${stats.winRate}%`}
          sub={stats.settled ? `${fmtNum(stats.won)} won of ${fmtNum(stats.settled)} settled` : 'No settled bets yet'}
          tone="violet"
        />
      </section>

      {/* Tab nav */}
      <nav className="dossier-tabs" aria-label="Dossier sections">
        {[
          ['overview',     'Overview'],
          ['transactions', 'Transactions'],
          ['security',     'Security'],
        ].map(([k, label], i) => (
          <button
            key={k}
            type="button"
            className={`dossier-tab${tab === k ? ' active' : ''}`}
            onClick={() => setTab(k)}
          >
            <span className="tab-num">{String(i + 1).padStart(2, '0')}</span>
            <span className="tab-label">{label}</span>
          </button>
        ))}
      </nav>

      {/* Tab panels */}
      <section className="dossier-panel">
        {tab === 'overview' && (
          <PanelOverview
            account={account}
            displayName={displayName}
            setDisplayName={setDisplayName}
            phone={phone}
            setPhone={setPhone}
            profileErr={profileErr}
            busy={busy}
            onSubmit={saveProfile}
          />
        )}
        {tab === 'transactions' && (
          <PanelTransactions transactions={transactions} />
        )}
        {tab === 'security' && (
          <PanelSecurity
            account={account}
            pwForm={pwForm}
            setPwForm={setPwForm}
            err={err}
            busy={busy}
            onSubmit={submitPassword}
          />
        )}
      </section>

      <footer className="dossier-foot">
        <span>END OF FILE · {player}</span>
        <span className="mono dim">{maskEmail(account.email)}</span>
      </footer>

      <style>{DOSSIER_CSS}</style>
    </main>
  );
}

// ─── Stat Tile ──────────────────────────────────────────────────────────────

function StatTile({ label, value, sub, tone = 'lime' }) {
  return (
    <article className={`dossier-stat tone-${tone}`}>
      <div className="dossier-stat-mark" />
      <p className="dossier-stat-label">{label}</p>
      <p className="dossier-stat-value">{value}</p>
      <p className="dossier-stat-sub">{sub}</p>
    </article>
  );
}

// ─── Panels ─────────────────────────────────────────────────────────────────

function PanelOverview({ account, displayName, setDisplayName, phone, setPhone, profileErr, busy, onSubmit }) {
  return (
    <div className="dossier-card">
      <header className="dossier-card-head">
        <span className="dossier-card-num">§ 01</span>
        <div>
          <h3>Personal information</h3>
          <p>Update the details we hold on this player.</p>
        </div>
      </header>
      <form onSubmit={onSubmit} className="dossier-form">
        <Field label="Email · login" value={account.email} readOnly hint="Locked to the email used at signup." />
        <Field
          label="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="The name we'll use on slips"
        />
        <Field
          label="Phone number"
          hint="Withdrawals are sent to this number."
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="e.g. 0244123456 or +233244123456"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          maxLength={20}
        />
        {profileErr && <p className="dossier-error">{profileErr}</p>}
        <div className="dossier-form-actions">
          <button type="submit" className="dossier-cta" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes →'}
          </button>
        </div>
      </form>
    </div>
  );
}

function PanelTransactions({ transactions }) {
  if (transactions === null) {
    return (
      <div className="dossier-card">
        <header className="dossier-card-head">
          <span className="dossier-card-num">§ 02</span>
          <div><h3>Wallet movements</h3><p>Pulling the latest ledger…</p></div>
        </header>
        <div className="dossier-skel-list">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="dossier-skel-row" />)}
        </div>
      </div>
    );
  }
  if (!transactions.length) {
    return (
      <div className="dossier-card">
        <header className="dossier-card-head">
          <span className="dossier-card-num">§ 02</span>
          <div><h3>Wallet movements</h3><p>No money has moved through this account yet.</p></div>
        </header>
        <Empty
          title="Nothing on the ledger"
          sub="Deposits, withdrawals, and bet settlements will appear here in time order."
        />
      </div>
    );
  }
  return (
    <div className="dossier-card">
      <header className="dossier-card-head">
        <span className="dossier-card-num">§ 02</span>
        <div><h3>Wallet movements</h3><p>{transactions.length} entries · newest first</p></div>
      </header>
      <ol className="dossier-tx">
        {transactions.map((tx, i) => {
          const positive = (tx.amount || 0) >= 0;
          return (
            <li key={tx.id || i} className={`dossier-tx-item ${positive ? 'pos' : 'neg'}`}>
              <span className="dossier-tx-index">{String(i + 1).padStart(2, '0')}</span>
              <div className="dossier-tx-body">
                <div className="dossier-tx-kind">{(tx.kind || 'movement').replace(/_/g, ' ')}</div>
                <div className="dossier-tx-meta">{longDate(tx.at)}{tx.method ? ` · ${tx.method}` : ''}</div>
              </div>
              <div className="dossier-tx-amount">
                <span className="sign">{positive ? '+' : '−'}</span>
                <span className="num">GHS {fmtMoney(Math.abs(tx.amount || 0))}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function PanelSecurity({ account, pwForm, setPwForm, err, busy, onSubmit }) {
  return (
    <div className="dossier-card">
      <header className="dossier-card-head">
        <span className="dossier-card-num">§ 03</span>
        <div>
          <h3>Credentials</h3>
          <p>Rotate the password. Other devices will be signed out.</p>
        </div>
      </header>
      <div className="dossier-security-card">
        <p className="dossier-security-when">
          Account opened <strong>{longDate(account.createdAt)}</strong>
        </p>
        <p className="dossier-security-2fa">
          Two-factor auth · <em>{account.twoFactorEnabled ? 'enabled' : 'off — set one up via the admin panel'}</em>
        </p>
      </div>
      <form onSubmit={onSubmit} className="dossier-form">
        <Field
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={pwForm.current}
          onChange={(e) => setPwForm((p) => ({ ...p, current: e.target.value }))}
        />
        <Field
          label="New password"
          hint="At least 8 chars · mixed case · 1 digit."
          type="password"
          autoComplete="new-password"
          value={pwForm.next}
          onChange={(e) => setPwForm((p) => ({ ...p, next: e.target.value }))}
        />
        <Field
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={pwForm.confirm}
          onChange={(e) => setPwForm((p) => ({ ...p, confirm: e.target.value }))}
        />
        {err && <p className="dossier-error">{err}</p>}
        <div className="dossier-form-actions">
          <button type="submit" className="dossier-cta" disabled={busy}>
            {busy ? 'Updating…' : 'Rotate password →'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Field & Empty ──────────────────────────────────────────────────────────

function Field({ label, hint, readOnly, ...rest }) {
  return (
    <label className={`dossier-field${readOnly ? ' is-readonly' : ''}`}>
      <span className="dossier-field-label">
        {label}
        {hint && <span className="dossier-field-hint"> — {hint}</span>}
      </span>
      <input className="dossier-input" readOnly={readOnly} {...rest} />
    </label>
  );
}

function Empty({ title, sub }) {
  return (
    <div className="dossier-empty-state">
      <p className="dossier-empty-title">{title}</p>
      <p className="dossier-empty-sub">{sub}</p>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const DOSSIER_CSS = `
.dossier {
  --bg: #070a08;
  --bg-soft: #0c1410;
  --panel: #0e1814;
  --panel-edge: rgba(255,255,255,.06);
  --line: rgba(197, 255, 61, .14);
  --hairline: rgba(255,255,255,.07);
  --text: #f3f6f1;
  --text-soft: rgba(243, 246, 241, 0.72);
  --text-dim: rgba(243, 246, 241, 0.46);
  --text-mute: rgba(243, 246, 241, 0.28);
  --lime: #c5ff3d;
  --gold: #ffd166;
  --cyan: #67e8f9;
  --violet: #c4b5fd;
  --red: #ff5c5c;

  position: relative;
  min-height: calc(100vh - 80px);
  padding: 28px 22px 80px;
  background:
    radial-gradient(900px 600px at 10% -10%, rgba(197,255,61,.07), transparent 65%),
    radial-gradient(700px 500px at 110% 15%, rgba(255,209,102,.06), transparent 60%),
    radial-gradient(600px 400px at 50% 110%, rgba(124,92,255,.08), transparent 65%),
    linear-gradient(180deg, var(--bg) 0%, #050807 100%);
  color: var(--text);
  font-family: 'Bricolage Grotesque', system-ui, sans-serif;
  overflow: hidden;
}
html[data-theme="light"] .dossier {
  --bg: #f4f3eb;
  --bg-soft: #ecebe1;
  --panel: #ffffff;
  --panel-edge: rgba(0,0,0,.08);
  --line: rgba(20, 60, 30, .22);
  --hairline: rgba(0,0,0,.08);
  --text: #1a1f1c;
  --text-soft: rgba(26, 31, 28, .72);
  --text-dim: rgba(26, 31, 28, .52);
  --text-mute: rgba(26, 31, 28, .34);
  --lime: #1f8a35;
  --gold: #b6731a;
}

.dossier-grain {
  position: absolute; inset: 0;
  pointer-events: none;
  opacity: 0.06;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

/* ─── Topbar ──────────────────────────────────────────────── */
.dossier-topbar {
  position: relative;
  z-index: 1;
  max-width: 1080px;
  margin: 0 auto 22px;
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-dim);
  font-family: 'JetBrains Mono', monospace;
}
.dossier-back, .dossier-signout {
  background: transparent;
  border: 1px solid var(--hairline);
  color: var(--text-soft);
  width: auto; height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  font: inherit;
  font-size: 11px;
  letter-spacing: 0.14em;
  transition: color .15s, border-color .15s, background .15s, transform .15s;
}
.dossier-back { width: 34px; padding: 0; }
.dossier-back:hover, .dossier-signout:hover {
  color: var(--lime);
  border-color: var(--lime);
}
.dossier-signout:hover { color: var(--red); border-color: var(--red); }
.dossier-crumb {
  flex: 1;
  display: inline-flex; align-items: center; gap: 8px;
  letter-spacing: 0.22em;
}
.dossier-crumb em {
  font-style: italic;
  font-family: 'Instrument Serif', serif;
  font-size: 18px;
  letter-spacing: 0;
  text-transform: none;
  color: var(--text);
  margin-right: 2px;
}

/* ─── File hero ────────────────────────────────────────────── */
.dossier-file {
  position: relative;
  z-index: 1;
  max-width: 1080px;
  margin: 0 auto 24px;
  background: var(--panel);
  border-radius: 22px;
  border: 1px solid var(--panel-edge);
  box-shadow: 0 24px 80px rgba(0, 0, 0, .45);
  overflow: hidden;
}
.dossier-file::before {
  /* dossier corner notch */
  content: '';
  position: absolute;
  top: 0; right: 0;
  width: 84px; height: 84px;
  background: linear-gradient(225deg, rgba(197,255,61,.18) 0%, transparent 55%);
  pointer-events: none;
}
.dossier-file-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  padding: 14px 24px;
  border-bottom: 1px dashed var(--hairline);
  font-size: 10.5px;
  letter-spacing: 0.18em;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-dim);
  text-transform: uppercase;
}
.dossier-file-tab { display: inline-flex; align-items: center; gap: 8px; }
.dossier-file-tab.dim { color: var(--text-mute); }
.dossier-file-tab .dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: var(--lime);
  box-shadow: 0 0 8px var(--lime);
}
.dossier-file-tab .dot.warm {
  background: var(--gold);
  box-shadow: 0 0 8px var(--gold);
}
.dossier-file-body {
  padding: 28px 28px 24px;
  position: relative;
}

.dossier-headline {
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 22px;
  align-items: start;
  margin-bottom: 26px;
}
.dossier-initial {
  position: relative;
  width: 74px; height: 74px;
  border-radius: 50%;
  background: linear-gradient(160deg, rgba(197,255,61,.22), rgba(255,209,102,.14));
  display: grid; place-items: center;
  font-family: 'Instrument Serif', serif;
  font-style: italic;
  font-size: 42px;
  color: var(--text);
  border: 1px solid var(--line);
  box-shadow: 0 12px 28px rgba(197,255,61,.12);
}
.dossier-initial .ring {
  position: absolute;
  inset: -10px;
  border-radius: 50%;
  border: 1px dashed var(--line);
  pointer-events: none;
  animation: dossier-ring 18s linear infinite;
}
@keyframes dossier-ring { to { transform: rotate(360deg); } }

.dossier-kicker {
  margin: 0 0 4px;
  font-size: 10.5px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--text-mute);
  font-family: 'JetBrains Mono', monospace;
}
.dossier-name {
  margin: 0 0 6px;
  font-family: 'Instrument Serif', serif;
  font-style: italic;
  font-weight: 400;
  font-size: clamp(38px, 6vw, 64px);
  line-height: 1.02;
  letter-spacing: -0.015em;
  color: var(--text);
  word-break: break-word;
}
.dossier-name .punct { color: var(--lime); font-style: normal; }
.dossier-tag {
  margin: 0;
  font-size: 13.5px;
  color: var(--text-soft);
  letter-spacing: 0.01em;
}

.dossier-stamp {
  position: absolute;
  top: -8px;
  right: -4px;
  transform: rotate(-9deg);
  border: 2px solid var(--stamp);
  color: var(--stamp);
  padding: 6px 14px;
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  text-transform: uppercase;
  display: inline-flex; align-items: center; gap: 8px;
  background: rgba(0, 0, 0, 0.25);
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.35);
  opacity: 0.92;
}
.dossier-stamp .stamp-bracket {
  font-size: 24px;
  font-family: 'Instrument Serif', serif;
  font-style: italic;
  line-height: 1;
  opacity: 0.6;
}
.dossier-stamp .stamp-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.1;
}
.dossier-stamp .stamp-num {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.04em;
}
.dossier-stamp .stamp-name {
  font-size: 10px;
  letter-spacing: 0.22em;
  margin-top: 2px;
}

.dossier-bio {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px 28px;
  margin: 0;
  padding-top: 22px;
  border-top: 1px dashed var(--hairline);
}
.dossier-bio div { min-width: 0; }
.dossier-bio dt {
  font-size: 10px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--text-mute);
  font-family: 'JetBrains Mono', monospace;
  margin: 0 0 4px;
}
.dossier-bio dd {
  margin: 0;
  font-size: 14px;
  color: var(--text);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dossier-bio .mono { font-family: 'JetBrains Mono', monospace; letter-spacing: 0.04em; color: var(--gold); }
.dossier-bio .cap  { text-transform: capitalize; }
.dossier-bio .dim  { color: var(--text-mute); }

/* ─── Stats ───────────────────────────────────────────────── */
.dossier-stats {
  position: relative;
  z-index: 1;
  max-width: 1080px;
  margin: 0 auto 28px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}
.dossier-stat {
  position: relative;
  padding: 18px 18px 16px;
  background: var(--panel);
  border: 1px solid var(--panel-edge);
  border-radius: 16px;
  overflow: hidden;
  transition: transform .25s, border-color .25s;
}
.dossier-stat:hover { transform: translateY(-2px); border-color: var(--accent-tone, var(--lime)); }
.dossier-stat-mark {
  position: absolute;
  top: 0; left: 0; bottom: 0;
  width: 3px;
  background: var(--accent-tone, var(--lime));
}
.dossier-stat.tone-lime   { --accent-tone: var(--lime); }
.dossier-stat.tone-gold   { --accent-tone: var(--gold); }
.dossier-stat.tone-cyan   { --accent-tone: var(--cyan); }
.dossier-stat.tone-violet { --accent-tone: var(--violet); }
.dossier-stat-label {
  margin: 0 0 8px;
  font-size: 10.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-mute);
  font-family: 'JetBrains Mono', monospace;
}
.dossier-stat-value {
  margin: 0 0 6px;
  font-size: clamp(20px, 3vw, 28px);
  font-weight: 800;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--accent-tone, var(--text));
}
.dossier-stat-sub {
  margin: 0;
  font-size: 12px;
  color: var(--text-dim);
}

/* ─── Tabs ────────────────────────────────────────────────── */
.dossier-tabs {
  position: relative;
  z-index: 1;
  max-width: 1080px;
  margin: 0 auto 20px;
  display: flex;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;
  padding-bottom: 4px;
  border-bottom: 1px dashed var(--hairline);
}
.dossier-tabs::-webkit-scrollbar { display: none; }
.dossier-tab {
  flex-shrink: 0;
  background: transparent;
  border: none;
  color: var(--text-dim);
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  padding: 12px 16px 14px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  letter-spacing: -0.005em;
  transition: color .15s, border-color .15s;
}
.dossier-tab .tab-num {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.16em;
  color: var(--text-mute);
}
.dossier-tab:hover { color: var(--text); }
.dossier-tab.active {
  color: var(--text);
  border-bottom-color: var(--lime);
}
.dossier-tab.active .tab-num { color: var(--lime); }

/* ─── Panel cards ─────────────────────────────────────────── */
.dossier-panel {
  position: relative;
  z-index: 1;
  max-width: 1080px;
  margin: 0 auto;
}
.dossier-card {
  background: var(--panel);
  border: 1px solid var(--panel-edge);
  border-radius: 18px;
  padding: 24px 26px 26px;
}
.dossier-card-head {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 16px;
  align-items: start;
  margin-bottom: 22px;
  padding-bottom: 16px;
  border-bottom: 1px dashed var(--hairline);
}
.dossier-card-num {
  font-family: 'Instrument Serif', serif;
  font-style: italic;
  font-size: 28px;
  color: var(--gold);
  line-height: 1;
}
.dossier-card-head h3 {
  margin: 0 0 4px;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.dossier-card-head p {
  margin: 0;
  font-size: 13px;
  color: var(--text-soft);
}

/* ─── Form ────────────────────────────────────────────────── */
.dossier-form {
  display: grid;
  gap: 18px;
}
.dossier-field {
  display: grid;
  gap: 6px;
}
.dossier-field-label {
  font-size: 10.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-dim);
}
.dossier-field-hint {
  font-size: 10px;
  color: var(--text-mute);
  text-transform: none;
  letter-spacing: 0.02em;
  font-family: inherit;
  margin-left: 4px;
}
.dossier-input {
  width: 100%;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--hairline);
  border-bottom: 1px solid var(--line);
  border-radius: 10px;
  padding: 14px 16px;
  color: var(--text);
  font: inherit;
  font-size: 15px;
  font-family: 'Instrument Serif', serif;
  font-style: italic;
  letter-spacing: 0.01em;
  transition: border-color .15s, background .15s;
}
.dossier-input:focus {
  outline: none;
  border-color: var(--lime);
  background: rgba(197, 255, 61, .04);
}
.dossier-field.is-readonly .dossier-input {
  color: var(--text-dim);
  font-style: italic;
  cursor: not-allowed;
}
.dossier-error {
  margin: 0;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(255, 92, 92, 0.08);
  border: 1px solid rgba(255, 92, 92, 0.32);
  color: var(--red);
  font-size: 13px;
  font-weight: 500;
}
.dossier-form-actions {
  display: flex;
  justify-content: flex-end;
}
.dossier-cta {
  background: linear-gradient(135deg, var(--lime) 0%, #8acf25 100%);
  color: #0a1006;
  border: none;
  padding: 13px 22px;
  border-radius: 10px;
  font-weight: 800;
  font-size: 14px;
  letter-spacing: 0.01em;
  cursor: pointer;
  font-family: inherit;
  transition: transform .15s, box-shadow .15s, opacity .15s;
}
.dossier-cta:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(197, 255, 61, .35);
}
.dossier-cta:disabled { opacity: 0.55; cursor: not-allowed; }

/* ─── Security card ───────────────────────────────────────── */
.dossier-security-card {
  margin-bottom: 18px;
  padding: 14px 16px;
  border-radius: 12px;
  background: rgba(255, 209, 102, .06);
  border: 1px solid rgba(255, 209, 102, .25);
  display: grid;
  gap: 4px;
}
.dossier-security-when, .dossier-security-2fa {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-soft);
}
.dossier-security-when strong { color: var(--text); font-weight: 600; }
.dossier-security-2fa em {
  font-family: 'Instrument Serif', serif;
  font-style: italic;
  color: var(--gold);
  font-size: 13.5px;
}

/* ─── Transactions ───────────────────────────────────────── */
.dossier-tx {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 2px;
}
.dossier-tx-item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 14px;
  align-items: center;
  padding: 14px 8px;
  border-bottom: 1px dashed var(--hairline);
}
.dossier-tx-item:last-child { border-bottom: none; }
.dossier-tx-index {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--text-mute);
  letter-spacing: 0.1em;
}
.dossier-tx-kind {
  font-weight: 600;
  font-size: 14px;
  text-transform: capitalize;
}
.dossier-tx-meta {
  font-size: 11.5px;
  color: var(--text-dim);
  margin-top: 2px;
}
.dossier-tx-amount {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.dossier-tx-amount .sign { font-weight: 800; }
.dossier-tx-amount .num { font-size: 14px; font-weight: 600; }
.dossier-tx-item.pos .dossier-tx-amount { color: var(--lime); }
.dossier-tx-item.neg .dossier-tx-amount { color: var(--gold); }

/* ─── Activity ───────────────────────────────────────────── */
.dossier-act {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0;
}
.dossier-act-item {
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 14px;
  align-items: start;
  padding: 14px 8px 14px 22px;
  border-bottom: 1px dashed var(--hairline);
}
.dossier-act-item:last-child { border-bottom: none; }
.dossier-act-item .bullet {
  position: absolute;
  top: 19px;
  left: 4px;
  width: 7px; height: 7px;
  border-radius: 50%;
  background: var(--lime);
  box-shadow: 0 0 0 3px rgba(197, 255, 61, .12);
}
.dossier-act-item .kind {
  font-weight: 600;
  font-size: 14px;
  text-transform: capitalize;
}
.dossier-act-item .meta {
  font-size: 11.5px;
  color: var(--text-dim);
  margin-top: 2px;
  font-family: 'JetBrains Mono', monospace;
}
.dossier-act-item .rel {
  font-size: 11px;
  color: var(--text-mute);
  white-space: nowrap;
  font-family: 'JetBrains Mono', monospace;
}

/* ─── Empty / skeleton / footer ──────────────────────────── */
.dossier-empty-state {
  text-align: center;
  padding: 28px 16px;
  border: 1px dashed var(--hairline);
  border-radius: 14px;
}
.dossier-empty-title {
  margin: 0 0 4px;
  font-family: 'Instrument Serif', serif;
  font-style: italic;
  font-size: 20px;
  color: var(--text);
}
.dossier-empty-sub { margin: 0; color: var(--text-dim); font-size: 13px; }

.dossier-skel-list { display: grid; gap: 8px; }
.dossier-skel-row {
  height: 50px;
  border-radius: 10px;
  background: linear-gradient(110deg, rgba(255,255,255,.04) 8%, rgba(255,255,255,.10) 18%, rgba(255,255,255,.04) 33%);
  background-size: 200% 100%;
  animation: dossier-shimmer 1.2s linear infinite;
}
@keyframes dossier-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.dossier-foot {
  position: relative;
  z-index: 1;
  max-width: 1080px;
  margin: 28px auto 0;
  padding: 14px 4px 0;
  border-top: 1px dashed var(--hairline);
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10.5px;
  color: var(--text-mute);
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
.dossier-foot .dim { color: var(--text-mute); text-transform: none; letter-spacing: 0.04em; }

/* ─── Empty (logged out) ─────────────────────────────────── */
.dossier-empty {
  min-height: calc(100vh - 100px);
  display: grid;
  place-items: center;
  padding: 40px 22px;
  background: var(--bg, #070a08);
  color: var(--text, #f3f6f1);
  font-family: 'Bricolage Grotesque', system-ui, sans-serif;
}
.dossier-empty-card {
  max-width: 460px;
  text-align: center;
}
.dossier-empty-card h1 {
  font-family: 'Instrument Serif', serif;
  font-style: italic;
  font-size: 42px;
  font-weight: 400;
  margin: 8px 0 16px;
  letter-spacing: -0.01em;
}
.dossier-eyebrow {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: #ffd166;
}
.dossier-empty-cta {
  display: inline-block;
  margin-top: 20px;
  padding: 14px 24px;
  background: #c5ff3d;
  color: #0a1006;
  font-weight: 800;
  border-radius: 10px;
  text-decoration: none;
  letter-spacing: 0.01em;
}

/* ─── Responsive ─────────────────────────────────────────── */
@media (max-width: 900px) {
  .dossier-stats { grid-template-columns: repeat(2, 1fr); }
  .dossier-bio   { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 640px) {
  .dossier { padding: 18px 14px 80px; }
  .dossier-file-body { padding: 22px 18px 18px; }
  .dossier-headline { grid-template-columns: auto 1fr; gap: 14px; }
  .dossier-initial { width: 58px; height: 58px; font-size: 32px; }
  .dossier-stamp {
    top: auto;
    right: auto;
    position: relative;
    transform: rotate(-4deg);
    width: fit-content;
    margin-top: 14px;
  }
  .dossier-card { padding: 18px 16px 20px; }
  .dossier-bio { grid-template-columns: 1fr 1fr; gap: 14px; }
  .dossier-bio dd { white-space: normal; }
  .dossier-card-head { gap: 10px; }
  .dossier-card-num { font-size: 22px; }
  .dossier-foot { flex-direction: column; gap: 6px; align-items: flex-start; }
  .dossier-crumb { font-size: 10px; }
  .dossier-crumb em { font-size: 14px; }
}
@media (max-width: 420px) {
  .dossier-stats { grid-template-columns: 1fr 1fr; gap: 10px; }
  .dossier-stat { padding: 14px; }
  .dossier-name { font-size: 34px; }
  .dossier-tab { padding: 10px 12px 12px; font-size: 12.5px; }
  .dossier-tab .tab-num { font-size: 9px; }
}
`;

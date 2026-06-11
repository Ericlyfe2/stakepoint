/**
 * Polished placeholder pages for sections that aren't fully implemented yet.
 * They aren't empty — they show a roadmap and connect to the real audit-log
 * and health endpoints where applicable so the dashboard never feels broken.
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, Badge, Empty, Modal, moneyFmt, numFmt, ago, dateShort, Spinner } from '../../components/admin/primitives.jsx';
import {
  adminAudit, adminHealth, adminLiveBets,
  adminListInvites, adminCreateInvite, adminRevokeInvite,
  adminFinance, adminFraud,
  adminListNotifications, adminCreateNotification, adminDeleteNotification,
  adminListTickets, adminReplyTicket, adminPatchTicket,
} from '../../api/adminApi.js';
import { useAdmin } from '../../providers/AdminProvider.jsx';
import {
  IconBook, IconCash, IconBell, IconLifebuoy, IconChart, IconCog, IconBot, IconShield,
  IconLive, IconActivity, IconSparkles,
} from '../../components/admin/Icons.jsx';

function ComingSoon({ title, intro, items, icon }) {
  return (
    <>
      <header className="adm-page-head">
        <div>
          <h1>{title}</h1>
          <p>{intro}</p>
        </div>
        <Badge tone="brand"><IconSparkles size={12} /> Module preview</Badge>
      </header>
      <div className="adm-grid c2">
        {items.map((it) => (
          <Card key={it.title} title={it.title} subtitle={it.subtitle} pill={it.pill || <Badge tone="info">Coming</Badge>}>
            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-soft)', fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {it.bullets.map((b) => <li key={b}>{b}</li>)}
            </ul>
          </Card>
        ))}
      </div>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            display: 'grid', placeItems: 'center',
            background: 'var(--grad-brand)', color: '#fff',
          }}>{icon}</div>
          <div style={{ flex: 1 }}>
            <strong>Need this section sooner?</strong>
            <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>
              The backend hooks, audit pipeline, and design system are already in place — extending into a full section
              is mostly UI work. Open an issue and we'll prioritise it.
            </div>
          </div>
          <button className="adm-btn primary">Request</button>
        </div>
      </Card>
    </>
  );
}

/* ---------- Live betting (uses real endpoint) ---------- */
export function LiveBettingPage() {
  const [bets, setBets] = useState(null);
  useEffect(() => {
    let live = true;
    const tick = () => adminLiveBets().then((r) => { if (live) setBets(r.bets); }).catch(() => {});
    tick(); const i = setInterval(tick, 8000); return () => { live = false; clearInterval(i); };
  }, []);
  return (
    <>
      <header className="adm-page-head">
        <div>
          <h1>Live betting</h1>
          <p>Open tickets right now. Risk team can drill into any leg and intervene.</p>
        </div>
        <Badge tone="danger" dot>LIVE</Badge>
      </header>
      <Card title="Open tickets" subtitle="Auto refreshes every 8s">
        {!bets ? <Spinner /> : bets.length === 0 ? <Empty title="No open tickets" /> : (
          <table className="adm-table">
            <thead><tr><th>Ticket</th><th>User</th><th>Mode</th><th className="num">Stake</th><th className="num">Liability</th><th>Placed</th></tr></thead>
            <tbody>
              {bets.map((b) => (
                <tr key={b.id}>
                  <td style={{ fontFamily: 'var(--ff-mono)', fontSize: 12 }}>{b.id.slice(0, 18)}…</td>
                  <td>{b.user?.email || b.userId}</td>
                  <td>{b.mode}</td>
                  <td className="num">{moneyFmt(b.stake)}</td>
                  <td className="num">{moneyFmt(b.potentialWin)}</td>
                  <td>{ago(b.placedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

/* ---------- Audit logs (uses real endpoint) ---------- */
export function AuditLogsPage() {
  const [entries, setEntries] = useState(null);
  const [severity, setSeverity] = useState('');
  const [action, setAction] = useState('');

  useEffect(() => {
    adminAudit({ severity, action, limit: 200 }).then((r) => setEntries(r.entries)).catch(() => {});
  }, [severity, action]);

  return (
    <>
      <header className="adm-page-head">
        <div>
          <h1>Audit logs</h1>
          <p>Every privileged action is recorded with actor, target, IP and severity.</p>
        </div>
        <Badge tone="info">Tamper-evident</Badge>
      </header>
      <div className="adm-table-wrap">
        <div className="adm-table-toolbar">
          <input placeholder="Filter action…" value={action} onChange={(e) => setAction(e.target.value)} style={{ minWidth: 220 }} />
          <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="">Any severity</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div className="adm-table-scroll">
          <table className="adm-table">
            <thead><tr><th>When</th><th>Severity</th><th>Action</th><th>Actor</th><th>Target</th><th>IP</th></tr></thead>
            <tbody>
              {!entries && <tr><td colSpan={6}><Spinner /></td></tr>}
              {entries && entries.length === 0 && <tr><td colSpan={6}><Empty title="No events match" /></td></tr>}
              {entries?.map((e) => (
                <tr key={e.id}>
                  <td>{dateShort(e.at)}</td>
                  <td><Badge tone={e.severity === 'critical' ? 'danger' : e.severity === 'warning' ? 'warn' : 'info'}>{e.severity}</Badge></td>
                  <td style={{ fontFamily: 'var(--ff-mono)', fontSize: 12 }}>{e.action}</td>
                  <td>{e.actorId || '—'} <span style={{ color: 'var(--text-dim)' }}>{e.actorRole ? `(${e.actorRole})` : ''}</span></td>
                  <td>{e.target ? `${e.targetType}:${e.target}` : '—'}</td>
                  <td style={{ fontFamily: 'var(--ff-mono)', fontSize: 12 }}>{e.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ---------- Settings (real session + 2FA + admin invites) ---------- */
export { default as SettingsPage } from './Settings.jsx';

export function StubSettingsPage() {
  const [health, setHealth] = useState(null);
  useEffect(() => { adminHealth().then(setHealth).catch(() => {}); }, []);
  return (
    <>
      <header className="adm-page-head">
        <div>
          <h1>Settings</h1>
          <p>Platform configuration, security posture, and runtime info.</p>
        </div>
        <Badge tone="info">Super admin</Badge>
      </header>

      <AdminInvitesCard />

      <div className="adm-grid c2">
        <Card title="Runtime">
          <dl className="adm-kv">
            <dt>API uptime</dt><dd>{health?.uptimeSec ?? '—'}s</dd>
            <dt>Memory</dt><dd>{health?.memoryMb ?? '—'} MB</dd>
            <dt>Node</dt><dd>{health?.nodeVersion || '—'}</dd>
            <dt>PID</dt><dd>{health?.pid ?? '—'}</dd>
            <dt>SMTP</dt><dd>{health?.smtp ? <Badge tone="success">Configured</Badge> : <Badge tone="warn">Console mode</Badge>}</dd>
            <dt>Google OAuth</dt><dd>{health?.google ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}</dd>
            <dt>Odds feed</dt><dd>{health?.oddsApi?.enabled ? <Badge tone="success">Live</Badge> : <Badge tone="warn">Cached</Badge>}</dd>
          </dl>
        </Card>
        <Card title="Platform toggles" subtitle="Affect the player site immediately">
          {[
            ['Maintenance mode', false],
            ['New registrations', true],
            ['Live betting',      true],
            ['Cash-out enabled',  true],
            ['Casino enabled',    true],
            ['Promotions visible',true],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px dashed var(--border)' }}>
              <span style={{ fontSize: 13.5 }}>{k}</span>
              <Badge tone={v ? 'success' : 'default'} dot>{v ? 'On' : 'Off'}</Badge>
            </div>
          ))}
        </Card>

        <Card title="Branding">
          <dl className="adm-kv">
            <dt>Site name</dt><dd>Xenbet Gaming</dd>
            <dt>Default currency</dt><dd>GHS</dd>
            <dt>Locale</dt><dd>en-GH</dd>
            <dt>Theme</dt><dd>Dark + Light (auto)</dd>
          </dl>
        </Card>
        <Card title="Limits & compliance">
          <dl className="adm-kv">
            <dt>Min deposit</dt><dd>GHS 5</dd>
            <dt>Max stake</dt><dd>GHS 50,000</dd>
            <dt>Cash-out factor</dt><dd>0.60×</dd>
            <dt>Bonus rate</dt><dd>8% on multi-bets</dd>
            <dt>KYC threshold</dt><dd>GHS 2,500 withdrawals</dd>
            <dt>Self-exclusion</dt><dd>Available</dd>
          </dl>
        </Card>
      </div>
    </>
  );
}

function AdminInvitesCard() {
  const { hasRole, showToast } = useAdmin();
  const isSuper = hasRole(); // super-only (requireRole() with no allowed list)
  const [invites, setInvites] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [lastIssued, setLastIssued] = useState(null);

  async function load() {
    try { const r = await adminListInvites(); setInvites(r.invites); }
    catch (e) { showToast(e.message, 'error'); }
  }
  useEffect(() => { if (isSuper) load(); else setInvites([]); }, [isSuper]);

  async function revoke(inv) {
    if (!isSuper) return;
    if (!confirm(`Revoke invite for ${inv.email}? They won't be able to sign up with it.`)) return;
    try {
      await adminRevokeInvite(inv.id);
      showToast('Invite revoked.');
      load();
    } catch (e) { showToast(e.message, 'error'); }
  }

  function copy(text) {
    try { navigator.clipboard.writeText(text); showToast('Copied to clipboard.'); }
    catch { window.prompt('Copy invite link:', text); }
  }

  return (
    <>
      <Card title="Admin invites"
            subtitle="Invite-only sign-up. Each link is single-use and tied to a role."
            action={isSuper
              ? <button className="adm-btn primary" onClick={() => setCreateOpen(true)}>Issue invite</button>
              : <Badge tone="warn">Super admin only</Badge>}>
        {lastIssued && (
          <div style={{
            padding: 12, marginBottom: 14,
            background: 'linear-gradient(135deg, rgba(24,240,161,.08), rgba(124,92,255,.08))',
            border: '1px solid rgba(24,240,161,.25)',
            borderRadius: 12,
          }}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.12em', fontWeight: 700 }}>
              Invite issued — share this link with {lastIssued.invite.email}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input className="adm-input" readOnly value={lastIssued.signupUrl}
                     style={{ fontFamily: 'var(--ff-mono)', fontSize: 12 }}
                     onFocus={(e) => e.target.select()} />
              <button className="adm-btn" onClick={() => copy(lastIssued.signupUrl)}>Copy</button>
              <button className="adm-btn ghost" onClick={() => setLastIssued(null)}>Hide</button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 6 }}>
              You will not be able to retrieve this link again. The token hash is stored — the raw token is not.
            </div>
          </div>
        )}

        {!invites && <Spinner />}
        {invites && invites.length === 0 && <Empty title="No invites yet" subtitle={isSuper ? 'Click "Issue invite" to create one.' : 'Only super admins can issue invites.'} />}
        {invites && invites.length > 0 && (
          <div className="adm-table-scroll" style={{ maxHeight: 360 }}>
            <table className="adm-table">
              <thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th>Expires</th><th></th></tr></thead>
              <tbody>
                {invites.map((inv) => (
                  <tr key={inv.id}>
                    <td>{inv.email}</td>
                    <td><Badge tone="brand">{inv.adminRole}</Badge></td>
                    <td>
                      {inv.status === 'pending'  && <Badge tone="info" dot>Pending</Badge>}
                      {inv.status === 'used'     && <Badge tone="success" dot>Used</Badge>}
                      {inv.status === 'revoked'  && <Badge tone="danger">Revoked</Badge>}
                      {inv.status === 'expired'  && <Badge tone="warn">Expired</Badge>}
                    </td>
                    <td>{ago(inv.createdAt)}</td>
                    <td title={dateShort(inv.expiresAt)}>{inv.status === 'pending' ? ago(inv.expiresAt) : '—'}</td>
                    <td className="row-actions">
                      {isSuper && inv.status === 'pending' && (
                        <button className="adm-btn sm danger" onClick={() => revoke(inv)}>Revoke</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <CreateInviteModal open={createOpen} onClose={() => setCreateOpen(false)}
                         onCreated={(res) => { setCreateOpen(false); setLastIssued(res); load(); }} />
    </>
  );
}

function CreateInviteModal({ open, onClose, onCreated }) {
  const { showToast } = useAdmin();
  const [form, setForm] = useState({ email: '', adminRole: 'support', displayName: '', ttlDays: 7 });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setForm({ email: '', adminRole: 'support', displayName: '', ttlDays: 7 }); }, [open]);

  async function submit(e) {
    e.preventDefault(); setBusy(true);
    try {
      const res = await adminCreateInvite({
        email: form.email.trim().toLowerCase(),
        adminRole: form.adminRole,
        displayName: form.displayName.trim() || undefined,
        ttlDays: Number(form.ttlDays) || 7,
      });
      onCreated(res);
      showToast('Invite created.');
    } catch (e) {
      showToast(e.message || 'Could not create invite.', 'error');
    } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose}
           title="Issue admin invite"
           description="The recipient will get a one-time signup link. The token is shown once.">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="adm-field">
          <label>Email</label>
          <input className="adm-input" type="email" required value={form.email}
                 onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} autoFocus />
        </div>
        <div className="adm-field">
          <label>Role</label>
          <select className="adm-select" value={form.adminRole}
                  onChange={(e) => setForm((f) => ({ ...f, adminRole: e.target.value }))}>
            <option value="super_admin">Super admin (unrestricted)</option>
            <option value="finance_admin">Finance lead (withdrawals + wallet)</option>
            <option value="odds_manager">Trading desk (fixtures + odds)</option>
            <option value="support">Support agent (read-only + tickets)</option>
            <option value="moderator">Risk & moderation (bans + KYC)</option>
          </select>
        </div>
        <div className="adm-field">
          <label>Display name (optional)</label>
          <input className="adm-input" value={form.displayName}
                 onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                 placeholder="Set a default; they can still change it" />
        </div>
        <div className="adm-field">
          <label>Valid for (days)</label>
          <input className="adm-input" type="number" min="1" max="30" value={form.ttlDays}
                 onChange={(e) => setForm((f) => ({ ...f, ttlDays: e.target.value }))} />
        </div>
        <div className="adm-modal-actions">
          <button type="button" className="adm-btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="adm-btn primary" disabled={busy}>{busy ? 'Issuing…' : 'Issue invite'}</button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------- Generic stubs ---------- */

export const SportsOddsPage = () => (
  <ComingSoon
    title="Sports & odds"
    intro="Curate leagues, fixtures, markets, and live odds with one-click suspension."
    icon={<IconBook />}
    items={[
      { title: 'Match management',   subtitle: 'CRUD on leagues, teams, fixtures.', bullets: ['Add / edit fixtures', 'Schedule kick-offs', 'Manage match metadata', 'Mark fixtures live or settled'] },
      { title: 'Market builder',     subtitle: 'Compose markets and selections.',  bullets: ['1X2 / OU / BTTS / handicap', 'Custom prop markets', 'Per-market limits', 'Liability caps'] },
      { title: 'Live odds control',  subtitle: 'Real-time odds intervention.',      bullets: ['Suspend single selection', 'Bulk freeze a fixture', 'Auto-rebalance liability', 'Trader notes'] },
      { title: 'Feed integration',   subtitle: 'The Odds API + manual overrides.',  bullets: ['Live feed status', 'Override values per league', 'Quality scores per provider', 'Failover routing'] },
    ]}
  />
);

/* ---------- Finance (real) ---------- */
export function FinancePage() {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () => adminFinance().then((r) => { if (alive) setData(r); }).catch((e) => setErr(e.message));
    load();
    const id = setInterval(load, 15_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const filtered = useMemo(() => {
    if (!data?.transactions) return [];
    if (filter === 'all') return data.transactions;
    return data.transactions.filter((t) => t.kind === filter);
  }, [data, filter]);

  const s = data?.summary;
  return (
    <>
      <header className="adm-page-head">
        <div>
          <h1>Finance</h1>
          <p>Deposits, withdrawals, net cash position. Refreshes every 15s.</p>
        </div>
        <Badge tone="info"><IconCash size={12} /> Live ledger</Badge>
      </header>

      <div className="adm-grid c4" style={{ marginBottom: 18 }}>
        <Card title="Deposits (24h)">
          <div style={{ fontSize: 28, fontWeight: 800 }}>{s ? moneyFmt(s.sumIn24h) : '—'}</div>
          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>Lifetime {s ? moneyFmt(s.depositTotal) : '—'} · {s ? numFmt(s.depositCount) : '—'} txns</div>
        </Card>
        <Card title="Withdrawals (24h)">
          <div style={{ fontSize: 28, fontWeight: 800 }}>{s ? moneyFmt(s.sumOut24h) : '—'}</div>
          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>Lifetime {s ? moneyFmt(s.withdrawTotal) : '—'} · {s ? numFmt(s.withdrawCount) : '—'} txns</div>
        </Card>
        <Card title="Net cash">
          <div style={{ fontSize: 28, fontWeight: 800, color: s && s.net >= 0 ? 'var(--success, #1aa46a)' : 'var(--danger, #d63a2c)' }}>
            {s ? moneyFmt(s.net) : '—'}
          </div>
          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>Deposits minus withdrawals</div>
        </Card>
        <Card title="Min thresholds">
          <dl className="adm-kv" style={{ margin: 0 }}>
            <dt>Min deposit</dt><dd>GHS 300</dd>
            <dt>Min withdraw</dt><dd>GHS 10,000</dd>
            <dt>Deposit gate</dt><dd>10% of withdraw</dd>
          </dl>
        </Card>
      </div>

      <Card title="Transaction feed"
            subtitle={data ? `${numFmt(filtered.length)} of ${numFmt(data.transactions.length)} entries` : '—'}
            action={
              <div className="adm-table-toolbar" style={{ padding: 0 }}>
                <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                  <option value="all">All transactions</option>
                  <option value="deposit">Deposits</option>
                  <option value="withdraw">Withdrawals</option>
                </select>
              </div>
            }>
        {err && <div className="err">{err}</div>}
        {!data && <Spinner />}
        {data && filtered.length === 0 && <Empty title="No transactions yet" subtitle="They will appear here as players deposit and withdraw." />}
        {data && filtered.length > 0 && (
          <div className="adm-table-scroll" style={{ maxHeight: 520 }}>
            <table className="adm-table">
              <thead><tr><th>When</th><th>Type</th><th>User</th><th>Country</th><th>Method</th><th className="num">Amount</th><th className="num">Balance after</th></tr></thead>
              <tbody>
                {filtered.slice(0, 200).map((t) => (
                  <tr key={t.id}>
                    <td>{ago(t.at)}</td>
                    <td><Badge tone={t.kind === 'deposit' ? 'success' : 'warn'}>{t.kind}</Badge></td>
                    <td>{t.user?.email || t.userId}</td>
                    <td>{t.user?.country || '—'}</td>
                    <td>{t.method || '—'}</td>
                    <td className="num">{moneyFmt(t.amount)}</td>
                    <td className="num">{moneyFmt(t.balanceAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

/* ---------- Notifications (real broadcasts) ---------- */
export function NotificationsPage() {
  const { showToast } = useAdmin();
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', audience: 'all', severity: 'info' });

  const load = async () => {
    try { const r = await adminListNotifications(); setList(r.notifications); }
    catch (e) { showToast(e.message, 'error'); }
  };
  useEffect(() => { load(); }, []);

  const send = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) return;
    setBusy(true);
    try {
      await adminCreateNotification(form);
      showToast('Broadcast sent.');
      setForm({ title: '', body: '', audience: 'all', severity: 'info' });
      load();
    } catch (e) { showToast(e.message, 'error'); }
    finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!confirm('Delete this broadcast?')) return;
    try { await adminDeleteNotification(id); showToast('Deleted.'); load(); }
    catch (e) { showToast(e.message, 'error'); }
  };

  return (
    <>
      <header className="adm-page-head">
        <div>
          <h1>Notifications</h1>
          <p>Compose and ship platform-wide announcements. Delivered over realtime channel.</p>
        </div>
        <Badge tone="brand"><IconBell size={12} /> Broadcasts</Badge>
      </header>

      <Card title="New broadcast" subtitle="Reaches every connected player or admin session.">
        <form onSubmit={send} style={{ display: 'grid', gap: 12 }}>
          <div className="adm-field">
            <label>Title</label>
            <input className="adm-input" value={form.title}
                   onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                   placeholder="e.g. Scheduled maintenance tonight at 23:00" required maxLength={80} />
          </div>
          <div className="adm-field">
            <label>Body</label>
            <textarea className="adm-input" rows={3} value={form.body}
                      onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                      placeholder="Keep it short. Players see this in-app." required maxLength={500} />
          </div>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
            <div className="adm-field">
              <label>Audience</label>
              <select className="adm-select" value={form.audience}
                      onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}>
                <option value="all">All players</option>
                <option value="verified">Verified players only</option>
                <option value="admins">Admins only</option>
              </select>
            </div>
            <div className="adm-field">
              <label>Severity</label>
              <select className="adm-select" value={form.severity}
                      onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}>
                <option value="info">Info</option>
                <option value="success">Success</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
          <div>
            <button className="adm-btn primary" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send broadcast'}</button>
          </div>
        </form>
      </Card>

      <Card title="Recent broadcasts" subtitle={list ? `${list.length} total` : '—'}>
        {!list && <Spinner />}
        {list && list.length === 0 && <Empty title="No broadcasts yet" subtitle="Anything you publish above will appear here." />}
        {list && list.length > 0 && (
          <div className="adm-table-scroll" style={{ maxHeight: 440 }}>
            <table className="adm-table">
              <thead><tr><th>When</th><th>Title</th><th>Audience</th><th>Severity</th><th></th></tr></thead>
              <tbody>
                {list.map((n) => (
                  <tr key={n.id}>
                    <td>{ago(n.createdAt)}</td>
                    <td style={{ maxWidth: 360 }}>
                      <div style={{ fontWeight: 700 }}>{n.title}</div>
                      <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{n.body}</div>
                    </td>
                    <td><Badge tone="info">{n.audience}</Badge></td>
                    <td><Badge tone={n.severity === 'critical' ? 'danger' : n.severity === 'warning' ? 'warn' : n.severity === 'success' ? 'success' : 'info'}>{n.severity}</Badge></td>
                    <td className="row-actions">
                      <button className="adm-btn sm danger" onClick={() => remove(n.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

/* ---------- Support tickets (real) ---------- */
export function SupportPage() {
  const { showToast } = useAdmin();
  const [tickets, setTickets] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [active, setActive] = useState(null);
  const [reply, setReply] = useState('');

  const load = async () => {
    try { const r = await adminListTickets(statusFilter); setTickets(r.tickets); }
    catch (e) { showToast(e.message, 'error'); }
  };
  useEffect(() => { load(); }, [statusFilter]);

  const send = async () => {
    if (!active || !reply.trim()) return;
    try {
      const r = await adminReplyTicket(active.id, reply.trim());
      setActive(r.ticket);
      setReply('');
      load();
      showToast('Reply sent.');
    } catch (e) { showToast(e.message, 'error'); }
  };

  const close = async () => {
    if (!active) return;
    try {
      const r = await adminPatchTicket(active.id, 'closed');
      setActive(r.ticket);
      load();
      showToast('Ticket closed.');
    } catch (e) { showToast(e.message, 'error'); }
  };

  return (
    <>
      <header className="adm-page-head">
        <div>
          <h1>Customer support</h1>
          <p>Live ticket queue. Tickets land here when players submit the help form.</p>
        </div>
        <Badge tone="brand"><IconLifebuoy size={12} /> Inbox</Badge>
      </header>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
        <Card title="Tickets" subtitle={tickets ? `${tickets.length} matching` : '—'}
              action={
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">All statuses</option>
                  <option value="open">Open</option>
                  <option value="pending">Pending reply</option>
                  <option value="closed">Closed</option>
                </select>
              }>
          {!tickets && <Spinner />}
          {tickets && tickets.length === 0 && <Empty title="No tickets" subtitle="When players send messages from /help they appear here." />}
          {tickets && tickets.length > 0 && (
            <div className="adm-table-scroll" style={{ maxHeight: 500 }}>
              <table className="adm-table">
                <thead><tr><th>When</th><th>From</th><th>Topic</th><th>Status</th></tr></thead>
                <tbody>
                  {tickets.map((t) => (
                    <tr key={t.id} onClick={() => { setActive(t); setReply(''); }} style={{ cursor: 'pointer', background: active?.id === t.id ? 'var(--surface-soft, rgba(255,255,255,.04))' : '' }}>
                      <td>{ago(t.updatedAt)}</td>
                      <td>{t.name}{t.email ? <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{t.email}</div> : null}</td>
                      <td>{t.topic}</td>
                      <td><Badge tone={t.status === 'open' ? 'warn' : t.status === 'pending' ? 'info' : 'default'} dot>{t.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title={active ? `${active.topic} — ${active.name}` : 'Select a ticket'}
              subtitle={active ? `Status: ${active.status}` : 'Pick one on the left'}>
          {!active && <Empty title="No ticket selected" />}
          {active && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: 'var(--surface-soft, rgba(255,255,255,.04))', borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{dateShort(active.createdAt)}</div>
                <p style={{ marginTop: 8, whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6 }}>{active.body}</p>
              </div>
              {(active.replies || []).map((r, i) => (
                <div key={i} style={{ background: 'var(--grad-brand, linear-gradient(135deg, rgba(124,92,255,.08), rgba(24,240,161,.08)))', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)' }}><strong>{r.by}</strong> · {dateShort(r.at)}</div>
                  <p style={{ marginTop: 8, whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6 }}>{r.body}</p>
                </div>
              ))}
              {active.status !== 'closed' && (
                <div style={{ display: 'grid', gap: 8 }}>
                  <textarea className="adm-input" rows={3} value={reply} onChange={(e) => setReply(e.target.value)}
                            placeholder="Type your reply…" />
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="adm-btn ghost" onClick={close}>Close ticket</button>
                    <button className="adm-btn primary" onClick={send} disabled={!reply.trim()}>Send reply</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

/* ---------- Fraud signals (real heuristics) ---------- */
export function FraudPage() {
  const [data, setData] = useState(null);
  const [minScore, setMinScore] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => adminFraud().then((r) => { if (alive) setData(r); }).catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const signals = useMemo(() => (data?.signals || []).filter((s) => s.score >= minScore), [data, minScore]);

  return (
    <>
      <header className="adm-page-head">
        <div>
          <h1>Fraud &amp; Risk signals</h1>
          <p>Heuristic risk indicators computed live from user activity, deposits, and bet history.</p>
        </div>
        <Badge tone="warn"><IconBot size={12} /> Auto-refresh 30s</Badge>
      </header>

      <div className="adm-grid c4" style={{ marginBottom: 18 }}>
        <Card title="Flagged players"><div style={{ fontSize: 28, fontWeight: 800 }}>{data ? numFmt(data.counts.total) : '—'}</div></Card>
        <Card title="High risk (≥60)"><div style={{ fontSize: 28, fontWeight: 800, color: 'var(--danger, #d63a2c)' }}>{data ? numFmt(data.counts.high) : '—'}</div></Card>
        <Card title="Medium (30–59)"><div style={{ fontSize: 28, fontWeight: 800, color: 'var(--warn, #c87f00)' }}>{data ? numFmt(data.counts.medium) : '—'}</div></Card>
        <Card title="Low (<30)"><div style={{ fontSize: 28, fontWeight: 800 }}>{data ? numFmt(data.counts.low) : '—'}</div></Card>
      </div>

      <Card title="Signal list"
            subtitle={data ? `Generated ${ago(data.generatedAt)}` : '—'}
            action={
              <select value={minScore} onChange={(e) => setMinScore(Number(e.target.value))}>
                <option value={0}>All signals</option>
                <option value={30}>Medium and up</option>
                <option value={60}>High only</option>
              </select>
            }>
        {!data && <Spinner />}
        {data && signals.length === 0 && <Empty title="No risk signals" subtitle="Everyone is behaving — for now." />}
        {data && signals.length > 0 && (
          <div className="adm-table-scroll" style={{ maxHeight: 520 }}>
            <table className="adm-table">
              <thead><tr><th className="num">Score</th><th>User</th><th>Country</th><th className="num">Balance</th><th className="num">Deposited</th><th className="num">Withdrawn</th><th>Reasons</th><th>Last seen</th></tr></thead>
              <tbody>
                {signals.map((s) => (
                  <tr key={s.userId}>
                    <td className="num">
                      <Badge tone={s.score >= 60 ? 'danger' : s.score >= 30 ? 'warn' : 'info'} dot>{s.score}</Badge>
                    </td>
                    <td>{s.email}</td>
                    <td>{s.country || '—'}</td>
                    <td className="num">{moneyFmt(s.balance)}</td>
                    <td className="num">{moneyFmt(s.totalDeposited)}</td>
                    <td className="num">{moneyFmt(s.totalWithdrawn)}</td>
                    <td><div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {s.reasons.map((r) => <Badge key={r} tone="warn">{r}</Badge>)}
                    </div></td>
                    <td>{ago(s.lastActivity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

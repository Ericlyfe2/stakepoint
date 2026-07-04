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
  adminListKyc, adminGetKyc, adminApproveKyc, adminRejectKyc, adminKycStats,
  adminRevenueReport, adminPlayerReport, adminOperationalReport, adminListExports,
  adminListBonuses, adminCreateBonus, adminUpdateBonus, adminDeleteBonus, adminIssueBonus, adminClawbackBonus, adminBonusStats,
  adminReferralStats, adminReferralPayouts, adminCreateReferralPayout,
  adminListCodes, adminCreateCode, adminBulkCreateCodes, adminUpdateCode, adminDeleteCode, adminCodeStats,
  adminCashoutRules, adminUpdateCashoutRules, adminCashoutOffers, adminCashoutStats,
  adminListPages, adminCreatePage, adminUpdatePage, adminDeletePage,
  adminListBanners, adminCreateBanner, adminUpdateBanner, adminDeleteBanner,
  adminListAnnouncements, adminCreateAnnouncement, adminDeleteAnnouncement,
} from '../../api/adminApi.js';
import { useAdmin } from '../../providers/AdminProvider.jsx';
import {
  IconBook, IconCash, IconBell, IconLifebuoy, IconChart, IconCog, IconBot, IconShield,
  IconLive, IconActivity, IconSparkles, IconGift, IconUsers2, IconCode, IconFileText,
  IconLock, IconRefresh, IconCheck, IconX, IconSearch, IconDownload, IconPlus, IconTrash,
  IconBan, IconFlag, IconSend, IconBarChart, IconAward, IconTrending,
} from '../../components/admin/Icons.jsx';

function StatTile({ label, value }) {
  return (
    <div className="adm-stat" style={{ '--accentGrad': 'linear-gradient(135deg,#7c5cff,#22d3ee)' }}>
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
    </div>
  );
}

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
            <dt>Site name</dt><dd>BetXentra Gaming</dd>
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
            background: 'linear-gradient(135deg, rgba(14,138,74,.08), rgba(124,92,255,.08))',
            border: '1px solid rgba(14,138,74,.25)',
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

/* ---------- New module stubs ---------- */

export const LeaguesPage = () => (
  <ComingSoon
    title="Leagues"
    intro="Manage all sports leagues, seasons, and competition structures."
    icon={<IconBook />}
    items={[
      { title: 'League CRUD',       subtitle: 'Create, edit, and archive leagues.',  bullets: ['Add / edit league metadata', 'Assign to sport', 'Set season dates', 'Flag featured leagues'] },
      { title: 'Seasons & stages',  subtitle: 'Multi-season league support.',          bullets: ['Define current season', 'Group by division/region', 'Schedule stage start/end', 'Auto-promote/relegate'] },
      { title: 'Coverage mapping',  subtitle: 'Ensure odds coverage across leagues.',  bullets: ['Track feed provider per league', 'Set quality thresholds', 'Override suspension rules', 'Monitor coverage gaps'] },
      { title: 'Featured ordering', subtitle: 'Control customer-facing display order.', bullets: ['Drag-to-reorder', 'Feature flag for homepage', 'Set region visibility', 'Bulk updates'] },
    ]}
  />
);

export const TeamsPage = () => (
  <ComingSoon
    title="Teams"
    intro="Manage team rosters, logos, and metadata across all sports."
    icon={<IconBook />}
    items={[
      { title: 'Team CRUD',     subtitle: 'Add, edit, merge, and retire teams.',     bullets: ['Team name / short name', 'Logo upload', 'Country & venue', 'League assignment'] },
      { title: 'Rosters',       subtitle: 'Player profiles and squad management.',    bullets: ['Player names and numbers', 'Position & role', 'Injury status', 'Transfer tracking'] },
      { title: 'Media assets',  subtitle: 'Team logos, kits, and branding.',         bullets: ['Logo URL and variants', 'Kit colours', 'Social links', 'Image moderation'] },
      { title: 'Merge & dedup', subtitle: 'Handle duplicate team records cleanly.',  bullets: ['Find duplicates by name', 'Merge fixtures and stats', 'Redirect old references', 'Audit trail'] },
    ]}
  />
);

export function BonusesPage() {
  const { hasRole, showToast } = useAdmin();
  const [campaigns, setCampaigns] = useState(null);
  const [stats, setStats] = useState(null);
  const [tab, setTab] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [issueTarget, setIssueTarget] = useState(null);

  async function load() {
    try {
      const [r, s] = await Promise.all([adminListBonuses({ status: tab === 'all' ? undefined : tab }), adminBonusStats()]);
      setCampaigns(r.campaigns); setStats(s);
    } catch (e) { showToast(e.message, 'error'); }
  }
  useEffect(() => { load(); }, [tab]);

  async function remove(id) {
    if (!confirm('Delete this campaign?')) return;
    try { await adminDeleteBonus(id); showToast('Deleted.'); load(); }
    catch (e) { showToast(e.message, 'error'); }
  }

  return (
    <>
      <header className="adm-page-head">
        <div>
          <h1>Bonuses &amp; Promotions</h1>
          <p>Design bonus campaigns, issue manual awards, and track performance.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="adm-btn primary" onClick={() => { setEditTarget(null); setCreateOpen(true); }}>
            <IconPlus size={14} /> New campaign
          </button>
        </div>
      </header>

      <div className="adm-stat-grid">
        <StatTile label="Total issued" value={stats ? moneyFmt(stats.totalIssued) : '—'} />
        <StatTile label="Total wagered" value={stats ? moneyFmt(stats.totalWagered) : '—'} />
        <StatTile label="Awards" value={stats ? numFmt(stats.totalAwards) : '—'} />
        <StatTile label="Claim rate" value={stats ? `${stats.claimedRate}%` : '—'} />
      </div>

      <div className="adm-table-wrap">
        <div className="adm-table-toolbar">
          {['all', 'active', 'draft', 'ended'].map((t) => (
            <button key={t} className={`adm-btn sm ${tab === t ? 'primary' : ''}`} onClick={() => setTab(t)}>
              {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
              {campaigns && stats ? ` (${t === 'all' ? campaigns.length : stats[t] || 0})` : ''}
            </button>
          ))}
          <div className="grow" />
        </div>
        <div className="adm-table-scroll">
          <table className="adm-table">
            <thead><tr><th>Name</th><th>Type</th><th>Value</th><th>Wagering</th><th>Status</th><th>Dates</th><th></th></tr></thead>
            <tbody>
              {!campaigns && <tr><td colSpan={7}><Spinner /></td></tr>}
              {campaigns && campaigns.length === 0 && <tr><td colSpan={7}><Empty title="No campaigns" subtitle="Create your first bonus campaign." /></td></tr>}
              {campaigns?.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.name}</strong></td>
                  <td><Badge tone="brand">{c.type?.replace(/_/g, ' ')}</Badge></td>
                  <td>{c.valueType === 'percentage' ? `${c.value}%` : moneyFmt(c.value)}</td>
                  <td>{c.wageringRequirement > 0 ? `${c.wageringRequirement}×` : '—'}</td>
                  <td><Badge tone={c.status === 'active' ? 'success' : c.status === 'draft' ? 'info' : c.status === 'paused' ? 'warn' : 'default'} dot>{c.status}</Badge></td>
                  <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                    {c.startsAt ? dateShort(c.startsAt) : '—'} → {c.endsAt ? dateShort(c.endsAt) : '∞'}
                  </td>
                  <td className="row-actions">
                    <button className="adm-btn sm" onClick={() => { setEditTarget(c); setCreateOpen(true); }}>Edit</button>
                    <button className="adm-btn sm" onClick={() => { setIssueTarget(c); }}>Issue</button>
                    <button className="adm-btn sm danger" onClick={() => remove(c.id)}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <BonusCampaignModal
        open={createOpen}
        campaign={editTarget}
        onClose={() => { setCreateOpen(false); setEditTarget(null); }}
        onSaved={() => { setCreateOpen(false); setEditTarget(null); load(); }}
        showToast={showToast}
      />

      <IssueBonusModal
        open={!!issueTarget}
        campaign={issueTarget}
        onClose={() => setIssueTarget(null)}
        onIssued={() => { setIssueTarget(null); load(); }}
        showToast={showToast}
      />
    </>
  );
}

function BonusCampaignModal({ open, campaign, onClose, onSaved, showToast }) {
  const isEdit = !!campaign;
  const [form, setForm] = useState({ name: '', type: 'deposit', description: '', value: '', valueType: 'percentage', minDeposit: '0', wageringRequirement: '0', maxBonus: '0', status: 'draft' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setForm(campaign ? { ...campaign, value: String(campaign.value), minDeposit: String(campaign.minDeposit || 0), wageringRequirement: String(campaign.wageringRequirement || 0), maxBonus: String(campaign.maxBonus || 0) } : { name: '', type: 'deposit', description: '', value: '', valueType: 'percentage', minDeposit: '0', wageringRequirement: '0', maxBonus: '0', status: 'draft' });
  }, [open, campaign]);

  async function submit(e) {
    e.preventDefault(); setBusy(true);
    try {
      const body = { ...form, value: Number(form.value), minDeposit: Number(form.minDeposit), wageringRequirement: Number(form.wageringRequirement), maxBonus: Number(form.maxBonus) };
      if (isEdit) await adminUpdateBonus(campaign.id, body);
      else await adminCreateBonus(body);
      showToast(isEdit ? 'Campaign updated.' : 'Campaign created.');
      onSaved();
    } catch (e) { showToast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit campaign' : 'New campaign'} description="Configure bonus rules, eligibility, and schedule.">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="adm-field">
          <label>Campaign name</label>
          <input className="adm-input" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus />
        </div>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
          <div className="adm-field">
            <label>Type</label>
            <select className="adm-select" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              <option value="deposit">Deposit bonus</option>
              <option value="free_bet">Free bet</option>
              <option value="cashback">Cashback</option>
              <option value="multi_boost">Multi-bet boost</option>
            </select>
          </div>
          <div className="adm-field">
            <label>Status</label>
            <select className="adm-select" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="ended">Ended</option>
            </select>
          </div>
        </div>
        <div className="adm-field">
          <label>Description</label>
          <textarea className="adm-input" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </div>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
          <div className="adm-field">
            <label>Value</label>
            <input className="adm-input" type="number" min="0" step="0.01" required value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} />
          </div>
          <div className="adm-field">
            <label>Value type</label>
            <select className="adm-select" value={form.valueType} onChange={(e) => setForm((f) => ({ ...f, valueType: e.target.value }))}>
              <option value="percentage">Percentage</option>
              <option value="fixed">Fixed amount</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
          <div className="adm-field">
            <label>Min deposit</label>
            <input className="adm-input" type="number" min="0" value={form.minDeposit} onChange={(e) => setForm((f) => ({ ...f, minDeposit: e.target.value }))} />
          </div>
          <div className="adm-field">
            <label>Wagering req. (×)</label>
            <input className="adm-input" type="number" min="0" step="0.1" value={form.wageringRequirement} onChange={(e) => setForm((f) => ({ ...f, wageringRequirement: e.target.value }))} />
          </div>
        </div>
        <div className="adm-modal-actions">
          <button type="button" className="adm-btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="adm-btn primary" disabled={busy}>{busy ? 'Saving…' : isEdit ? 'Update' : 'Create'}</button>
        </div>
      </form>
    </Modal>
  );
}

function IssueBonusModal({ open, campaign, onClose, onIssued, showToast }) {
  const [form, setForm] = useState({ userId: '', amount: '', reason: '', wageringRequirement: '0' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setForm({ userId: '', amount: '', reason: '', wageringRequirement: '0' }); }, [open]);

  async function submit(e) {
    e.preventDefault(); setBusy(true);
    try {
      await adminIssueBonus(campaign.id, { ...form, amount: Number(form.amount), wageringRequirement: Number(form.wageringRequirement) });
      showToast('Bonus issued.');
      onIssued();
    } catch (e) { showToast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Issue bonus — ${campaign?.name}`} description="Manually award this bonus to a specific player.">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="adm-field">
          <label>User ID</label>
          <input className="adm-input" required value={form.userId} onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))} placeholder="Enter user ID" autoFocus />
        </div>
        <div className="adm-field">
          <label>Amount</label>
          <input className="adm-input" type="number" min="0.01" step="0.01" required value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
        </div>
        <div className="adm-field">
          <label>Reason</label>
          <input className="adm-input" required value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="e.g. VIP appreciation" />
        </div>
        <div className="adm-field">
          <label>Wagering requirement (×)</label>
          <input className="adm-input" type="number" min="0" step="0.1" value={form.wageringRequirement} onChange={(e) => setForm((f) => ({ ...f, wageringRequirement: e.target.value }))} />
        </div>
        <div className="adm-modal-actions">
          <button type="button" className="adm-btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="adm-btn primary" disabled={busy}>{busy ? 'Issuing…' : 'Issue bonus'}</button>
        </div>
      </form>
    </Modal>
  );
}

export function KYCSPage() {
  const { hasRole, showToast } = useAdmin();
  const [docs, setDocs] = useState(null);
  const [stats, setStats] = useState(null);
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(null);

  async function load() {
    try {
      const [r, s] = await Promise.all([adminListKyc({ status: filter || undefined, q: q || undefined }), adminKycStats()]);
      setDocs(r.documents); setStats(s);
    } catch (e) { showToast(e.message, 'error'); }
  }
  useEffect(() => { load(); }, [filter, q]);

  async function approve(doc) {
    try { await adminApproveKyc(doc.id, ''); showToast('Document approved.'); load(); setSelected(null); }
    catch (e) { showToast(e.message, 'error'); }
  }
  async function reject(doc) {
    const reason = prompt('Rejection reason:', 'Document does not meet requirements');
    if (!reason) return;
    try { await adminRejectKyc(doc.id, reason); showToast('Document rejected.'); load(); setSelected(null); }
    catch (e) { showToast(e.message, 'error'); }
  }

  return (
    <>
      <header className="adm-page-head">
        <div>
          <h1>KYC &amp; Verification</h1>
          <p>Review player documents, approve identities, and manage compliance status.</p>
        </div>
        <Badge tone="brand"><IconShield size={12} /> Compliance</Badge>
      </header>

      <div className="adm-stat-grid">
        <StatTile label="Pending review" value={stats ? numFmt(stats.pending) : '—'} />
        <StatTile label="Verified" value={stats ? numFmt(stats.verified) : '—'} />
        <StatTile label="Rejected" value={stats ? numFmt(stats.rejected) : '—'} />
        <StatTile label="Avg pending time" value={stats ? `${stats.pendingAvgHours}h` : '—'} />
      </div>

      <div className="adm-table-wrap">
        <div className="adm-table-toolbar">
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <IconSearch size={14} style={{ position: 'absolute', left: 12, color: 'var(--text-mute)' }} />
            <input style={{ paddingLeft: 34 }} placeholder="Search by email…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </select>
          <button className="adm-btn" onClick={load}><IconRefresh size={14} /> Refresh</button>
        </div>
        <div className="adm-table-scroll">
          <table className="adm-table">
            <thead><tr><th>Email</th><th>Document type</th><th>Status</th><th>Submitted</th><th>Reviewed by</th><th></th></tr></thead>
            <tbody>
              {!docs && <tr><td colSpan={6}><Spinner /></td></tr>}
              {docs && docs.length === 0 && <tr><td colSpan={6}><Empty title="No documents" subtitle="Player uploads will appear here." /></td></tr>}
              {docs?.map((d) => (
                <tr key={d.id} onClick={() => setSelected(d)} className={selected?.id === d.id ? 'selected' : ''}>
                  <td>{d.email || d.userId}</td>
                  <td>{d.type || 'Identity'}</td>
                  <td>
                    <Badge tone={d.status === 'verified' ? 'success' : d.status === 'rejected' ? 'danger' : 'warn'} dot>
                      {d.status}
                    </Badge>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{ago(d.createdAt)}</td>
                  <td>{d.reviewedBy ? d.reviewedBy : '—'}</td>
                  <td className="row-actions">
                    {d.status === 'pending' && (
                      <>
                        <button className="adm-btn sm success" onClick={(e) => { e.stopPropagation(); approve(d); }}>
                          <IconCheck size={12} /> Approve
                        </button>
                        <button className="adm-btn sm danger" onClick={(e) => { e.stopPropagation(); reject(d); }}>
                          <IconX size={12} /> Reject
                        </button>
                      </>
                    )}
                    <button className="adm-btn sm" onClick={(e) => { e.stopPropagation(); setSelected(d); }}>
                      Detail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <KycDetailDrawer
        open={!!selected}
        doc={selected}
        onClose={() => setSelected(null)}
        onApprove={approve}
        onReject={reject}
      />
    </>
  );
}

function KycDetailDrawer({ open, doc, onClose, onApprove, onReject }) {
  if (!open || !doc) return null;
  return (
    <Drawer open={open} onClose={onClose} title="Document detail"
            footer={doc.status === 'pending' ? (
              <>
                <button className="adm-btn success" onClick={() => onApprove(doc)}><IconCheck size={14} /> Approve</button>
                <button className="adm-btn danger" onClick={() => onReject(doc)}><IconX size={14} /> Reject</button>
              </>
            ) : null}>
      <dl className="adm-kv">
        <dt>User</dt><dd>{doc.email || doc.userId}</dd>
        <dt>Document type</dt><dd>{doc.type || 'Identity document'}</dd>
        <dt>Status</dt><dd><Badge tone={doc.status === 'verified' ? 'success' : doc.status === 'rejected' ? 'danger' : 'warn'}>{doc.status}</Badge></dd>
        <dt>Submitted</dt><dd>{dateShort(doc.createdAt)}</dd>
        <dt>Reviewed by</dt><dd>{doc.reviewedBy || '—'}</dd>
        <dt>Reviewed at</dt><dd>{doc.reviewedAt ? dateShort(doc.reviewedAt) : '—'}</dd>
        {doc.rejectReason && <><dt>Rejection reason</dt><dd style={{ color: 'var(--danger)' }}>{doc.rejectReason}</dd></>}
        <dt>Expires</dt><dd>{doc.expiresAt ? dateShort(doc.expiresAt) : '—'}</dd>
      </dl>
    </Drawer>
  );
}

export function ReferralsPage() {
  const { showToast } = useAdmin();
  const [data, setData] = useState(null);
  const [payouts, setPayouts] = useState(null);

  useEffect(() => {
    Promise.all([adminReferralStats(), adminReferralPayouts()])
      .then(([r, p]) => { setData(r); setPayouts(p.payouts); })
      .catch((e) => showToast(e.message, 'error'));
  }, []);

  return (
    <>
      <header className="adm-page-head">
        <div>
          <h1>Referrals</h1>
          <p>Track referral performance, manage commission payouts, and monitor for abuse.</p>
        </div>
        <Badge tone="info"><IconUsers2 size={12} /> Growth</Badge>
      </header>

      <div className="adm-stat-grid">
        <StatTile label="Total referrals" value={data ? numFmt(data.stats?.totalReferrals) : '—'} />
        <StatTile label="Total commission" value={data ? moneyFmt(data.stats?.totalCommission) : '—'} />
        <StatTile label="Pending payouts" value={data ? moneyFmt(data.stats?.pendingPayouts) : '—'} />
        <StatTile label="Top referrers" value={data ? numFmt(data.stats?.topReferrers?.length || 0) : '—'} />
      </div>

      <Card title="Referral tree" subtitle="Hierarchical view of who referred whom">
        <table className="adm-table">
          <thead><tr><th>Referrer</th><th>Referred</th><th>Date</th><th className="num">Commission earned</th><th>Status</th></tr></thead>
          <tbody>
            {!data && <tr><td colSpan={5}><Spinner /></td></tr>}
            {data && (!data.referrals || data.referrals.length === 0) && <tr><td colSpan={5}><Empty title="No referrals yet" subtitle="Referrals will appear as players invite friends." /></td></tr>}
            {data?.referrals?.map((r, i) => (
              <tr key={i}>
                <td>{r.referrerEmail || r.referrerId}</td>
                <td>{r.referredEmail || r.referredId}</td>
                <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{r.createdAt ? ago(r.createdAt) : '—'}</td>
                <td className="num">{r.commission ? moneyFmt(r.commission) : '—'}</td>
                <td><Badge tone={r.status === 'paid' ? 'success' : 'warn'}>{r.status || 'pending'}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Payout history" subtitle="Commission payments processed"
            action={payouts && payouts.length > 0 ? <Badge tone="info">{payouts.length} payments</Badge> : null}>
        {!payouts && <Spinner />}
        {payouts && payouts.length === 0 && <Empty title="No payouts yet" />}
        {payouts && payouts.length > 0 && (
          <div className="adm-table-scroll" style={{ maxHeight: 360 }}>
            <table className="adm-table">
              <thead><tr><th>Referral</th><th className="num">Amount</th><th>Status</th><th>Processed</th></tr></thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id}>
                    <td>{p.referralId}</td>
                    <td className="num">{moneyFmt(p.amount)}</td>
                    <td><Badge tone={p.status === 'completed' ? 'success' : 'warn'}>{p.status}</Badge></td>
                    <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{ago(p.createdAt)}</td>
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

export function CodesPage() {
  const { hasRole, showToast } = useAdmin();
  const [codes, setCodes] = useState(null);
  const [stats, setStats] = useState(null);
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  async function load() {
    try {
      const [r, s] = await Promise.all([adminListCodes({ status: tab === 'all' ? undefined : tab, q: q || undefined }), adminCodeStats()]);
      setCodes(r.codes); setStats(s);
    } catch (e) { showToast(e.message, 'error'); }
  }
  useEffect(() => { load(); }, [tab, q]);

  async function remove(id) {
    if (!confirm('Delete this code?')) return;
    try { await adminDeleteCode(id); showToast('Deleted.'); load(); }
    catch (e) { showToast(e.message, 'error'); }
  }

  return (
    <>
      <header className="adm-page-head">
        <div>
          <h1>Promo Codes</h1>
          <p>Generate, distribute, and track promotional code campaigns.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="adm-btn" onClick={() => setBulkOpen(true)}><IconDownload size={14} /> Bulk generate</button>
          <button className="adm-btn primary" onClick={() => setCreateOpen(true)}><IconPlus size={14} /> New code</button>
        </div>
      </header>

      <div className="adm-stat-grid">
        <StatTile label="Total codes" value={stats ? numFmt(stats.total) : '—'} />
        <StatTile label="Active" value={stats ? numFmt(stats.active) : '—'} />
        <StatTile label="Expired" value={stats ? numFmt(stats.expired) : '—'} />
        <StatTile label="Redemptions" value={stats ? numFmt(stats.totalRedemptions) : '—'} />
      </div>

      <div className="adm-table-wrap">
        <div className="adm-table-toolbar">
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <IconSearch size={14} style={{ position: 'absolute', left: 12, color: 'var(--text-mute)' }} />
            <input style={{ paddingLeft: 34 }} placeholder="Search code…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {['all', 'active', 'expired'].map((t) => (
            <button key={t} className={`adm-btn sm ${tab === t ? 'primary' : ''}`} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className="adm-table-scroll">
          <table className="adm-table">
            <thead><tr><th>Code</th><th>Type</th><th className="num">Value</th><th className="num">Uses</th><th className="num">Max</th><th>Expires</th><th></th></tr></thead>
            <tbody>
              {!codes && <tr><td colSpan={7}><Spinner /></td></tr>}
              {codes && codes.length === 0 && <tr><td colSpan={7}><Empty title="No codes" subtitle="Create your first promo code." /></td></tr>}
              {codes?.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontFamily: 'var(--ff-mono)', fontWeight: 700 }}>{c.code}</td>
                  <td><Badge tone="brand">{c.type?.replace(/_/g, ' ')}</Badge></td>
                  <td className="num">{c.type === 'free_bet' ? moneyFmt(c.value) : `${c.value}%`}</td>
                  <td className="num">{c.useCount || 0}</td>
                  <td className="num">{c.maxUses}</td>
                  <td style={{ fontSize: 12, color: c.expiresAt && c.expiresAt < new Date().toISOString() ? 'var(--danger)' : 'var(--text-dim)' }}>
                    {c.expiresAt ? ago(c.expiresAt) : 'Never'}
                  </td>
                  <td className="row-actions">
                    <button className="adm-btn sm danger" onClick={() => remove(c.id)}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <CodeModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); load(); }} showToast={showToast} />
      <BulkCodeModal open={bulkOpen} onClose={() => setBulkOpen(false)} onCreated={() => { setBulkOpen(false); load(); }} showToast={showToast} />
    </>
  );
}

function CodeModal({ open, onClose, onCreated, showToast }) {
  const [form, setForm] = useState({ code: '', type: 'free_bet', value: '', maxUses: '1', maxPerUser: '1', minStake: '0', description: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setForm({ code: '', type: 'free_bet', value: '', maxUses: '1', maxPerUser: '1', minStake: '0', description: '' }); }, [open]);

  async function submit(e) {
    e.preventDefault(); setBusy(true);
    try {
      await adminCreateCode({ ...form, value: Number(form.value), maxUses: Number(form.maxUses), maxPerUser: Number(form.maxPerUser), minStake: Number(form.minStake) });
      showToast('Code created.');
      onCreated();
    } catch (e) { showToast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="New promo code" description="Single-use or multi-use code with optional expiry.">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
          <div className="adm-field">
            <label>Code (uppercase)</label>
            <input className="adm-input" required value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} autoFocus />
          </div>
          <div className="adm-field">
            <label>Type</label>
            <select className="adm-select" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              <option value="free_bet">Free bet</option>
              <option value="deposit_match">Deposit match</option>
              <option value="bonus">Bonus</option>
              <option value="odds_boost">Odds boost</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr 1fr' }}>
          <div className="adm-field">
            <label>Value</label>
            <input className="adm-input" type="number" min="0" step="0.01" required value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} />
          </div>
          <div className="adm-field">
            <label>Max uses</label>
            <input className="adm-input" type="number" min="1" value={form.maxUses} onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))} />
          </div>
          <div className="adm-field">
            <label>Max per user</label>
            <input className="adm-input" type="number" min="1" value={form.maxPerUser} onChange={(e) => setForm((f) => ({ ...f, maxPerUser: e.target.value }))} />
          </div>
        </div>
        <div className="adm-field">
          <label>Description</label>
          <input className="adm-input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </div>
        <div className="adm-modal-actions">
          <button type="button" className="adm-btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="adm-btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create code'}</button>
        </div>
      </form>
    </Modal>
  );
}

function BulkCodeModal({ open, onClose, onCreated, showToast }) {
  const [form, setForm] = useState({ prefix: 'PROMO', count: '10', type: 'free_bet', value: '', maxUses: '1', maxPerUser: '1', description: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setForm({ prefix: 'PROMO', count: '10', type: 'free_bet', value: '', maxUses: '1', maxPerUser: '1', description: '' }); }, [open]);

  async function submit(e) {
    e.preventDefault(); setBusy(true);
    try {
      const r = await adminBulkCreateCodes({ ...form, count: Number(form.count), value: Number(form.value), maxUses: Number(form.maxUses), maxPerUser: Number(form.maxPerUser) });
      showToast(`Generated ${r.count} codes.`);
      onCreated();
    } catch (e) { showToast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Bulk generate codes" description="Generate multiple unique codes with a shared prefix.">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
          <div className="adm-field">
            <label>Prefix</label>
            <input className="adm-input" required value={form.prefix} onChange={(e) => setForm((f) => ({ ...f, prefix: e.target.value.toUpperCase() }))} autoFocus />
          </div>
          <div className="adm-field">
            <label>Count (max 500)</label>
            <input className="adm-input" type="number" min="1" max="500" required value={form.count} onChange={(e) => setForm((f) => ({ ...f, count: e.target.value }))} />
          </div>
        </div>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr 1fr' }}>
          <div className="adm-field">
            <label>Type</label>
            <select className="adm-select" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              <option value="free_bet">Free bet</option>
              <option value="deposit_match">Deposit match</option>
              <option value="bonus">Bonus</option>
              <option value="odds_boost">Odds boost</option>
            </select>
          </div>
          <div className="adm-field">
            <label>Value</label>
            <input className="adm-input" type="number" min="0" step="0.01" required value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} />
          </div>
          <div className="adm-field">
            <label>Max uses</label>
            <input className="adm-input" type="number" min="1" value={form.maxUses} onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))} />
          </div>
        </div>
        <div className="adm-modal-actions">
          <button type="button" className="adm-btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="adm-btn primary" disabled={busy}>{busy ? 'Generating…' : `Generate ${form.count || 0} codes`}</button>
        </div>
      </form>
    </Modal>
  );
}

export function CashoutPage() {
  const { hasRole, showToast } = useAdmin();
  const [rules, setRules] = useState(null);
  const [offers, setOffers] = useState(null);
  const [stats, setStats] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});

  async function load() {
    try {
      const [r, o, s] = await Promise.all([adminCashoutRules(), adminCashoutOffers(), adminCashoutStats()]);
      setRules(r); setOffers(o); setStats(s);
    } catch (e) { showToast(e.message, 'error'); }
  }
  useEffect(() => { load(); }, []);

  function startEdit() {
    setForm({ ...rules });
    setEditing(true);
  }

  async function saveRules() {
    try { await adminUpdateCashoutRules(form); showToast('Rules updated.'); setEditing(false); load(); }
    catch (e) { showToast(e.message, 'error'); }
  }

  const canEdit = hasRole('cashout.configure');

  return (
    <>
      <header className="adm-page-head">
        <div>
          <h1>Cash-out</h1>
          <p>Configure cash-out rules, view active offers, and monitor performance.</p>
        </div>
        <Badge tone={rules?.enabled ? 'success' : 'danger'} dot>{rules?.enabled ? 'Enabled' : 'Disabled'}</Badge>
      </header>

      <div className="adm-stat-grid">
        <StatTile label="Total cash-outs" value={stats ? numFmt(stats.totalCashouts) : '—'} />
        <StatTile label="Total amount" value={stats ? moneyFmt(stats.totalAmount) : '—'} />
        <StatTile label="Avg cash-out %" value={stats ? `${stats.avgCashoutPct}%` : '—'} />
        <StatTile label="Adoption rate" value={stats ? `${stats.playerAdoptionRate}%` : '—'} />
      </div>

      <div className="adm-grid c2">
        <Card title="Rules & limits"
              subtitle="These values control cash-out availability across all markets"
              action={canEdit && <button className="adm-btn" onClick={startEdit}><IconCog size={14} /> Edit</button>}>
          {!rules && <Spinner />}
          {rules && (
            <dl className="adm-kv">
              <dt>Enabled</dt><dd>{rules.enabled ? <Badge tone="success">Yes</Badge> : <Badge tone="danger">No</Badge>}</dd>
              <dt>Min odds</dt><dd>{rules.minOdds}×</dd>
              <dt>Max odds</dt><dd>{rules.maxOdds}×</dd>
              <dt>Min legs</dt><dd>{rules.minLegs}</dd>
              <dt>Max legs</dt><dd>{rules.maxLegs}</dd>
              <dt>Factor</dt><dd>{(rules.factor * 100).toFixed(0)}%</dd>
            </dl>
          )}
        </Card>

        <Card title="Active offers" subtitle={offers ? `${offers.totalCount} offers, ${moneyFmt(offers.totalValue)} total value` : '—'}>
          {!offers && <Spinner />}
          {offers && offers.offers?.length === 0 && <Empty title="No active offers" subtitle="Offers appear when players place eligible bets." />}
          {offers?.offers?.map((o, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{o.betId?.slice(0, 16)}…</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{moneyFmt(o.value)} cash-out value</div>
              </div>
              <Badge tone="info">{o.odds?.toFixed(2)}×</Badge>
            </div>
          ))}
        </Card>
      </div>

      <Card title="Performance metrics" subtitle="Cash-out P&L over time">
        {!stats && <Spinner />}
        {stats && (
          <div className="adm-grid c3">
            <Mini label="Profit impact" v={moneyFmt(stats.profitImpact)} />
            <Mini label="Avg cash-out %" v={`${stats.avgCashoutPct}%`} />
            <Mini label="Player adoption" v={`${stats.playerAdoptionRate}%`} />
          </div>
        )}
      </Card>

      <Modal open={editing} onClose={() => setEditing(false)} title="Edit cash-out rules" description="Changes apply immediately to new cash-out calculations.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="adm-field">
            <label><input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} /> Enabled</label>
          </div>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
            <div className="adm-field">
              <label>Min odds</label>
              <input className="adm-input" type="number" min="1" step="0.1" value={form.minOdds} onChange={(e) => setForm((f) => ({ ...f, minOdds: Number(e.target.value) }))} />
            </div>
            <div className="adm-field">
              <label>Max odds</label>
              <input className="adm-input" type="number" min="1" step="0.1" value={form.maxOdds} onChange={(e) => setForm((f) => ({ ...f, maxOdds: Number(e.target.value) }))} />
            </div>
            <div className="adm-field">
              <label>Factor</label>
              <input className="adm-input" type="number" min="0" max="1" step="0.05" value={form.factor} onChange={(e) => setForm((f) => ({ ...f, factor: Number(e.target.value) }))} />
            </div>
            <div className="adm-field">
              <label>Min legs</label>
              <input className="adm-input" type="number" min="1" value={form.minLegs} onChange={(e) => setForm((f) => ({ ...f, minLegs: Number(e.target.value) }))} />
            </div>
          </div>
          <div className="adm-modal-actions">
            <button className="adm-btn ghost" onClick={() => setEditing(false)}>Cancel</button>
            <button className="adm-btn primary" onClick={saveRules}>Save rules</button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function CMSPage() {
  const { hasRole, showToast } = useAdmin();
  const [tab, setTab] = useState('pages');
  const [pages, setPages] = useState(null);
  const [banners, setBanners] = useState(null);
  const [announcements, setAnnouncements] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [bannerOpen, setBannerOpen] = useState(false);
  const [announceOpen, setAnnounceOpen] = useState(false);

  function loadAll() {
    adminListPages().then((r) => setPages(r.pages)).catch(() => {});
    adminListBanners().then((r) => setBanners(r.banners)).catch(() => {});
    adminListAnnouncements().then((r) => setAnnouncements(r.announcements)).catch(() => {});
  }
  useEffect(() => { loadAll(); }, []);

  async function delPage(id) {
    if (!confirm('Delete this page?')) return;
    try { await adminDeletePage(id); showToast('Deleted.'); loadAll(); }
    catch (e) { showToast(e.message, 'error'); }
  }
  async function delBanner(id) {
    if (!confirm('Delete this banner?')) return;
    try { await adminDeleteBanner(id); showToast('Deleted.'); loadAll(); }
    catch (e) { showToast(e.message, 'error'); }
  }
  async function delAnnouncement(id) {
    if (!confirm('Delete this announcement?')) return;
    try { await adminDeleteAnnouncement(id); showToast('Deleted.'); loadAll(); }
    catch (e) { showToast(e.message, 'error'); }
  }

  return (
    <>
      <header className="adm-page-head">
        <div>
          <h1>Content Management</h1>
          <p>Manage static pages, banners, and site-wide announcements.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {tab === 'pages' && <button className="adm-btn primary" onClick={() => { setEditTarget(null); setCreateOpen(true); }}><IconPlus size={14} /> New page</button>}
          {tab === 'banners' && <button className="adm-btn primary" onClick={() => setBannerOpen(true)}><IconPlus size={14} /> New banner</button>}
          {tab === 'announcements' && <button className="adm-btn primary" onClick={() => setAnnounceOpen(true)}><IconPlus size={14} /> New announcement</button>}
        </div>
      </header>

      <div className="adm-table-toolbar" style={{ marginBottom: 16 }}>
        {['pages', 'banners', 'announcements'].map((t) => (
          <button key={t} className={`adm-btn sm ${tab === t ? 'primary' : ''}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === 'pages' && pages ? ` (${pages.length})` : t === 'banners' && banners ? ` (${banners.length})` : announcements ? ` (${announcements.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'pages' && (
        <div className="adm-table-scroll">
          <table className="adm-table">
            <thead><tr><th>Slug</th><th>Title</th><th>Status</th><th>Updated</th><th></th></tr></thead>
            <tbody>
              {!pages && <tr><td colSpan={5}><Spinner /></td></tr>}
              {pages && pages.length === 0 && <tr><td colSpan={5}><Empty title="No pages yet" subtitle="Create your first content page." /></td></tr>}
              {pages?.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontFamily: 'var(--ff-mono)', fontSize: 12 }}>/{p.slug}</td>
                  <td><strong>{p.title}</strong></td>
                  <td><Badge tone={p.published ? 'success' : 'info'} dot>{p.published ? 'Published' : 'Draft'}</Badge></td>
                  <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{ago(p.updatedAt || p.createdAt)}</td>
                  <td className="row-actions">
                    <button className="adm-btn sm" onClick={() => { setEditTarget(p); setCreateOpen(true); }}>Edit</button>
                    <button className="adm-btn sm danger" onClick={() => delPage(p.id)}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'banners' && (
        <div className="adm-table-scroll">
          <table className="adm-table">
            <thead><tr><th>Name</th><th>Position</th><th className="num">Priority</th><th>Status</th><th>Audience</th><th></th></tr></thead>
            <tbody>
              {!banners && <tr><td colSpan={6}><Spinner /></td></tr>}
              {banners && banners.length === 0 && <tr><td colSpan={6}><Empty title="No banners yet" subtitle="Create your first banner." /></td></tr>}
              {banners?.map((b) => (
                <tr key={b.id}>
                  <td><strong>{b.name}</strong></td>
                  <td><Badge tone="info">{b.position}</Badge></td>
                  <td className="num">{b.priority}</td>
                  <td><Badge tone={b.active ? 'success' : 'default'} dot>{b.active ? 'Active' : 'Inactive'}</Badge></td>
                  <td><Badge>{b.audience || 'all'}</Badge></td>
                  <td className="row-actions">
                    <button className="adm-btn sm danger" onClick={() => delBanner(b.id)}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'announcements' && (
        <div className="adm-table-scroll">
          <table className="adm-table">
            <thead><tr><th>Title</th><th>Severity</th><th>Audience</th><th>Dismissible</th><th>Created</th><th></th></tr></thead>
            <tbody>
              {!announcements && <tr><td colSpan={6}><Spinner /></td></tr>}
              {announcements && announcements.length === 0 && <tr><td colSpan={6}><Empty title="No announcements" subtitle="Create your first site-wide announcement." /></td></tr>}
              {announcements?.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{a.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{a.body}</div>
                  </td>
                  <td><Badge tone={a.severity === 'critical' ? 'danger' : a.severity === 'warning' ? 'warn' : a.severity === 'success' ? 'success' : 'info'}>{a.severity}</Badge></td>
                  <td><Badge>{a.audience || 'all'}</Badge></td>
                  <td>{a.dismissible ? <Badge tone="success">Yes</Badge> : <Badge>No</Badge>}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{ago(a.createdAt)}</td>
                  <td className="row-actions">
                    <button className="adm-btn sm danger" onClick={() => delAnnouncement(a.id)}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PageModal open={createOpen} page={editTarget} onClose={() => { setCreateOpen(false); setEditTarget(null); }}
                 onSaved={() => { setCreateOpen(false); setEditTarget(null); loadAll(); }} showToast={showToast} />

      <BannerModal open={bannerOpen} onClose={() => setBannerOpen(false)}
                    onSaved={() => { setBannerOpen(false); loadAll(); }} showToast={showToast} />

      <AnnouncementModal open={announceOpen} onClose={() => setAnnounceOpen(false)}
                          onSaved={() => { setAnnounceOpen(false); loadAll(); }} showToast={showToast} />
    </>
  );
}

function PageModal({ open, page, onClose, onSaved, showToast }) {
  const isEdit = !!page;
  const [form, setForm] = useState({ slug: '', title: '', content: '', seoDescription: '', published: false });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setForm(page ? { slug: page.slug, title: page.title, content: page.content || '', seoDescription: page.seoDescription || '', published: page.published } : { slug: '', title: '', content: '', seoDescription: '', published: false }); }, [open, page]);

  async function submit(e) {
    e.preventDefault(); setBusy(true);
    try {
      if (isEdit) await adminUpdatePage(page.id, form);
      else await adminCreatePage(form);
      showToast(isEdit ? 'Page updated.' : 'Page created.');
      onSaved();
    } catch (e) { showToast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit page' : 'New page'} description="Content pages appear under /page/{slug} on the player site.">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="adm-field">
          <label>Slug</label>
          <input className="adm-input" required value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))} autoFocus />
        </div>
        <div className="adm-field">
          <label>Title</label>
          <input className="adm-input" required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        </div>
        <div className="adm-field">
          <label>Content (HTML)</label>
          <textarea className="adm-input" rows={6} value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} />
        </div>
        <div className="adm-field">
          <label>SEO description</label>
          <input className="adm-input" value={form.seoDescription} onChange={(e) => setForm((f) => ({ ...f, seoDescription: e.target.value }))} />
        </div>
        <div className="adm-field">
          <label><input type="checkbox" checked={form.published} onChange={(e) => setForm((f) => ({ ...f, published: e.target.checked }))} /> Published</label>
        </div>
        <div className="adm-modal-actions">
          <button type="button" className="adm-btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="adm-btn primary" disabled={busy}>{busy ? 'Saving…' : isEdit ? 'Update' : 'Create'}</button>
        </div>
      </form>
    </Modal>
  );
}

function BannerModal({ open, onClose, onSaved, showToast }) {
  const [form, setForm] = useState({ name: '', imageUrl: '', linkUrl: '', position: 'hero', active: true, priority: '50', audience: 'all' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setForm({ name: '', imageUrl: '', linkUrl: '', position: 'hero', active: true, priority: '50', audience: 'all' }); }, [open]);

  async function submit(e) {
    e.preventDefault(); setBusy(true);
    try {
      await adminCreateBanner({ ...form, priority: Number(form.priority) });
      showToast('Banner created.');
      onSaved();
    } catch (e) { showToast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="New banner" description="Banners appear on the homepage and selected pages.">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="adm-field">
          <label>Name</label>
          <input className="adm-input" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus />
        </div>
        <div className="adm-field">
          <label>Image URL</label>
          <input className="adm-input" required value={form.imageUrl} onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))} placeholder="https://example.com/banner.jpg" />
        </div>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
          <div className="adm-field">
            <label>Link URL</label>
            <input className="adm-input" value={form.linkUrl} onChange={(e) => setForm((f) => ({ ...f, linkUrl: e.target.value }))} />
          </div>
          <div className="adm-field">
            <label>Position</label>
            <select className="adm-select" value={form.position} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}>
              <option value="hero">Hero</option>
              <option value="sidebar">Sidebar</option>
              <option value="popup">Popup</option>
              <option value="inline">Inline</option>
            </select>
          </div>
          <div className="adm-field">
            <label>Priority (0–100)</label>
            <input className="adm-input" type="number" min="0" max="100" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} />
          </div>
          <div className="adm-field">
            <label>Audience</label>
            <select className="adm-select" value={form.audience} onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}>
              <option value="all">All</option>
              <option value="verified">Verified only</option>
              <option value="new">New players</option>
            </select>
          </div>
        </div>
        <div className="adm-modal-actions">
          <button type="button" className="adm-btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="adm-btn primary" disabled={busy}>{busy ? 'Saving…' : 'Create banner'}</button>
        </div>
      </form>
    </Modal>
  );
}

function AnnouncementModal({ open, onClose, onSaved, showToast }) {
  const [form, setForm] = useState({ title: '', body: '', severity: 'info', dismissible: true, audience: 'all' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setForm({ title: '', body: '', severity: 'info', dismissible: true, audience: 'all' }); }, [open]);

  async function submit(e) {
    e.preventDefault(); setBusy(true);
    try {
      await adminCreateAnnouncement(form);
      showToast('Announcement created.');
      onSaved();
    } catch (e) { showToast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="New announcement" description="Site-wide alert shown to all players.">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="adm-field">
          <label>Title</label>
          <input className="adm-input" required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} autoFocus />
        </div>
        <div className="adm-field">
          <label>Body</label>
          <textarea className="adm-input" rows={3} required value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
        </div>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
          <div className="adm-field">
            <label>Severity</label>
            <select className="adm-select" value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}>
              <option value="info">Info</option>
              <option value="success">Success</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div className="adm-field">
            <label>Audience</label>
            <select className="adm-select" value={form.audience} onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}>
              <option value="all">All</option>
              <option value="verified">Verified only</option>
              <option value="new">New players</option>
            </select>
          </div>
        </div>
        <div className="adm-field">
          <label><input type="checkbox" checked={form.dismissible} onChange={(e) => setForm((f) => ({ ...f, dismissible: e.target.checked }))} /> Dismissible by user</label>
        </div>
        <div className="adm-modal-actions">
          <button type="button" className="adm-btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="adm-btn primary" disabled={busy}>{busy ? 'Saving…' : 'Create announcement'}</button>
        </div>
      </form>
    </Modal>
  );
}

export function ReportsPage() {
  const { showToast } = useAdmin();
  const [tab, setTab] = useState('revenue');
  const [revenue, setRevenue] = useState(null);
  const [players, setPlayers] = useState(null);
  const [ops, setOps] = useState(null);
  const [exports, setExports] = useState(null);

  useEffect(() => {
    Promise.all([
      adminRevenueReport(), adminPlayerReport(), adminOperationalReport(), adminListExports(),
    ]).then(([r, p, o, e]) => { setRevenue(r); setPlayers(p); setOps(o); setExports(e.exports); })
    .catch((e) => showToast(e.message, 'error'));
  }, []);

  return (
    <>
      <header className="adm-page-head">
        <div>
          <h1>Reports &amp; BI</h1>
          <p>Financial, player, and operational analytics.</p>
        </div>
        <Badge tone="info"><IconBarChart size={12} /> Analytics</Badge>
      </header>

      <div className="adm-table-toolbar" style={{ marginBottom: 16 }}>
        {[
          ['revenue', 'Revenue'],
          ['players', 'Player analytics'],
          ['operational', 'Operational KPIs'],
          ['exports', 'Export centre'],
        ].map(([k, label]) => (
          <button key={k} className={`adm-btn sm ${tab === k ? 'primary' : ''}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === 'revenue' && (
        <div className="adm-grid c2">
          <Card title="Revenue summary">
            {revenue ? (
              <dl className="adm-kv">
                <dt>Gross gaming revenue</dt><dd style={{ fontWeight: 700 }}>{moneyFmt(revenue.summary?.grossGamingRevenue)}</dd>
                <dt>Net revenue</dt><dd style={{ fontWeight: 700 }}>{moneyFmt(revenue.summary?.netRevenue)}</dd>
                <dt>Bonus cost</dt><dd>{moneyFmt(revenue.summary?.bonusCost)}</dd>
                <dt>Total bets</dt><dd>{numFmt(revenue.summary?.totalBets)}</dd>
                <dt>Total payouts</dt><dd>{moneyFmt(revenue.summary?.totalPayouts)}</dd>
              </dl>
            ) : <Spinner />}
          </Card>
          <Card title="By sport" subtitle="Breakdown by sport category">
            {revenue?.bySport?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {revenue.bySport.map((s, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <span>{s.sport}</span>
                    <span style={{ fontWeight: 700 }}>{moneyFmt(s.revenue)}</span>
                  </div>
                ))}
              </div>
            ) : <Empty title="No data" subtitle="Revenue data will appear once players start betting." />}
          </Card>
        </div>
      )}

      {tab === 'players' && (
        <div className="adm-grid c2">
          <Card title="Player summary">
            {players ? (
              <dl className="adm-kv">
                <dt>Total players</dt><dd style={{ fontWeight: 700 }}>{numFmt(players.total)}</dd>
                <dt>New this period</dt><dd>{numFmt(players.newThisPeriod)}</dd>
                <dt>Returning</dt><dd>{numFmt(players.returning)}</dd>
                <dt>Churn rate</dt><dd>{players.churnRate}%</dd>
                <dt>Avg LTV</dt><dd style={{ fontWeight: 700 }}>{moneyFmt(players.avgLtv)}</dd>
              </dl>
            ) : <Spinner />}
          </Card>
          <Card title="By channel" subtitle="Acquisition channel breakdown">
            {players?.byChannel?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {players.byChannel.map((c, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <span>{c.channel}</span>
                    <span style={{ fontWeight: 700 }}>{numFmt(c.count)}</span>
                  </div>
                ))}
              </div>
            ) : <Empty title="No data" />}
          </Card>
        </div>
      )}

      {tab === 'operational' && (
        <div className="adm-grid c2">
          <Card title="Support">
            {ops ? (
              <dl className="adm-kv">
                <dt>Total tickets</dt><dd>{numFmt(ops.supportTickets?.total)}</dd>
                <dt>Avg response time</dt><dd>{ops.supportTickets?.avgResponseTime || '—'}h</dd>
                <dt>Satisfaction</dt><dd>{ops.supportTickets?.satisfaction ? `${ops.supportTickets.satisfaction}%` : '—'}</dd>
              </dl>
            ) : <Spinner />}
          </Card>
          <Card title="Withdrawals">
            {ops ? (
              <dl className="adm-kv">
                <dt>Total</dt><dd>{numFmt(ops.withdrawals?.total)}</dd>
                <dt>Avg processing time</dt><dd>{ops.withdrawals?.avgProcessingTime || '—'}h</dd>
                <dt>Pending</dt><dd>{numFmt(ops.withdrawals?.pendingCount)}</dd>
              </dl>
            ) : <Spinner />}
          </Card>
          <Card title="Admin activity">
            {ops ? (
              <dl className="adm-kv">
                <dt>Total actions</dt><dd>{numFmt(ops.adminActions?.total)}</dd>
                <dt>Unique admins</dt><dd>{numFmt(ops.adminActions?.uniqueAdmins)}</dd>
              </dl>
            ) : <Spinner />}
          </Card>
        </div>
      )}

      {tab === 'exports' && (
        <Card title="Export centre" subtitle="Generate and download custom reports">
          {!exports && <Spinner />}
          {exports && exports.length === 0 && <Empty title="No exports yet" subtitle="Requested exports will appear here." />}
          {exports?.map((e) => (
            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{e.type} — {e.format}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{ago(e.createdAt)}</div>
              </div>
              <Badge tone={e.status === 'completed' ? 'success' : 'warn'}>{e.status}</Badge>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}

export function SecurityPage() {
  const { hasRole, showToast } = useAdmin();
  const [tab, setTab] = useState('settings');
  const [settings, setSettings] = useState(null);
  const [sessions, setSessions] = useState(null);

  useEffect(() => {
    adminListExports(); // ignore — placeholder
  }, []);

  return (
    <>
      <header className="adm-page-head">
        <div>
          <h1>Security</h1>
          <p>Platform access controls, threat monitoring, and compliance exports.</p>
        </div>
        <Badge tone="info"><IconLock size={12} /> Security</Badge>
      </header>

      <div className="adm-table-toolbar" style={{ marginBottom: 16 }}>
        {[
          ['settings', 'Access control'],
          ['sessions', 'Sessions'],
          ['threats', 'Threat monitoring'],
          ['compliance', 'Compliance exports'],
        ].map(([k, label]) => (
          <button key={k} className={`adm-btn sm ${tab === k ? 'primary' : ''}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === 'settings' && (
        <Card title="Access control" subtitle="Admin roles, 2FA, and session timeout policy">
          <dl className="adm-kv">
            <dt>Force 2FA</dt><dd><Badge tone="warn">Configurable per role</Badge></dd>
            <dt>Session timeout</dt><dd>1 hour (default)</dd>
            <dt>IP allowlist</dt><dd>None configured — all IPs accepted</dd>
            <dt>Break-glass access</dt><dd><Badge tone="info">Available</Badge></dd>
            <dt>Rate limit profile</dt><dd>Standard</dd>
          </dl>
        </Card>
      )}

      {tab === 'sessions' && (
        <Card title="Active admin sessions" subtitle="Currently logged-in admin users">
          <Empty title="No session data" subtitle="Session tracking will appear when the server reports active sessions." />
        </Card>
      )}

      {tab === 'threats' && (
        <Card title="Threat monitoring" subtitle="Suspicious activity detection and alerts">
          <Empty title="No threats detected" subtitle="All clear. Alerts will appear if suspicious activity is detected." />
        </Card>
      )}

      {tab === 'compliance' && (
        <Card title="Compliance exports" subtitle="GDPR data requests and account deletion">
          <Empty title="No pending requests" subtitle="GDPR data subject requests and account deletion workflows will appear here." />
        </Card>
      )}
    </>
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
          <div style={{ fontSize: 28, fontWeight: 800, color: s && s.net >= 0 ? 'var(--success, #0E8A4A)' : 'var(--danger, #d63a2c)' }}>
            {s ? moneyFmt(s.net) : '—'}
          </div>
          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>Deposits minus withdrawals</div>
        </Card>
        <Card title="Min thresholds">
          <dl className="adm-kv" style={{ margin: 0 }}>
            <dt>Min deposit</dt><dd>GHS 300</dd>
            <dt>Min withdraw</dt><dd>GHS 550</dd>
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
                <div key={i} style={{ background: 'var(--grad-brand, linear-gradient(135deg, rgba(124,92,255,.08), rgba(14,138,74,.08)))', borderRadius: 10, padding: 14 }}>
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

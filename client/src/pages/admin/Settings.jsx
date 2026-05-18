import { useEffect, useState } from 'react';
import { Card, Badge, Spinner, useToast } from '../../components/admin/primitives.jsx';
import { adminGetSettings, adminUpdateSettings, adminHealth } from '../../api/adminApi.js';
import { useAdmin } from '../../providers/AdminProvider.jsx';

export default function SettingsPage() {
  const { hasRole, showToast } = useAdmin();
  const isSuper = hasRole();
  const $t = useToast();
  const toast = showToast || $t?.showToast || (() => {});
  const [health, setHealth] = useState(null);
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminHealth().then(setHealth).catch(() => {});
    adminGetSettings().then(setSettings).catch(() => {});
  }, []);

  if (!settings) return <Spinner label="Loading settings…" />;

  const update = async (patch) => {
    setBusy(true);
    try {
      const res = await adminUpdateSettings(patch);
      setSettings(res.settings);
      toast('Settings saved.', 'success');
    } catch (e) {
      toast(e.message || 'Failed to save.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (key) => {
    update({ [key]: !settings[key] });
  };

  const setNum = (key) => (e) => {
    const val = parseFloat(e.target.value);
    if (!Number.isFinite(val) || val < 0) return;
    update({ [key]: val });
  };

  const setStr = (key) => (e) => {
    update({ [key]: e.target.value });
  };

  return (
    <>
      <header className="adm-page-head">
        <div>
          <h1>Settings</h1>
          <p>Platform configuration, feature toggles, and runtime info.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {busy && <Spinner label="" />}
          <Badge tone={isSuper ? 'success' : 'warn'}>{isSuper ? 'Super admin' : 'Read-only'}</Badge>
        </div>
      </header>

      <div className="adm-grid c2">
        {/* Feature toggles */}
        <Card title="Feature toggles" subtitle="Enable or disable platform features">
          {[
            ['maintenance',      'Maintenance mode',      settings.maintenance,      'Blocks all user traffic'],
            ['signupsOpen',      'New registrations',     settings.signupsOpen,      'Allow new users to sign up'],
            ['featureJackpot',   'Jackpot',               settings.featureJackpot,   'Jackpot betting'],
            ['featureCasino',    'Casino',                settings.featureCasino,    'Casino games'],
            ['featureVirtuals',  'Virtuals',              settings.featureVirtuals,  'Virtual sports'],
            ['featurePromotions','Promotions',            settings.featurePromotions,'Promotions page'],
            ['featureLiveBetting','Live betting',         settings.featureLiveBetting,'Live in-play betting'],
          ].map(([key, label, val, desc]) => (
            <div key={key} className="adm-toggle-row">
              <div>
                <strong>{label}</strong>
                <span className="adm-toggle-desc">{desc}</span>
              </div>
              {isSuper ? (
                <button
                  type="button"
                  className={`adm-toggle ${val ? 'on' : 'off'}`}
                  onClick={() => toggle(key)}
                >
                  {val ? 'ON' : 'OFF'}
                </button>
              ) : (
                <Badge tone={val ? 'success' : 'default'} dot>{val ? 'On' : 'Off'}</Badge>
              )}
            </div>
          ))}
        </Card>

        {/* Financial limits */}
        <Card title="Financial limits" subtitle="Betting and wallet thresholds">
          <div className="adm-kv">
            {[
              ['minDeposit',      'Min deposit',     'GHS', settings.minDeposit],
              ['minWithdraw',     'Min withdraw',    'GHS', settings.minWithdraw],
              ['maxSingleStake',  'Max single stake','GHS', settings.maxSingleStake],
              ['maxMultipleStake','Max multi stake', 'GHS', settings.maxMultipleStake],
              ['maxSystemStake',  'Max system stake','GHS', settings.maxSystemStake],
            ].map(([key, label, prefix, val]) => (
              <div key={key} className="adm-kv-row">
                <dt>{label}</dt>
                <dd>
                  {isSuper ? (
                    <input
                      type="number"
                      className="adm-num-input"
                      defaultValue={val}
                      onBlur={setNum(key)}
                      onKeyDown={(e) => e.key === 'Enter' && setNum(key)(e)}
                      min={0}
                    />
                  ) : (
                    `${prefix} ${val?.toLocaleString?.() ?? val}`
                  )}
                </dd>
              </div>
            ))}
            {[
              ['bonusRate',       'Bonus rate',       '', `${(settings.bonusRate * 100).toFixed(0)}%`],
              ['referralBonus',   'Referral bonus',   'GHS', settings.referralBonus],
            ].map(([key, label, prefix, val]) => (
              <div key={key} className="adm-kv-row">
                <dt>{label}</dt>
                <dd>
                  {isSuper ? (
                    <input
                      type="number"
                      className="adm-num-input"
                      defaultValue={key === 'bonusRate' ? settings.bonusRate * 100 : val}
                      onBlur={(e) => {
                        const n = parseFloat(e.target.value);
                        if (!Number.isFinite(n) || n < 0) return;
                        update({ [key]: key === 'bonusRate' ? n / 100 : n });
                      }}
                      step={key === 'bonusRate' ? 1 : 5}
                      min={0}
                    />
                  ) : `${prefix} ${key === 'bonusRate' ? `${(val * 100).toFixed(0)}%` : val?.toLocaleString?.() ?? val}`}
                </dd>
              </div>
            ))}
          </div>
        </Card>

        {/* Contact & branding */}
        <Card title="Contact & branding">
          <div className="adm-kv">
            <div className="adm-kv-row">
              <dt>Contact email</dt>
              <dd>
                {isSuper ? (
                  <input
                    type="email"
                    className="adm-text-input"
                    defaultValue={settings.contactEmail}
                    onBlur={setStr('contactEmail')}
                    onKeyDown={(e) => e.key === 'Enter' && setStr('contactEmail')(e)}
                  />
                ) : settings.contactEmail}
              </dd>
            </div>
          </div>
        </Card>

        {/* Maintenance banner */}
        {settings.maintenance && isSuper && (
          <Card title="Maintenance banner">
            <textarea
              className="adm-textarea"
              defaultValue={settings.maintenanceMessage}
              rows={3}
              onBlur={setStr('maintenanceMessage')}
              placeholder="Message shown to users during maintenance..."
            />
          </Card>
        )}

        {/* Runtime */}
        <Card title="Runtime">
          <dl className="adm-kv">
            <div className="adm-kv-row"><dt>API uptime</dt><dd>{health?.uptimeSec ?? '—'}s</dd></div>
            <div className="adm-kv-row"><dt>Memory</dt><dd>{health?.memoryMb ?? '—'} MB</dd></div>
            <div className="adm-kv-row"><dt>Node</dt><dd>{health?.nodeVersion || '—'}</dd></div>
            <div className="adm-kv-row"><dt>PID</dt><dd>{health?.pid ?? '—'}</dd></div>
            <div className="adm-kv-row"><dt>SMTP</dt><dd>{health?.smtp ? <Badge tone="success">Configured</Badge> : <Badge tone="warn">Console mode</Badge>}</dd></div>
            <div className="adm-kv-row"><dt>Google OAuth</dt><dd>{health?.google ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}</dd></div>
            <div className="adm-kv-row"><dt>Odds feed</dt><dd>{health?.oddsApi?.enabled ? <Badge tone="success">Live</Badge> : <Badge tone="warn">Cached</Badge>}</dd></div>
          </dl>
        </Card>
      </div>

      <style>{STYLES}</style>
    </>
  );
}

const STYLES = `
.adm-toggle-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 0; border-bottom: 1px dashed var(--border);
  gap: 12px;
}
.adm-toggle-row:last-child { border-bottom: none; }
.adm-toggle-row strong { display: block; font-size: 13.5px; }
.adm-toggle-desc { display: block; font-size: 11.5px; color: var(--text-dim); margin-top: 2px; }
.adm-toggle {
  flex-shrink: 0; padding: 6px 16px; border-radius: 20px;
  border: none; font-size: 11px; font-weight: 800; letter-spacing: .08em;
  cursor: pointer; transition: all .15s ease; text-transform: uppercase;
}
.adm-toggle.on { background: rgba(34, 197, 94, .15); color: #22c55e; }
.adm-toggle.off { background: rgba(239, 68, 68, .12); color: #ef4444; }
.adm-toggle:hover { opacity: .75; }
.adm-kv-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 0; border-bottom: 1px dashed var(--border);
  gap: 12px;
}
.adm-kv-row:last-child { border-bottom: none; }
.adm-kv-row dt { font-size: 13px; color: var(--text-soft); }
.adm-kv-row dd { font-size: 13px; font-weight: 700; text-align: right; }
.adm-num-input {
  width: 100px; padding: 4px 8px; border-radius: 6px;
  border: 1px solid var(--border); background: var(--surface);
  color: var(--text); font-size: 13px; font-weight: 700; text-align: right;
}
.adm-text-input {
  width: 220px; padding: 4px 8px; border-radius: 6px;
  border: 1px solid var(--border); background: var(--surface);
  color: var(--text); font-size: 13px;
}
.adm-textarea {
  width: 100%; padding: 8px 10px; border-radius: 8px;
  border: 1px solid var(--border); background: var(--surface);
  color: var(--text); font-size: 13px; resize: vertical;
  font-family: inherit;
}
`;

/**
 * Account — port of the Claude Design OddAccountScreen.
 *
 * Floating balance card overlapping the page header, 4 quick actions
 * (Deposit / Withdraw / Transfer / Help), 3-stat row, navigable menu list,
 * log out button. Wires deposit/withdraw via the existing AccountProvider
 * dialogs so we keep the working MoMo / Paybill / Card flows intact.
 */
import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAccount } from '../providers/AccountProvider.jsx';
import { fetchTransactions, fetchBetHistory } from '../api/betApi.js';
import {
  T, fmtCedi,
  OddPageHeader, OddIcon,
} from '../components/odd/primitives.jsx';

const QUICK_ACTIONS = (handlers) => ([
  { id: 'dep',   icon: 'deposit', label: 'Deposit',  tint: T.greenBright, onClick: handlers.deposit },
  { id: 'with',  icon: 'upload',  label: 'Withdraw', tint: T.gold,        onClick: handlers.withdraw },
  { id: 'trans', icon: 'refresh', label: 'Transfer', tint: '#3a6dff',     onClick: handlers.transfer },
  { id: 'help',  icon: 'info',    label: 'Help',     tint: T.inkSoft,     onClick: handlers.help },
]);

const MENU_ITEMS = (counts, navigate) => ([
  { icon: 'ticket', label: 'My bets',            detail: counts.openBets ? `${counts.openBets} open` : null, to: '/my-bets' },
  { icon: 'wallet', label: 'Transactions',       detail: counts.tx ? String(counts.tx) : null,                to: '/wallet' },
  { icon: 'trophy', label: 'Rewards & promos',   detail: '3 new',  to: '/promos' },
  { icon: 'bell',   label: 'Notifications',      detail: counts.unread ? String(counts.unread) : null,        to: '/profile#notifications' },
  { icon: 'user',   label: 'Profile & KYC',                                                                   to: '/profile#kyc' },
  { icon: 'info',   label: 'Help center',                                                                     to: '/help' },
]);

export default function ProfilePage() {
  const navigate = useNavigate();
  const { account, signOut, openDeposit, openWithdraw, unreadCount } = useAccount();
  const [counts, setCounts] = useState({ openBets: 0, tx: 0, unread: 0 });

  useEffect(() => {
    if (!account) return;
    let alive = true;
    // Best-effort badge counts — the page renders without them, so failures
    // are silent. Both endpoints are cheap reads we already cache server-side.
    Promise.all([
      fetchBetHistory().catch(() => null),
      fetchTransactions().catch(() => null),
    ]).then(([bets, txs]) => {
      if (!alive) return;
      const items = bets?.bets || bets?.history || [];
      setCounts({
        openBets: items.filter(b => b.status === 'open').length,
        tx: (txs?.transactions || txs?.items || []).length,
        unread: unreadCount,
      });
    });
    return () => { alive = false; };
  }, [account, unreadCount]);

  if (!account) {
    return (
      <div style={{ background: T.bg, minHeight: '100vh', paddingBottom: 120 }}>
        <OddPageHeader title="Account" subtitle="Sign in to access your account" />
        <div style={{ padding: '40px 24px', textAlign: 'center' }}>
          <OddIcon name="user" size={32} color={T.inkDim} />
          <div style={{ fontWeight: 700, fontSize: 16, color: T.ink, marginTop: 12 }}>
            Sign in to Oddsify
          </div>
          <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 6 }}>
            Track balance, deposits and bets in one place.
          </div>
          <Link to="/login" style={{
            display: 'inline-block', marginTop: 16,
            padding: '12px 24px', borderRadius: 999,
            background: T.greenBright, color: T.goldDark,
            fontWeight: 700, fontSize: 13, textDecoration: 'none',
          }}>Sign in →</Link>
        </div>
      </div>
    );
  }

  const handlers = {
    deposit:  () => openDeposit(),
    withdraw: () => openWithdraw(),
    transfer: () => navigate('/wallet'),
    help:     () => navigate('/help'),
  };

  const balance = Number(account.balance || 0);
  const bonus   = Number(account.bonus || 0);
  const firstName = (account.displayName || account.email || '').split(/[ @]/)[0];

  return (
    <div style={{ background: T.bg, minHeight: '100vh', paddingBottom: 120 }}>
      <OddPageHeader title="Account" subtitle={`Hello, ${firstName}`}
        right={
          <button type="button" onClick={() => navigate('/wallet')}
            aria-label="Notifications"
            style={{
              width: 36, height: 36, borderRadius: 999,
              background: 'rgba(255,255,255,0.1)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              border: 0, cursor: 'pointer', color: '#fff',
            }}>
            <OddIcon name="bell" size={18} color="#fff" />
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: -2, right: -2, width: 8, height: 8,
                borderRadius: 999, background: T.danger,
              }} />
            )}
          </button>
        }
      />

      {/* floating balance + quick actions */}
      <div style={{ padding: '0 16px', marginTop: -16, position: 'relative', zIndex: 2 }}>
        <div style={{
          background: T.surface, borderRadius: 18,
          padding: '16px', border: `1px solid ${T.line}`,
          boxShadow: '0 12px 32px -16px rgba(0,0,0,0.6)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{
                fontSize: 11, color: T.inkSoft, fontWeight: 600, letterSpacing: 0.4,
              }}>MAIN BALANCE</div>
              <div style={{
                fontSize: 28, fontWeight: 700, color: T.ink, letterSpacing: -0.5,
                fontVariantNumeric: 'tabular-nums',
                fontFamily: '"Space Grotesk", system-ui, sans-serif',
              }}>
                GHS <span>{fmtCedi(balance)}</span>
              </div>
              {bonus > 0 && (
                <div style={{
                  fontSize: 11, color: T.greenBright, fontWeight: 600, marginTop: 2,
                }}>Bonus GHS {fmtCedi(bonus)} · expires in 6 days</div>
              )}
            </div>
            <button type="button" aria-label="Toggle balance visibility" style={{
              width: 38, height: 38, borderRadius: 12,
              background: T.surfaceAlt,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              border: 0, color: T.ink, cursor: 'pointer',
            }}>
              <OddIcon name="eye" size={18} color={T.ink} />
            </button>
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 14,
          }}>
            {QUICK_ACTIONS(handlers).map(a => (
              <button key={a.id} type="button" onClick={a.onClick} style={{
                display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center',
                padding: '10px 4px', borderRadius: 12,
                background: T.surfaceAlt, border: 0, cursor: 'pointer',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 10, background: `${a.tint}1f`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}><OddIcon name={a.icon} size={16} color={a.tint} /></div>
                <span style={{ fontSize: 11, fontWeight: 600, color: T.ink }}>{a.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* quick stats */}
      <div style={{
        padding: '16px 16px 0',
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
      }}>
        {[
          { label: 'Open bets', value: String(counts.openBets) },
          { label: 'Win rate',  value: account.winRate ? `${Math.round(account.winRate * 100)}%` : '—' },
          { label: 'Streak',    value: account.streak ? `🔥 ${account.streak}` : '0' },
        ].map(s => (
          <div key={s.label} style={{
            background: T.surface, border: `1px solid ${T.line}`,
            borderRadius: 12, padding: '12px',
          }}>
            <div style={{
              fontSize: 10, color: T.inkSoft, fontWeight: 700, letterSpacing: 0.4,
            }}>{s.label.toUpperCase()}</div>
            <div style={{
              fontSize: 18, fontWeight: 700, color: T.ink, letterSpacing: -0.3,
            }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* menu list */}
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{
          background: T.surface, borderRadius: 14, overflow: 'hidden',
          border: `1px solid ${T.line}`,
        }}>
          {MENU_ITEMS(counts, navigate).map((m, i, arr) => (
            <button key={m.label} type="button" onClick={() => navigate(m.to)}
              style={{
                width: '100%', padding: '14px 14px',
                display: 'flex', alignItems: 'center', gap: 12,
                borderBottom: i < arr.length - 1 ? `1px solid ${T.line}` : 'none',
                color: T.ink, background: 'transparent', border: 0, cursor: 'pointer',
              }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10, background: T.surfaceAlt,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><OddIcon name={m.icon} size={16} color={T.greenBright} /></div>
              <span style={{ flex: 1, textAlign: 'left', fontSize: 14, fontWeight: 600 }}>
                {m.label}
              </span>
              {m.detail && (
                <span style={{ fontSize: 11, color: T.inkSoft, fontWeight: 600 }}>{m.detail}</span>
              )}
              <OddIcon name="chevR" size={14} color={T.inkDim} />
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '24px 16px', textAlign: 'center' }}>
        <button type="button" onClick={signOut} style={{
          padding: '10px 18px', borderRadius: 999,
          background: 'transparent', color: T.danger,
          border: `1px solid ${T.danger}33`,
          fontWeight: 600, fontSize: 13, cursor: 'pointer',
        }}>Log out</button>
      </div>
    </div>
  );
}

/**
 * Bottom navigation — port of the Claude Design Oddsify.html OddBottomNav.
 * Five tabs (Home / AZ Menu / Bet History / Wallet / Account) routed through
 * react-router NavLink. Active tab gets a gold top dash + tinted icon/label.
 * Hidden when the bet slip is open so the slip's CTA owns the bottom safe area.
 */
import { useLocation, useNavigate } from 'react-router-dom';
import { T } from './tokens.js';
import OddIcon from './Icon.jsx';
import { useSlip } from '../../providers/SlipProvider.jsx';
import { useAccount } from '../../providers/AccountProvider.jsx';

const ITEMS = [
  { id: 'home',   label: 'Home',        icon: 'home',   to: '/' },
  { id: 'sports', label: 'AZ Menu',     icon: 'menu',   to: '/sports' },
  { id: 'bets',   label: 'Bet History', icon: 'ticket', to: '/my-bets' },
  { id: 'tx',     label: 'Wallet',      icon: 'wallet', to: '/wallet' },
  { id: 'me',     label: 'Account',     icon: 'user',   to: '/profile' },
];

function isActive(pathname, to) {
  if (to === '/') return pathname === '/';
  return pathname.startsWith(to);
}

export default function OddBottomNav() {
  const loc = useLocation();
  const navigate = useNavigate();
  const { open: slipOpen } = useSlip();
  const { account } = useAccount();
  if (slipOpen) return null;

  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: 0,
      paddingBottom: 28,
      background: 'linear-gradient(to top, rgba(10, 10, 10, 0.96) 70%, rgba(10, 10, 10, 0))',
      pointerEvents: 'none', zIndex: 70,
    }}>
      <div style={{
        margin: '0 12px', padding: '8px 6px',
        background: '#1c1a16', borderRadius: 22,
        border: '1px solid rgba(232, 185, 74, 0.18)',
        display: 'grid', gridTemplateColumns: `repeat(${ITEMS.length}, 1fr)`,
        boxShadow: '0 18px 40px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(0, 0, 0, 0.4)',
        pointerEvents: 'auto',
        maxWidth: 560, marginLeft: 'auto', marginRight: 'auto',
      }}>
        {ITEMS.map(item => {
          const active = isActive(loc.pathname, item.to);
          const isAccount = item.id === 'me';
          // Route guests away from /profile so they hit the login flow,
          // matching the original bottom-nav's behaviour.
          const dest = (isAccount && !account) ? '/login?next=/profile' : item.to;
          return (
            <button key={item.id} type="button"
              onClick={() => navigate(dest)}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 3, padding: '6px 4px', position: 'relative',
                color: active ? T.greenBright : 'rgba(255,255,255,0.55)',
                background: 'transparent', border: 0, cursor: 'pointer',
              }}>
              {active && (
                <span style={{
                  position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                  width: 24, height: 3, borderRadius: 999, background: T.greenBright,
                }} />
              )}
              <OddIcon name={item.icon} size={20} strokeWidth={active ? 2.2 : 1.8} />
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.2 }}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

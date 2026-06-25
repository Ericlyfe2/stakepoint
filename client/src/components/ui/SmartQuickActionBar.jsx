'use client';
import { useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef, useMemo } from 'react';
import { Gamepad2, CloudRain, Zap, CircleDollarSign, Bot } from 'lucide-react';

const items = [
  {
    label: 'Lucky Numbers',
    icon: Gamepad2,
    bg: 'linear-gradient(135deg,#6c2dc7,#9f5de2)',
    to: '/casino',
    ariaLabel: 'Lucky Numbers casino game',
  },
  {
    label: 'Daily Rains',
    icon: CloudRain,
    bg: 'linear-gradient(135deg,#1a7a4c,#27ae60)',
    to: '/promos',
    ariaLabel: 'Daily Rains promotions',
  },
  {
    label: 'Instant Win',
    icon: Zap,
    bg: 'linear-gradient(135deg,#c87f00,#f5a623)',
    to: '/casino',
    ariaLabel: 'Instant Win casino game',
  },
  {
    label: 'JACKPOT',
    icon: CircleDollarSign,
    bg: 'linear-gradient(135deg,#c5993d,#ffd700)',
    to: '/jackpot',
    ariaLabel: 'Jackpot',
  },
  {
    label: 'AutoBet',
    icon: Bot,
    bg: 'linear-gradient(135deg,#2a5298,#4a90d9)',
    to: '/',
    ariaLabel: 'AutoBet settings',
  },
];

export default function SmartQuickActionBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(true);
  const timeoutRef = useRef(null);

  const isSportsPage = useMemo(
    () => location.pathname === '/' || location.pathname.startsWith('/?'),
    [location.pathname],
  );
  const isProfilePage = useMemo(
    () => location.pathname === '/profile',
    [location.pathname],
  );

  useEffect(() => {
    if (isProfilePage) {
      setIsVisible(true);
      timeoutRef.current = setTimeout(() => {
        setIsVisible(false);
      }, 15000);
    } else {
      setIsVisible(true);
    }
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isProfilePage]);

  const shouldRender = isSportsPage || (isProfilePage && isVisible);
  if (!shouldRender) return null;

  return (
    <div className="sqab-container">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.label}
            type="button"
            role="button"
            aria-label={item.ariaLabel}
            onClick={() => navigate(item.to)}
            className="sqab-item"
          >
            <div className="sqab-icon" style={{ background: item.bg }}>
              <Icon size={24} strokeWidth={2.5} />
            </div>
            <span className="sqab-label">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

const SQAB_CSS = `
.sqab-container {
  width: 100%;
  background: #fff;
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  border-bottom: 1px solid #e5e7eb;
}
.sqab-container::-webkit-scrollbar { display: none; }
.sqab-container { -ms-overflow-style: none; scrollbar-width: none; }

.sqab-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  transition: transform 0.2s, filter 0.2s;
  cursor: pointer;
  border: none;
  background: none;
  padding: 0;
  font-family: inherit;
}
.sqab-item:hover { transform: scale(1.1); filter: brightness(1.1); }

.sqab-icon {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}
@media (min-width: 640px) {
  .sqab-icon { width: 56px; height: 56px; }
}

.sqab-label {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  text-align: center;
  max-width: 60px;
  line-height: 1.2;
}
`;

if (typeof document !== 'undefined') {
  const id = 'sqab-styles';
  if (!document.getElementById(id)) {
    const style = document.createElement('style');
    style.id = id;
    style.textContent = SQAB_CSS;
    document.head.appendChild(style);
  }
}

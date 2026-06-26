import { useMemo } from 'react';
import { useLocation, NavLink } from 'react-router-dom';

export default function XenFooter({ className = '' }) {
  const { pathname } = useLocation();

  const isSportsRoute = useMemo(() => {
    return pathname === '/';
  }, [pathname]);

  if (!isSportsRoute) return null;

  return (
    <footer className={`sporty-footer${className ? ` ${className}` : ''}`}>
      <div className="sporty-footer-top">
        <span className="sporty-18">18+</span>
        <span className="sporty-copy">© {new Date().getFullYear()} BetXentra GH · Licensed by the Gaming Commission of Ghana</span>
      </div>

      <div className="sporty-footer-brand">
        <div className="sporty-brand-row">
          <span className="sporty-brand-name">Bet<em>Xentra</em></span>
          <span className="sporty-brand-tag">Official Sports<br/>Betting Partner</span>
          <svg className="sporty-brand-logo" viewBox="0 0 60 20" width="50" height="18" aria-label="Real Madrid">
            <rect x="0" y="2" width="16" height="16" rx="2" fill="#fabe00" />
            <text x="8" y="14" textAnchor="middle" fontSize="10" fontWeight="800" fill="#00529f">RM</text>
            <text x="22" y="14" fontSize="7" fontWeight="700" fill="var(--text-soft)" fontFamily="sans-serif">REAL</text>
            <text x="22" y="19" fontSize="5" fontWeight="600" fill="var(--text-dim)" fontFamily="sans-serif">MADRID C.F.</text>
          </svg>
          <svg className="sporty-brand-logo" viewBox="0 0 60 22" width="55" height="22" aria-label="LaLiga">
            <rect x="0" y="1" width="20" height="20" rx="10" fill="#ff4b44" />
            <text x="10" y="15" textAnchor="middle" fontSize="10" fontWeight="800" fill="#fff" fontFamily="sans-serif">L</text>
            <text x="24" y="15" fontSize="9" fontWeight="800" fill="var(--text)" fontFamily="sans-serif">LaLiga</text>
          </svg>
        </div>
      </div>

      <p className="sporty-footer-tagline">The world&apos;s sharper betting platform</p>

      <div className="sporty-footer-section">
        <div className="sporty-footer-label">Payroll</div>
        <div className="sporty-footer-code">*711*222#</div>
      </div>

      <div className="sporty-footer-section">
        <div className="sporty-footer-label">Payment methods</div>
        <div className="sporty-payment-row">
          <span className="sporty-pay-chip">AT</span>
          <span className="sporty-pay-chip mtn">MTN</span>
          <span className="sporty-pay-chip telecel">telecel</span>
          <span className="sporty-pay-chip visa">VISA</span>
          <span className="sporty-pay-chip gt">GTBank</span>
        </div>
      </div>

      <p className="sporty-footer-legal">
        Age 18 and above to play. Please play responsibly. Betting is addictive and can be psychologically harmful.
        BetXentra Ghana Limited is licensed by the Gaming Commission of Ghana under licence: GC/B01/2137.
      </p>

      <div className="sporty-footer-links">
        <NavLink to="/info#terms">Terms &amp; Conditions</NavLink>
        <span className="sporty-dot">·</span>
        <NavLink to="/info#about">About Us</NavLink>
        <span className="sporty-dot">·</span>
        <NavLink to="/info#status">System Status</NavLink>
      </div>

      <div className="sporty-sponsors">
        <div className="sporty-sponsors-label">Official Club Partners</div>
        <div className="sporty-sponsors-row">
          <div className="sporty-sponsor-card">
            <svg viewBox="0 0 48 48" width="40" height="40" aria-label="Manchester City">
              <circle cx="24" cy="24" r="23" fill="#6CABDD" stroke="#1C2C5B" strokeWidth="1.5" />
              <circle cx="24" cy="24" r="17" fill="#1C2C5B" />
              <text x="24" y="21" textAnchor="middle" fontSize="7" fontWeight="800" fill="#6CABDD" fontFamily="sans-serif">MAN</text>
              <text x="24" y="29" textAnchor="middle" fontSize="7" fontWeight="800" fill="#6CABDD" fontFamily="sans-serif">CITY</text>
              <circle cx="24" cy="13" r="1.5" fill="#fabe00" />
            </svg>
            <span>Manchester City</span>
          </div>
          <div className="sporty-sponsor-card">
            <svg viewBox="0 0 48 48" width="40" height="40" aria-label="FC Barcelona">
              <rect x="4" y="4" width="40" height="40" rx="6" fill="#A50044" />
              <rect x="10" y="10" width="13" height="14" rx="1" fill="#004D98" />
              <rect x="25" y="10" width="13" height="14" rx="1" fill="#004D98" />
              <rect x="10" y="26" width="13" height="12" rx="1" fill="#EDBB00" />
              <rect x="25" y="26" width="13" height="12" rx="1" fill="#EDBB00" />
              <text x="24" y="22" textAnchor="middle" fontSize="8" fontWeight="900" fill="#fff" fontFamily="sans-serif">FC</text>
              <text x="24" y="35" textAnchor="middle" fontSize="6" fontWeight="800" fill="#A50044" fontFamily="sans-serif">BARÇA</text>
            </svg>
            <span>FC Barcelona</span>
          </div>
          <div className="sporty-sponsor-card">
            <svg viewBox="0 0 48 48" width="40" height="40" aria-label="Real Madrid">
              <circle cx="24" cy="24" r="23" fill="#FABE00" stroke="#00529F" strokeWidth="1.5" />
              <circle cx="24" cy="24" r="16" fill="#fff" />
              <text x="24" y="22" textAnchor="middle" fontSize="7" fontWeight="900" fill="#00529F" fontFamily="sans-serif">REAL</text>
              <text x="24" y="30" textAnchor="middle" fontSize="5.5" fontWeight="700" fill="#00529F" fontFamily="sans-serif">MADRID</text>
              <path d="M21 10 l3 -4 l3 4" fill="none" stroke="#FABE00" strokeWidth="1.5" />
            </svg>
            <span>Real Madrid</span>
          </div>
        </div>
      </div>

      <button type="button" className="sporty-back-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
        Back to Top
      </button>
    </footer>
  );
}

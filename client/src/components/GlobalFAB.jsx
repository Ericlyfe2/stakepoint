import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { fetchBetByCode } from '../api/betApi.js';
import { useToast, useAccount } from '../providers/AccountProvider.jsx';
import OddsGauge from './OddsGauge.jsx';

function formatAmt(n) {
  return Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const HIDDEN_PATHS = ['/login', '/register', '/forgot-password', '/reset-password', '/verify'];
const ADMIN_PREFIX = '/admin';

export default function GlobalFAB() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { account } = useAccount();
  const dlgRef = useRef(null);
  const inputRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectionCount, setSelectionCount] = useState(0);
  const [totalOdds, setTotalOdds] = useState(0);
  const [loadedTicket, setLoadedTicket] = useState(null);
  const [showMini, setShowMini] = useState(false);

  // Listen for selection changes from the Home page betslip
  useEffect(() => {
    const handler = (e) => {
      setSelectionCount(e.detail?.count ?? 0);
      setTotalOdds(e.detail?.odds ?? 0);
    };
    window.addEventListener('betxentra:slip-update', handler);
    return () => window.removeEventListener('betxentra:slip-update', handler);
  }, []);

  // Listen for bet placement (clear state)
  useEffect(() => {
    const handler = () => {
      setSelectionCount(0);
      setTotalOdds(0);
      setLoadedTicket(null);
    };
    window.addEventListener('betxentra:bet-placed', handler);
    return () => window.removeEventListener('betxentra:bet-placed', handler);
  }, []);

  // Hide on auth/admin pages
  const shouldHide =
    HIDDEN_PATHS.some((p) => location.pathname.startsWith(p)) ||
    location.pathname.startsWith(ADMIN_PREFIX);

  if (shouldHide) return null;

  const openModal = () => {
    setOpen(true);
    setError('');
    setCode('');
    requestAnimationFrame(() => {
      dlgRef.current?.showModal();
      inputRef.current?.focus();
    });
  };

  const closeModal = () => {
    dlgRef.current?.close();
    setOpen(false);
    setError('');
  };

  const handleLoad = async (e) => {
    e?.preventDefault();
    const trimmed = code.trim().toUpperCase();

    if (!trimmed) {
      setError('Please enter a valid booking code.');
      return;
    }
    if (!/^[A-Z]{2}\d{5}$/.test(trimmed)) {
      setError('Invalid format. Use 2 letters + 5 digits (e.g. AB12345).');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { bet } = await fetchBetByCode(trimmed);

      if (!bet?.legs?.length) {
        setError('Booking code not found or has no selections.');
        setLoading(false);
        return;
      }

      setLoadedTicket({ code: trimmed, bet });
      closeModal();

      // Dispatch event so Home page can hydrate the slip
      window.dispatchEvent(
        new CustomEvent('betxentra:load-code', { detail: { code: trimmed, bet } }),
      );

      // Navigate to home if not already there
      if (location.pathname !== '/') {
        navigate(`/?code=${trimmed}`);
      }

      toast(`Loaded ${bet.legs.length} selection${bet.legs.length === 1 ? '' : 's'} from ${trimmed}.`);
    } catch (err) {
      if (err.status === 404) {
        setError('Booking code not found.');
      } else if (err.status === 410) {
        setError('Booking code has expired.');
      } else {
        setError(err.message || 'Failed to load booking code. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const openBetslip = () => {
    if (location.pathname === '/') {
        window.dispatchEvent(new CustomEvent('betxentra:open-slip'));
    } else {
      navigate('/');
      setTimeout(() => {
      window.dispatchEvent(new CustomEvent('betxentra:open-slip'));
      }, 500);
    }
  };

  // Determine button state
  const hasSelections = selectionCount > 0;
  const hasTicket = !!loadedTicket;

  const handleFabClick = () => {
    if (hasSelections) {
      openBetslip();
    } else {
      openModal();
    }
  };

  return (
    <>
      {/* === Floating Action Button === */}
      <div className="gfab-container" role="complementary" aria-label="Quick betslip access">
        <button
          type="button"
          className={`gfab-btn${hasSelections ? ' has-selections' : ''}${hasTicket && !hasSelections ? ' has-ticket' : ''}`}
          onClick={handleFabClick}
          aria-label={
            hasSelections
              ? `Open betslip with ${selectionCount} selections`
              : 'Enter booking code'
          }
        >
          {hasSelections ? (
            <>
              <div className="gfab-gauge">
                <OddsGauge odds={totalOdds} size={36} />
              </div>
              <div className="gfab-content">
                <span className="gfab-count">{selectionCount}</span>
                <span className="gfab-label">Betslip</span>
              </div>
            </>
          ) : hasTicket ? (
            <>
              <svg className="gfab-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 4C3 3.45 3.45 3 4 3H20C20.55 3 21 3.45 21 4V8.5C21 8.78 20.78 9 20.5 9C19.67 9 19 9.67 19 10.5C19 11.33 19.67 12 20.5 12C20.78 12 21 12.22 21 12.5V20C21 20.55 20.55 21 20 21H4C3.45 21 3 20.55 3 20V12.5C3 12.22 3.22 12 3.5 12C4.33 12 5 11.33 5 10.5C5 9.67 4.33 9 3.5 9C3.22 9 3 8.78 3 8.5V4Z" />
              </svg>
              <span className="gfab-label">Loaded</span>
            </>
          ) : (
            <>
              <svg className="gfab-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 18l6-6-6-6" />
                <path d="M8 6l-6 6 6 6" />
              </svg>
              <span className="gfab-label">Code</span>
            </>
          )}
        </button>

        {/* Quick action: long-press or secondary click opens code input even when selections exist */}
        {hasSelections && (
          <button
            type="button"
            className="gfab-code-mini"
            onClick={openModal}
            aria-label="Enter booking code"
            title="Load booking code"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 18l6-6-6-6" />
              <path d="M8 6l-6 6 6 6" />
            </svg>
          </button>
        )}
      </div>

      {/* === Booking Code Modal === */}
      <dialog ref={dlgRef} className="gfab-modal" onClose={() => setOpen(false)}>
        <div className="gfab-modal-inner">
          <div className="gfab-modal-header">
            <h3 className="gfab-modal-title">Load Booking Code</h3>
            <button
              type="button"
              className="gfab-modal-close"
              onClick={closeModal}
              aria-label="Close"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <p className="gfab-modal-desc">
            Enter your booking code to restore your selections.
          </p>

          <form onSubmit={handleLoad} className="gfab-modal-form">
            <div className="gfab-input-wrap">
              <input
                ref={inputRef}
                type="text"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase().replace(/\s+/g, ''));
                  setError('');
                }}
                placeholder="e.g. AB12345"
                maxLength={7}
                autoCapitalize="characters"
                spellCheck={false}
                autoComplete="off"
                className="gfab-input"
                aria-label="Booking code"
                aria-invalid={!!error}
                aria-describedby={error ? 'gfab-error' : undefined}
                disabled={loading}
              />
              {code && !loading && (
                <button
                  type="button"
                  className="gfab-input-clear"
                  onClick={() => { setCode(''); setError(''); inputRef.current?.focus(); }}
                  aria-label="Clear input"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                </button>
              )}
            </div>

            {error && (
              <div id="gfab-error" className="gfab-error" role="alert">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </div>
            )}

            <div className="gfab-modal-actions">
              <button
                type="button"
                className="gfab-btn-cancel"
                onClick={closeModal}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="gfab-btn-load"
                disabled={!code.trim() || loading}
              >
                {loading ? (
                  <span className="gfab-spinner" />
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 4C3 3.45 3.45 3 4 3H20C20.55 3 21 3.45 21 4V8.5C21 8.78 20.78 9 20.5 9C19.67 9 19 9.67 19 10.5C19 11.33 19.67 12 20.5 12C20.78 12 21 12.22 21 12.5V20C21 20.55 20.55 21 20 21H4C3.45 21 3 20.55 3 20V12.5C3 12.22 3.22 12 3.5 12C4.33 12 5 11.33 5 10.5C5 9.67 4.33 9 3.5 9C3.22 9 3 8.78 3 8.5V4Z" />
                    </svg>
                    Load Ticket
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Recent codes from localStorage */}
          <RecentCodes onSelect={(c) => { setCode(c); setError(''); }} />
        </div>
      </dialog>
    </>
  );
}

function RecentCodes({ onSelect }) {
  const [codes, setCodes] = useState([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('betxentra_recent_codes');
      if (stored) setCodes(JSON.parse(stored).slice(0, 5));
    } catch { /* ignore */ }
  }, []);

  if (!codes.length) return null;

  return (
    <div className="gfab-recent">
      <div className="gfab-recent-title">Recent codes</div>
      <div className="gfab-recent-list">
        {codes.map((c) => (
          <button
            key={c}
            type="button"
            className="gfab-recent-chip"
            onClick={() => onSelect(c)}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

// Helper: save a code to recent list
export function saveRecentCode(code) {
  try {
    const stored = localStorage.getItem('betxentra_recent_codes');
    let list = stored ? JSON.parse(stored) : [];
    list = [code, ...list.filter((c) => c !== code)].slice(0, 8);
    localStorage.setItem('betxentra_recent_codes', JSON.stringify(list));
  } catch { /* ignore */ }
}

import { useNavigate } from 'react-router-dom';

// History navigation: ← back / → forward. Back falls back to `fallback`
// when there is no history. navigate(N) wraps history.go(N), so a single
// call covers both react-router and the browser-native forward stack.
export default function PageBack({ fallback = '/', style }) {
  const navigate = useNavigate();

  const goBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(fallback);
    }
  };

  const goForward = () => {
    navigate(1);
  };

  const baseBtn = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '8px 12px',
    borderRadius: 10,
    border: '1px solid var(--surface-2, #2a2a2a)',
    background: 'var(--surface, transparent)',
    color: 'var(--text, #fff)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    font: 'inherit',
    minWidth: 44,
    minHeight: 36,
  };

  return (
    <nav
      className="page-nav"
      aria-label="History"
      style={{ display: 'inline-flex', gap: 6, marginBottom: 12, ...(style || {}) }}
    >
      <button type="button" onClick={goBack} aria-label="Go back" style={baseBtn}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Back
      </button>
      <button type="button" onClick={goForward} aria-label="Go forward" style={baseBtn}>
        Forward
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
    </nav>
  );
}

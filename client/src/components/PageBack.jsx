import { useNavigate } from 'react-router-dom';

// Compact back affordance for inner pages. Uses history.back when there is
// somewhere to go back to, otherwise falls back to the provided fallback
// route (defaults to /).
export default function PageBack({ fallback = '/', label = 'Back' }) {
  const navigate = useNavigate();

  const onClick = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(fallback);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="page-back"
      aria-label={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 12px',
        marginBottom: 12,
        borderRadius: 10,
        border: '1px solid var(--surface-2, #2a2a2a)',
        background: 'var(--surface, transparent)',
        color: 'var(--text, #fff)',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        font: 'inherit',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 18l-6-6 6-6" />
      </svg>
      {label}
    </button>
  );
}

import { useNavigate, useLocation } from 'react-router-dom';
import PageBack from '../components/PageBack.jsx';

const SUGGESTIONS = [
  { to: '/',         label: 'Sports' },
  { to: '/casino',   label: 'Casino' },
  { to: '/jackpot',  label: 'Jackpot' },
  { to: '/promos',   label: 'Promotions' },
  { to: '/my-bets',  label: 'My Bets' },
  { to: '/wallet',   label: 'Wallet' },
];

export default function NotFoundPage() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <main
      className="page-wrap"
      style={{
        minHeight: 'calc(100vh - 200px)',
        display: 'grid',
        placeItems: 'center',
        padding: '40px 20px 80px',
      }}
    >
      <div style={{ maxWidth: 520, width: '100%', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <PageBack />
        </div>

        <div
          aria-hidden="true"
          style={{
            fontSize: 88,
            fontWeight: 900,
            letterSpacing: '-0.04em',
            lineHeight: 1,
            color: 'var(--accent, #c5ff3d)',
            margin: '12px 0 4px',
          }}
        >404</div>
        <h1 style={{ margin: '4px 0 8px', fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em' }}>
          Page not found
        </h1>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-soft, #aaa)', lineHeight: 1.5 }}>
          We couldn't find <code style={{ background: 'var(--surface,#161616)', padding: '2px 6px', borderRadius: 6, fontSize: 12 }}>{location.pathname}</code>.
          It may have been moved or you might have followed a stale link.
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 22, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => navigate('/')}
            style={{
              padding: '12px 22px', borderRadius: 10, border: 'none',
              background: 'var(--accent, #c5ff3d)', color: 'var(--bg, #0b0b0b)',
              font: 'inherit', fontSize: 13.5, fontWeight: 800, cursor: 'pointer',
            }}
          >Go to homepage</button>
        </div>

        <p style={{ margin: '28px 0 8px', fontSize: 11, color: 'var(--text-dim, #666)', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>
          Try one of these
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s.to}
              type="button"
              onClick={() => navigate(s.to)}
              style={{
                padding: '8px 14px', borderRadius: 999,
                border: '1px solid var(--surface-2, #2a2a2a)',
                background: 'var(--surface, #161616)',
                color: 'var(--text, #fff)',
                font: 'inherit', fontSize: 12.5, fontWeight: 600,
                cursor: 'pointer',
              }}
            >{s.label}</button>
          ))}
        </div>
      </div>
    </main>
  );
}

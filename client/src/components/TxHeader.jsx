import { useNavigate } from 'react-router-dom';

const IconBack = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

const IconForward = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

const IconHome = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

/**
 * Shared green-gradient header used by Deposit dialog and Withdraw page.
 *
 * Callers may override any handler; the dialog version needs onBack/onForward/
 * onHome to also close the <dialog> before navigating away.
 *
 * Heading renders as <h3> inside a <dialog>, otherwise <h1>.
 */
export default function TxHeader({ title, onBack, onForward, onHelp, onHome, asDialog = false }) {
  const navigate = useNavigate();
  const Heading = asDialog ? 'h3' : 'h1';

  const back = onBack || (() => {
    if (typeof window !== 'undefined' && window.history.length > 1) navigate(-1);
    else navigate('/');
  });
  const forward = onForward || (() => {
    // navigate(1) is a no-op when there is no forward entry — safe to call.
    navigate(1);
  });
  const help = onHelp || (() => navigate('/help'));
  const home = onHome || (() => navigate('/'));

  return (
    <div className="tx-header">
      <button type="button" className="tx-header__btn" onClick={back} aria-label="Back">
        <IconBack />
      </button>
      <button type="button" className="tx-header__btn" onClick={forward} aria-label="Forward">
        <IconForward />
      </button>
      <Heading>{title}</Heading>
      <button type="button" className="tx-header__btn tx-header__btn--circle" onClick={help} aria-label="Help">?</button>
      <button type="button" className="tx-header__btn" onClick={home} aria-label="Home">
        <IconHome />
      </button>
    </div>
  );
}

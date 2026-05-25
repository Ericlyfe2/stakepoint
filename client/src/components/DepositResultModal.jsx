import React, { useEffect, useRef } from 'react';

/**
 * Centered in-app modal that pops up when a deposit decision arrives.
 *
 * Why a real modal (not just the toast):
 *  - Toasts disappear after a few seconds. A deposit decision is money-related
 *    and the user must see it.
 *  - OS-level browser notifications need permission; many users decline. This
 *    modal renders unconditionally so the message is guaranteed visible.
 *
 * Renders nothing when `result` is null. Calls `onClose` when the user
 * dismisses; the parent provider is responsible for clearing the result so
 * back-to-back decisions can each show their own modal.
 */
export default function DepositResultModal({ result, onClose }) {
  const dlgRef = useRef(null);

  useEffect(() => {
    const dlg = dlgRef.current;
    if (!dlg) return;
    if (result && !dlg.open) {
      // showModal() throws if already open; guarding above keeps StrictMode happy.
      try { dlg.showModal(); } catch { /* already open */ }
    } else if (!result && dlg.open) {
      try { dlg.close(); } catch { /* already closed */ }
    }
  }, [result]);

  if (!result) return <dialog ref={dlgRef} className="deposit-result-dlg" />;

  const approved = result.kind === 'approved';
  const amt = Number(result.amount || 0).toLocaleString('en-GH', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });

  return (
    <dialog
      ref={dlgRef}
      className="deposit-result-dlg"
      onClose={onClose}
      onClick={(e) => { if (e.target === dlgRef.current) onClose?.(); }}
      style={{
        border: 'none', borderRadius: 14, padding: 0, width: 'min(92vw, 380px)',
        background: 'var(--bg, #0f1411)', color: 'var(--text, #e7efea)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
      }}
    >
      <div style={{ padding: '28px 24px 22px', textAlign: 'center' }}>
        <div
          aria-hidden="true"
          style={{
            width: 72, height: 72, borderRadius: '50%', margin: '0 auto 18px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: approved ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
            color: approved ? '#22c55e' : '#ef4444',
            fontSize: 38, fontWeight: 900, lineHeight: 1,
          }}
        >
          {approved ? '✓' : '✕'}
        </div>

        <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800 }}>
          {approved ? 'Deposit approved' : 'Deposit rejected'}
        </h2>

        <p style={{ margin: '0 0 4px', fontSize: 15, color: 'var(--text-soft, #b8c5be)' }}>
          {approved
            ? `GHS ${amt} has been credited to your wallet.`
            : `Your GHS ${amt} deposit was not approved.`}
        </p>

        {!approved && result.reason && (
          <p style={{
            margin: '12px 0 0', fontSize: 13, color: 'var(--text-dim, #8a9a92)',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 8, padding: '10px 12px',
          }}>
            <strong style={{ color: '#ef4444' }}>Reason:</strong> {result.reason}
          </p>
        )}

        <button
          type="button"
          autoFocus
          onClick={onClose}
          style={{
            width: '100%', marginTop: 22, padding: '12px 0', borderRadius: 10, border: 'none',
            background: approved
              ? 'linear-gradient(135deg, #22c55e, #16a34a)'
              : 'var(--surface-2, #1a221d)',
            color: approved ? '#0a0d0c' : 'var(--text, #e7efea)',
            fontWeight: 800, fontSize: 15, cursor: 'pointer',
          }}
        >
          OK
        </button>
      </div>
    </dialog>
  );
}

import { useState } from 'react';

const NETWORKS = [
  { key: 'mtn',      label: 'MTN',          tag: 'MTN', bg: '#ffcc00', fg: '#000' },
  { key: 'telecel',  label: 'Telecel',      tag: 'TLC', bg: '#e60000', fg: '#fff' },
  { key: 'at',       label: 'AirtelTigo',   tag: 'AT',  bg: '#0055ff', fg: '#fff' },
];

const STEPS = {
  mtn: [
    'Dial *170# on your MTN line',
    'Choose 1. Transfer Money',
    'Choose 2. MoMoPay & Pay Bill',
    'Choose 2. Pay Bill',
    'Enter the Paybill ID shown above',
    'Enter your Pay ID (Account Reference)',
    'Enter the amount and confirm with your MoMo PIN',
  ],
  telecel: [
    'Dial *110# on your Telecel line',
    'Choose 3. Make Payment',
    'Choose 1. Pay Merchant',
    'Enter the Paybill ID shown above',
    'Enter your Pay ID (Account Reference)',
    'Enter the amount and confirm with your PIN',
  ],
  at: [
    'Dial *110# on your AirtelTigo line',
    'Choose Payments',
    'Choose Pay Bill / Merchant',
    'Enter the Paybill ID shown above',
    'Enter your Pay ID (Account Reference)',
    'Enter the amount and confirm with your PIN',
  ],
};

function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(String(value));
      } else {
        const ta = document.createElement('textarea');
        ta.value = String(value);
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — silently ignore */
    }
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={`Copy ${label}`}
      style={{
        padding: '6px 10px',
        borderRadius: 6,
        border: '1px solid var(--line)',
        background: copied ? 'var(--accent)' : 'var(--surface-2)',
        color: copied ? '#0a0d0c' : 'var(--text)',
        fontWeight: 700, fontSize: 12, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        transition: 'background 120ms ease, color 120ms ease',
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export default function PaybillInstructions({
  paybillId = '222000',
  accountRef,
  context = 'deposit', // 'deposit' | 'withdraw'
}) {
  const [network, setNetwork] = useState('mtn');
  const active = NETWORKS.find((n) => n.key === network) || NETWORKS[0];
  const steps = STEPS[network];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Network chips */}
      <div role="tablist" aria-label="Network" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {NETWORKS.map((n) => {
          const selected = n.key === network;
          return (
            <button
              key={n.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setNetwork(n.key)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '10px 0', borderRadius: 8,
                background: selected ? 'var(--surface)' : 'var(--surface-2)',
                border: selected ? '1px solid var(--accent)' : '1px solid var(--line)',
                color: 'var(--text)', fontWeight: 700, fontSize: 13, cursor: 'pointer',
              }}
            >
              <span style={{
                width: 24, height: 24, borderRadius: 4, background: n.bg, color: n.fg,
                fontSize: 9, fontWeight: 900, display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center', lineHeight: 1,
              }}>
                {n.tag}
              </span>
              {n.label}
            </button>
          );
        })}
      </div>

      {/* Paybill ID + Reference */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Paybill ID</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '0.05em' }}>{paybillId}</div>
          </div>
          <CopyButton value={paybillId} label="Paybill ID" />
        </div>
        <div style={{ height: 1, background: 'var(--line)' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Pay ID (Account Reference)</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', wordBreak: 'break-all' }}>
              {accountRef || '—'}
            </div>
          </div>
          {accountRef && <CopyButton value={accountRef} label="Pay ID" />}
        </div>
      </div>

      {/* Step-by-step */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{
            width: 22, height: 22, borderRadius: 4, background: active.bg, color: active.fg,
            fontSize: 9, fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {active.tag}
          </span>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>
            {active.label} — Step by step
          </div>
        </div>
        <ol style={{ paddingLeft: 20, margin: 0, fontSize: 13, color: 'var(--text-soft)', lineHeight: 1.7 }}>
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </div>

      {/* Footer note */}
      <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
        {context === 'withdraw' ? (
          <>Funds requested via paybill route are paid out to the mobile number registered on your account. Use the <strong>Mobile Money</strong> tab for instant withdrawals.</>
        ) : (
          <>Your account is credited automatically once the paybill payment is confirmed. This usually takes under a minute.</>
        )}
      </div>
    </div>
  );
}

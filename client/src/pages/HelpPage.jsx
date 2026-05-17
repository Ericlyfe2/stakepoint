import { useState } from 'react';
import { useToast, useAccount } from '../providers/AccountProvider.jsx';
import { submitTicket } from '../api/betApi.js';
import PageBack from '../components/PageBack.jsx';

const FAQ = [
  {
    q: 'How long do deposits take to reflect in my account?',
    a: 'MoMo, Vodafone Cash and AirtelTigo deposits are instant. Card deposits clear within 2 minutes.',
  },
  {
    q: 'What is the minimum deposit?',
    a: 'GHS 300 is the minimum deposit on every method. There is no maximum on a single deposit, but daily limits apply.',
  },
  {
    q: 'What is the minimum withdrawal?',
    a: 'GHS 10,000 is the minimum withdrawal. You must also have lifetime deposits of at least 10% of the amount you want to withdraw before a request can be processed.',
  },
  {
    q: 'When are my bets settled?',
    a: 'Pre-match singles settle within 60 seconds of the final whistle. Live bets settle the moment the relevant market is resolved. Multiples settle once every leg has resolved.',
  },
  {
    q: 'How does cash-out work?',
    a: 'Open the My Bets tab and tap “Cash out” on any eligible bet. The offer updates in real time with the live price.',
  },
  {
    q: 'I forgot my password — what do I do?',
    a: 'Email support@xenbet.gh from your registered address with the subject “Password reset”. We will verify and re-set it within an hour.',
  },
];

export default function HelpPage() {
  const { toast } = useToast();
  const { account } = useAccount();
  const [open, setOpen] = useState(0);
  const [name, setName] = useState(account?.displayName || '');
  const [msg, setMsg] = useState('');
  const [topic, setTopic] = useState('Wallet');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !msg.trim()) return;
    setBusy(true);
    try {
      await submitTicket({ name: name.trim(), email: account?.email || '', topic, body: msg.trim() });
      toast(`Thanks, ${name}. A support agent will reply within 30 minutes.`);
      setMsg('');
    } catch (err) {
      toast(err.message || 'Could not send. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page-wrap" style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px 80px' }}>
      <PageBack />
      <header className="page-head" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 36, letterSpacing: '-0.02em' }}>Help &amp; Support</h1>
        <p style={{ color: 'var(--text-soft)', marginTop: 6 }}>
          24/7 live chat in-app. Below: the questions we get every day, and a direct line to a real human.
        </p>
      </header>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12, color: 'var(--text)' }}>Frequently asked</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          {FAQ.map((item, i) => (
            <details key={item.q}
                     open={open === i}
                     onToggle={(e) => { if (e.currentTarget.open) setOpen(i); }}
                     style={{
                       background: 'var(--surface)',
                       border: '1px solid var(--line)',
                       borderRadius: 'var(--r)',
                       padding: '14px 18px',
                     }}>
              <summary style={{
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
                listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                {item.q}
                <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{open === i ? '−' : '+'}</span>
              </summary>
              <p style={{ marginTop: 10, color: 'var(--text-soft)', fontSize: 14, lineHeight: 1.7 }}>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section style={{
        padding: 28, background: 'var(--surface)',
        border: '1px solid var(--line)', borderRadius: 'var(--r-lg)',
      }}>
        <h2 style={{ fontSize: 18, marginBottom: 6 }}>Contact us</h2>
        <p style={{ color: 'var(--text-soft)', fontSize: 13, marginBottom: 18 }}>
          We reply to most messages within 30 minutes.
          Or email <a href="mailto:support@xenbet.gh" style={{ color: 'var(--accent)' }}>support@xenbet.gh</a>.
        </p>
        <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
            <label style={fieldStyle}>
              <span style={labelStyle}>Your name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required
                     style={inputStyle} placeholder="Kwame A." />
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>Topic</span>
              <select value={topic} onChange={(e) => setTopic(e.target.value)} style={inputStyle}>
                <option>Wallet</option>
                <option>Bet settlement</option>
                <option>Account / KYC</option>
                <option>Bonus / promo</option>
                <option>Other</option>
              </select>
            </label>
          </div>
          <label style={fieldStyle}>
            <span style={labelStyle}>Message</span>
            <textarea rows={5} value={msg} onChange={(e) => setMsg(e.target.value)} required
                      style={{ ...inputStyle, resize: 'vertical' }} placeholder="Describe the issue. Include bet IDs or transaction references where possible." />
          </label>
          <button type="submit" className="btn btn-primary" style={{ width: 'fit-content' }} disabled={busy}>
            {busy ? 'Sending…' : 'Send to support'}
          </button>
        </form>
      </section>
    </main>
  );
}

const fieldStyle = { display: 'grid', gap: 6 };
const labelStyle = { fontSize: 12, color: 'var(--text-soft)', fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase' };
const inputStyle = {
  background: 'var(--bg-soft)',
  color: 'var(--text)',
  border: '1px solid var(--line-strong)',
  borderRadius: 10,
  padding: '10px 12px',
  font: 'inherit',
  outline: 'none',
};

/**
 * Wallet — port of the Claude Design OddTxScreen.
 * Headline transaction count, filter pills, transaction rows with type icon,
 * status chip, and signed amount. Wired to /api/wallet/transactions.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchTransactions } from '../api/betApi.js';
import { useAccount } from '../providers/AccountProvider.jsx';
import {
  T, fmtCedi,
  OddPageHeader, OddStatusChip, OddIcon,
} from '../components/odd/primitives.jsx';

const FILTERS = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'dep', label: 'Deposits',    match: (t) => t.type === 'deposit' || t.kind === 'Deposit' },
  { id: 'wdl', label: 'Withdrawals', match: (t) => t.type === 'withdraw' || t.type === 'withdrawal' || t.kind === 'Withdraw' || t.kind === 'Withdrawal' },
  { id: 'stk', label: 'Stakes',      match: (t) => t.type === 'bet_placed' || t.kind === 'Stake' },
  { id: 'pay', label: 'Payouts',     match: (t) => t.type === 'bet_won' || t.type === 'cash_out' || t.kind === 'Payout' },
];

const TX_LABEL = {
  deposit:       'Deposit',
  withdraw:      'Withdrawal',
  withdrawal:    'Withdrawal',
  bet_placed:    'Stake',
  bet_won:       'Payout',
  bet_lost:      'Bet lost',
  cash_out:      'Cash-out',
  jackpot_entry: 'Jackpot entry',
};

const ICON_MAP = {
  Deposit: 'deposit',
  Withdrawal: 'upload',
  Stake: 'ticket',
  Payout: 'trophy',
  Cashout: 'refresh',
};

function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GH', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}

export default function WalletPage() {
  const navigate = useNavigate();
  const { account } = useAccount();
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterId, setFilterId] = useState('all');

  useEffect(() => {
    if (!account) return;
    let alive = true;
    setLoading(true);
    fetchTransactions()
      .then((d) => { if (alive) setTxs(d?.transactions || d?.items || []); })
      .catch(() => { if (alive) setTxs([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [account]);

  const filtered = useMemo(() => {
    const f = FILTERS.find(x => x.id === filterId) || FILTERS[0];
    return txs.filter(f.match);
  }, [txs, filterId]);

  if (!account) {
    return (
      <div style={{ background: T.bg, minHeight: '100vh', paddingBottom: 120 }}>
        <OddPageHeader title="Wallet" subtitle="Sign in to view transactions" />
        <div style={{ padding: '40px 24px', textAlign: 'center' }}>
          <OddIcon name="wallet" size={32} color={T.inkDim} />
          <div style={{ fontWeight: 700, fontSize: 16, color: T.ink, marginTop: 12 }}>
            Sign in to see your transactions
          </div>
          <button type="button" onClick={() => navigate('/login?next=/wallet')}
            style={{
              marginTop: 16, padding: '12px 24px', borderRadius: 999,
              background: T.greenBright, color: T.goldDark,
              fontWeight: 700, fontSize: 13, border: 0, cursor: 'pointer',
            }}>Sign in</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: T.bg, minHeight: '100vh', paddingBottom: 120 }}>
      <OddPageHeader title="Transactions" subtitle="Your account activity" />

      <div style={{ padding: '16px 16px 4px' }}>
        <div style={{ fontSize: 12, color: T.inkSoft }}>Total transactions</div>
        <div style={{
          fontSize: 30, fontWeight: 700, color: T.ink, letterSpacing: -0.6,
          fontFamily: '"Space Grotesk", system-ui, sans-serif',
          fontVariantNumeric: 'tabular-nums',
        }}>{txs.length}</div>
      </div>

      <div className="odd-pane" style={{
        padding: '6px 16px 0', display: 'flex', gap: 6, overflowX: 'auto',
      }}>
        {FILTERS.map(f => {
          const active = f.id === filterId;
          return (
            <button key={f.id} type="button" onClick={() => setFilterId(f.id)} style={{
              padding: '6px 12px', borderRadius: 999,
              background: active ? T.greenBright : T.surface,
              color: active ? T.goldDark : T.ink,
              border: active ? 0 : `1px solid ${T.line}`,
              fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer',
            }}>{f.label}</button>
          );
        })}
      </div>

      <div style={{
        padding: '14px 16px',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {loading ? (
          [0, 1, 2, 3].map(i => (
            <div key={i} style={{
              height: 68, borderRadius: 14, background: T.surface,
              border: `1px solid ${T.line}`, opacity: 0.6 + (i % 3) * 0.15,
            }} />
          ))
        ) : filtered.length === 0 ? (
          <div style={{
            padding: '40px 24px', textAlign: 'center',
            background: T.surface, borderRadius: 14, border: `1px solid ${T.line}`,
            color: T.inkSoft, fontSize: 13,
          }}>
            No transactions to show.
          </div>
        ) : (
          filtered.map(t => <TxRow key={t.id || `${t.type}-${t.createdAt}`} tx={t} />)
        )}
      </div>
    </div>
  );
}

function TxRow({ tx }) {
  const amount = Number(tx.amount || 0);
  const isIn = amount > 0;
  const labelRaw = TX_LABEL[tx.type] || tx.kind || tx.type || 'Transaction';
  const iconName = ICON_MAP[labelRaw] || (isIn ? 'deposit' : 'upload');
  const status = tx.status || (tx.completedAt ? 'won' : 'pending');
  const date = tx.completedAt || tx.createdAt || tx.date;

  return (
    <div style={{
      background: T.surface, borderRadius: 14,
      border: `1px solid ${T.line}`,
      padding: '12px 14px',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 12,
        background: isIn ? T.greenSoft : T.surfaceAlt,
        color: isIn ? T.greenBright : T.inkSoft,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <OddIcon name={iconName} size={18} color={isIn ? T.greenBright : T.inkSoft} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{labelRaw}</span>
          <OddStatusChip kind={status} label={String(status).toUpperCase()} />
        </div>
        <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 2 }}>
          {typeof date === 'string' && date.includes('T') ? fmtDateTime(date) : date}
        </div>
      </div>
      <div style={{
        fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
        color: isIn ? T.greenBright : T.danger,
      }}>{isIn ? '+' : '−'} GHS {fmtCedi(amount)}</div>
    </div>
  );
}

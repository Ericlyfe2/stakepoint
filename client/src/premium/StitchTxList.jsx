import { formatAmt } from '../lib/betslipEngine.js';

/* ---------------------------------------------------------------------------
   Stitch — shared wallet transaction list.

   Renders the REAL transaction records returned by /wallet/transactions (the
   page hooks merge in the local cache). Every row is a real movement; there is
   no placeholder row.
   ------------------------------------------------------------------------- */

export const TX_LABEL = {
  deposit: 'Deposit',
  deposit_approve: 'Deposit approve',
  withdraw: 'Withdrawal',
  withdrawal: 'Withdrawal',
  bet_placed: 'Bet placed',
  bet_won: 'Bet won',
  bet_lost: 'Bet lost',
  cash_out: 'Cash-out',
  jackpot_entry: 'Jackpot entry',
  referral_bonus: 'Referral bonus',
};

export function relTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString('en-GH', { day: '2-digit', month: 'short' });
}

function statusPill(t) {
  if (t.status === 'pending') return { tone: 'pending', label: 'Pending' };
  if (t.status === 'rejected') return { tone: 'rejected', label: 'Rejected' };
  if (t.status === 'completed') return { tone: 'approved', label: 'Approved' };
  return null;
}

export default function StitchTxList({ txs = [], limit, empty = 'No transactions yet.' }) {
  const list = typeof limit === 'number' ? txs.slice(0, limit) : txs;

  if (!list.length) {
    return <p className="stx-bets-empty-note stx-muted">{empty}</p>;
  }

  return (
    <ul className="stx-tx-list">
      {list.map((t) => {
        const credit = Number(t.amount ?? 0) > 0;
        const pill = statusPill(t);
        return (
          <li key={t.id} className="stx-tx">
            <span className={`stx-tx-icon stx-tx-icon--${credit ? 'credit' : 'debit'}`} aria-hidden="true">
              {credit ? '↓' : '↑'}
            </span>
            <span className="stx-tx-body">
              <span className="stx-tx-title">{TX_LABEL[t.kind] || t.kind}</span>
              <span className="stx-tx-meta">
                {relTime(t.at || t.createdAt)}
                {pill && <span className={`stx-tx-pill stx-tx-pill--${pill.tone}`}>{pill.label}</span>}
              </span>
            </span>
            <span className={`stx-tx-amt stx-tx-amt--${credit ? 'credit' : 'debit'}`}>
              {credit ? '+' : '-'}GHS {formatAmt(Math.abs(Number(t.amount || 0)))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

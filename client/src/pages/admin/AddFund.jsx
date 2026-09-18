/**
 * Add Fund — a focused, standalone flow for crediting or debiting a
 * player's wallet directly (bonuses, goodwill credits, manual top-ups,
 * corrections, clawbacks, etc.).
 *
 * Reuses the same audited endpoint as the "Adjust wallet" action buried in
 * the Users drawer (`PATCH /admin/users/:id/wallet`, finance_admin+), just
 * surfaced as its own page for the common "find a player, add or remove
 * money" workflow instead of requiring a detour through the full user
 * record. A positive delta credits, a negative delta debits.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { useAdmin } from '../../providers/AdminProvider.jsx';
import { adminListUsers, adminUserWallet } from '../../api/adminApi.js';
import { Card, Badge, Empty, moneyFmt, ago } from '../../components/admin/primitives.jsx';
import { IconSearch, IconCash, IconCheck } from '../../components/admin/Icons.jsx';

function IconMinus({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
    </svg>
  );
}

const QUICK_AMOUNTS = [50, 100, 500, 1000, 5000];

export default function AddFundPage() {
  const { can, showToast } = useAdmin();
  const allowed = can('finance.adjustments');

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);

  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const [history, setHistory] = useState([]); // this-session record of what was added
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await adminListUsers({ q, limit: 8 });
        setResults(data?.users || []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const pickUser = useCallback((u) => {
    setSelected(u);
    setResults([]);
    setQuery('');
    setErr('');
    setAmount('');
    setReason('');
  }, []);

  const adjustWallet = useCallback(async (direction) => {
    setErr('');
    if (!selected) { setErr('Pick a user first.'); return; }
    const n = parseFloat(String(amount).replace(/,/g, ''));
    if (!Number.isFinite(n) || n <= 0) { setErr('Enter a valid amount greater than 0.'); return; }
    if (!reason.trim() || reason.trim().length < 2) { setErr('A reason is required — it is recorded in the audit log.'); return; }
    if (direction === 'debit' && n > selected.balance) {
      setErr(`Cannot remove more than the current balance (${moneyFmt(selected.balance)}).`);
      return;
    }

    const delta = direction === 'debit' ? -n : n;
    setSubmitting(true);
    try {
      const data = await adminUserWallet(selected.id, delta, reason.trim());
      const nextBalance = data?.user?.balance ?? (selected.balance + delta);
      setSelected((prev) => prev ? { ...prev, balance: nextBalance } : prev);
      setHistory((prev) => [{
        id: data?.transaction?.id || `local-${Date.now()}`,
        userId: selected.id,
        userLabel: selected.displayName || selected.email,
        direction,
        amount: n,
        reason: reason.trim(),
        balanceAfter: nextBalance,
        at: new Date().toISOString(),
      }, ...prev].slice(0, 20));
      showToast(`${direction === 'debit' ? 'Removed' : 'Added'} GHS ${n.toLocaleString('en-US')} ${direction === 'debit' ? 'from' : 'to'} ${selected.displayName || selected.email}.`);
      setAmount('');
      setReason('');
    } catch (e2) {
      setErr(e2?.message || `Could not ${direction === 'debit' ? 'remove' : 'add'} funds.`);
    } finally {
      setSubmitting(false);
    }
  }, [selected, amount, reason, showToast]);

  const submitAdd = useCallback((e) => { e.preventDefault(); adjustWallet('credit'); }, [adjustWallet]);
  const removeFund = useCallback(() => { adjustWallet('debit'); }, [adjustWallet]);

  if (!allowed) {
    return (
      <Card title="Add Fund">
        <Empty title="No access" subtitle="Your admin role doesn't include finance.adjustments." />
      </Card>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 720 }}>
      <Card
        title="Add Fund"
        subtitle="Search a player, then credit or remove funds from their wallet directly. Every adjustment is recorded on their transaction history and the audit log."
      >
        <div style={{ position: 'relative', marginBottom: selected ? 16 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-soft)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
            <IconSearch size={16} />
            <input
              className="adm-input"
              style={{ border: 'none', background: 'transparent', flex: 1, padding: 0 }}
              placeholder="Search by name, email or user id…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search users"
            />
            {searching && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Searching…</span>}
          </div>

          {results.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
              marginTop: 6, background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 10, overflow: 'hidden', boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
            }}>
              {results.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => pickUser(u)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    width: '100%', textAlign: 'left', padding: '10px 12px', background: 'transparent',
                    border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text)',
                  }}
                >
                  <span>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{u.displayName || u.email}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{u.email}</div>
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{moneyFmt(u.balance)}</span>
                </button>
              ))}
            </div>
          )}
          {query.trim().length >= 2 && !searching && results.length === 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: 'var(--text-dim)' }}>
              No matching users.
            </div>
          )}
        </div>

        {selected && (
          <form onSubmit={submitAdd} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              padding: '12px 14px', borderRadius: 10, background: 'var(--surface-soft)', border: '1px solid var(--border)',
            }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14.5 }}>{selected.displayName || selected.email}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{selected.email} · {selected.id}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Current balance</div>
                <div style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{moneyFmt(selected.balance)}</div>
              </div>
              <button type="button" className="adm-btn ghost" onClick={() => setSelected(null)}>Change</button>
            </div>

            <div className="adm-field">
              <label>Amount (GHS)</label>
              <input
                className="adm-input"
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
                required
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {QUICK_AMOUNTS.map((n) => (
                  <button key={n} type="button" className="adm-btn" style={{ padding: '6px 12px', fontSize: 12.5 }} onClick={() => setAmount(String(n))}>
                    +{n.toLocaleString('en-US')}
                  </button>
                ))}
              </div>
            </div>

            <div className="adm-field">
              <label>Reason (required, recorded in audit log)</label>
              <input
                className="adm-input"
                placeholder="e.g. Goodwill credit — support ticket #4821"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                minLength={2}
              />
            </div>

            {err && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#ef4444' }}>
                {err}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
              <button type="submit" className="adm-btn primary" disabled={submitting} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <IconCash size={14} /> {submitting ? 'Adding…' : 'Add Fund'}
              </button>
              <button
                type="button"
                className="adm-btn danger"
                disabled={submitting}
                onClick={removeFund}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                <IconMinus size={14} /> {submitting ? 'Removing…' : 'Remove Fund'}
              </button>
            </div>
          </form>
        )}
      </Card>

      {history.length > 0 && (
        <Card title="Adjusted this session" subtitle="Local record for this browser tab only — the full history lives on each user's transactions.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.map((h) => {
              const isDebit = h.direction === 'debit';
              return (
                <div key={h.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--surface-soft)', border: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{h.userLabel}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{h.reason}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, color: isDebit ? '#ef4444' : '#22c55e', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {isDebit ? <IconMinus size={12} /> : <IconCheck size={12} />} {isDebit ? '-' : '+'}{moneyFmt(h.amount)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{ago(h.at)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {!selected && history.length === 0 && (
        <Card>
          <Badge tone="default">Tip</Badge>
          <p style={{ marginTop: 8, fontSize: 13, color: 'var(--text-dim)' }}>
            Search for a player above to credit or remove funds from their
            wallet. This uses the same audited adjustment endpoint as the
            wallet action on the Users page — amounts are applied to the
            balance immediately and appear on the player's transaction
            history as <code>admin_adjust</code>. Removals can't exceed the
            player's current balance.
          </p>
        </Card>
      )}
    </div>
  );
}

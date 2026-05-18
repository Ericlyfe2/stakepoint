/**
 * Admin bet management.
 *   GET    /                   list with filters
 *   GET    /live               currently-live bets (status=open with live legs)
 *   GET    /:id                full receipt
 *   POST   /:id/settle         body { result: 'won'|'lost'|'void' }   credits/debits user
 *   POST   /:id/cancel         refund stake, set status=cancelled
 *   POST   /:id/note           moderator note
 */
import { Router } from 'express';
import { z } from 'zod';
import { createStore } from '../../db/store.js';
import { allUsers, getUserById, updateUser, logActivity } from '../../db/users.js';
import { requireAdmin, requireRole, audit } from '../../middleware/adminAuth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { badRequest, conflict, notFound } from '../../utils/httpError.js';

const router = Router();

const betsStore = createStore('bets', {});
const txStore   = createStore('transactions', {});

function pushTx(userId, tx) {
  const id = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const entry = { id, userId, at: new Date().toISOString(), ...tx };
  const list = txStore.get(userId) || [];
  txStore.set(userId, [entry, ...list].slice(0, 500));
  return entry;
}

function enrich(bet) {
  if (!bet) return null;
  const u = getUserById(bet.userId);
  return {
    ...bet,
    user: u ? { id: u.id, email: u.email, displayName: u.displayName } : null,
  };
}

router.get('/', requireAdmin, (req, res) => {
  const { q, status, mode, userId, from, to, sort = 'placedAt', dir = 'desc', limit = 100, offset = 0 } = req.query;
  let rows = Object.values(betsStore.all() || {});

  if (status && status !== 'all') rows = rows.filter((b) => b.status === status);
  if (mode   && mode   !== 'all') rows = rows.filter((b) => b.mode === mode);
  if (userId) rows = rows.filter((b) => b.userId === String(userId).toLowerCase());
  if (q) {
    const needle = String(q).toLowerCase();
    rows = rows.filter((b) =>
      b.id.toLowerCase().includes(needle) ||
      (b.userId || '').toLowerCase().includes(needle) ||
      (b.legs || []).some((l) => `${l.home} ${l.away} ${l.market} ${l.outcome}`.toLowerCase().includes(needle))
    );
  }
  if (from) rows = rows.filter((b) => new Date(b.placedAt) >= new Date(from));
  if (to)   rows = rows.filter((b) => new Date(b.placedAt) <= new Date(to));

  rows.sort((a, b) => {
    const av = a[sort] ?? '';
    const bv = b[sort] ?? '';
    if (av === bv) return 0;
    return (av < bv ? -1 : 1) * (dir === 'asc' ? 1 : -1);
  });

  const total = rows.length;
  const lim = Math.min(Number(limit) || 100, 1000);
  const off = Math.max(Number(offset) || 0, 0);
  const slice = rows.slice(off, off + lim).map(enrich);

  // Summary cards
  const summary = {
    open:       rows.filter((b) => b.status === 'open').length,
    won:        rows.filter((b) => b.status === 'won').length,
    lost:       rows.filter((b) => b.status === 'lost').length,
    void:       rows.filter((b) => b.status === 'void').length,
    cashedOut:  rows.filter((b) => b.status === 'cashed_out').length,
    cancelled:  rows.filter((b) => b.status === 'cancelled').length,
    stake:      Number(rows.reduce((s, b) => s + (b.stake || 0), 0).toFixed(2)),
    potential:  Number(rows.reduce((s, b) => s + (b.potentialWin || 0), 0).toFixed(2)),
  };

  res.json({ total, offset: off, limit: lim, summary, bets: slice });
});

router.get('/live', requireAdmin, (_req, res) => {
  const rows = Object.values(betsStore.all() || {})
    .filter((b) => b.status === 'open')
    .sort((a, b) => (a.placedAt < b.placedAt ? 1 : -1))
    .slice(0, 100)
    .map(enrich);
  res.json({ bets: rows });
});

router.get('/:id', requireAdmin, (req, res, next) => {
  const bet = betsStore.get(req.params.id);
  if (!bet) return next(notFound('Bet not found'));
  res.json({ bet: enrich(bet) });
});

router.post('/:id/settle',
  requireAdmin, requireRole('odds_manager', 'finance_admin'),
  validate(z.object({
    result: z.enum(['won', 'lost', 'void']),
    payoutOverride: z.number().nonnegative().optional(),
    reason: z.string().max(500).optional(),
  })),
  asyncHandler(async (req, res) => {
    const bet = betsStore.get(req.params.id);
    if (!bet) throw notFound('Bet not found');
    if (bet.status !== 'open') throw conflict('Bet already settled.');

    const user = getUserById(bet.userId);
    if (!user) throw notFound('Bet owner not found.');

    const { result, payoutOverride, reason } = req.body;
    let credit = 0;
    if (result === 'won')  credit = payoutOverride ?? bet.potentialWin;
    if (result === 'void') credit = bet.stake;
    if (result === 'lost') credit = 0;

    const updatedBet = { ...bet, status: result, settledAt: new Date().toISOString(), settledBy: req.admin.email, settleReason: reason || null, settledPayout: credit };
    betsStore.set(bet.id, updatedBet);

    let updatedUser = user;
    if (credit > 0) {
      updatedUser = updateUser(user.id, { balance: Number((user.balance + credit).toFixed(2)) });
      pushTx(user.id, { kind: result === 'won' ? 'bet_won' : 'bet_void_refund', amount: credit, status: 'completed', balanceAfter: updatedUser.balance, ref: bet.id });
    }
    logActivity(user.id, { kind: `bet_${result}`, betId: bet.id, credit });
    audit(req, { action: `bet.settle.${result}`, target: bet.id, targetType: 'bet', severity: result === 'void' ? 'warning' : 'info', meta: { credit, reason, userId: user.id } });

    res.json({ bet: enrich(updatedBet) });
  })
);

router.post('/:id/cancel',
  requireAdmin, requireRole('odds_manager', 'finance_admin', 'moderator'),
  validate(z.object({ reason: z.string().min(2).max(500) })),
  asyncHandler(async (req, res) => {
    const bet = betsStore.get(req.params.id);
    if (!bet) throw notFound('Bet not found');
    if (bet.status === 'cancelled') throw conflict('Bet already cancelled.');
    if (bet.status === 'cashed_out') throw conflict('Cannot cancel a cashed-out bet.');

    const user = getUserById(bet.userId);
    if (!user) throw notFound('Bet owner not found.');

    const refund = bet.status === 'open' ? bet.stake : 0;
    const updatedBet = { ...bet, status: 'cancelled', cancelledAt: new Date().toISOString(), cancelledBy: req.admin.email, cancelReason: req.body.reason };
    betsStore.set(bet.id, updatedBet);

    let updatedUser = user;
    if (refund > 0) {
      updatedUser = updateUser(user.id, { balance: Number((user.balance + refund).toFixed(2)) });
      pushTx(user.id, { kind: 'bet_cancel_refund', amount: refund, status: 'completed', balanceAfter: updatedUser.balance, ref: bet.id });
    }
    logActivity(user.id, { kind: 'bet_cancelled', betId: bet.id, refund });
    audit(req, { action: 'bet.cancel', target: bet.id, targetType: 'bet', severity: 'warning', meta: { refund, reason: req.body.reason } });
    res.json({ bet: enrich(updatedBet) });
  })
);

router.post('/:id/note',
  requireAdmin,
  validate(z.object({ note: z.string().min(1).max(1000) })),
  (req, res, next) => {
    const bet = betsStore.get(req.params.id);
    if (!bet) return next(notFound('Bet not found'));
    const notes = bet.adminNotes || [];
    const entry = { at: new Date().toISOString(), by: req.admin.email, note: req.body.note };
    const updated = { ...bet, adminNotes: [entry, ...notes].slice(0, 50) };
    betsStore.set(bet.id, updated);
    audit(req, { action: 'bet.note', target: bet.id, targetType: 'bet' });
    res.json({ bet: enrich(updated) });
  }
);

/* ─── Bulk operations ─── */
const bulkSchema = z.object({
  action: z.enum(['settle', 'cancel']),
  betIds: z.array(z.string()).min(1).max(200),
  result: z.enum(['won', 'lost', 'void']).optional(),
  payoutOverride: z.number().nonnegative().optional(),
  reason: z.string().max(500).optional(),
});

router.post('/bulk',
  requireAdmin, requireRole('odds_manager', 'finance_admin'),
  validate(bulkSchema),
  asyncHandler(async (req, res) => {
    const { action, betIds, result, payoutOverride, reason } = req.body;
    const results = [];

    for (const id of betIds) {
      try {
        const bet = betsStore.get(id);
        if (!bet) { results.push({ betId: id, status: 'error', error: 'Not found' }); continue; }
        if (action === 'settle') {
          if (bet.status !== 'open') { results.push({ betId: id, status: 'error', error: `Already ${bet.status}` }); continue; }
          const user = getUserById(bet.userId);
          if (!user) { results.push({ betId: id, status: 'error', error: 'User not found' }); continue; }
          const r = result || 'lost';
          let credit = 0;
          if (r === 'won')  credit = payoutOverride ?? bet.potentialWin;
          if (r === 'void') credit = bet.stake;
          const updatedBet = { ...bet, status: r, settledAt: new Date().toISOString(), settledBy: req.admin.email, settleReason: reason || null, settledPayout: credit };
          betsStore.set(bet.id, updatedBet);
          if (credit > 0) {
            const updatedUser = updateUser(user.id, { balance: Number((user.balance + credit).toFixed(2)) });
            pushTx(user.id, { kind: r === 'won' ? 'bet_won' : 'bet_void_refund', amount: credit, status: 'completed', balanceAfter: updatedUser.balance, ref: bet.id });
          }
          logActivity(user.id, { kind: `bet_${r}`, betId: bet.id, credit });
          results.push({ betId: id, status: r, credit });
        } else if (action === 'cancel') {
          if (bet.status === 'cancelled') { results.push({ betId: id, status: 'error', error: 'Already cancelled' }); continue; }
          if (bet.status === 'cashed_out') { results.push({ betId: id, status: 'error', error: 'Cashed out' }); continue; }
          const user = getUserById(bet.userId);
          if (!user) { results.push({ betId: id, status: 'error', error: 'User not found' }); continue; }
          const refund = bet.status === 'open' ? bet.stake : 0;
          const updatedBet = { ...bet, status: 'cancelled', cancelledAt: new Date().toISOString(), cancelledBy: req.admin.email, cancelReason: reason || 'Bulk cancel' };
          betsStore.set(bet.id, updatedBet);
          if (refund > 0) {
            const updatedUser = updateUser(user.id, { balance: Number((user.balance + refund).toFixed(2)) });
            pushTx(user.id, { kind: 'bet_cancel_refund', amount: refund, status: 'completed', balanceAfter: updatedUser.balance, ref: bet.id });
          }
          logActivity(user.id, { kind: 'bet_cancelled', betId: bet.id, refund });
          results.push({ betId: id, status: 'cancelled', refund });
        }
      } catch (e) {
        results.push({ betId: id, status: 'error', error: e.message });
      }
    }

    audit(req, { action: `bet.bulk.${action}`, target: `bets:${betIds.length}`, targetType: 'bet', severity: 'warning', meta: { count: results.length, action } });
    res.json({ ok: true, results });
  })
);

export default router;

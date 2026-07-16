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
import { allUsers, getUserById, updateUser, adjustBalance, logActivity } from '../../db/users.js';
import { requireAdmin, requireRole, audit } from '../../middleware/adminAuth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { badRequest, conflict, notFound } from '../../utils/httpError.js';
import * as cashOutEngine from '../../services/cashOutEngine.js';
import { applySettlement } from '../../services/settlement.js';

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
  const { q, status, mode, userId, from, to, sort = 'placedAt', dir = 'desc', limit = 100, offset = 0, showDeleted } = req.query;
  let rows = Object.values(betsStore.all() || {});

  // Hide soft-deleted bets from the default view; ?showDeleted=1 to see them.
  const includeDeleted = showDeleted === '1' || showDeleted === 'true';
  if (!includeDeleted) rows = rows.filter((b) => !b.deleted);

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
    .filter((b) => b.status === 'open' && !b.deleted)
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
    const { result, payoutOverride, reason } = req.body;
    const outcome = await applySettlement(req.params.id, { result, reason, payoutOverride, adminEmail: req.admin.email });

    if (outcome.error === 'not_found')       throw notFound('Bet not found');
    if (outcome.error === 'cashed_out')      throw conflict('Bet was cashed out — settle/correct the cash-out amount manually, not the original stake.');
    if (outcome.error === 'reason_required') throw badRequest('A reason is required to correct an already-settled bet.');

    audit(req, {
      action: outcome.bet.correction ? `bet.correct.${result}` : `bet.settle.${result}`,
      target: req.params.id, targetType: 'bet', severity: outcome.bet.correction || result === 'void' ? 'warning' : 'info',
      meta: { reason, userId: outcome.bet.userId },
    });
    res.json({ bet: enrich(outcome.bet) });
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
    cashOutEngine.unregisterBet(bet.id);

    let updatedUser = user;
    if (refund > 0) {
      updatedUser = await adjustBalance(user.id, refund, { allowNegative: true });
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

/* ─── Soft delete / restore ───
 * Marks the bet as hidden without dropping its row, so a careless click
 * doesn't lose the receipt forever. Filters in the rest of the admin UI
 * default to deleted=false; pass ?showDeleted=1 to surface them.
 * Hard purge (true delete) intentionally not exposed — use the audit
 * trail to investigate and then purge via DB if absolutely required.
 */
router.post('/:id/delete',
  requireAdmin, requireRole('moderator', 'odds_manager', 'finance_admin'),
  validate(z.object({ reason: z.string().max(500).optional() })),
  (req, res, next) => {
    const bet = betsStore.get(req.params.id);
    if (!bet) return next(notFound('Bet not found'));
    if (bet.deleted) return next(conflict('Bet already deleted.'));
    const updated = {
      ...bet,
      deleted: true,
      deletedAt: new Date().toISOString(),
      deletedBy: req.admin.email,
      deleteReason: req.body.reason || null,
    };
    betsStore.set(bet.id, updated);
    audit(req, { action: 'bet.delete', target: bet.id, targetType: 'bet', severity: 'warning', meta: { reason: req.body.reason } });
    res.json({ bet: enrich(updated) });
  }
);

router.post('/:id/restore',
  requireAdmin, requireRole('moderator', 'odds_manager', 'finance_admin'),
  (req, res, next) => {
    const bet = betsStore.get(req.params.id);
    if (!bet) return next(notFound('Bet not found'));
    if (!bet.deleted) return next(conflict('Bet is not deleted.'));
    const { deleted, deletedAt, deletedBy, deleteReason, ...rest } = bet;
    const updated = { ...rest, restoredAt: new Date().toISOString(), restoredBy: req.admin.email };
    betsStore.set(bet.id, updated);
    audit(req, { action: 'bet.restore', target: bet.id, targetType: 'bet', severity: 'info' });
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
          const r = result || 'lost';
          const outcome = await applySettlement(id, { result: r, reason, payoutOverride, adminEmail: req.admin.email });
          if (outcome.error) { results.push({ betId: id, status: 'error', error: outcome.error }); continue; }
          results.push({ betId: id, status: r, credit: outcome.bet.settledPayout });
        } else if (action === 'cancel') {
          if (bet.status === 'cancelled') { results.push({ betId: id, status: 'error', error: 'Already cancelled' }); continue; }
          if (bet.status === 'cashed_out') { results.push({ betId: id, status: 'error', error: 'Cashed out' }); continue; }
          const user = getUserById(bet.userId);
          if (!user) { results.push({ betId: id, status: 'error', error: 'User not found' }); continue; }
          const refund = bet.status === 'open' ? bet.stake : 0;
          const updatedBet = { ...bet, status: 'cancelled', cancelledAt: new Date().toISOString(), cancelledBy: req.admin.email, cancelReason: reason || 'Bulk cancel' };
          betsStore.set(bet.id, updatedBet);
          cashOutEngine.unregisterBet(bet.id);
          if (refund > 0) {
            const updatedUser = await adjustBalance(user.id, refund, { allowNegative: true });
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

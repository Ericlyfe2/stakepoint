import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, requireRole, audit } from '../../middleware/adminAuth.js';
import { validate } from '../../middleware/validate.js';
import { createStore } from '../../db/store.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { notFound, conflict } from '../../utils/httpError.js';
import { getUserById } from '../../db/users.js';
import * as cashOutEngine from '../../services/cashOutEngine.js';

const store = createStore('cashout_rules', {});
const betsStore = createStore('bets', {});
const router = Router();

function currentOfferFor(bet) {
  if (bet.mode === 'system') return Number((bet.stake * bet.totalOdds * 0.6).toFixed(2));
  const last = cashOutEngine.getLastOffer(bet.id);
  if (last) return last.cashOut > 0 ? last.cashOut : 0;
  if (bet.lastCashOutOffer?.amount != null && bet.lastCashOutOffer.amount > 0) return bet.lastCashOutOffer.amount;
  return cashOutEngine.computeInitialOffer(bet);
}

const rulesSchema = z.object({
  enabled: z.boolean().optional(),
  minOdds: z.number().min(1).optional(),
  maxOdds: z.number().min(1).optional(),
  minLegs: z.number().int().min(1).optional(),
  maxLegs: z.number().int().min(1).max(20).optional(),
  minStake: z.number().min(0).optional(),
  maxStake: z.number().min(0).optional(),
  factor: z.number().min(0).max(1).optional(),
  autoCashoutThreshold: z.number().min(0).optional(),
  disabledSports: z.array(z.string()).optional(),
  timeBasedRestriction: z.number().min(0).optional(),
});

router.get('/rules', requireAdmin, (_req, res) => {
  const r = store.all() || {};
  res.json({
    enabled: r.enabled !== false,
    minOdds: r.minOdds || 1.2,
    maxOdds: r.maxOdds || 50,
    minLegs: r.minLegs || 1,
    maxLegs: r.maxLegs || 15,
    minStake: r.minStake || 1,
    maxStake: r.maxStake || 50000,
    factor: r.factor || 0.6,
    autoCashoutThreshold: r.autoCashoutThreshold || 0,
    disabledSports: r.disabledSports || [],
    timeBasedRestriction: r.timeBasedRestriction || 0,
  });
});

router.put('/rules', requireAdmin, requireRole('finance_admin', 'odds_manager'), validate(rulesSchema), asyncHandler(async (req, res) => {
  Object.entries(req.body).forEach(([k, v]) => store.set(k, v));
  audit(req, { action: 'admin.cashout.rules', target: 'global', targetType: 'config', meta: Object.keys(req.body) });
  res.json({ ok: true });
}));

router.get('/offers', requireAdmin, (_req, res) => {
  const open = Object.values(betsStore.all() || {}).filter((b) => b.status === 'open' && b.legs?.length);
  const offers = open.map((b) => {
    const value = currentOfferFor(b);
    const user = b.userId ? getUserById(b.userId) : null;
    return {
      betId: b.id,
      bookingCode: b.bookingCode,
      userId: b.userId,
      userLabel: user?.displayName || user?.email || b.userId || 'guest',
      stake: b.stake,
      totalOdds: b.totalOdds,
      value: value != null ? Number(value.toFixed(2)) : null,
      odds: b.totalOdds,
      adjustedByAdmin: !!b.lastCashOutOffer?.adminAdjusted,
    };
  }).filter((o) => o.value != null && o.value > 0);

  res.json({
    offers,
    totalCount: offers.length,
    totalValue: Number(offers.reduce((s, o) => s + o.value, 0).toFixed(2)),
  });
});

router.post('/offers/:betId/adjust',
  requireAdmin, requireRole('finance_admin', 'odds_manager'),
  validate(z.object({ amount: z.number().min(0) })),
  asyncHandler(async (req, res) => {
    const bet = betsStore.get(req.params.betId);
    if (!bet) throw notFound('Bet not found');
    if (bet.status !== 'open') throw conflict('Bet is already settled.', { code: 'ALREADY_SETTLED' });

    const amount = Number(req.body.amount.toFixed(2));
    const ts = Date.now();
    cashOutEngine.restoreLastOffer(bet.id, { amount, ts });
    bet.lastCashOutOffer = { amount, ts, adminAdjusted: true };
    betsStore.set(bet.id, bet);

    audit(req, {
      action: 'admin.cashout.adjustOffer',
      target: bet.id,
      targetType: 'bet',
      meta: { amount, bookingCode: bet.bookingCode },
    });

    res.json({ ok: true, betId: bet.id, offer: amount });
  })
);

router.get('/stats', requireAdmin, (_req, res) => {
  res.json({
    totalCashouts: 0,
    totalAmount: 0,
    avgCashoutPct: 0,
    playerAdoptionRate: 0,
    profitImpact: 0,
    bySport: [],
  });
});

export default router;

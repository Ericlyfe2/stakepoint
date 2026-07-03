import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { conflict, notFound } from '../utils/httpError.js';
import { createStore } from '../db/store.js';
import { adjustBalance, logActivity } from '../db/users.js';
import { pushTx } from './wallet.js';
import { emitToUser, emitAdmin } from '../services/realtime.js';
import * as cashOutEngine from '../services/cashOutEngine.js';
import { LIVE_BETTING, CASHOUT } from '../config/env.js';
import { uniqueBookingCode, pushBet } from './bet.js';
import { BONUS_RATE, getMatchById } from '../matchesData.js';

const router = Router();
const betsStore = createStore('bets', {});

const OFFER_REVALIDATION_DELAY_MS = 2000;
const MIN_PARTIAL_STAKE = 1;

const executeSchema = z.object({
  acceptedAmount: z.union([z.number(), z.string()])
    .transform((v) => Number(v))
    .refine((v) => Number.isFinite(v) && v >= 0, 'invalid acceptedAmount'),
  fraction: z.union([z.number(), z.string()])
    .optional()
    .transform((v) => v === undefined ? 1 : Number(v))
    .refine((v) => Number.isFinite(v) && v > 0 && v <= 1, 'fraction must be in (0, 1]'),
});

const autoSchema = z.object({
  target: z.union([z.number(), z.string()])
    .transform((v) => Number(v))
    .refine((v) => v === 0 || (Number.isFinite(v) && v > 0), 'target must be 0 or a positive number'),
});

function getOddsLookup() {
  return (matchId, market, outcome) => {
    try {
      const match = getMatchById(matchId);
      if (!match) return null;
      if (match.suspended) return 0;
      const mkt = match.markets?.[market];
      if (!mkt) return null;
      if (mkt.suspended) return 0;
      const sel = mkt.selections?.[outcome];
      if (!sel) return null;
      if (sel.suspended) return 0;
      return Number(sel.odds) || null;
    } catch {
      return null;
    }
  };
}

function getCurrentOfferForBet(bet) {
  if (bet.mode === 'system') {
    return Number((bet.stake * bet.totalOdds * 0.6).toFixed(2));
  }

  const last = cashOutEngine.getLastOffer(bet.id);
  if (last) {
    if (last.cashOut > 0) return last.cashOut;
    return 0;
  }

  if (bet.lastCashOutOffer?.amount != null && bet.lastCashOutOffer.amount > 0) {
    return bet.lastCashOutOffer.amount;
  }

  return cashOutEngine.computeInitialOffer(bet);
}

async function validateAndComputeCashout(betId, userId, acceptedAmount, fraction) {
  const bet = betsStore.get(betId);
  if (!bet || bet.userId !== userId) throw notFound('Bet not found');
  if (bet.status !== 'open') throw conflict('Bet is already settled.', { code: 'ALREADY_SETTLED' });

  const currentOffer = getCurrentOfferForBet(bet);
  if (currentOffer === null || currentOffer === 0) {
    throw conflict('Cash-out is not available for this bet right now.', { code: 'OFFER_UNAVAILABLE' });
  }

  const drift = Math.abs(acceptedAmount - currentOffer) / Math.max(currentOffer, 1);
  if (drift > LIVE_BETTING.driftTolerance) {
    throw conflict('Cash-out amount changed. Please review the new offer.', {
      code: 'OFFER_STALE',
      currentOffer,
    });
  }

  const fractionVal = Math.min(1, Math.max(0.01, fraction));
  const cashOutAmount = Number((currentOffer * fractionVal).toFixed(2));
  const residualStake = Number((bet.stake * (1 - fractionVal)).toFixed(2));

  if (fractionVal < 1 && residualStake < MIN_PARTIAL_STAKE) {
    throw conflict('Remaining stake too small. Cash out fully or choose a smaller fraction.', {
      code: 'RESIDUAL_TOO_SMALL',
    });
  }

  return { bet, currentOffer, cashOutAmount, fractionVal, residualStake };
}

router.post('/offer/:betId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const bet = betsStore.get(req.params.betId);
    if (!bet || bet.userId !== req.user.id) throw notFound('Bet not found');
    if (bet.status !== 'open') throw conflict('Bet is already settled.', { code: 'ALREADY_SETTLED' });

    let offer;
    if (bet.mode === 'system') {
      offer = Number((bet.stake * bet.totalOdds * 0.6).toFixed(2));
    } else {
      const last = cashOutEngine.getLastOffer(bet.id);
      if (last) {
        offer = last.cashOut > 0 ? last.cashOut : 0;
      } else if (bet.lastCashOutOffer?.amount != null && bet.lastCashOutOffer.amount > 0) {
        offer = bet.lastCashOutOffer.amount;
      } else {
        offer = cashOutEngine.computeInitialOffer(bet);
      }
    }

    const partialCount = cashOutEngine.getPartialCashoutCount(bet.id);
    const autoTarget = cashOutEngine.getAutoCashoutTarget(bet.id);

    res.json({
      ok: true,
      offer: offer !== null ? Number(offer.toFixed(2)) : null,
      potentialWin: bet.potentialWin,
      stake: bet.stake,
      totalOdds: bet.totalOdds,
      mode: bet.mode,
      partialCashoutCount: partialCount,
      maxPartialCashouts: bet.mode === 'multiple' ? CASHOUT.maxPartialMultiple : CASHOUT.maxPartialSingle,
      autoCashoutTarget: autoTarget,
    });
  })
);

router.post('/execute/:betId',
  requireAuth,
  validate(executeSchema),
  asyncHandler(async (req, res) => {
    const { acceptedAmount, fraction } = req.body;
    const { bet, currentOffer, cashOutAmount, fractionVal, residualStake } =
      await validateAndComputeCashout(req.params.betId, req.user.id, acceptedAmount, fraction);

    const delayMs = CASHOUT.minDelayMs + Math.floor(Math.random() * (CASHOUT.maxDelayMs - CASHOUT.minDelayMs));

    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const revalidated = getCurrentOfferForBet(bet);
    if (revalidated === null || revalidated === 0) {
      throw conflict('Cash-out is no longer available. Market may be suspended.', { code: 'OFFER_UNAVAILABLE' });
    }

    const postDrift = Math.abs(acceptedAmount - revalidated) / Math.max(revalidated, 1);
    if (postDrift > LIVE_BETTING.driftTolerance) {
      throw conflict('Cash-out amount changed during processing.', {
        code: 'OFFER_CHANGED',
        currentOffer: revalidated,
      });
    }

    bet.status = 'cashed_out';
    bet.cashOut = cashOutAmount;
    bet.cashOutFraction = fractionVal;
    bet.cashOutAt = new Date().toISOString();
    bet.cashOutDelayMs = delayMs;
    betsStore.set(bet.id, bet);
    cashOutEngine.unregisterBet(bet.id);

    let residual = null;
    if (fractionVal < 1) {
      cashOutEngine.incrementPartialCashoutCount(bet.id);

      const newId = `bv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      residual = {
        ...bet,
        id: newId,
        bookingCode: await uniqueBookingCode(),
        placedAt: new Date().toISOString(),
        parentBetId: bet.id,
        stake: residualStake,
        potentialWin: Number((residualStake * bet.totalOdds * (1 + BONUS_RATE)).toFixed(2)),
        status: 'open',
        cashOut: undefined,
        cashOutFraction: undefined,
        cashOutAt: undefined,
        lastCashOutOffer: null,
        cashOutHistory: [],
      };
      bet.residualBetId = newId;
      betsStore.set(bet.id, bet);
      await pushBet(residual);
      cashOutEngine.registerBet(residual);
    }

    const updated = await adjustBalance(req.user.id, cashOutAmount);
    pushTx(req.user.id, {
      kind: fractionVal < 1 ? 'cash_out_partial' : 'cash_out',
      amount: cashOutAmount,
      status: 'completed',
      balanceAfter: updated.balance,
      ref: bet.id,
    });
    logActivity(req.user.id, {
      kind: 'cash_out',
      betId: bet.id,
      cashOut: cashOutAmount,
      fraction: fractionVal,
      delayMs,
    });

    emitToUser(req.user.id, 'wallet:update', {
      balance: updated.balance,
      delta: cashOutAmount,
      reason: 'cash_out',
      ref: bet.id,
    });
    emitAdmin('cashout:executed', {
      betId: bet.id,
      userId: req.user.id,
      cashOut: cashOutAmount,
      fraction: fractionVal,
      ts: Date.now(),
    });

    res.json({
      ok: true,
      bet,
      residual,
      account: { ...updated, passwordHash: undefined, googleId: undefined, activity: undefined },
      processingTimeMs: delayMs,
    });
  })
);

router.post('/auto/:betId',
  requireAuth,
  validate(autoSchema),
  asyncHandler(async (req, res) => {
    const bet = betsStore.get(req.params.betId);
    if (!bet || bet.userId !== req.user.id) throw notFound('Bet not found');
    if (bet.status !== 'open') throw conflict('Bet is already settled.', { code: 'ALREADY_SETTLED' });

    const target = Number(req.body.target);

    if (target > 0) {
      const currentOffer = getCurrentOfferForBet(bet);
      if (currentOffer !== null && target <= currentOffer) {
        throw conflict('Auto cash-out target must be higher than the current offer.', {
          code: 'TARGET_TOO_LOW',
          currentOffer,
        });
      }
    }

    cashOutEngine.setAutoCashoutTarget(bet.id, target);

    res.json({
      ok: true,
      betId: bet.id,
      autoCashoutTarget: target || null,
    });
  })
);

router.get('/auto/:betId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const bet = betsStore.get(req.params.betId);
    if (!bet || bet.userId !== req.user.id) throw notFound('Bet not found');

    const target = cashOutEngine.getAutoCashoutTarget(bet.id);
    res.json({ ok: true, betId: bet.id, autoCashoutTarget: target || 0 });
  })
);

export default router;

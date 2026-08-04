import { Router } from 'express';
import express from 'express';
import crypto from 'crypto';
import { PAYSTACK } from '../config/env.js';
import { creditPaystackDeposit } from './wallet.js';
import { log } from '../utils/logger.js';

// Durable, server-to-server confirmation channel — fires from Paystack's
// infrastructure even if the customer's browser closes before the client
// ever calls /paystack/verify. Mounted BEFORE the global express.json()
// middleware (see index.js) so the body arrives as raw bytes: the
// x-paystack-signature HMAC is computed over the exact raw payload, and
// re-serializing a parsed JSON object would produce a different hash.
const router = Router();

router.post('/', express.raw({ type: 'application/json', limit: '256kb' }), async (req, res) => {
  if (!PAYSTACK.enabled) return res.sendStatus(503);

  const signature = req.headers['x-paystack-signature'];
  const raw = req.body; // Buffer
  const hash = crypto.createHmac('sha512', PAYSTACK.secretKey).update(raw).digest('hex');
  if (!signature || hash !== signature) {
    log.warn('paystack webhook: signature mismatch, rejecting');
    return res.sendStatus(401);
  }

  let event;
  try { event = JSON.parse(raw.toString('utf8')); } catch { return res.sendStatus(400); }

  // Acknowledge immediately — Paystack expects a fast 200 and retries on
  // timeout, which could double-process a slow handler otherwise.
  res.sendStatus(200);

  if (event?.event !== 'charge.success') return;
  const data = event.data || {};
  const userId = data.metadata?.userId;
  const txId = data.metadata?.transactionId;
  if (!userId || !txId) return;

  try {
    await creditPaystackDeposit(userId, txId, Number(data.amount) / 100, data.currency);
  } catch (e) {
    log.warn(`paystack webhook: failed to credit tx ${txId}: ${e.message}`);
  }
});

export default router;

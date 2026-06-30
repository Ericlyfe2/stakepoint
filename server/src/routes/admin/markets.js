import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, requireRole, audit } from '../../middleware/adminAuth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { notFound } from '../../utils/httpError.js';
import { listMarketTemplates, getMarketTemplate, createMarketTemplate, updateMarketTemplate, deleteMarketTemplate } from '../../db/markets.js';

const router = Router();

const selectionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  defaultOdds: z.number().positive().optional(),
});

const upsertSchema = z.object({
  key: z.string().min(1).max(20),
  name: z.string().min(1).max(60),
  sport: z.string().optional(),
  description: z.string().max(300).optional(),
  selections: z.array(selectionSchema).min(1).optional(),
  sort: z.number().int().optional(),
  active: z.boolean().optional(),
  icon: z.string().max(30).optional(),
});

router.get('/', requireAdmin, (req, res) => {
  res.json({ markets: listMarketTemplates() });
});

router.get('/:key', requireAdmin, (req, res) => {
  const m = getMarketTemplate(req.params.key);
  if (!m) throw notFound('Market template not found');
  res.json({ market: m });
});

router.post('/', requireAdmin, requireRole('odds_manager'), validate(upsertSchema), asyncHandler(async (req, res) => {
  if (getMarketTemplate(req.body.key)) {
    return res.status(409).json({ error: 'A market with this key already exists' });
  }
  const market = createMarketTemplate(req.body);
  audit(req, { action: 'market.create', target: req.body.key, targetType: 'market', severity: 'info', meta: { name: req.body.name } });
  res.status(201).json({ market });
}));

router.put('/:key', requireAdmin, requireRole('odds_manager'), validate(upsertSchema), asyncHandler(async (req, res) => {
  const existing = getMarketTemplate(req.params.key);
  if (!existing) throw notFound('Market template not found');
  const market = updateMarketTemplate(req.params.key, req.body);
  audit(req, { action: 'market.update', target: req.params.key, targetType: 'market', severity: 'info', meta: { name: req.body.name } });
  res.json({ market });
}));

router.patch('/:key', requireAdmin, requireRole('odds_manager'), validate(upsertSchema.partial()), asyncHandler(async (req, res) => {
  const existing = getMarketTemplate(req.params.key);
  if (!existing) throw notFound('Market template not found');
  const market = updateMarketTemplate(req.params.key, req.body);
  audit(req, { action: 'market.update', target: req.params.key, targetType: 'market', severity: 'info' });
  res.json({ market });
}));

router.delete('/:key', requireAdmin, requireRole('odds_manager'), asyncHandler(async (req, res) => {
  const existing = getMarketTemplate(req.params.key);
  if (!existing) throw notFound('Market template not found');
  deleteMarketTemplate(req.params.key);
  audit(req, { action: 'market.delete', target: req.params.key, targetType: 'market', severity: 'warning' });
  res.json({ ok: true });
}));

export default router;

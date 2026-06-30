import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, requireRole, audit } from '../../middleware/adminAuth.js';
import { validate } from '../../middleware/validate.js';
import { createStore } from '../../db/store.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { notFound } from '../../utils/httpError.js';


const store = createStore('kyc_documents', {});
const router = Router();

const approveSchema = z.object({ note: z.string().max(500).optional() });
const rejectSchema = z.object({ reason: z.string().trim().min(1).max(500) });

router.get('/', requireAdmin, (req, res) => {
  const { status, q } = req.query;
  let list = Object.values(store.all() || {});
  if (status) list = list.filter((d) => d.status === status);
  if (q)      list = list.filter((d) => (d.email || '').toLowerCase().includes(q.toLowerCase()));
  list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const pending = list.filter((d) => d.status === 'pending').length;
  const verified = list.filter((d) => d.status === 'verified').length;
  const rejected = list.filter((d) => d.status === 'rejected').length;
  res.json({ documents: list.slice(0, 200), counts: { total: list.length, pending, verified, rejected } });
});

router.get('/stats', requireAdmin, (_req, res) => {
  const all = Object.values(store.all() || {});
  const pending = all.filter((d) => d.status === 'pending');
  const avgHours = pending.length > 0
    ? pending.reduce((s, d) => s + (Date.now() - new Date(d.createdAt).getTime()) / 3600000, 0) / pending.length
    : 0;
  res.json({
    total: all.length,
    pending: pending.length,
    verified: all.filter((d) => d.status === 'verified').length,
    rejected: all.filter((d) => d.status === 'rejected').length,
    pendingAvgHours: Math.round(avgHours * 10) / 10,
  });
});

router.get('/:id', requireAdmin, (req, res, next) => {
  const doc = store.get(req.params.id);
  if (!doc) return next(notFound('Document not found.'));
  res.json({ document: doc });
});

router.post('/:id/approve', requireRole('moderator', 'support'), validate(approveSchema), asyncHandler(async (req, res, next) => {
  const doc = store.get(req.params.id);
  if (!doc) return next(notFound('Document not found.'));
  const updated = store.update(doc.id, (cur) => ({
    ...cur, status: 'verified', reviewedBy: req.admin.id, reviewedAt: new Date().toISOString(), note: req.body.note || '',
  }));
  audit(req, { action: 'admin.kyc.approved', target: doc.userId, targetType: 'user', meta: { documentId: doc.id, type: doc.type } });
  res.json({ ok: true, document: updated });
}));

router.post('/:id/reject', requireRole('moderator', 'support'), validate(rejectSchema), asyncHandler(async (req, res, next) => {
  const doc = store.get(req.params.id);
  if (!doc) return next(notFound('Document not found.'));
  const updated = store.update(doc.id, (cur) => ({
    ...cur, status: 'rejected', reviewedBy: req.admin.id, reviewedAt: new Date().toISOString(), rejectReason: req.body.reason,
  }));
  audit(req, { action: 'admin.kyc.rejected', target: doc.userId, targetType: 'user', meta: { documentId: doc.id, type: doc.type, reason: req.body.reason } });
  res.json({ ok: true, document: updated });
}));

export default router;

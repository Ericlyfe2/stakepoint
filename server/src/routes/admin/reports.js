import { Router } from 'express';
import { requireAdmin, requireRole } from '../../middleware/adminAuth.js';
import { createStore } from '../../db/store.js';

const store = createStore('reports_cache', {});
const router = Router();

router.get('/revenue', requireAdmin, (_req, res) => {
  res.json({
    daily: [],
    weekly: [],
    monthly: [],
    bySport: [],
    summary: {
      grossGamingRevenue: 0,
      netRevenue: 0,
      bonusCost: 0,
      totalBets: 0,
      totalPayouts: 0,
    },
  });
});

router.get('/players', requireAdmin, (_req, res) => {
  res.json({
    total: 0,
    newThisPeriod: 0,
    returning: 0,
    churnRate: 0,
    avgLtv: 0,
    byChannel: [],
    depositCohorts: [],
  });
});

router.get('/operational', requireAdmin, (_req, res) => {
  res.json({
    supportTickets: { total: 0, avgResponseTime: 0, satisfaction: 0 },
    withdrawals: { total: 0, avgProcessingTime: 0, pendingCount: 0 },
    adminActions: { total: 0, uniqueAdmins: 0 },
  });
});

router.get('/export', requireRole('reports.view', 'reports.export'), (_req, res) => {
  res.json({ exports: Object.values(store.all() || {}).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 50) });
});

router.post('/export', requireRole('reports.export'), (req, res) => {
  const id = `rpt-${Date.now()}`;
  const record = { id, type: req.body.type || 'csv', format: req.body.format || 'csv', status: 'pending', createdAt: new Date().toISOString() };
  store.set(id, record);
  res.status(201).json({ ok: true, export: record });
});

export default router;

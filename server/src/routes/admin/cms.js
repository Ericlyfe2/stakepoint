import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, requireRole, audit } from '../../middleware/adminAuth.js';
import { validate } from '../../middleware/validate.js';
import { createStore } from '../../db/store.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { notFound } from '../../utils/httpError.js';

const pages = createStore('cms_pages', {});
const banners = createStore('cms_banners', {});
const announcements = createStore('cms_announcements', {});
const router = Router();

const pageSchema = z.object({
  slug: z.string().trim().min(1).max(80).transform((v) => v.toLowerCase().replace(/[^a-z0-9-]/g, '-')),
  title: z.string().trim().min(1).max(120),
  content: z.string().default(''),
  seoDescription: z.string().max(300).optional(),
  published: z.boolean().default(false),
  publishedAt: z.string().optional(),
});

const bannerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  imageUrl: z.string().max(500),
  linkUrl: z.string().max(500).optional(),
  position: z.enum(['hero', 'sidebar', 'popup', 'inline']).default('hero'),
  active: z.boolean().default(true),
  priority: z.number().int().min(0).max(100).default(50),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  audience: z.enum(['all', 'verified', 'new']).default('all'),
});

const announcementSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(500),
  severity: z.enum(['info', 'success', 'warning', 'critical']).default('info'),
  dismissible: z.boolean().default(true),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  audience: z.enum(['all', 'verified', 'new']).default('all'),
});

router.get('/pages', requireAdmin, (req, res) => {
  let list = Object.values(pages.all() || {});
  const { published } = req.query;
  if (published !== undefined) list = list.filter((p) => p.published === (published === 'true'));
  list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  res.json({ pages: list.slice(0, 100) });
});

router.get('/pages/:id', requireAdmin, (req, res, next) => {
  const p = pages.get(req.params.id);
  if (!p) return next(notFound('Page not found.'));
  res.json({ page: p });
});

router.post('/pages', requireRole('cms.pages'), validate(pageSchema), asyncHandler(async (req, res) => {
  const id = `pg-${Date.now()}`;
  const record = { id, ...req.body, createdBy: req.admin.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  pages.set(id, record);
  audit(req, { action: 'admin.cms.page.created', target: id, targetType: 'cms_page', meta: { slug: req.body.slug, title: req.body.title } });
  res.status(201).json({ ok: true, page: record });
}));

router.patch('/pages/:id', requireRole('cms.pages'), validate(pageSchema.partial()), asyncHandler(async (req, res, next) => {
  const p = pages.get(req.params.id);
  if (!p) return next(notFound('Page not found.'));
  const updated = pages.update(p.id, (cur) => ({ ...cur, ...req.body, updatedAt: new Date().toISOString() }));
  res.json({ ok: true, page: updated });
}));

router.delete('/pages/:id', requireRole('cms.pages'), asyncHandler(async (req, res, next) => {
  const p = pages.get(req.params.id);
  if (!p) return next(notFound('Page not found.'));
  pages.delete(p.id);
  audit(req, { action: 'admin.cms.page.deleted', target: p.id, targetType: 'cms_page', severity: 'warning' });
  res.json({ ok: true });
}));

router.get('/banners', requireAdmin, (req, res) => {
  let list = Object.values(banners.all() || {});
  const { active } = req.query;
  if (active !== undefined) list = list.filter((b) => b.active === (active === 'true'));
  list.sort((a, b) => b.priority - a.priority);
  res.json({ banners: list.slice(0, 50) });
});

router.post('/banners', requireRole('cms.banners'), validate(bannerSchema), asyncHandler(async (req, res) => {
  const id = `bnr-${Date.now()}`;
  const record = { id, ...req.body, createdBy: req.admin.id, createdAt: new Date().toISOString() };
  banners.set(id, record);
  audit(req, { action: 'admin.cms.banner.created', target: id, targetType: 'cms_banner', meta: { name: req.body.name, position: req.body.position } });
  res.status(201).json({ ok: true, banner: record });
}));

router.patch('/banners/:id', requireRole('cms.banners'), validate(bannerSchema.partial()), asyncHandler(async (req, res, next) => {
  const b = banners.get(req.params.id);
  if (!b) return next(notFound('Banner not found.'));
  const updated = banners.update(b.id, (cur) => ({ ...cur, ...req.body }));
  res.json({ ok: true, banner: updated });
}));

router.delete('/banners/:id', requireRole('cms.banners'), asyncHandler(async (req, res, next) => {
  const b = banners.get(req.params.id);
  if (!b) return next(notFound('Banner not found.'));
  banners.delete(b.id);
  audit(req, { action: 'admin.cms.banner.deleted', target: b.id, targetType: 'cms_banner', severity: 'warning' });
  res.json({ ok: true });
}));

router.get('/announcements', requireAdmin, (req, res) => {
  let list = Object.values(announcements.all() || {});
  list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  res.json({ announcements: list.slice(0, 100) });
});

router.post('/announcements', requireRole('cms.announcements'), validate(announcementSchema), asyncHandler(async (req, res) => {
  const id = `ann-${Date.now()}`;
  const record = { id, ...req.body, createdBy: req.admin.id, createdAt: new Date().toISOString() };
  announcements.set(id, record);
  audit(req, { action: 'admin.cms.announcement.created', target: id, targetType: 'cms_announcement' });
  res.status(201).json({ ok: true, announcement: record });
}));

router.delete('/announcements/:id', requireRole('cms.announcements'), asyncHandler(async (req, res, next) => {
  const a = announcements.get(req.params.id);
  if (!a) return next(notFound('Announcement not found.'));
  announcements.delete(a.id);
  audit(req, { action: 'admin.cms.announcement.deleted', target: a.id, targetType: 'cms_announcement', severity: 'warning' });
  res.json({ ok: true });
}));

export default router;

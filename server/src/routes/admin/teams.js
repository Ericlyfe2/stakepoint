import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, requireRole, audit } from '../../middleware/adminAuth.js';
import { validate } from '../../middleware/validate.js';
import { notFound } from '../../utils/httpError.js';
import { listTeams, getTeam, createTeam, updateTeam, deleteTeam } from '../../db/teams.js';

const router = Router();

router.get('/', requireAdmin, (req, res) => {
  const { sport, q } = req.query;
  const teams = listTeams({ sport, q });
  res.json({ teams });
});

router.get('/:id', requireAdmin, (req, res, next) => {
  const team = getTeam(req.params.id);
  if (!team) return next(notFound('Team not found'));
  res.json({ team });
});

const teamSchema = z.object({
  name: z.string().min(1).max(100),
  shortName: z.string().max(10).optional(),
  sport: z.enum(['football', 'basketball', 'tennis']).optional(),
  country: z.string().optional(),
  logoUrl: z.string().optional(),
  colors: z.string().optional(),
  venue: z.string().optional(),
});

router.post('/',
  requireAdmin, requireRole('odds_manager'),
  validate(teamSchema),
  (req, res) => {
    const team = createTeam(req.body);
    audit(req, { action: 'teams.create', target: team.id, targetType: 'team', meta: { name: team.name } });
    res.status(201).json({ team });
  }
);

const teamPatchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  shortName: z.string().max(10).optional(),
  sport: z.enum(['football', 'basketball', 'tennis']).optional(),
  country: z.string().optional(),
  logoUrl: z.string().optional(),
  colors: z.string().optional(),
  venue: z.string().optional(),
  active: z.boolean().optional(),
});

router.put('/:id',
  requireAdmin, requireRole('odds_manager'),
  validate(teamPatchSchema),
  (req, res, next) => {
    const updated = updateTeam(req.params.id, req.body);
    if (!updated) return next(notFound('Team not found'));
    audit(req, { action: 'teams.update', target: req.params.id, targetType: 'team', meta: req.body });
    res.json({ team: updated });
  }
);

router.delete('/:id', requireAdmin, requireRole('odds_manager'), (req, res) => {
  deleteTeam(req.params.id);
  audit(req, { action: 'teams.delete', target: req.params.id, targetType: 'team', severity: 'warning' });
  res.json({ ok: true });
});

export default router;

import { Router } from 'express';
import { z } from 'zod';
import type { ChangelogService } from './service.js';

const idSchema = z.string().min(1).max(128);

export function createChangelogRouter(service: ChangelogService): Router {
  const router = Router();
  router.get('/', async (_req, res, next) => {
    try {
      res.set('Cache-Control', 'public, max-age=0, must-revalidate');
      res.json({ entries: await service.listPublished() });
    } catch (error) { next(error); }
  });
  return router;
}

/** Mounted below the admin authorization boundary. */
export function createAdminChangelogRouter(service: ChangelogService): Router {
  const router = Router();
  router.get('/', async (_req, res, next) => {
    try { res.json({ entries: await service.listAll() }); } catch (error) { next(error); }
  });
  router.post('/', async (req, res, next) => {
    try { res.status(201).json({ entry: await service.create(req.body) }); } catch (error) { next(error); }
  });
  router.patch('/:id', async (req, res, next) => {
    try { res.json({ entry: await service.update(idSchema.parse(req.params.id), req.body) }); } catch (error) { next(error); }
  });
  router.delete('/:id', async (req, res, next) => {
    try { await service.delete(idSchema.parse(req.params.id)); res.status(204).end(); } catch (error) { next(error); }
  });
  return router;
}

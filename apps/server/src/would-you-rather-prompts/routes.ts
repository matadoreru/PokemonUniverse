import { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../auth/middleware.js';
import type { WouldYouRatherPromptService } from './service.js';

const idSchema = z.string().min(1).max(128);

export function createWouldYouRatherPromptRouter(service: WouldYouRatherPromptService): Router {
  const router = Router();
  router.use(requireUser);
  router.get('/', (req, res) => { res.json({ prompts: service.list(req.auth!.id) }); });
  router.post('/', async (req, res, next) => {
    try { res.status(201).json({ prompt: await service.create(req.auth!.id, req.body) }); } catch (error) { next(error); }
  });
  router.post('/import', async (req, res, next) => {
    try { res.status(201).json({ prompts: await service.import(req.auth!.id, req.body) }); } catch (error) { next(error); }
  });
  router.patch('/:id', async (req, res, next) => {
    try { res.json({ prompt: await service.update(req.auth!.id, idSchema.parse(req.params.id), req.body) }); } catch (error) { next(error); }
  });
  router.delete('/:id', async (req, res, next) => {
    try { await service.delete(req.auth!.id, idSchema.parse(req.params.id)); res.status(204).end(); } catch (error) { next(error); }
  });
  return router;
}

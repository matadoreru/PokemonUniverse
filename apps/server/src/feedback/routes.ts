import { feedbackStatusSchema, feedbackTypeSchema } from '@pokemon-universe/shared';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import type { FeedbackService } from './service.js';

const idSchema = z.string().min(1).max(128);
const feedbackRateLimit = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false });

export function createFeedbackRouter(service: FeedbackService): Router {
  const router = Router();
  router.post('/', requireAuth, feedbackRateLimit, async (req, res, next) => {
    try { res.status(201).json({ feedback: await service.submit(req.body, req.auth!) }); }
    catch (error) { next(error); }
  });
  return router;
}

/** Mounted below the administrator authorization boundary. */
export function createAdminFeedbackRouter(service: FeedbackService): Router {
  const router = Router();
  router.get('/', async (req, res, next) => {
    try {
      const query = z.object({
        page: z.coerce.number().int().min(1).default(1),
        search: z.string().trim().max(80).default(''),
        status: feedbackStatusSchema.optional(),
        type: feedbackTypeSchema.optional(),
      }).parse(req.query);
      const filters = {
        ...(query.search ? { search: query.search } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.type ? { type: query.type } : {}),
      };
      const [page, overview] = await Promise.all([service.list(filters, query.page), service.overview()]);
      res.json({ ...page, overview });
    } catch (error) { next(error); }
  });
  router.patch('/:id/status', async (req, res, next) => {
    try {
      const body = z.object({ status: feedbackStatusSchema }).strict().parse(req.body);
      res.json({ feedback: await service.updateStatus(idSchema.parse(req.params.id), body.status) });
    } catch (error) { next(error); }
  });
  return router;
}

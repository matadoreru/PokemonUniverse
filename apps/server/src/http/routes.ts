import { gameRegistry } from '@pokemon-universe/shared';
import { Router } from 'express';
import { prisma } from '../db.js';
import { env } from '../config.js';

export const apiRouter = Router();

apiRouter.get('/health', async (_req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const migrations = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1
    `;
    res.json({
      status: 'ok', database: 'ready', schemaVersion: migrations[0]?.migration_name ?? 'unknown',
      uptimeSeconds: Math.floor(process.uptime()), commit: env.PU_COMMIT_SHA || 'development', timestamp: new Date().toISOString(),
    });
  }
  catch (error) { next(error); }
});

apiRouter.get('/games', (_req, res) => {
  res.json({ games: gameRegistry.list().map((game) => ({ ...game.manifest, defaultConfig: game.defaultConfig })) });
});

apiRouter.get('/pokemon', async (req, res, next) => {
  try {
    const generations = typeof req.query.generations === 'string'
      ? req.query.generations.split(',').map(Number).filter((value) => Number.isInteger(value) && value >= 1 && value <= 9)
      : [];
    const rows = await prisma.pokemon.findMany({
      ...(generations.length ? { where: { generation: { in: generations } } } : {}),
      orderBy: { nationalDexNumber: 'asc' },
      select: { id: true, nationalDexNumber: true, name: true, generation: true, sprite: true, names: true, types: true },
    });
    res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.json({ pokemon: rows });
  } catch (error) { next(error); }
});

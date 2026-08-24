import { gameRegistry, type GameAssetResolution } from '@pokemon-universe/shared';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../db.js';
import { env } from '../config.js';
import { loadGameImage } from './game-image-cache.js';

export const apiRouter = Router();
let gameImageResolver: ((code: string, assetToken: string, roundNumber: number, optionId: string) => string | GameAssetResolution | null) | null = null;
const gameImageRateLimit = rateLimit({ windowMs: 60_000, limit: 5_000, standardHeaders: 'draft-7', legacyHeaders: false });

export function registerGameImageResolver(resolver: typeof gameImageResolver): void {
  gameImageResolver = resolver;
}

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

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
    const includeForms = req.query.includeForms === 'true';
    const rows = await prisma.pokemon.findMany({
      where: {
        ...(generations.length ? { generation: { in: generations } } : {}),
        ...(!includeForms ? { isDefault: true } : {}),
      },
      orderBy: [{ nationalDexNumber: 'asc' }, { isDefault: 'desc' }, { name: 'asc' }],
      select: { id: true, nationalDexNumber: true, name: true, generation: true, isDefault: true, sprite: true, names: true, types: true, hp: true, attack: true, defense: true, specialAttack: true, specialDefense: true, speed: true, baseStatTotal: true, heightDecimeters: true, weightHectograms: true, evolutionStage: true, evolutionStages: true, legendaryStatus: true, color: true, abilities: true },
    });
    res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.json({ pokemon: rows.map(({ evolutionStages, ...pokemon }) => ({
      ...pokemon,
      ...(evolutionStages ? { evolutionStageCount: evolutionStages } : {}),
    })) });
  } catch (error) { next(error); }
});

apiRouter.get('/rooms/:code/games/:assetToken/rounds/:roundNumber/options/:optionId/sprite', gameImageRateLimit, async (req, res, next) => {
  try {
    const roundNumber = Number(req.params.roundNumber);
    if (!gameImageResolver || !Number.isInteger(roundNumber)) { res.status(404).end(); return; }
    const source = gameImageResolver(routeParam(req.params.code), routeParam(req.params.assetToken), roundNumber, routeParam(req.params.optionId));
    if (!source) { res.status(404).end(); return; }
    const image = await loadGameImage(source);
    res.type(image.contentType);
    res.set('Cache-Control', 'private, max-age=86400, immutable');
    res.send(image.body);
  } catch (error) { next(error); }
});

import { gameRegistry, type GameResults, type ProfileMetricDefinition } from '@pokemon-universe/shared';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import type { LiveRoom } from '../rooms/types.js';

export function mergeMetrics(previous: unknown, current: Record<string, number>, definitions: readonly ProfileMetricDefinition[]): Prisma.JsonObject {
  const base = previous && typeof previous === 'object' && !Array.isArray(previous) ? previous as Record<string, unknown> : {};
  const merged: Prisma.JsonObject = {};
  for (const definition of definitions) {
    const priorValue = base[definition.key]; const currentValue = current[definition.key];
    const old = typeof priorValue === 'number' ? priorValue : 0;
    const value = typeof currentValue === 'number' ? currentValue : 0;
    if (definition.aggregation === 'MAX') merged[definition.key] = Math.max(old, value);
    else if (definition.aggregation === 'MIN') merged[definition.key] = value <= 0 ? old : old <= 0 ? value : Math.min(old, value);
    else merged[definition.key] = old + value;
  }
  return merged;
}

export function isUniqueResultError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

export async function persistGameResults(room: LiveRoom, results: GameResults, resultId: string, startedAt: number, gameId: string, config: unknown): Promise<void> {
  const metricDefinitions = gameRegistry.get(gameId)?.manifest.profileStats.metrics;
  if (!metricDefinitions) throw new Error(`No profile statistics registered for ${gameId}`);
  const standings = results.standings.map((standing) => {
    const member = room.members.get(standing.playerId)!;
    return { standing, member };
  });
  try { await prisma.$transaction(async (tx) => {
    const history = await tx.gameHistory.create({ data: {
      resultId, roomCode: room.code, gameId, playerCount: standings.length,
      config: config as Prisma.InputJsonValue, startedAt: new Date(startedAt),
    } });
    for (const { standing, member } of standings) {
      const userId = member.identity.kind === 'USER' ? member.identity.id : null;
      await tx.playerGameResult.create({ data: {
        historyId: history.id, userId, displayName: member.identity.displayName,
        position: standing.position, points: standing.points, metrics: standing.stats,
      } });
      if (!userId) continue;
      const won = standing.won ?? standing.playerId === results.winnerId;
      await tx.userStats.upsert({ where: { userId }, create: {
        userId, gamesPlayed: 1, gamesWon: won ? 1 : 0, totalPoints: standing.points,
      }, update: {
        gamesPlayed: { increment: 1 }, gamesWon: { increment: won ? 1 : 0 }, totalPoints: { increment: standing.points },
      } });
      const existing = await tx.userGameStats.findUnique({ where: { userId_gameId: { userId, gameId } } });
      await tx.userGameStats.upsert({ where: { userId_gameId: { userId, gameId } }, create: {
        userId, gameId, gamesPlayed: 1, gamesWon: won ? 1 : 0, points: standing.points,
        metrics: mergeMetrics(null, standing.stats, metricDefinitions),
      }, update: {
        gamesPlayed: { increment: 1 }, gamesWon: { increment: won ? 1 : 0 }, points: { increment: standing.points },
        metrics: mergeMetrics(existing?.metrics, standing.stats, metricDefinitions),
      } });
    }
  }); } catch (error) {
    if (isUniqueResultError(error)) return;
    throw error;
  }
}

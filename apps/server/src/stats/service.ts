import type { GameResults } from '@pokemon-universe/shared';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import type { LiveRoom } from '../rooms/types.js';

function mergeMetrics(previous: unknown, current: Record<string, number>): Prisma.JsonObject {
  const base = previous && typeof previous === 'object' && !Array.isArray(previous) ? previous as Record<string, unknown> : {};
  const merged: Prisma.JsonObject = {};
  for (const [key, value] of Object.entries(base)) {
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') merged[key] = value;
  }
  for (const [key, value] of Object.entries(current)) {
    const old = typeof base[key] === 'number' ? base[key] : 0;
    merged[key] = old + value;
  }
  return merged;
}

export async function persistGameResults(room: LiveRoom, results: GameResults, startedAt: number, gameId: string, config: unknown): Promise<void> {
  const standings = results.standings.map((standing) => {
    const member = room.members.get(standing.playerId)!;
    return { standing, member };
  });
  await prisma.$transaction(async (tx) => {
    const history = await tx.gameHistory.create({ data: {
      roomCode: room.code, gameId, playerCount: standings.length,
      config: config as Prisma.InputJsonValue, startedAt: new Date(startedAt),
    } });
    for (const { standing, member } of standings) {
      const userId = member.identity.kind === 'USER' ? member.identity.id : null;
      await tx.playerGameResult.create({ data: {
        historyId: history.id, userId, displayName: member.identity.displayName,
        position: standing.position, points: standing.points, metrics: standing.stats,
      } });
      if (!userId) continue;
      await tx.userStats.upsert({ where: { userId }, create: {
        userId, gamesPlayed: 1, gamesWon: standing.playerId === results.winnerId ? 1 : 0, totalPoints: standing.points,
      }, update: {
        gamesPlayed: { increment: 1 }, gamesWon: { increment: standing.playerId === results.winnerId ? 1 : 0 }, totalPoints: { increment: standing.points },
      } });
      const existing = await tx.userGameStats.findUnique({ where: { userId_gameId: { userId, gameId } } });
      await tx.userGameStats.upsert({ where: { userId_gameId: { userId, gameId } }, create: {
        userId, gameId, gamesPlayed: 1, gamesWon: standing.playerId === results.winnerId ? 1 : 0,
        metrics: mergeMetrics(null, standing.stats),
      }, update: {
        gamesPlayed: { increment: 1 }, gamesWon: { increment: standing.playerId === results.winnerId ? 1 : 0 },
        metrics: mergeMetrics(existing?.metrics, standing.stats),
      } });
    }
  });
}

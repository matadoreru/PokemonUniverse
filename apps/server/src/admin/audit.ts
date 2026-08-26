import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '../db.js';

export interface RoomAuditSink {
  roomCreated(input: { id: string; code: string; hostUserId: string | null; hostDisplayName: string; maxPlayers: number; createdAt: number }): Promise<void>;
  roomClosed(input: { id: string; reason: string; gameResultId: string | null; endedAt: number }): Promise<void>;
  gameStarted(input: { resultId: string; roomHistoryId: string; roomCode: string; gameId: string; playerCount: number; config: unknown; startedAt: number }): Promise<void>;
}

export const noOpRoomAuditSink: RoomAuditSink = {
  roomCreated: async () => undefined,
  roomClosed: async () => undefined,
  gameStarted: async () => undefined,
};

export function createPrismaRoomAuditSink(database: PrismaClient = prisma): RoomAuditSink {
  let queue = Promise.resolve();
  const enqueue = (operation: () => Promise<unknown>): Promise<void> => {
    const result = queue.then(operation).then(() => undefined);
    queue = result.catch(() => undefined);
    return result;
  };
  return {
    roomCreated: (input) => enqueue(async () => {
      await database.roomHistory.create({ data: {
        id: input.id, roomCode: input.code, hostUserId: input.hostUserId,
        hostDisplayName: input.hostDisplayName, maxPlayers: input.maxPlayers,
        createdAt: new Date(input.createdAt),
      } });
    }),
    roomClosed: (input) => enqueue(async () => {
      const endedAt = new Date(input.endedAt);
      await database.$transaction([
        ...(input.gameResultId ? [database.gameHistory.updateMany({ where: { resultId: input.gameResultId, status: 'IN_PROGRESS' }, data: { status: 'ABANDONED', endedAt } })] : []),
        database.roomHistory.updateMany({ where: { id: input.id, status: 'ACTIVE' }, data: { status: 'CLOSED', closeReason: input.reason, endedAt } }),
      ]);
    }),
    gameStarted: (input) => enqueue(async () => {
      await database.gameHistory.upsert({
        where: { resultId: input.resultId }, update: {},
        create: {
          resultId: input.resultId, roomHistoryId: input.roomHistoryId, roomCode: input.roomCode,
          gameId: input.gameId, playerCount: input.playerCount, config: input.config as Prisma.InputJsonValue,
          status: 'IN_PROGRESS', startedAt: new Date(input.startedAt),
        },
      });
    }),
  };
}

export async function interruptStaleActivity(database: PrismaClient = prisma): Promise<void> {
  const endedAt = new Date();
  await database.$transaction([
    database.gameHistory.updateMany({ where: { status: 'IN_PROGRESS' }, data: { status: 'INTERRUPTED', endedAt } }),
    database.roomHistory.updateMany({ where: { status: 'ACTIVE' }, data: { status: 'INTERRUPTED', closeReason: 'SERVER_STOPPED', endedAt } }),
  ]);
}

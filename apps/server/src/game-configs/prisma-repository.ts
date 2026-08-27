import type { Prisma, PrismaClient } from '@prisma/client';

export interface StoredUserGameConfig {
  userId: string;
  gameId: string;
  config: unknown;
}

export interface UserGameConfigRepository {
  list(): Promise<StoredUserGameConfig[]>;
  upsert(userId: string, gameId: string, config: unknown): Promise<void>;
}

export class PrismaUserGameConfigRepository implements UserGameConfigRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(): Promise<StoredUserGameConfig[]> {
    return this.prisma.userGameConfig.findMany({ select: { userId: true, gameId: true, config: true } });
  }

  async upsert(userId: string, gameId: string, config: unknown): Promise<void> {
    const value = config as Prisma.InputJsonValue;
    await this.prisma.userGameConfig.upsert({
      where: { userId_gameId: { userId, gameId } },
      create: { userId, gameId, config: value },
      update: { config: value },
    });
  }
}

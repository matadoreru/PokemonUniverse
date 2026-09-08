import type { FeedbackStatus } from '@pokemon-universe/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { FeedbackFilters, FeedbackRepository, StoredFeedback } from './service.js';

function whereFor(filters: FeedbackFilters): Prisma.FeedbackWhereInput {
  return {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.search ? { OR: [
      { description: { contains: filters.search, mode: 'insensitive' } },
      { authorDisplayName: { contains: filters.search, mode: 'insensitive' } },
      { gameId: { contains: filters.search, mode: 'insensitive' } },
      { roomCode: { contains: filters.search, mode: 'insensitive' } },
    ] } : {}),
  };
}

export class PrismaFeedbackRepository implements FeedbackRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(data: Omit<StoredFeedback, 'id' | 'status' | 'createdAt' | 'updatedAt'>): Promise<StoredFeedback> {
    return this.prisma.feedback.create({ data });
  }

  list(filters: FeedbackFilters, skip: number, take: number): Promise<StoredFeedback[]> {
    return this.prisma.feedback.findMany({ where: whereFor(filters), orderBy: { createdAt: 'desc' }, skip, take });
  }

  count(filters: FeedbackFilters): Promise<number> {
    return this.prisma.feedback.count({ where: whereFor(filters) });
  }

  async updateStatus(id: string, status: FeedbackStatus): Promise<StoredFeedback | null> {
    const result = await this.prisma.feedback.updateMany({ where: { id }, data: { status } });
    if (result.count === 0) return null;
    return this.prisma.feedback.findUnique({ where: { id } });
  }
}

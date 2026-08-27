import { Prisma, type PrismaClient } from '@prisma/client';
import { DuplicateWouldYouRatherPromptError, type StoredWouldYouRatherPrompt, type WouldYouRatherPromptRepository } from './service.js';

export class PrismaWouldYouRatherPromptRepository implements WouldYouRatherPromptRepository {
  constructor(private readonly prisma: PrismaClient) {}
  findAll(): Promise<StoredWouldYouRatherPrompt[]> { return this.prisma.customWouldYouRatherPrompt.findMany(); }
  async create(userId: string, optionA: string, optionB: string, normalizedKey: string): Promise<StoredWouldYouRatherPrompt> {
    try { return await this.prisma.customWouldYouRatherPrompt.create({ data: { userId, optionA, optionB, normalizedKey } }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new DuplicateWouldYouRatherPromptError();
      throw error;
    }
  }
  async update(userId: string, id: string, data: { optionA?: string; optionB?: string; normalizedKey?: string; enabled?: boolean }): Promise<StoredWouldYouRatherPrompt | null> {
    const exists = await this.prisma.customWouldYouRatherPrompt.findFirst({ where: { id, userId }, select: { id: true } });
    if (!exists) return null;
    try { return await this.prisma.customWouldYouRatherPrompt.update({ where: { id }, data }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new DuplicateWouldYouRatherPromptError();
      throw error;
    }
  }
  async delete(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.customWouldYouRatherPrompt.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }
}

import { Prisma, type PrismaClient } from '@prisma/client';
import { DuplicateWouldYouRatherPromptError, InvalidWouldYouRatherPromptError, normalizeWouldYouRatherOption, wouldYouRatherPromptKey, type StoredWouldYouRatherPrompt, type WouldYouRatherPromptRepository } from './service.js';

export class PrismaWouldYouRatherPromptRepository implements WouldYouRatherPromptRepository {
  constructor(private readonly prisma: PrismaClient) {}
  findAll(): Promise<StoredWouldYouRatherPrompt[]> { return this.prisma.customWouldYouRatherPrompt.findMany(); }
  async createBatch(userId: string, prompts: readonly { optionA: string; optionB: string; normalizedKey: string }[]): Promise<StoredWouldYouRatherPrompt[]> {
    try { return await this.prisma.$transaction(prompts.map((prompt) => this.prisma.customWouldYouRatherPrompt.create({ data: { userId, ...prompt } }))); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new DuplicateWouldYouRatherPromptError();
      throw error;
    }
  }
  async create(userId: string, optionA: string, optionB: string, normalizedKey: string): Promise<StoredWouldYouRatherPrompt> {
    try { return await this.prisma.customWouldYouRatherPrompt.create({ data: { userId, optionA, optionB, normalizedKey } }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new DuplicateWouldYouRatherPromptError();
      throw error;
    }
  }
  async update(userId: string, id: string, data: { optionA?: string; optionB?: string; normalizedKey?: string; enabled?: boolean }): Promise<StoredWouldYouRatherPrompt | null> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const current = await tx.customWouldYouRatherPrompt.findFirst({ where: { id, userId } });
          if (!current) return null;
          const optionA = data.optionA ?? current.optionA;
          const optionB = data.optionB ?? current.optionB;
          if (normalizeWouldYouRatherOption(optionA) === normalizeWouldYouRatherOption(optionB)) throw new InvalidWouldYouRatherPromptError();
          return tx.customWouldYouRatherPrompt.update({ where: { id }, data: { ...data, optionA, optionB, normalizedKey: wouldYouRatherPromptKey(optionA, optionB) } });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === 'P2034' && attempt < 2) continue;
          if (error.code === 'P2002') throw new DuplicateWouldYouRatherPromptError();
        }
        throw error;
      }
    }
    throw new Error('No se pudo actualizar el dilema.');
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.customWouldYouRatherPrompt.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }
}

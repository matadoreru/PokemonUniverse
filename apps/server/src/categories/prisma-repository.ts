import { Prisma, type PrismaClient } from '@prisma/client';
import { DuplicateCustomCategoryError, type CustomCategoryRepository, type StoredCustomCategory } from './service.js';

export class PrismaCustomCategoryRepository implements CustomCategoryRepository {
  constructor(private readonly prisma: PrismaClient) {}
  findAll(): Promise<StoredCustomCategory[]> { return this.prisma.customCategory.findMany(); }
  async create(userId: string, text: string, normalizedText: string): Promise<StoredCustomCategory> {
    try { return await this.prisma.customCategory.create({ data: { userId, text, normalizedText } }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new DuplicateCustomCategoryError();
      throw error;
    }
  }
  async update(userId: string, id: string, data: { text?: string; normalizedText?: string; enabled?: boolean }): Promise<StoredCustomCategory | null> {
    const exists = await this.prisma.customCategory.findFirst({ where: { id, userId }, select: { id: true } });
    if (!exists) return null;
    try { return await this.prisma.customCategory.update({ where: { id }, data }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new DuplicateCustomCategoryError();
      throw error;
    }
  }
  async delete(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.customCategory.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }
}

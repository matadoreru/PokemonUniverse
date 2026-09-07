import { Prisma, type PrismaClient } from '@prisma/client';
import type { ChangelogChange } from '@pokemon-universe/shared';
import { DuplicateChangelogVersionError, type ChangelogRepository, type StoredChangelog } from './service.js';

export class PrismaChangelogRepository implements ChangelogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  list(publishedOnly: boolean): Promise<StoredChangelog[]> {
    return this.prisma.changelog.findMany({
      where: publishedOnly ? { published: true } : {},
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
  }

  findByVersion(version: string): Promise<StoredChangelog | null> {
    return this.prisma.changelog.findUnique({ where: { version } });
  }

  async create(data: { version: string; title: string; date: Date; published: boolean; content: ChangelogChange[] }): Promise<StoredChangelog> {
    try { return await this.prisma.changelog.create({ data: { ...data, content: data.content as Prisma.InputJsonValue } }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new DuplicateChangelogVersionError();
      throw error;
    }
  }

  async update(id: string, data: Partial<{ version: string; title: string; date: Date; published: boolean; content: ChangelogChange[] }>): Promise<StoredChangelog | null> {
    const exists = await this.prisma.changelog.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return null;
    try {
      const { content, ...rest } = data;
      return await this.prisma.changelog.update({ where: { id }, data: { ...rest, ...(content === undefined ? {} : { content: content as Prisma.InputJsonValue }) } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new DuplicateChangelogVersionError();
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    return (await this.prisma.changelog.deleteMany({ where: { id } })).count > 0;
  }
}

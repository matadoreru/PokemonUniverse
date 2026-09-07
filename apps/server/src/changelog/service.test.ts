import { describe, expect, it } from 'vitest';
import {
  ChangelogNotFoundError,
  ChangelogService,
  DuplicateChangelogVersionError,
  type ChangelogRepository,
  type StoredChangelog,
} from './service.js';

class MemoryRepository implements ChangelogRepository {
  entries: StoredChangelog[] = [];
  private nextId = 1;

  async list(publishedOnly: boolean) {
    return this.entries
      .filter((entry) => !publishedOnly || entry.published)
      .sort((left, right) => right.date.getTime() - left.date.getTime())
      .map((entry) => ({ ...entry }));
  }

  async findByVersion(version: string) {
    const entry = this.entries.find((candidate) => candidate.version === version);
    return entry ? { ...entry } : null;
  }

  async create(data: Parameters<ChangelogRepository['create']>[0]) {
    const now = new Date(`2026-09-0${this.nextId}T12:00:00.000Z`);
    const entry: StoredChangelog = { id: `change-${this.nextId++}`, ...data, createdAt: now, updatedAt: now };
    this.entries.push(entry); return { ...entry };
  }

  async update(id: string, data: Parameters<ChangelogRepository['update']>[1]) {
    const index = this.entries.findIndex((entry) => entry.id === id);
    if (index < 0) return null;
    const entry = { ...this.entries[index]!, ...data, updatedAt: new Date('2026-09-09T12:00:00.000Z') };
    this.entries[index] = entry; return { ...entry };
  }

  async delete(id: string) {
    const before = this.entries.length;
    this.entries = this.entries.filter((entry) => entry.id !== id);
    return before !== this.entries.length;
  }
}

const input = {
  version: '0.8.0', title: 'Pokémon Bingo Update', date: '2026-09-08T12:00:00.000Z', published: false,
  content: [{ type: 'NEW' as const, text: 'Añadido Pokémon Bingo.' }],
};

describe('ChangelogService', () => {
  it('keeps drafts private until an administrator publishes them', async () => {
    const service = new ChangelogService(new MemoryRepository());
    const draft = await service.create(input);
    expect(await service.listPublished()).toEqual([]);
    const published = await service.update(draft.id, { published: true });
    expect(published.published).toBe(true);
    expect(await service.listPublished()).toEqual([published]);
  });

  it('validates content and rejects duplicate semantic versions', async () => {
    const service = new ChangelogService(new MemoryRepository());
    await service.create(input);
    await expect(service.create(input)).rejects.toBeInstanceOf(DuplicateChangelogVersionError);
    await expect(service.create({ ...input, version: 'release-eight' })).rejects.toThrow('Usa una versión');
    await expect(service.create({ ...input, version: '0.8.1', content: [] })).rejects.toThrow('Añade al menos');
  });

  it('updates and removes entries while reporting missing ids', async () => {
    const service = new ChangelogService(new MemoryRepository());
    const created = await service.create(input);
    expect(await service.update(created.id, { title: 'Actualización de Bingo' })).toMatchObject({ title: 'Actualización de Bingo' });
    await service.delete(created.id);
    await expect(service.update(created.id, { published: true })).rejects.toBeInstanceOf(ChangelogNotFoundError);
    await expect(service.delete(created.id)).rejects.toBeInstanceOf(ChangelogNotFoundError);
  });
});

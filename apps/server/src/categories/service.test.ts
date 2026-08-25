import { describe, expect, it } from 'vitest';
import { CustomCategoryNotFoundError, CustomCategoryService, DuplicateCustomCategoryError, normalizeCustomCategory, type CustomCategoryRepository, type StoredCustomCategory } from './service.js';

class MemoryRepository implements CustomCategoryRepository {
  categories: StoredCustomCategory[] = [];
  nextId = 1;
  findAll = async () => this.categories.map((category) => ({ ...category }));
  create = async (userId: string, text: string, normalizedText: string) => {
    const now = new Date(this.nextId * 1_000);
    const category = { id: `c${this.nextId++}`, userId, text, normalizedText, enabled: true, createdAt: now, updatedAt: now };
    this.categories.push(category); return { ...category };
  };
  update = async (userId: string, id: string, data: { text?: string; normalizedText?: string; enabled?: boolean }) => {
    const index = this.categories.findIndex((category) => category.userId === userId && category.id === id);
    if (index < 0) return null;
    const current = this.categories[index]!;
    const updated = { ...current, ...data, updatedAt: new Date(current.updatedAt.getTime() + 1_000) };
    this.categories[index] = updated; return { ...updated };
  };
  delete = async (userId: string, id: string) => {
    const before = this.categories.length;
    this.categories = this.categories.filter((category) => category.userId !== userId || category.id !== id);
    return this.categories.length !== before;
  };
}

describe('CustomCategoryService', () => {
  it('normalizes accents and punctuation for duplicate protection', () => {
    expect(normalizeCustomCategory('  Pokémon, PARA  FIESTAS!! ')).toBe('pokemon para fiestas');
  });

  it('creates, edits, toggles and deletes only categories owned by the user', async () => {
    const repository = new MemoryRepository(); const service = new CustomCategoryService(repository); await service.load();
    const created = await service.create('u1', { text: 'Pokémon para el gimnasio' });
    expect(service.enabled('u1')).toEqual([{ id: created.id, text: 'Pokémon para el gimnasio' }]);
    const edited = await service.update('u1', created.id, { text: 'Pokémon para hacer deporte', enabled: false });
    expect(edited).toMatchObject({ text: 'Pokémon para hacer deporte', enabled: false }); expect(service.enabled('u1')).toEqual([]);
    await expect(service.update('u2', created.id, { enabled: true })).rejects.toBeInstanceOf(CustomCategoryNotFoundError);
    await service.delete('u1', created.id); expect(service.list('u1')).toEqual([]);
  });

  it('rejects equivalent duplicates and persists through a service reload', async () => {
    const repository = new MemoryRepository(); const first = new CustomCategoryService(repository); await first.load();
    await first.create('u1', { text: 'Pokémon para una CITA' });
    await expect(first.create('u1', { text: 'pokemon para una cita!' })).rejects.toBeInstanceOf(DuplicateCustomCategoryError);
    const restarted = new CustomCategoryService(repository); await restarted.load();
    expect(restarted.list('u1')).toHaveLength(1); expect(restarted.enabled('u1')[0]?.text).toBe('Pokémon para una CITA');
  });

  it('notifies consumers after every mutation so lobby validation stays current', async () => {
    const repository = new MemoryRepository(); const service = new CustomCategoryService(repository); await service.load();
    const changed: string[] = []; service.onChanged((userId) => changed.push(userId));
    const category = await service.create('u1', { text: 'Pokémon para cocinar' });
    await service.update('u1', category.id, { enabled: false }); await service.delete('u1', category.id);
    expect(changed).toEqual(['u1', 'u1', 'u1']);
  });
});

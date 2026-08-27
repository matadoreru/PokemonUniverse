import { describe, expect, it } from 'vitest';
import { DuplicateWouldYouRatherPromptError, InvalidWouldYouRatherPromptError, WouldYouRatherPromptNotFoundError, WouldYouRatherPromptService, normalizeWouldYouRatherOption, wouldYouRatherPromptKey, type StoredWouldYouRatherPrompt, type WouldYouRatherPromptRepository } from './service.js';

class MemoryRepository implements WouldYouRatherPromptRepository {
  prompts: StoredWouldYouRatherPrompt[] = [];
  nextId = 1;
  findAll = async () => this.prompts.map((prompt) => ({ ...prompt }));
  create = async (userId: string, optionA: string, optionB: string, normalizedKey: string) => {
    const now = new Date(this.nextId * 1_000);
    const prompt = { id: `w${this.nextId++}`, userId, optionA, optionB, normalizedKey, enabled: true, createdAt: now, updatedAt: now };
    this.prompts.push(prompt); return { ...prompt };
  };
  update = async (userId: string, id: string, data: { optionA?: string; optionB?: string; normalizedKey?: string; enabled?: boolean }) => {
    const index = this.prompts.findIndex((prompt) => prompt.userId === userId && prompt.id === id);
    if (index < 0) return null;
    const current = this.prompts[index]!;
    const updated = { ...current, ...data, updatedAt: new Date(current.updatedAt.getTime() + 1_000) };
    this.prompts[index] = updated; return { ...updated };
  };
  delete = async (userId: string, id: string) => {
    const before = this.prompts.length;
    this.prompts = this.prompts.filter((prompt) => prompt.userId !== userId || prompt.id !== id);
    return this.prompts.length !== before;
  };
}

describe('WouldYouRatherPromptService', () => {
  it('normalizes accents and treats a reversed pair as the same pair', () => {
    expect(normalizeWouldYouRatherOption('  Pokémon, EN  CASA!! ')).toBe('pokemon en casa');
    expect(wouldYouRatherPromptKey('Opción Á', 'Opción B')).toBe(wouldYouRatherPromptKey('opcion b!', 'opcion a'));
  });

  it('creates, edits, toggles and deletes only prompts owned by the user', async () => {
    const repository = new MemoryRepository(); const service = new WouldYouRatherPromptService(repository); await service.load();
    const created = await service.create('u1', { optionA: 'Vivir con Gengar', optionB: 'Viajar con Magikarp' });
    expect(service.enabled('u1')).toEqual([{ id: created.id, optionA: 'Vivir con Gengar', optionB: 'Viajar con Magikarp' }]);
    const edited = await service.update('u1', created.id, { optionA: 'Cenar con Gengar', enabled: false });
    expect(edited).toMatchObject({ optionA: 'Cenar con Gengar', enabled: false });
    await expect(service.update('u2', created.id, { enabled: true })).rejects.toBeInstanceOf(WouldYouRatherPromptNotFoundError);
    await service.delete('u1', created.id); expect(service.list('u1')).toEqual([]);
  });

  it('rejects equal options and equivalent duplicate pairs, including reversed pairs', async () => {
    const repository = new MemoryRepository(); const service = new WouldYouRatherPromptService(repository); await service.load();
    await expect(service.create('u1', { optionA: 'La misma opción', optionB: 'la misma opcion!' })).rejects.toBeInstanceOf(InvalidWouldYouRatherPromptError);
    await service.create('u1', { optionA: 'Vivir con Gengar', optionB: 'Viajar con Magikarp' });
    await expect(service.create('u1', { optionA: 'viajar con magikarp!', optionB: 'VIVIR CON GENGAR' })).rejects.toBeInstanceOf(DuplicateWouldYouRatherPromptError);
  });

  it('persists through reload and notifies rooms after every mutation', async () => {
    const repository = new MemoryRepository(); const first = new WouldYouRatherPromptService(repository); await first.load();
    const changed: string[] = []; first.onChanged((userId) => changed.push(userId));
    const prompt = await first.create('u1', { optionA: 'Elegir a Pikachu', optionB: 'Elegir a Eevee' });
    await first.update('u1', prompt.id, { enabled: false }); await first.delete('u1', prompt.id);
    expect(changed).toEqual(['u1', 'u1', 'u1']);
    await first.create('u1', { optionA: 'Dormir con Snorlax', optionB: 'Correr con Rapidash' });
    const restarted = new WouldYouRatherPromptService(repository); await restarted.load();
    expect(restarted.list('u1')).toHaveLength(1);
  });

  it('imports a versioned JSON batch and rejects duplicates before writing', async () => {
    const repository = new MemoryRepository(); const service = new WouldYouRatherPromptService(repository); await service.load();
    const imported = await service.import('u1', { version: 1, prompts: [
      { optionA: 'Entrenar con Pikachu', optionB: 'Dormir con Snorlax' },
      { optionA: 'Volar con Dragonite', optionB: 'Nadar con Lapras' },
    ] });
    expect(imported).toHaveLength(2); expect(service.enabled('u1')).toHaveLength(2);
    await expect(service.import('u1', { version: 1, prompts: [
      { optionA: 'Elegir a Eevee', optionB: 'Elegir a Mew' },
      { optionA: 'elegir a mew', optionB: 'ELEGIR A EEVEE' },
    ] })).rejects.toThrow(/JSON contiene dilemas duplicados/);
    expect(repository.prompts).toHaveLength(2);
  });
});

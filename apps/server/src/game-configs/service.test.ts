import { gameRegistry } from '@pokemon-universe/shared';
import { describe, expect, it, vi } from 'vitest';
import type { UserGameConfigRepository } from './prisma-repository.js';
import { migrateStoredGameConfig, UserGameConfigService } from './service.js';

function repository(rows: Awaited<ReturnType<UserGameConfigRepository['list']>> = []) {
  return {
    list: vi.fn(async () => rows),
    upsert: vi.fn(async () => undefined),
  } satisfies UserGameConfigRepository;
}

describe('user game configuration preferences', () => {
  it('keeps valid legacy values while filling new defaults and dropping retired keys', () => {
    const game = gameRegistry.get('pokeddle-race')!;
    const migrated = migrateStoredGameConfig(game, {
      generations: [1, 2], roundSeconds: 25, maxRounds: 7,
      clues: { generation: false, dexNumber: true, retiredClue: true },
      retiredSetting: 'legacy',
    }) as Record<string, any>;

    expect(migrated.generations).toEqual([1, 2]);
    expect(migrated.roundSeconds).toBe(25);
    expect(migrated.maxRounds).toBe(7);
    expect(migrated.clues.generation).toBe(false);
    expect(migrated.clues.dexNumber).toBe(true);
    expect(migrated.clues.types).toBe(true);
    expect(migrated.clues).not.toHaveProperty('retiredClue');
    expect(migrated).not.toHaveProperty('retiredSetting');
  });

  it('repairs only invalid branches before falling back to the complete default', () => {
    const game = gameRegistry.get('pokedex-distance')!;
    expect(migrateStoredGameConfig(game, { generations: [1], roundSeconds: 999 })).toEqual({
      generations: [1], roundSeconds: 20,
    });
    expect(migrateStoredGameConfig(game, 'corrupt')).toEqual(game.defaultConfig);
  });

  it('normalizes stored rows on load and coalesces rapid writes by user and game', async () => {
    const data = repository([{ userId: 'u1', gameId: 'pokedex-distance', config: { generations: [1], roundSeconds: 999, retired: true } }]);
    const service = new UserGameConfigService(data);
    await service.load();

    expect(service.forUser('u1').get('pokedex-distance')).toEqual({ generations: [1], roundSeconds: 20 });
    expect(data.upsert).toHaveBeenCalledWith('u1', 'pokedex-distance', { generations: [1], roundSeconds: 20 });

    data.upsert.mockClear();
    service.save('u1', 'pokedex-distance', { generations: [1], roundSeconds: 25 });
    service.save('u1', 'pokedex-distance', { generations: [2], roundSeconds: 30 });
    service.save('u1', 'shiny-vote', {
      generations: [1], roundSeconds: 15, rounds: 2, candidateMode: 'SAME_POKEMON', optionCount: 4, showVotes: true,
    });
    await service.flush();

    expect(data.upsert).toHaveBeenCalledTimes(2);
    expect(data.upsert).toHaveBeenCalledWith('u1', 'pokedex-distance', { generations: [2], roundSeconds: 30 });
    expect(data.upsert).toHaveBeenCalledWith('u1', 'shiny-vote', expect.objectContaining({ rounds: 2 }));
  });
});

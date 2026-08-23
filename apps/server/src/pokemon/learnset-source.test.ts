import { describe, expect, it } from 'vitest';
import { extractCanonicalLevelUpEntries, type SourceMoveEntry } from './learnset-source.js';

const moves: SourceMoveEntry[] = [
  { move: { name: 'tackle' }, version_group_details: [
    { level_learned_at: 1, move_learn_method: { name: 'level-up' }, version_group: { name: 'yellow' } },
    { level_learned_at: 5, move_learn_method: { name: 'machine' }, version_group: { name: 'yellow' } },
    { level_learned_at: 3, move_learn_method: { name: 'tutor' }, version_group: { name: 'yellow' } },
    { level_learned_at: 0, move_learn_method: { name: 'level-up' }, version_group: { name: 'yellow' } },
    { level_learned_at: 2, move_learn_method: { name: 'level-up' }, version_group: { name: 'red-blue' } },
    { level_learned_at: 4, move_learn_method: { name: 'level-up' }, version_group: { name: 'crystal' } },
  ] },
];

describe('canonical learnset source', () => {
  it('keeps level-up moves from the canonical version and includes level 1', () => {
    expect(extractCanonicalLevelUpEntries('pikachu', 1, moves)).toEqual([
      { pokemonId: 'pikachu', moveId: 'tackle', referenceGeneration: 1, level: 1 },
      { pokemonId: 'pikachu', moveId: 'tackle', referenceGeneration: 2, level: 4 },
    ]);
  });

  it('excludes machine, tutor, level-zero reminder and noncanonical version data', () => {
    const entries = extractCanonicalLevelUpEntries('pikachu', 1, moves);
    expect(entries).toHaveLength(2);
    expect(entries.some((entry) => [0, 2, 3, 5].includes(entry.level))).toBe(false);
  });

  it('does not generate entries before the Pokémon introduction generation', () => {
    expect(extractCanonicalLevelUpEntries('future', 3, moves)).toEqual([]);
  });
});

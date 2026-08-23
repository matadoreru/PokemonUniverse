import { GENERATION_LEARNSET_SOURCES, type Generation } from '@pokemon-universe/shared';

export interface SourceMoveEntry {
  move: { name: string };
  version_group_details: Array<{
    level_learned_at: number;
    move_learn_method: { name: string };
    version_group: { name: string };
  }>;
}

export interface CanonicalLevelUpEntry { pokemonId: string; moveId: string; referenceGeneration: number; level: number }

/** The only gateway from PokéAPI acquisition data into playable learnsets. */
export function extractCanonicalLevelUpEntries(pokemonId: string, introducedGeneration: Generation, moves: readonly SourceMoveEntry[]): CanonicalLevelUpEntry[] {
  const entries = new Map<string, CanonicalLevelUpEntry>();
  for (const move of moves) for (const generation of Object.keys(GENERATION_LEARNSET_SOURCES).map(Number) as Generation[]) {
    if (introducedGeneration > generation) continue;
    const source = GENERATION_LEARNSET_SOURCES[generation].versionGroup;
    for (const detail of move.version_group_details) {
      if (detail.move_learn_method.name !== 'level-up' || detail.level_learned_at < 1 || detail.version_group.name !== source) continue;
      const entry = { pokemonId, moveId: move.move.name, referenceGeneration: generation, level: detail.level_learned_at };
      entries.set(`${entry.pokemonId}:${entry.moveId}:${entry.referenceGeneration}:${entry.level}`, entry);
    }
  }
  return [...entries.values()];
}

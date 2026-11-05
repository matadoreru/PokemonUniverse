import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { GameContext, Pokemon, PokemonCatalog } from '../../index.js';
import {
  connectionCategoryCatalog, connectionCuratedTemplates, connectionsCategoryMemberIds, generateConnectionsPuzzle,
} from './catalog.js';

// Fixtures compartidas con el backend: los ids de todos los Pokémon por defecto con sprite (generaciones 1–9) y el
// catálogo dorado de las generaciones 1 y 2. Las regenera npm run golden:catalog.
const fixtures = new URL('../../../../../backend/src/test/resources/golden/catalog/', import.meta.url);
const defaultIds = new Set(JSON.parse(readFileSync(new URL('default-pokemon-ids.json', fixtures), 'utf8')) as string[]);
const gen12 = (JSON.parse(readFileSync(new URL('gen1-2.json', fixtures), 'utf8')) as { pokemon: Pokemon[] }).pokemon;

function catalog(entries: readonly Pokemon[]): PokemonCatalog {
  return {
    all: () => [...entries],
    byId: (id) => entries.find((pokemon) => pokemon.id === id),
    byDexNumber: (number) => entries.find((pokemon) => pokemon.nationalDexNumber === number),
    forGenerations: (generations) => entries.filter((pokemon) => generations.includes(pokemon.generation)),
  };
}

/** mulberry32, el PRNG de las fixtures doradas. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Pokémon Connections category catalog', () => {
  it('uses only slugs of default Pokémon that exist in the catalog', () => {
    expect(defaultIds.size).toBeGreaterThan(1_000);
    const unknown = connectionCategoryCatalog.flatMap((category) => (category.pokemonIds ?? [])
      .filter((id) => !defaultIds.has(id))
      .map((id) => `${category.id}:${id}`));
    const unknownInTemplates = connectionCuratedTemplates.flatMap((template) => template.groups
      .flatMap((group) => group.pokemonIds.filter((id) => !defaultIds.has(id)).map((id) => `${template.id}:${id}`)));
    expect([...unknown, ...unknownInTemplates]).toEqual([]);
  });

  it('keeps every category id unique and every list without repeated Pokémon', () => {
    expect(connectionCategoryCatalog.length).toBeGreaterThanOrEqual(90);
    expect(new Set(connectionCategoryCatalog.map((category) => category.id)).size).toBe(connectionCategoryCatalog.length);
    for (const category of connectionCategoryCatalog) {
      if (!category.pokemonIds) continue;
      expect(new Set(category.pokemonIds).size, category.id).toBe(category.pokemonIds.length);
    }
  });

  it('builds curated templates where every Pokémon fits exactly one of the chosen categories', () => {
    const definitions = new Map(connectionCategoryCatalog.map((category) => [category.id, category]));
    for (const template of connectionCuratedTemplates) {
      // El tablero de 16 usa los cuatro grupos; el de 12, cualquier rotación de tres.
      const boards = [template.groups, ...template.groups.map((_, offset) => [0, 1, 2].map((index) => template.groups[(offset + index) % template.groups.length]!))];
      for (const groups of boards) {
        const board = groups.flatMap((group) => group.pokemonIds);
        for (const group of groups) {
          const members = new Set(definitions.get(group.categoryId)?.pokemonIds ?? []);
          expect(group.pokemonIds.every((id) => members.has(id)), `${template.id}/${group.categoryId}`).toBe(true);
          expect(board.filter((id) => members.has(id)), `${template.id}/${group.categoryId}`).toHaveLength(group.pokemonIds.length);
        }
      }
    }
  });

  it('generates unambiguous dynamic boards on the real generation 1-2 catalog', () => {
    const pokemon = catalog(gen12);
    for (const generations of [[1], [2], [1, 2]]) {
      const pool = pokemon.forGenerations(generations).filter((entry) => entry.isDefault !== false && entry.sprite);
      const membership = connectionsCategoryMemberIds(pool);
      for (const groupSize of [3, 4, 5]) {
        for (const groupCount of [3, 4, 5]) {
          for (let seed = 1; seed <= 6; seed += 1) {
            const context: GameContext = { players: [], pokemon, now: 0, random: seeded(seed * 97 + groupSize * 11 + groupCount) };
            const puzzle = generateConnectionsPuzzle(context, { generations, groupSize, pokemonCount: groupSize * groupCount });
            const board = puzzle.groups.flatMap((group) => group.pokemon.map((entry) => entry.id));
            expect(new Set(board).size).toBe(groupSize * groupCount);
            for (const group of puzzle.groups) {
              const members = membership.get(group.categoryId)!;
              expect(board.filter((id) => members.has(id)), `${generations}/${groupSize}x${groupCount}/${group.categoryId}`).toHaveLength(groupSize);
            }
          }
        }
      }
    }
  });
});

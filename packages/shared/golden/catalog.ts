// Construye el catálogo de una fixture con el mismo filtrado y orden que producción
// (InMemoryPokemonCatalog del dist del servidor). Requiere npm run build -w @pokemon-universe/server.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Move, PokedexEntry, Pokemon, PokemonCatalog, PokemonEvolutionInfo } from '../dist/index.js';
import { InMemoryPokemonCatalog } from '../../../apps/server/dist/src/pokemon/catalog.js';
import { applyCatalogPatch } from './catalog-patch.js';
import type { GoldenCatalogPatch } from './types.js';

interface CatalogFixture {
  fixtureId: string;
  pokemon: Pokemon[];
  moves: Move[];
  learnsets: ConstructorParameters<typeof InMemoryPokemonCatalog>[2];
  evolution: Record<string, PokemonEvolutionInfo>;
  pokedexEntries: PokedexEntry[];
}

const cache = new Map<string, PokemonCatalog>();

function readFixture(fixtureId: string): CatalogFixture {
  const path = fileURLToPath(new URL(`../../../backend/src/test/resources/golden/catalog/${fixtureId}.json`, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8')) as CatalogFixture;
}

/** Sin parche, el catálogo se cachea por fixture; con parche se construye uno nuevo sobre las filas parcheadas. */
export function loadGoldenCatalog(fixtureId: string, patch?: GoldenCatalogPatch): PokemonCatalog {
  const cached = patch ? undefined : cache.get(fixtureId);
  if (cached) return cached;
  const fixture = readFixture(fixtureId);
  const pokemon = patch ? applyCatalogPatch(fixture.pokemon, patch) : fixture.pokemon;
  const catalog = new InMemoryPokemonCatalog(pokemon, fixture.moves, fixture.learnsets, fixture.evolution, fixture.pokedexEntries);
  if (!patch) cache.set(fixtureId, catalog);
  return catalog;
}

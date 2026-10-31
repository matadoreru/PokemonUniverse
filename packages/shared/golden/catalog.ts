// Construye el catálogo de una fixture con el mismo filtrado y orden que producción
// (InMemoryPokemonCatalog del dist del servidor). Requiere npm run build -w @pokemon-universe/server.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Move, PokedexEntry, Pokemon, PokemonCatalog, PokemonEvolutionInfo } from '../dist/index.js';
import { InMemoryPokemonCatalog } from '../../../apps/server/dist/src/pokemon/catalog.js';

interface CatalogFixture {
  fixtureId: string;
  pokemon: Pokemon[];
  moves: Move[];
  learnsets: ConstructorParameters<typeof InMemoryPokemonCatalog>[2];
  evolution: Record<string, PokemonEvolutionInfo>;
  pokedexEntries: PokedexEntry[];
}

const cache = new Map<string, PokemonCatalog>();

export function loadGoldenCatalog(fixtureId: string): PokemonCatalog {
  const cached = cache.get(fixtureId);
  if (cached) return cached;
  const path = fileURLToPath(new URL(`../../../backend/src/test/resources/golden/catalog/${fixtureId}.json`, import.meta.url));
  const fixture = JSON.parse(readFileSync(path, 'utf8')) as CatalogFixture;
  const catalog = new InMemoryPokemonCatalog(fixture.pokemon, fixture.moves, fixture.learnsets, fixture.evolution, fixture.pokedexEntries);
  cache.set(fixtureId, catalog);
  return catalog;
}

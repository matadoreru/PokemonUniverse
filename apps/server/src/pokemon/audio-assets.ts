import type { PokemonAudioCatalog, PokemonCryVersion } from '@pokemon-universe/shared';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';

const kindFor = (version: PokemonCryVersion) => version === 'LATEST' ? 'CRY_LATEST' : 'CRY_LEGACY';

export class InMemoryPokemonAudioCatalog implements PokemonAudioCatalog {
  private sources: ReadonlyMap<string, string>;

  constructor(entries: readonly { pokemonId: string; kind: string; url: string }[]) {
    this.sources = new Map(entries.map((entry) => [`${entry.pokemonId}:${entry.kind}`, entry.url]));
  }

  cryFor(pokemonId: string, version: PokemonCryVersion): string | null {
    return this.sources.get(`${pokemonId}:${kindFor(version)}`) ?? null;
  }

  pokemonIds(version?: PokemonCryVersion): readonly string[] {
    const suffix = version ? `:${kindFor(version)}` : null;
    return [...new Set([...this.sources.keys()].filter((key) => !suffix || key.endsWith(suffix)).map((key) => key.slice(0, key.indexOf(':'))))];
  }

  replaceWith(catalog: InMemoryPokemonAudioCatalog): void {
    this.sources = new Map(catalog.sources);
  }
}

export function metadataCries(pokemonId: string, metadata: Prisma.JsonValue): Array<{ pokemonId: string; kind: string; url: string }> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
  const cries = metadata.cries;
  if (!cries || typeof cries !== 'object' || Array.isArray(cries)) return [];
  return ([['CRY_LATEST', cries.latest], ['CRY_LEGACY', cries.legacy]] as const)
    .flatMap(([kind, url]) => typeof url === 'string' && url ? [{ pokemonId, kind, url }] : []);
}

export async function loadPokemonAudioCatalog(): Promise<InMemoryPokemonAudioCatalog> {
  const [references, legacyPokemon] = await Promise.all([
    prisma.pokemonAssetReference.findMany({
      where: { kind: { in: ['CRY_LATEST', 'CRY_LEGACY'] } },
      select: { pokemonId: true, kind: true, url: true },
      orderBy: [{ pokemonId: 'asc' }, { kind: 'asc' }, { isPrimary: 'desc' }, { updatedAt: 'desc' }],
    }),
    prisma.pokemon.findMany({ where: { metadata: { not: Prisma.JsonNull } }, select: { id: true, metadata: true } }),
  ]);
  const unique = new Map<string, { pokemonId: string; kind: string; url: string }>();
  for (const reference of [...references, ...legacyPokemon.flatMap((pokemon) => metadataCries(pokemon.id, pokemon.metadata))]) {
    if (!/^https:\/\/raw\.githubusercontent\.com\/PokeAPI\/cries\//.test(reference.url)) continue;
    const key = `${reference.pokemonId}:${reference.kind}`;
    if (!unique.has(key)) unique.set(key, reference);
  }
  return new InMemoryPokemonAudioCatalog([...unique.values()]);
}

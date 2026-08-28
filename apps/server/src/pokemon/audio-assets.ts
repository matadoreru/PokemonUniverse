import type { PokemonAudioCatalog, PokemonCryVersion } from '@pokemon-universe/shared';
import { prisma } from '../db.js';

const kindFor = (version: PokemonCryVersion) => version === 'LATEST' ? 'CRY_LATEST' : 'CRY_LEGACY';

export class InMemoryPokemonAudioCatalog implements PokemonAudioCatalog {
  private readonly sources: ReadonlyMap<string, string>;

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
}

export async function loadPokemonAudioCatalog(): Promise<InMemoryPokemonAudioCatalog> {
  const references = await prisma.pokemonAssetReference.findMany({
    where: { kind: { in: ['CRY_LATEST', 'CRY_LEGACY'] } },
    select: { pokemonId: true, kind: true, url: true },
    orderBy: [{ pokemonId: 'asc' }, { kind: 'asc' }, { isPrimary: 'desc' }, { updatedAt: 'desc' }],
  });
  const unique = new Map<string, { pokemonId: string; kind: string; url: string }>();
  for (const reference of references) {
    if (!/^https:\/\/raw\.githubusercontent\.com\/PokeAPI\/cries\//.test(reference.url)) continue;
    const key = `${reference.pokemonId}:${reference.kind}`;
    if (!unique.has(key)) unique.set(key, reference);
  }
  return new InMemoryPokemonAudioCatalog([...unique.values()]);
}

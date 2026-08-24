import type { PokemonCatalog, PokemonVisualAsset, PokemonVisualCatalog } from '@pokemon-universe/shared';
import { alphaBounds } from '@pokemon-universe/shared';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const artworkDirectoryCandidates = [resolve(process.cwd(), 'apps/server/assets/pokemon-artworks'), resolve(process.cwd(), 'assets/pokemon-artworks')];
export const POKEMON_ARTWORK_DIRECTORY = artworkDirectoryCandidates.find(existsSync) ?? artworkDirectoryCandidates[0]!;
const ARTWORK_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*\.png$/;

export function localArtworkLocation(pokemonId: string): string { return `local-artwork:${pokemonId}`; }

export function localArtworkPath(location: string): string | null {
  const match = /^local-artwork:([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(location); if (!match) return null;
  return resolve(POKEMON_ARTWORK_DIRECTORY, `${match[1]}.png`);
}

export class ServerPokemonVisualCatalog implements PokemonVisualCatalog {
  constructor(private readonly artworks: ReadonlyMap<string, PokemonVisualAsset>) {}
  artworkFor(pokemonId: string): PokemonVisualAsset | null { return this.artworks.get(pokemonId) ?? null; }
  artworkPokemonIds(): readonly string[] { return [...this.artworks.keys()]; }
}

async function inspectArtwork(fileName: string, pokemonId: string, directory: string): Promise<PokemonVisualAsset | null> {
  try {
    const input = await readFile(resolve(directory, fileName));
    const metadata = await sharp(input).metadata();
    if (metadata.format !== 'png' || !metadata.width || !metadata.height) return null;
    const raw = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alpha = new Uint8Array(raw.info.width * raw.info.height);
    let visible = 0;
    for (let source = 3, target = 0; source < raw.data.length; source += 4, target += 1) { const value = raw.data[source]!; alpha[target] = value; if (value > 24) visible += 1; }
    const bounds = alphaBounds({ width: raw.info.width, height: raw.info.height, alpha });
    if (!bounds || visible < raw.info.width * raw.info.height * 0.002) return null;
    return {
      pokemonId, source: 'ARTWORK', location: localArtworkLocation(pokemonId), width: metadata.width, height: metadata.height,
      alphaBounds: { x: bounds.x / raw.info.width, y: bounds.y / raw.info.height, width: bounds.width / raw.info.width, height: bounds.height / raw.info.height },
    };
  } catch (error) {
    console.warn(`Ignoring invalid Pokémon artwork ${fileName}:`, error instanceof Error ? error.message : error); return null;
  }
}

/** Automatic filename index plus one-time PNG/alpha validation at server startup. */
export async function loadPokemonVisualCatalog(pokemon: PokemonCatalog, directory = POKEMON_ARTWORK_DIRECTORY): Promise<ServerPokemonVisualCatalog> {
  let names: string[] = [];
  try { names = await readdir(directory); } catch (error) {
    console.warn('Pokémon artwork directory is unavailable:', error instanceof Error ? error.message : error);
  }
  const entries = await Promise.all(names.filter((name) => ARTWORK_NAME.test(name)).map(async (fileName) => {
    const pokemonId = fileName.slice(0, -4); if (!pokemon.byId(pokemonId)) { console.warn(`Ignoring artwork without catalog key: ${fileName}`); return null; }
    const asset = await inspectArtwork(fileName, pokemonId, directory); return asset ? [pokemonId, asset] as const : null;
  }));
  return new ServerPokemonVisualCatalog(new Map(entries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))));
}

import type { Pokemon, PokemonCatalog } from '@pokemon-universe/shared';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { loadPokemonVisualCatalog, localArtworkLocation, localArtworkPath } from './visual-assets.js';

const gengar: Pokemon = { id: 'gengar-mega', nationalDexNumber: 94, name: 'Mega-Gengar', generation: 6, isDefault: false, sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10038.png', hp: 1, attack: 1, defense: 1, specialAttack: 1, specialDefense: 1, speed: 1, baseStatTotal: 6, types: ['ghost', 'poison'] };
const catalog: PokemonCatalog = { all: () => [gengar], byId: (id) => id === gengar.id ? gengar : undefined, byDexNumber: () => undefined, forGenerations: () => [gengar] };

describe('local Pokémon artwork index', () => {
  it('automatically maps a valid PNG to the exact canonical form key and alpha bounds', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pokemon-artworks-'));
    const image = await sharp({ create: { width: 32, height: 32, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: await sharp({ create: { width: 16, height: 18, channels: 4, background: { r: 120, g: 30, b: 180, alpha: 1 } } }).png().toBuffer(), left: 8, top: 7 }]).png().toBuffer();
    await writeFile(join(directory, 'gengar-mega.png'), image);
    const visuals = await loadPokemonVisualCatalog(catalog, directory); const asset = visuals.artworkFor('gengar-mega');
    expect(visuals.artworkPokemonIds()).toEqual(['gengar-mega']); expect(asset).toMatchObject({ pokemonId: 'gengar-mega', source: 'ARTWORK', location: 'local-artwork:gengar-mega', width: 32, height: 32 }); expect(asset?.alphaBounds?.width).toBeGreaterThan(0);
  });
  it('ignores transparent, invalid, unknown and missing artwork files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pokemon-artworks-empty-'));
    await writeFile(join(directory, 'gengar-mega.png'), await sharp({ create: { width: 16, height: 16, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer());
    await writeFile(join(directory, 'unknown.png'), Buffer.from('not png'));
    const visuals = await loadPokemonVisualCatalog(catalog, directory); expect(visuals.artworkPokemonIds()).toEqual([]); expect(visuals.artworkFor('gengar-mega')).toBeNull();
    expect((await loadPokemonVisualCatalog(catalog, join(directory, 'missing'))).artworkPokemonIds()).toEqual([]);
  });
  it('resolves only slug-safe local source identifiers inside the dedicated directory', () => {
    expect(localArtworkLocation('vulpix-alola')).toBe('local-artwork:vulpix-alola'); expect(localArtworkPath('local-artwork:vulpix-alola')).toMatch(/pokemon-artworks\/vulpix-alola\.png$/); expect(localArtworkPath('local-artwork:../secret')).toBeNull();
  });
});

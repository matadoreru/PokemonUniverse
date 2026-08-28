import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { extractPokemonPalette, persistedPokemonPalette, POKEMON_PALETTE_VERSION } from './pokemon-palette-sync.js';

describe('Pokémon palette DataSync', () => {
  it('extracts stable dominant colours while ignoring transparent pixels', async () => {
    const image = await sharp({ create: { width: 12, height: 12, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([
        { input: await sharp({ create: { width: 6, height: 12, channels: 4, background: '#e85050' } }).png().toBuffer(), left: 0, top: 0 },
        { input: await sharp({ create: { width: 6, height: 6, channels: 4, background: '#3078d0' } }).png().toBuffer(), left: 6, top: 0 },
        { input: await sharp({ create: { width: 6, height: 6, channels: 4, background: '#f0c830' } }).png().toBuffer(), left: 6, top: 6 },
      ]).png().toBuffer();
    const palette = await extractPokemonPalette(image);
    expect(palette).toHaveLength(3); expect(palette.every((color) => /^#[0-9a-f]{6}$/.test(color))).toBe(true);
  });

  it('accepts only current palettes extracted from the same sprite source', () => {
    const metadata = { palette: ['#183048', '#d86048', '#f0c030'], paletteVersion: POKEMON_PALETTE_VERSION, paletteSpriteUrl: 'https://raw.githubusercontent.com/a.png' };
    expect(persistedPokemonPalette(metadata, 'https://raw.githubusercontent.com/a.png')).toEqual(metadata.palette);
    expect(persistedPokemonPalette(metadata, 'https://raw.githubusercontent.com/b.png')).toBeNull();
    expect(persistedPokemonPalette({ ...metadata, paletteVersion: 0 }, 'https://raw.githubusercontent.com/a.png')).toBeNull();
  });
});

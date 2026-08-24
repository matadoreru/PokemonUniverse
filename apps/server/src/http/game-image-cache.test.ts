import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { createPokemonSilhouette } from './game-image-cache.js';

describe('secure Pokémon silhouette processing', () => {
  it('normalizes the visible shape, preserves alpha and removes every source colour', async () => {
    const width = 20; const height = 10; const pixels = Buffer.alloc(width * height * 4);
    for (let y = 2; y < 8; y += 1) for (let x = 5; x < 15; x += 1) {
      const index = (y * width + x) * 4;
      pixels[index] = 245; pixels[index + 1] = 80; pixels[index + 2] = 120; pixels[index + 3] = x === 5 ? 128 : 255;
    }
    const source = await sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
    const silhouette = await createPokemonSilhouette(source);
    const decoded = await sharp(silhouette).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    expect(decoded.info).toMatchObject({ width: 320, height: 320, channels: 4 });
    let transparent = 0; let visible = 0;
    for (let index = 0; index < decoded.data.length; index += 4) {
      const alpha = decoded.data[index + 3]!;
      if (alpha === 0) transparent += 1;
      else {
        visible += 1;
        expect([...decoded.data.subarray(index, index + 3)]).toEqual([0, 0, 0]);
      }
    }
    expect(transparent).toBeGreaterThan(0);
    expect(visible).toBeGreaterThan(0);
  });
});

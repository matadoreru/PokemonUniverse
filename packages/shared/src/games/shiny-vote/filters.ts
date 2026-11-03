import type { GameAssetRecolor } from '../contracts.js';

/** Some decoys start from the official shiny palette before being recolored. */
export const FAKE_SHINY_SPRITE_PROBABILITY = 0.35;

/** Restrained palette shifts emulate official recolours without clipping highlights or shadows. */
export const FAKE_SHINY_PALETTES = [
  { hueShiftDegrees: 28, saturationScale: 0.9, lightnessScale: 1.02, contrast: 0.97 },
  { hueShiftDegrees: 76, saturationScale: 0.82, lightnessScale: 0.99, contrast: 0.95 },
  { hueShiftDegrees: 142, saturationScale: 0.86, lightnessScale: 1.01, contrast: 0.96 },
  { hueShiftDegrees: 196, saturationScale: 0.8, lightnessScale: 1.03, contrast: 0.94 },
  { hueShiftDegrees: 248, saturationScale: 0.84, lightnessScale: 0.98, contrast: 0.96 },
  { hueShiftDegrees: 310, saturationScale: 0.88, lightnessScale: 1.02, contrast: 0.95 },
] as const satisfies readonly GameAssetRecolor[];

/** Paleta del señuelo `index` sobre la tabla barajada de la ronda (`palettes`), con vuelta al principio. */
export function fakeShinyPalette(palettes: readonly GameAssetRecolor[], index: number): GameAssetRecolor {
  return palettes[index % palettes.length]!;
}

export function useShinySpriteForFake(random: () => number): boolean {
  return random() < FAKE_SHINY_SPRITE_PROBABILITY;
}

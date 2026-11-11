import { describe, expect, it } from 'vitest';
import { colors, contrast, cssName, typeColors, type PokemonType } from '../styles/tokens';
import { PLAYER_COLORS } from './player-color';

/** Hex de un `var(--…)` de la paleta, por el espejo de tokens.ts. */
function hexOf(value: string): string {
  const name = /^var\((--[a-z0-9-]+)\)$/.exec(value)?.[1];
  const type = name?.match(/^--type-([a-z]+)$/)?.[1];
  if (type) return typeColors[type as PokemonType];
  const key = (Object.keys(cssName) as (keyof typeof colors)[]).find((k) => cssName[k] === name);
  if (!key) throw new Error(`${value} no es un token conocido`);
  return colors[key];
}

describe('PLAYER_COLORS (E11)', () => {
  it('son 8, distintos y ninguno es un color de estado', () => {
    expect(PLAYER_COLORS).toHaveLength(8);
    expect(new Set(PLAYER_COLORS).size).toBe(8);
    for (const state of ['--ok', '--bad', '--warn', '--info', '--red', '--red-d', '--red-l', '--red-text']) {
      expect(PLAYER_COLORS).not.toContain(`var(${state})`);
    }
  });
  it('cada uno se distingue del azul noche de bandas y paneles (≥ 3:1)', () => {
    for (const color of PLAYER_COLORS) expect(contrast(hexOf(color), colors.navy), color).toBeGreaterThanOrEqual(3);
  });
});

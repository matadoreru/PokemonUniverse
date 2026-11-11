import { describe, expect, it } from 'vitest';
import { absurdPokedexConfigSchema, defaultAbsurdPokedexConfig } from './config.js';
import { absurdPokedexScoringLabel } from './rules.js';

const withoutMode = Object.fromEntries(Object.entries(defaultAbsurdPokedexConfig).filter(([key]) => key !== 'mode'));

describe('Pokédex Absurda: contrato compartido', () => {
  it('describe la puntuación de cada modo', () => {
    expect(absurdPokedexScoringLabel('CLASSIC')).toBe('+1 por cada voto y +2 a la más votada.');
    expect(absurdPokedexScoringLabel('REAL_ENTRY')).toBe('+2 si aciertas la oficial, +1 por cada jugador al que engañes y +1 por cada voto a la más graciosa.');
  });

  it('la configuración por defecto es válida y sin mode sale CLASSIC', () => {
    expect(absurdPokedexConfigSchema.parse(defaultAbsurdPokedexConfig)).toEqual(defaultAbsurdPokedexConfig);
    expect(absurdPokedexConfigSchema.parse(withoutMode).mode).toBe('CLASSIC');
    expect(absurdPokedexConfigSchema.parse({ ...withoutMode, mode: 'REAL_ENTRY' }).mode).toBe('REAL_ENTRY');
  });

  it('rechaza valores fuera de rango, un modo desconocido y claves desconocidas', () => {
    for (const bad of [{ rounds: 11 }, { rounds: 0 }, { writeSeconds: 29 }, { writeSeconds: 121 }, { voteSeconds: 14 }, { voteSeconds: 61 }, { mode: 'TURBO' }, { extra: 1 }]) {
      expect(absurdPokedexConfigSchema.safeParse({ ...defaultAbsurdPokedexConfig, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });
});

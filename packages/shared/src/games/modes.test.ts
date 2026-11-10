import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { GAME_MODES, gameModeCount, gameModeLabel, gameModeName } from './modes.js';
import { absurdPokedexConfigSchema, defaultAbsurdPokedexConfig } from './absurd-pokedex/config.js';
import { defaultHigherLowerConfig, higherLowerConfigSchema } from './higher-lower/config.js';
import { defaultLearnsetGuessConfig, learnsetGuessConfigSchema } from './learnset-guess/config.js';
import { defaultPokedexDistanceConfig, pokedexDistanceConfigSchema } from './pokedex-distance/config.js';
import { defaultPokemonImpostorConfig, pokemonImpostorConfigSchema } from './pokemon-impostor/config.js';
import { defaultShinyVoteConfig, shinyVoteConfigSchema } from './shiny-vote/config.js';
import { defaultTypeDuelConfig, typeDuelConfigSchema } from './type-duel/config.js';

const games: Array<[string, z.ZodType, Record<string, unknown>, string]> = [
  ['pokedex-distance', pokedexDistanceConfigSchema, defaultPokedexDistanceConfig, 'POINTS'],
  ['higher-lower', higherLowerConfigSchema, defaultHigherLowerConfig, 'ENDLESS'],
  ['shiny-vote', shinyVoteConfigSchema, defaultShinyVoteConfig, 'SURVIVAL'],
  ['learnset-guess', learnsetGuessConfigSchema, defaultLearnsetGuessConfig, 'MANUAL_REVEAL'],
  ['type-duel', typeDuelConfigSchema, defaultTypeDuelConfig, 'COOP'],
  ['pokemon-impostor', pokemonImpostorConfigSchema, defaultPokemonImpostorConfig, 'ONE_WORD'],
  ['absurd-pokedex', absurdPokedexConfigSchema, defaultAbsurdPokedexConfig, 'REAL_ENTRY'],
];

const without = (config: Record<string, unknown>, ...keys: string[]): Record<string, unknown> =>
  Object.fromEntries(Object.entries(config).filter(([key]) => !keys.includes(key)));

describe.each(games)('mode de %s', (gameId, schema, defaults, newMode) => {
  it('vale CLASSIC por defecto, también en una configuración guardada sin mode', () => {
    expect(defaults.mode).toBe('CLASSIC');
    const parsed = schema.parse(without(defaults, 'mode'));
    expect((parsed as { mode: string }).mode).toBe('CLASSIC');
  });

  it('acepta el modo nuevo y rechaza un valor desconocido o null', () => {
    expect((schema.parse({ ...defaults, mode: newMode }) as { mode: string }).mode).toBe(newMode);
    expect(schema.safeParse({ ...defaults, mode: 'TURBO' }).success).toBe(false);
    expect(schema.safeParse({ ...defaults, mode: null }).success).toBe(false);
  });

  it('el catálogo de modos tiene Clásico y el modo nuevo', () => {
    const catalog = GAME_MODES[gameId as keyof typeof GAME_MODES];
    expect(catalog.modes).toEqual(['CLASSIC', newMode]);
    expect(catalog.labels.CLASSIC).toBe('Clásico');
    expect(catalog.texts[newMode]).toBeTruthy();
  });
});

describe('ajustes propios de un modo', () => {
  it('pointsRounds de Distance: 3–30, 10 por defecto', () => {
    expect(defaultPokedexDistanceConfig.pointsRounds).toBe(10);
    expect(pokedexDistanceConfigSchema.parse(without(defaultPokedexDistanceConfig, 'pointsRounds')).pointsRounds).toBe(10);
    for (const ok of [3, 30]) expect(pokedexDistanceConfigSchema.safeParse({ ...defaultPokedexDistanceConfig, pointsRounds: ok }).success).toBe(true);
    for (const bad of [2, 31, 10.5]) expect(pokedexDistanceConfigSchema.safeParse({ ...defaultPokedexDistanceConfig, pointsRounds: bad }).success).toBe(false);
  });

  it('coopSeconds de Type Duel: 30–120, 60 por defecto', () => {
    expect(defaultTypeDuelConfig.coopSeconds).toBe(60);
    expect(typeDuelConfigSchema.parse(without(defaultTypeDuelConfig, 'coopSeconds')).coopSeconds).toBe(60);
    for (const ok of [30, 120]) expect(typeDuelConfigSchema.safeParse({ ...defaultTypeDuelConfig, coopSeconds: ok }).success).toBe(true);
    for (const bad of [29, 121, 60.5]) expect(typeDuelConfigSchema.safeParse({ ...defaultTypeDuelConfig, coopSeconds: bad }).success).toBe(false);
  });
});

describe('gameModeLabel', () => {
  it('da el nombre del modo nuevo y null en Clásico', () => {
    expect(gameModeLabel('pokedex-distance', { mode: 'POINTS' })).toBe('Por puntos');
    expect(gameModeLabel('higher-lower', { mode: 'ENDLESS' })).toBe('Racha infinita');
    expect(gameModeLabel('shiny-vote', { mode: 'SURVIVAL' })).toBe('Supervivencia');
    expect(gameModeLabel('learnset-guess', { mode: 'MANUAL_REVEAL' })).toBe('Revelación manual');
    expect(gameModeLabel('type-duel', { mode: 'COOP' })).toBe('Cooperativo');
    expect(gameModeLabel('pokemon-impostor', { mode: 'ONE_WORD' })).toBe('Una palabra');
    expect(gameModeLabel('absurd-pokedex', { mode: 'REAL_ENTRY' })).toBe('¿Cuál es la real?');
    expect(gameModeName('absurd-pokedex', 'REAL_ENTRY')).toBe('¿Cuál es la real?');
    expect(gameModeName('absurd-pokedex', 'CLASSIC')).toBe('Clásico');
    expect(gameModeLabel('pokedex-distance', { mode: 'CLASSIC' })).toBeNull();
    expect(gameModeLabel('pokedex-distance', {})).toBeNull();
  });

  it('null para un juego sin modos, un modo ajeno o una configuración que no es objeto', () => {
    expect(gameModeLabel('pokemon-bingo', { mode: 'POINTS' })).toBeNull();
    expect(gameModeLabel('higher-lower', { mode: 'POINTS' })).toBeNull();
    expect(gameModeLabel('higher-lower', null)).toBeNull();
    expect(gameModeLabel('higher-lower', 'ENDLESS')).toBeNull();
    expect(gameModeLabel('toString', { mode: 'CLASSIC' })).toBeNull();
  });
});

describe('unown-translator', () => {
  it('su modo Clásico se llama Pokémon y el nuevo, Movimientos', () => {
    expect(GAME_MODES['unown-translator'].modes).toEqual(['CLASSIC', 'MOVES']);
    expect(gameModeName('unown-translator', 'CLASSIC')).toBe('Pokémon');
    expect(gameModeName('unown-translator', 'MOVES')).toBe('Movimientos');
    expect(GAME_MODES['unown-translator'].texts.MOVES).toBe('Los mensajes son nombres de movimientos en lugar de Pokémon.');
  });
});

describe('gameModeCount y gameModeName', () => {
  it('cuenta los modos (1 sin modos) y nombra cualquier modo del juego, también Clásico', () => {
    expect(gameModeCount('higher-lower')).toBe(2);
    expect(gameModeCount('pokemon-bingo')).toBe(1);
    expect(gameModeName('higher-lower', 'CLASSIC')).toBe('Clásico');
    expect(gameModeName('higher-lower', 'ENDLESS')).toBe('Racha infinita');
    expect(gameModeName('higher-lower', 'POINTS')).toBeNull();
    expect(gameModeName('pokemon-bingo', 'CLASSIC')).toBeNull();
  });
});

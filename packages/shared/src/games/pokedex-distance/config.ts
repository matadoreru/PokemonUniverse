import { z } from 'zod';
import { pokemonGenerationsSchema } from '../config.js';
import { GENERATIONS } from '../../pokemon/types.js';

/**
 * `HIDDEN`: las elecciones de los rivales no se publican hasta el resultado de la ronda y se permiten elecciones
 * repetidas. `LIVE`: se ven al momento y cada Pokémon elegido queda bloqueado (permite copiar).
 */
export const POKEDEX_DISTANCE_SELECTION_VISIBILITIES = ['HIDDEN', 'LIVE'] as const;
export type PokedexDistanceSelectionVisibility = (typeof POKEDEX_DISTANCE_SELECTION_VISIBILITIES)[number];

/** Modos de juego: `CLASSIC` (el de siempre) y `POINTS` (nadie queda fuera; suma puntos por ronda). */
export const POKEDEX_DISTANCE_MODES = ['CLASSIC', 'POINTS'] as const;
export type PokedexDistanceMode = (typeof POKEDEX_DISTANCE_MODES)[number];
/** Rondas de una partida `POINTS`; se valida en todos los modos. */
export const POKEDEX_DISTANCE_POINTS_ROUNDS_RANGE = { min: 3, max: 30 } as const;

export const pokedexDistanceConfigSchema = z.object({
  generations: pokemonGenerationsSchema,
  roundSeconds: z.number().int().min(10).max(60),
  selectionVisibility: z.enum(POKEDEX_DISTANCE_SELECTION_VISIBILITIES),
  pointsRounds: z.number().int().min(POKEDEX_DISTANCE_POINTS_ROUNDS_RANGE.min).max(POKEDEX_DISTANCE_POINTS_ROUNDS_RANGE.max).default(10),
  mode: z.enum(POKEDEX_DISTANCE_MODES).default('CLASSIC'),
});

export type PokedexDistanceConfig = z.infer<typeof pokedexDistanceConfigSchema>;

export const defaultPokedexDistanceConfig: PokedexDistanceConfig = {
  generations: [...GENERATIONS],
  roundSeconds: 20,
  selectionVisibility: 'HIDDEN',
  pointsRounds: 10,
  mode: 'CLASSIC',
};

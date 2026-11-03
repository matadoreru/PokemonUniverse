import { z } from 'zod';
import { pokemonGenerationsSchema } from '../config.js';
import { GENERATIONS } from '../../pokemon/types.js';

/**
 * `HIDDEN`: las elecciones de los rivales no se publican hasta el resultado de la ronda y se permiten elecciones
 * repetidas. `LIVE`: se ven al momento y cada Pokémon elegido queda bloqueado (permite copiar).
 */
export const POKEDEX_DISTANCE_SELECTION_VISIBILITIES = ['HIDDEN', 'LIVE'] as const;
export type PokedexDistanceSelectionVisibility = (typeof POKEDEX_DISTANCE_SELECTION_VISIBILITIES)[number];

export const pokedexDistanceConfigSchema = z.object({
  generations: pokemonGenerationsSchema,
  roundSeconds: z.number().int().min(10).max(60),
  selectionVisibility: z.enum(POKEDEX_DISTANCE_SELECTION_VISIBILITIES),
});

export type PokedexDistanceConfig = z.infer<typeof pokedexDistanceConfigSchema>;

export const defaultPokedexDistanceConfig: PokedexDistanceConfig = {
  generations: [...GENERATIONS],
  roundSeconds: 20,
  selectionVisibility: 'HIDDEN',
};

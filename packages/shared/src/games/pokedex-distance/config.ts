import { z } from 'zod';
import { pokemonGenerationsSchema } from '../config.js';
import { GENERATIONS } from '../../pokemon/types.js';

export const pokedexDistanceConfigSchema = z.object({
  generations: pokemonGenerationsSchema,
  roundSeconds: z.number().int().min(10).max(60),
});

export type PokedexDistanceConfig = z.infer<typeof pokedexDistanceConfigSchema>;

export const defaultPokedexDistanceConfig: PokedexDistanceConfig = {
  generations: [...GENERATIONS],
  roundSeconds: 20,
};

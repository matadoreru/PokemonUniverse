import { z } from 'zod';
import { GENERATIONS } from '../../pokemon/types.js';

export const pokedexDistanceConfigSchema = z.object({
  generations: z.array(z.number().int().min(1).max(9)).min(1).transform((values) => [...new Set(values)].sort()),
  roundSeconds: z.number().int().min(10).max(60),
});

export type PokedexDistanceConfig = z.infer<typeof pokedexDistanceConfigSchema>;

export const defaultPokedexDistanceConfig: PokedexDistanceConfig = {
  generations: [...GENERATIONS],
  roundSeconds: 20,
};

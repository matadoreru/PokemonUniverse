import { z } from 'zod';
import { pokemonGenerationsSchema } from '../config.js';
import { GENERATIONS } from '../../pokemon/types.js';

export const whosThatPokemonConfigSchema = z.object({
  generations: pokemonGenerationsSchema,
  roundSeconds: z.number().int().min(10).max(60),
  rounds: z.number().int().min(1).max(20),
  hintsEnabled: z.boolean(),
  includeRegionalForms: z.boolean(),
}).strict();

export type WhosThatPokemonConfig = z.infer<typeof whosThatPokemonConfigSchema>;

export const defaultWhosThatPokemonConfig: WhosThatPokemonConfig = {
  generations: [...GENERATIONS],
  roundSeconds: 20,
  rounds: 10,
  hintsEnabled: false,
  includeRegionalForms: true,
};

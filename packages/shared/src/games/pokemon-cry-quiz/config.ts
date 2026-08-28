import { z } from 'zod';
import { GENERATIONS } from '../../pokemon/types.js';
import { pokemonGenerationsSchema } from '../config.js';

export const pokemonCryQuizConfigSchema = z.object({
  generations: pokemonGenerationsSchema,
  roundSeconds: z.number().int().min(10).max(60),
  rounds: z.number().int().min(1).max(20),
  cryVersion: z.enum(['LATEST', 'LEGACY', 'RANDOM']),
  includeRegionalForms: z.boolean(),
}).strict();

export type PokemonCryQuizConfig = z.infer<typeof pokemonCryQuizConfigSchema>;

export const defaultPokemonCryQuizConfig: PokemonCryQuizConfig = {
  generations: [...GENERATIONS],
  roundSeconds: 20,
  rounds: 10,
  cryVersion: 'LATEST',
  includeRegionalForms: false,
};

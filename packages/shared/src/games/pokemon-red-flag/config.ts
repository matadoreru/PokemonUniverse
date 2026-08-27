import { z } from 'zod';
import { GENERATIONS } from '../../pokemon/types.js';
import { pokemonGenerationsSchema } from '../config.js';

export const pokemonRedFlagConfigSchema = z.object({
  generations: pokemonGenerationsSchema,
  rounds: z.number().int().min(1).max(10),
  phaseSeconds: z.number().int().min(15).max(120),
  includeForms: z.boolean(),
  mode: z.enum(['RED', 'GREEN', 'MIXED']),
}).strict();

export type PokemonRedFlagConfig = z.infer<typeof pokemonRedFlagConfigSchema>;

export const defaultPokemonRedFlagConfig: PokemonRedFlagConfig = {
  generations: [...GENERATIONS],
  rounds: 5,
  phaseSeconds: 30,
  includeForms: true,
  mode: 'RED',
};

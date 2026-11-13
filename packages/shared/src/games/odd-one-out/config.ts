import { z } from 'zod';
import { GENERATIONS } from '../../pokemon/types.js';
import { pokemonGenerationsSchema } from '../config.js';

/** Sin modos: una clave `mode` se rechaza como clave desconocida. */
export const oddOneOutConfigSchema = z.object({
  generations: pokemonGenerationsSchema,
  rounds: z.number().int().min(3).max(30),
  roundSeconds: z.number().int().min(10).max(60),
}).strict();

export type OddOneOutConfig = z.infer<typeof oddOneOutConfigSchema>;

export const defaultOddOneOutConfig: OddOneOutConfig = {
  generations: [...GENERATIONS],
  rounds: 10,
  roundSeconds: 20,
};

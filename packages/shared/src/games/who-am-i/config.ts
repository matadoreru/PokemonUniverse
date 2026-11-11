import { z } from 'zod';
import { GENERATIONS } from '../../pokemon/types.js';
import { pokemonGenerationsSchema } from '../config.js';

/** Sin modos: una clave `mode` se rechaza como clave desconocida. */
export const whoAmIConfigSchema = z.object({
  generations: pokemonGenerationsSchema,
  maxLaps: z.number().int().min(3).max(20),
  askSeconds: z.number().int().min(20).max(90),
  answerSeconds: z.number().int().min(10).max(60),
}).strict();

export type WhoAmIConfig = z.infer<typeof whoAmIConfigSchema>;

export const defaultWhoAmIConfig: WhoAmIConfig = {
  generations: [...GENERATIONS],
  maxLaps: 10,
  askSeconds: 45,
  answerSeconds: 20,
};

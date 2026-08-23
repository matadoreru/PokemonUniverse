import { z } from 'zod';
import { GENERATIONS } from '../../pokemon/types.js';
export const typeDuelConfigSchema = z.object({
  generations: z.array(z.number().int().min(1).max(9)).min(1).transform((values) => [...new Set(values)].sort()),
  typeSelectSeconds: z.number().int().min(5).max(60), searchSeconds: z.number().int().min(10).max(60), rounds: z.number().int().min(1).max(50),
});
export type TypeDuelConfig = z.infer<typeof typeDuelConfigSchema>;
export const defaultTypeDuelConfig: TypeDuelConfig = { generations: [...GENERATIONS], typeSelectSeconds: 15, searchSeconds: 20, rounds: 10 };

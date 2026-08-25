import { z } from 'zod';
import { pokemonGenerationsSchema } from '../config.js';
import { GENERATIONS } from '../../pokemon/types.js';

export const typeChainConfigSchema = z.object({
  generations: pokemonGenerationsSchema,
  turnSeconds: z.number().int().min(10).max(45),
}).strict();

export type TypeChainConfig = z.infer<typeof typeChainConfigSchema>;
export const defaultTypeChainConfig: TypeChainConfig = { generations: [...GENERATIONS], turnSeconds: 15 };

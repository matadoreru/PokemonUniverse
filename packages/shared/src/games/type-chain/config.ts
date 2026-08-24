import { z } from 'zod';
import { GENERATIONS } from '../../pokemon/types.js';

export const typeChainConfigSchema = z.object({
  generations: z.array(z.number().int().min(1).max(9)).min(1).transform((values) => [...new Set(values)].sort((a, b) => a - b)),
  turnSeconds: z.number().int().min(10).max(45),
}).strict();

export type TypeChainConfig = z.infer<typeof typeChainConfigSchema>;
export const defaultTypeChainConfig: TypeChainConfig = { generations: [...GENERATIONS], turnSeconds: 15 };

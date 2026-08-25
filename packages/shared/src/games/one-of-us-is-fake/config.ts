import { z } from 'zod';
import { GENERATIONS } from '../../pokemon/types.js';
import { pokemonGenerationsSchema } from '../config.js';

export const categorySourceSchema = z.enum(['OFFICIAL', 'CUSTOM', 'BOTH']);
export type CategorySource = z.infer<typeof categorySourceSchema>;

export const oneOfUsIsFakeConfigSchema = z.object({
  generations: pokemonGenerationsSchema,
  selectionSeconds: z.number().int().min(15).max(120),
  discussionSeconds: z.number().int().min(30).max(600),
  rounds: z.number().int().min(1).max(30),
  fakeKnows: z.boolean(),
  categorySource: categorySourceSchema,
  includeRegionalForms: z.boolean(),
}).strict();

export type OneOfUsIsFakeConfig = z.infer<typeof oneOfUsIsFakeConfigSchema>;

export const defaultOneOfUsIsFakeConfig: OneOfUsIsFakeConfig = {
  generations: [...GENERATIONS],
  selectionSeconds: 30,
  discussionSeconds: 180,
  rounds: 5,
  fakeKnows: false,
  categorySource: 'OFFICIAL',
  includeRegionalForms: true,
};

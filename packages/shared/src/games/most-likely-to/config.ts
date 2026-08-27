import { z } from 'zod';
import { GENERATIONS } from '../../pokemon/types.js';
import { pokemonGenerationsSchema, subjectivePromptSourceSchema } from '../config.js';

export const mostLikelyToConfigSchema = z.object({
  generations: pokemonGenerationsSchema,
  rounds: z.number().int().min(1).max(10),
  selectionSeconds: z.number().int().min(15).max(120),
  votingSeconds: z.number().int().min(15).max(120),
  promptSource: subjectivePromptSourceSchema,
  includeForms: z.boolean(),
}).strict();

export type MostLikelyToConfig = z.infer<typeof mostLikelyToConfigSchema>;

export const defaultMostLikelyToConfig: MostLikelyToConfig = {
  generations: [...GENERATIONS],
  rounds: 5,
  selectionSeconds: 45,
  votingSeconds: 30,
  promptSource: 'OFFICIAL',
  includeForms: true,
};

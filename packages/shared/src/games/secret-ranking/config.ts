import { z } from 'zod';
import { GENERATIONS } from '../../pokemon/types.js';
import { pokemonGenerationsSchema, subjectivePromptSourceSchema } from '../config.js';

export const secretRankingConfigSchema = z.object({
  generations: pokemonGenerationsSchema,
  rounds: z.number().int().min(1).max(10),
  roundSeconds: z.number().int().min(15).max(120),
  promptSource: subjectivePromptSourceSchema,
  includeForms: z.boolean(),
}).strict();

export type SecretRankingConfig = z.infer<typeof secretRankingConfigSchema>;

export const defaultSecretRankingConfig: SecretRankingConfig = {
  generations: [...GENERATIONS],
  rounds: 3,
  roundSeconds: 45,
  promptSource: 'OFFICIAL',
  includeForms: true,
};

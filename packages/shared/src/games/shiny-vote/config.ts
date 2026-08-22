import { z } from 'zod';
import { GENERATIONS } from '../../pokemon/types.js';

export const shinyVoteConfigSchema = z.object({
  generations: z.array(z.number().int().min(1).max(9)).min(1).transform((values) => [...new Set(values)].sort()),
  roundSeconds: z.number().int().min(10).max(60),
  rounds: z.number().int().min(1).max(50),
});

export type ShinyVoteConfig = z.infer<typeof shinyVoteConfigSchema>;

export const defaultShinyVoteConfig: ShinyVoteConfig = {
  generations: [...GENERATIONS],
  roundSeconds: 20,
  rounds: 10,
};

import { z } from 'zod';
import { GENERATIONS } from '../../pokemon/types.js';

export const SHINY_CANDIDATE_MODES = ['SAME_POKEMON', 'DIFFERENT_POKEMON'] as const;
export type ShinyCandidateMode = (typeof SHINY_CANDIDATE_MODES)[number];

export const shinyVoteConfigSchema = z.object({
  generations: z.array(z.number().int().min(1).max(9)).min(1).transform((values) => [...new Set(values)].sort()),
  roundSeconds: z.number().int().min(10).max(60),
  rounds: z.number().int().min(1).max(50),
  candidateMode: z.enum(SHINY_CANDIDATE_MODES),
  optionCount: z.number().int().min(3).max(6),
  showVotes: z.boolean(),
});

export type ShinyVoteConfig = z.infer<typeof shinyVoteConfigSchema>;

export const defaultShinyVoteConfig: ShinyVoteConfig = {
  generations: [...GENERATIONS],
  roundSeconds: 20,
  rounds: 10,
  candidateMode: 'SAME_POKEMON',
  optionCount: 4,
  showVotes: true,
};

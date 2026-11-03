import { z } from 'zod';
import { pokemonGenerationsSchema } from '../config.js';
import { GENERATIONS } from '../../pokemon/types.js';

export const SHINY_CANDIDATE_MODES = ['SAME_POKEMON', 'DIFFERENT_POKEMON'] as const;
export type ShinyCandidateMode = (typeof SHINY_CANDIDATE_MODES)[number];

/** `REVEAL`: los votos se publican al revelar la ronda. `LIVE`: se ven mientras la ronda sigue abierta (permite copiar). */
export const SHINY_VOTE_VISIBILITIES = ['REVEAL', 'LIVE'] as const;
export type ShinyVoteVisibility = (typeof SHINY_VOTE_VISIBILITIES)[number];

export const shinyVoteConfigSchema = z.object({
  generations: pokemonGenerationsSchema,
  roundSeconds: z.number().int().min(10).max(60),
  rounds: z.number().int().min(1).max(50),
  candidateMode: z.enum(SHINY_CANDIDATE_MODES),
  optionCount: z.number().int().min(3).max(6),
  voteVisibility: z.enum(SHINY_VOTE_VISIBILITIES),
});

export type ShinyVoteConfig = z.infer<typeof shinyVoteConfigSchema>;

export const defaultShinyVoteConfig: ShinyVoteConfig = {
  generations: [...GENERATIONS],
  roundSeconds: 20,
  rounds: 10,
  candidateMode: 'SAME_POKEMON',
  optionCount: 4,
  voteVisibility: 'REVEAL',
};

import { GENERATIONS } from '../../pokemon/types.js';
import { z } from 'zod';
import { pokemonGenerationsSchema } from '../config.js';

export const learnsetGuessConfigSchema = z.object({
  generations: pokemonGenerationsSchema,
  showLevels: z.boolean(),
  showEvolution: z.boolean(),
  roundSeconds: z.number().int().min(15).max(120),
  rounds: z.number().int().min(1).max(20),
}).strict();

export type LearnsetGuessConfig = z.infer<typeof learnsetGuessConfigSchema>;
export const defaultLearnsetGuessConfig: LearnsetGuessConfig = {
  generations: [...GENERATIONS], showLevels: true, showEvolution: true, roundSeconds: 60, rounds: 10,
};

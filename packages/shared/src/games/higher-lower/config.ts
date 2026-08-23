import { z } from 'zod';
import { GENERATIONS } from '../../pokemon/types.js';

export const HIGHER_LOWER_CATEGORIES = ['DEX_NUMBER', 'HP', 'ATTACK', 'DEFENSE', 'SPECIAL_ATTACK', 'SPECIAL_DEFENSE', 'SPEED', 'BASE_STAT_TOTAL'] as const;
export type HigherLowerCategory = (typeof HIGHER_LOWER_CATEGORIES)[number];
export const HIGHER_LOWER_VISIBILITIES = ['REALTIME', 'REVEAL'] as const;
export type HigherLowerAnswerVisibility = (typeof HIGHER_LOWER_VISIBILITIES)[number];
export const HIGHER_LOWER_DIFFICULTIES = ['VERY_EASY', 'EASY', 'NORMAL', 'HARD', 'VERY_HARD'] as const;
export type HigherLowerDifficulty = (typeof HIGHER_LOWER_DIFFICULTIES)[number];

export const higherLowerConfigSchema = z.object({
  generations: z.array(z.number().int().min(1).max(9)).min(1).transform((values) => [...new Set(values)].sort()),
  categories: z.array(z.enum(HIGHER_LOWER_CATEGORIES)).min(1).transform((values) => [...new Set(values)]),
  showPreviousValue: z.boolean(),
  answerVisibility: z.enum(HIGHER_LOWER_VISIBILITIES),
  difficulty: z.enum(HIGHER_LOWER_DIFFICULTIES),
  roundSeconds: z.number().int().min(10).max(60),
  rounds: z.number().int().min(1).max(50),
});
export type HigherLowerConfig = z.infer<typeof higherLowerConfigSchema>;

export const defaultHigherLowerConfig: HigherLowerConfig = {
  generations: [...GENERATIONS], categories: [...HIGHER_LOWER_CATEGORIES], showPreviousValue: true,
  answerVisibility: 'REALTIME', difficulty: 'NORMAL', roundSeconds: 20, rounds: 10,
};

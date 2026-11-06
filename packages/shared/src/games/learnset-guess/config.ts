import { GENERATIONS } from '../../pokemon/types.js';
import { z } from 'zod';
import { pokemonGenerationsSchema } from '../config.js';

/** Modos de juego: `CLASSIC` y `MANUAL_REVEAL` (cada fallo enseña más movimientos). */
export const LEARNSET_GUESS_MODES = ['CLASSIC', 'MANUAL_REVEAL'] as const;
export type LearnsetGuessMode = (typeof LEARNSET_GUESS_MODES)[number];

export const learnsetGuessConfigSchema = z.object({
  generations: pokemonGenerationsSchema,
  showLevels: z.boolean(),
  showEvolution: z.boolean(),
  roundSeconds: z.number().int().min(15).max(120),
  rounds: z.number().int().min(1).max(20),
  mode: z.enum(LEARNSET_GUESS_MODES).default('CLASSIC'),
}).strict();

export type LearnsetGuessConfig = z.infer<typeof learnsetGuessConfigSchema>;
export const defaultLearnsetGuessConfig: LearnsetGuessConfig = {
  generations: [...GENERATIONS], showLevels: true, showEvolution: true, roundSeconds: 60, rounds: 10, mode: 'CLASSIC',
};

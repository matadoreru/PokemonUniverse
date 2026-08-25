import { z } from 'zod';
import { pokemonGenerationsSchema } from '../config.js';
import { GENERATIONS } from '../../pokemon/types.js';

export const guessFromStatsFieldsSchema = z.object({
  hp: z.boolean(), attack: z.boolean(), defense: z.boolean(), specialAttack: z.boolean(), specialDefense: z.boolean(), speed: z.boolean(), bst: z.boolean(),
}).strict();

export const guessFromStatsHintsSchema = z.object({
  generation: z.boolean(), types: z.boolean(), typeCount: z.boolean(), evolution: z.boolean(), height: z.boolean(), weight: z.boolean(), category: z.boolean(),
}).strict();

export const guessFromStatsConfigSchema = z.object({
  generations: pokemonGenerationsSchema,
  roundSeconds: z.number().int().min(15).max(60), rounds: z.number().int().min(1).max(20),
  stats: guessFromStatsFieldsSchema, hintsEnabled: z.boolean(), hints: guessFromStatsHintsSchema,
}).strict().superRefine((value, context) => {
  if (Object.values(value.stats).filter(Boolean).length < 2) context.addIssue({ code: 'custom', path: ['stats'], message: 'Selecciona al menos 2 estadísticas.' });
  if (value.hintsEnabled && !Object.values(value.hints).some(Boolean)) context.addIssue({ code: 'custom', path: ['hints'], message: 'Selecciona al menos una pista adicional.' });
});

export type GuessFromStatsConfig = z.infer<typeof guessFromStatsConfigSchema>;
export type GuessFromStatsField = keyof GuessFromStatsConfig['stats'];
export type GuessFromStatsHintKey = keyof GuessFromStatsConfig['hints'];

export const defaultGuessFromStatsConfig: GuessFromStatsConfig = {
  generations: [...GENERATIONS], roundSeconds: 30, rounds: 10,
  stats: { hp: true, attack: true, defense: true, specialAttack: true, specialDefense: true, speed: true, bst: false },
  hintsEnabled: false,
  hints: { generation: true, types: true, typeCount: false, evolution: true, height: false, weight: false, category: false },
};

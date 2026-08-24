import { z } from 'zod';
import { GENERATIONS } from '../../pokemon/types.js';

export const pokedexEntryHintConfigSchema = z.object({
  generation: z.boolean(), type: z.boolean(), evolution: z.boolean(), typeCount: z.boolean(), category: z.boolean(),
}).strict();

export const pokedexEntryGuessConfigSchema = z.object({
  generations: z.array(z.number().int().min(1).max(9)).min(1).transform((values) => [...new Set(values)].sort((a, b) => a - b)),
  roundSeconds: z.number().int().min(15).max(60),
  rounds: z.number().int().min(1).max(20),
  hintsEnabled: z.boolean(),
  hints: pokedexEntryHintConfigSchema,
}).strict().superRefine((value, context) => {
  if (value.hintsEnabled && !Object.values(value.hints).some(Boolean)) context.addIssue({ code: 'custom', path: ['hints'], message: 'Selecciona al menos una pista adicional.' });
});

export type PokedexEntryGuessConfig = z.infer<typeof pokedexEntryGuessConfigSchema>;

export const defaultPokedexEntryGuessConfig: PokedexEntryGuessConfig = {
  generations: [...GENERATIONS], roundSeconds: 25, rounds: 10, hintsEnabled: false,
  hints: { generation: true, type: true, evolution: true, typeCount: false, category: false },
};

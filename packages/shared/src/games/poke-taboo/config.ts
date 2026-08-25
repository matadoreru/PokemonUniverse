import { z } from 'zod';
import { GENERATIONS } from '../../pokemon/types.js';
import { pokemonGenerationsSchema } from '../config.js';

const tabooRoundSeconds = [30, 45, 60, 90, 120] as const;

export const pokeTabooConfigSchema = z.object({
  generations: pokemonGenerationsSchema,
  roundSeconds: z.number().int().refine(
    (value) => tabooRoundSeconds.includes(value as (typeof tabooRoundSeconds)[number]),
    'El tiempo debe ser 30, 45, 60, 90 o 120 segundos.',
  ),
  laps: z.number().int().min(1).max(5),
  includeRegionalForms: z.boolean(),
}).strict();

export type PokeTabooConfig = z.infer<typeof pokeTabooConfigSchema>;

export const defaultPokeTabooConfig: PokeTabooConfig = {
  generations: [...GENERATIONS],
  roundSeconds: 60,
  laps: 1,
  includeRegionalForms: true,
};

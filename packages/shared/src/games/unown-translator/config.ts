import { z } from 'zod';
import { GENERATIONS } from '../../pokemon/types.js';
import { pokemonGenerationsSchema } from '../config.js';

/** Qué se cifra: el nombre de un Pokémon (`POKEMON`) o el de un movimiento (`MOVES`). */
export const UNOWN_TRANSLATOR_MODES = ['POKEMON', 'MOVES'] as const;
export type UnownTranslatorMode = (typeof UNOWN_TRANSLATOR_MODES)[number];

export const unownTranslatorConfigSchema = z.object({
  generations: pokemonGenerationsSchema,
  rounds: z.number().int().min(1).max(10),
  roundSeconds: z.number().int().min(30).max(120),
  hintSeconds: z.number().int().min(3).max(15),
  mode: z.enum(UNOWN_TRANSLATOR_MODES).default('POKEMON'),
}).strict();

export type UnownTranslatorConfig = z.infer<typeof unownTranslatorConfigSchema>;

export const defaultUnownTranslatorConfig: UnownTranslatorConfig = {
  generations: [...GENERATIONS],
  rounds: 5,
  roundSeconds: 60,
  hintSeconds: 6,
  mode: 'POKEMON',
};

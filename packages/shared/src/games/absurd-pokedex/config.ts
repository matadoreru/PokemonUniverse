import { z } from 'zod';
import { GENERATIONS } from '../../pokemon/types.js';
import { pokemonGenerationsSchema } from '../config.js';

/** Modos de juego: `CLASSIC` (votar la entrada más absurda) y `REAL_ENTRY` (la oficial se mezcla con las inventadas). */
export const ABSURD_POKEDEX_MODES = ['CLASSIC', 'REAL_ENTRY'] as const;
export type AbsurdPokedexMode = (typeof ABSURD_POKEDEX_MODES)[number];

export const absurdPokedexConfigSchema = z.object({
  generations: pokemonGenerationsSchema,
  rounds: z.number().int().min(1).max(10),
  writeSeconds: z.number().int().min(30).max(120),
  voteSeconds: z.number().int().min(15).max(60),
  mode: z.enum(ABSURD_POKEDEX_MODES).default('CLASSIC'),
}).strict();

export type AbsurdPokedexConfig = z.infer<typeof absurdPokedexConfigSchema>;

export const defaultAbsurdPokedexConfig: AbsurdPokedexConfig = {
  generations: [...GENERATIONS],
  rounds: 5,
  writeSeconds: 60,
  voteSeconds: 30,
  mode: 'CLASSIC',
};

import { z } from 'zod';
import { pokemonGenerationsSchema } from '../config.js';
import { GENERATIONS } from '../../pokemon/types.js';

/** Modos de juego: `CLASSIC` (duelos) y `COOP` (todos contra el reloj). */
export const TYPE_DUEL_MODES = ['CLASSIC', 'COOP'] as const;
export type TypeDuelMode = (typeof TYPE_DUEL_MODES)[number];
/** Duración de la búsqueda de `COOP`, en segundos; se valida en todos los modos. */
export const TYPE_DUEL_COOP_SECONDS_RANGE = { min: 30, max: 120 } as const;

export const typeDuelConfigSchema = z.object({
  generations: pokemonGenerationsSchema,
  typeSelectSeconds: z.number().int().min(5).max(60), searchSeconds: z.number().int().min(10).max(60), rounds: z.number().int().min(1).max(50),
  coopSeconds: z.number().int().min(TYPE_DUEL_COOP_SECONDS_RANGE.min).max(TYPE_DUEL_COOP_SECONDS_RANGE.max).default(60),
  mode: z.enum(TYPE_DUEL_MODES).default('CLASSIC'),
});
export type TypeDuelConfig = z.infer<typeof typeDuelConfigSchema>;
export const defaultTypeDuelConfig: TypeDuelConfig = { generations: [...GENERATIONS], typeSelectSeconds: 15, searchSeconds: 20, rounds: 10, coopSeconds: 60, mode: 'CLASSIC' };

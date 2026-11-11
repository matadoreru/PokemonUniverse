import { z } from 'zod';
import { pokemonGenerationsSchema } from '../config.js';
import { GENERATIONS } from '../../pokemon/types.js';

export const whosThatPokemonConfigSchema = z.object({
  generations: pokemonGenerationsSchema,
  roundSeconds: z.number().int().min(10).max(60),
  rounds: z.number().int().min(1).max(20),
  hintsEnabled: z.boolean(),
  includeRegionalForms: z.boolean(),
  /** Fallos de la ronda visibles para todos; apagado, cada jugador solo ve los suyos (el servidor no envía los demás). */
  publicAttempts: z.boolean().default(true),
  /** Rachas: el segundo acierto seguido suma +1, el tercero +2 y, desde el cuarto, +3 (`speedPodiumStreakBonus`). */
  streakBonus: z.boolean().default(false),
}).strict();

export type WhosThatPokemonConfig = z.infer<typeof whosThatPokemonConfigSchema>;

export const defaultWhosThatPokemonConfig: WhosThatPokemonConfig = {
  generations: [...GENERATIONS],
  roundSeconds: 20,
  rounds: 10,
  hintsEnabled: false,
  includeRegionalForms: true,
  publicAttempts: true,
  streakBonus: false,
};

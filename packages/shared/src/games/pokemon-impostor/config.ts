import { z } from 'zod';
import { pokemonGenerationsSchema } from '../config.js';
import { GENERATIONS } from '../../pokemon/types.js';

/** Modos de juego: `CLASSIC` y `ONE_WORD` (pistas de una palabra, dos vueltas antes de votar). */
export const POKEMON_IMPOSTOR_MODES = ['CLASSIC', 'ONE_WORD'] as const;
export type PokemonImpostorMode = (typeof POKEMON_IMPOSTOR_MODES)[number];

export const pokemonImpostorConfigSchema = z.object({
  generations: pokemonGenerationsSchema,
  impostorCount: z.number().int().min(1).max(10),
  clueSeconds: z.number().int().min(10).max(120),
  voteSeconds: z.number().int().min(10).max(90),
  mode: z.enum(POKEMON_IMPOSTOR_MODES).default('CLASSIC'),
});

export type PokemonImpostorConfig = z.infer<typeof pokemonImpostorConfigSchema>;

export const defaultPokemonImpostorConfig: PokemonImpostorConfig = {
  generations: [...GENERATIONS],
  impostorCount: 1,
  clueSeconds: 15,
  voteSeconds: 20,
  mode: 'CLASSIC',
};

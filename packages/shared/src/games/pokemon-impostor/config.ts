import { z } from 'zod';
import { GENERATIONS } from '../../pokemon/types.js';

export const pokemonImpostorConfigSchema = z.object({
  generations: z.array(z.number().int().min(1).max(9)).min(1).transform((values) => [...new Set(values)].sort()),
  impostorCount: z.number().int().min(1).max(10),
  clueSeconds: z.number().int().min(10).max(120),
  voteSeconds: z.number().int().min(10).max(90),
});

export type PokemonImpostorConfig = z.infer<typeof pokemonImpostorConfigSchema>;

export const defaultPokemonImpostorConfig: PokemonImpostorConfig = {
  generations: [...GENERATIONS],
  impostorCount: 1,
  clueSeconds: 15,
  voteSeconds: 20,
};

import { z } from 'zod';
import { GENERATIONS } from '../../pokemon/types.js';
import { pokemonGenerationsSchema } from '../config.js';

export const pokemonPaletteGuessConfigSchema = z.object({
  generations: pokemonGenerationsSchema,
  roundSeconds: z.number().int().min(10).max(60),
  rounds: z.number().int().min(1).max(20),
  paletteSize: z.number().int().min(3).max(6),
}).strict();

export type PokemonPaletteGuessConfig = z.infer<typeof pokemonPaletteGuessConfigSchema>;

export const defaultPokemonPaletteGuessConfig: PokemonPaletteGuessConfig = {
  generations: [...GENERATIONS],
  roundSeconds: 25,
  rounds: 10,
  paletteSize: 5,
};

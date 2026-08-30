import { z } from 'zod';
import { GENERATIONS } from '../../pokemon/types.js';
import { pokemonGenerationsSchema } from '../config.js';

export const POKEMON_PALETTE_HINT_KINDS = ['GENERATION', 'TYPE', 'TYPE_COUNT', 'EVOLUTION', 'CATEGORY'] as const;

export const pokemonPaletteGuessConfigSchema = z.object({
  generations: pokemonGenerationsSchema,
  roundSeconds: z.number().int().min(10).max(60),
  rounds: z.number().int().min(1).max(20),
  paletteSize: z.number().int().min(5).max(8),
  hintsEnabled: z.boolean(),
  hintKinds: z.array(z.enum(POKEMON_PALETTE_HINT_KINDS)).transform((values) => [...new Set(values)]),
}).strict();

export type PokemonPaletteGuessConfig = z.infer<typeof pokemonPaletteGuessConfigSchema>;
export type PokemonPaletteHintKind = PokemonPaletteGuessConfig['hintKinds'][number];

export const defaultPokemonPaletteGuessConfig: PokemonPaletteGuessConfig = {
  generations: [...GENERATIONS],
  roundSeconds: 25,
  rounds: 10,
  paletteSize: 8,
  hintsEnabled: false,
  hintKinds: ['GENERATION', 'TYPE', 'EVOLUTION'],
};

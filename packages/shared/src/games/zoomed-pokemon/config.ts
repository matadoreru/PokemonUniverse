import { z } from 'zod';
import { pokemonGenerationsSchema } from '../config.js';
import { GENERATIONS } from '../../pokemon/types.js';

export const ZOOMED_POKEMON_IMAGE_MODES = ['MIXED', 'SPRITE', 'ARTWORK'] as const;
export const ZOOMED_POKEMON_HINT_KINDS = ['GENERATION', 'TYPE', 'TYPE_COUNT', 'EVOLUTION', 'CATEGORY'] as const;

export const zoomedPokemonConfigSchema = z.object({
  generations: pokemonGenerationsSchema,
  imageMode: z.enum(ZOOMED_POKEMON_IMAGE_MODES),
  roundSeconds: z.number().int().min(15).max(60),
  rounds: z.number().int().min(1).max(20),
  hintsEnabled: z.boolean(),
  hintKinds: z.array(z.enum(ZOOMED_POKEMON_HINT_KINDS)).transform((values) => [...new Set(values)]),
  includeForms: z.boolean(),
}).strict();

export type ZoomedPokemonConfig = z.infer<typeof zoomedPokemonConfigSchema>;
export type ZoomedPokemonImageMode = ZoomedPokemonConfig['imageMode'];
export type ZoomedPokemonHintKind = ZoomedPokemonConfig['hintKinds'][number];

export const defaultZoomedPokemonConfig: ZoomedPokemonConfig = {
  generations: [...GENERATIONS],
  imageMode: 'MIXED',
  roundSeconds: 30,
  rounds: 10,
  hintsEnabled: false,
  hintKinds: ['GENERATION', 'TYPE', 'EVOLUTION'],
  includeForms: true,
};

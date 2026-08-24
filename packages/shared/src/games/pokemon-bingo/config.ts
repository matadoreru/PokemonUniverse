import { z } from 'zod';
import { GENERATIONS } from '../../pokemon/types.js';

export const BINGO_FAMILY_KEYS = [
  'generation', 'dexNumber', 'type', 'typeCombination', 'typeCount',
  'hp', 'attack', 'defense', 'specialAttack', 'specialDefense', 'speed', 'baseStatTotal',
  'height', 'weight', 'evolutionStage', 'legendaryStatus', 'color', 'abilities',
] as const;
export type BingoFamilyKey = (typeof BINGO_FAMILY_KEYS)[number];

export const bingoFamiliesSchema = z.object(Object.fromEntries(
  BINGO_FAMILY_KEYS.map((key) => [key, z.boolean()]),
) as Record<BingoFamilyKey, z.ZodBoolean>);

export const pokemonBingoConfigSchema = z.object({
  width: z.number().int().min(2).max(6),
  height: z.number().int().min(2).max(6),
  durationSeconds: z.number().int().min(60).max(300),
  generations: z.array(z.number().int().min(1).max(9)).min(1).transform((values) => [...new Set(values)].sort()),
  maxConditionsPerCell: z.union([z.literal(1), z.literal(2)]),
  families: bingoFamiliesSchema,
}).strict();
export type PokemonBingoConfig = z.infer<typeof pokemonBingoConfigSchema>;

export const defaultPokemonBingoConfig: PokemonBingoConfig = {
  width: 3, height: 3, durationSeconds: 120, generations: [...GENERATIONS], maxConditionsPerCell: 1,
  families: {
    generation: true, dexNumber: true, type: true, typeCombination: true, typeCount: true,
    hp: true, attack: true, defense: true, specialAttack: true, specialDefense: true, speed: true, baseStatTotal: false,
    height: true, weight: true, evolutionStage: true,
    legendaryStatus: false, color: false, abilities: false,
  },
};

export function activeBingoFamilies(config: PokemonBingoConfig): BingoFamilyKey[] {
  return BINGO_FAMILY_KEYS.filter((key) => config.families[key]);
}


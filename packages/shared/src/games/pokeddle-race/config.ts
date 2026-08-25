import { z } from 'zod';
import { pokemonGenerationsSchema } from '../config.js';
import { GENERATIONS } from '../../pokemon/types.js';

export const POKEDDLE_CLUE_KEYS = [
  'generation', 'dexNumber', 'types', 'typeCount',
  'hp', 'attack', 'defense', 'specialAttack', 'specialDefense', 'speed', 'baseStatTotal',
  'height', 'weight', 'evolutionStage', 'legendaryStatus', 'color', 'abilities',
] as const;
export type PokeddleClueKey = (typeof POKEDDLE_CLUE_KEYS)[number];

export const pokeddleCluesSchema = z.object(Object.fromEntries(
  POKEDDLE_CLUE_KEYS.map((key) => [key, z.boolean()]),
) as Record<PokeddleClueKey, z.ZodBoolean>);

export const pokeddleRaceConfigSchema = z.object({
  generations: pokemonGenerationsSchema,
  roundSeconds: z.number().int().min(10).max(60),
  maxRounds: z.number().int().min(1).max(30),
  clues: pokeddleCluesSchema,
}).strict();

export type PokeddleRaceConfig = z.infer<typeof pokeddleRaceConfigSchema>;

export const defaultPokeddleRaceConfig: PokeddleRaceConfig = {
  generations: [...GENERATIONS],
  roundSeconds: 20,
  maxRounds: 10,
  clues: {
    generation: true, dexNumber: true, types: true, typeCount: true,
    hp: true, attack: true, defense: true, specialAttack: true, specialDefense: true, speed: true, baseStatTotal: false,
    height: true, weight: true, evolutionStage: true,
    legendaryStatus: false, color: false, abilities: false,
  },
};

export function activePokeddleClues(config: PokeddleRaceConfig): PokeddleClueKey[] {
  return POKEDDLE_CLUE_KEYS.filter((key) => config.clues[key]);
}

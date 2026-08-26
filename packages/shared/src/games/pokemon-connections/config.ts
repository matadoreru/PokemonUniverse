import { z } from 'zod';
import { GENERATIONS } from '../../pokemon/types.js';
import { pokemonGenerationsSchema } from '../config.js';

export const pokemonConnectionsConfigSchema = z.object({
  generations: pokemonGenerationsSchema,
  groupSize: z.number().int().min(3).max(5),
  pokemonCount: z.number().int().min(9).max(25),
  mistakesAllowed: z.number().int().min(1).max(10),
  roundSeconds: z.number().int().min(30).max(300),
  rounds: z.number().int().min(1).max(20),
}).strict().superRefine((config, context) => {
  const groupCount = config.pokemonCount / config.groupSize;
  if (!Number.isInteger(groupCount) || groupCount < 3 || groupCount > 5) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['pokemonCount'],
      message: 'El tablero debe contener entre 3 y 5 grupos completos.',
    });
  }
});

export type PokemonConnectionsConfig = z.infer<typeof pokemonConnectionsConfigSchema>;

export const defaultPokemonConnectionsConfig: PokemonConnectionsConfig = {
  generations: [...GENERATIONS],
  groupSize: 4,
  pokemonCount: 16,
  mistakesAllowed: 4,
  roundSeconds: 120,
  rounds: 5,
};

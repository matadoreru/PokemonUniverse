import { z } from 'zod';
import { GENERATIONS } from '../../pokemon/types.js';
import { pokemonGenerationsSchema } from '../config.js';

export const whoIsWhoPokemonConfigSchema = z.object({
  generations: pokemonGenerationsSchema,
  boardSize: z.number().int().min(5).max(50),
  includeForms: z.boolean(),
  turnSeconds: z.number().int().min(10).max(120),
  rounds: z.number().int().min(1).max(25),
  selectionSeconds: z.number().int().min(0).max(120).default(30),
  secretSelection: z.enum(['RANDOM', 'PLAYER_CHOICE']),
}).strict();

export type WhoIsWhoPokemonConfig = z.infer<typeof whoIsWhoPokemonConfigSchema>;

export const defaultWhoIsWhoPokemonConfig: WhoIsWhoPokemonConfig = {
  generations: [...GENERATIONS], boardSize: 24, includeForms: true, turnSeconds: 40, rounds: 25, selectionSeconds: 30, secretSelection: 'RANDOM',
};

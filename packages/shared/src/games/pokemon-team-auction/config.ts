import { z } from 'zod';
import { GENERATIONS } from '../../pokemon/types.js';
import { pokemonGenerationsSchema } from '../config.js';

export const pokemonTeamAuctionConfigSchema = z.object({
  generations: pokemonGenerationsSchema,
  bidSeconds: z.number().int().min(0).max(120).default(20),
  initialBudget: z.number().int().min(1).max(100),
  includeForms: z.boolean(),
}).strict();

export type PokemonTeamAuctionConfig = z.infer<typeof pokemonTeamAuctionConfigSchema>;

export const defaultPokemonTeamAuctionConfig: PokemonTeamAuctionConfig = {
  generations: [...GENERATIONS],
  initialBudget: 20,
  bidSeconds: 20,
  includeForms: true,
};

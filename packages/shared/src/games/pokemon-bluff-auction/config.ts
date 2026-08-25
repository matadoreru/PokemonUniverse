import { z } from 'zod';
import { GENERATIONS } from '../../pokemon/types.js';
import { pokemonGenerationsSchema } from '../config.js';

const demonstrationTimes = [20, 30, 45, 60] as const;
const roundOptions = [5, 10, 15, 20] as const;

export const pokemonBluffAuctionConfigSchema = z.object({
  generations: pokemonGenerationsSchema,
  demonstrationSeconds: z.number().int().refine(
    (value) => demonstrationTimes.includes(value as (typeof demonstrationTimes)[number]),
    'El tiempo debe ser 20, 30, 45 o 60 segundos.',
  ),
  rounds: z.number().int().refine(
    (value) => roundOptions.includes(value as (typeof roundOptions)[number]),
    'Las rondas deben ser 5, 10, 15 o 20.',
  ),
}).strict();

export type PokemonBluffAuctionConfig = z.infer<typeof pokemonBluffAuctionConfigSchema>;

export const defaultPokemonBluffAuctionConfig: PokemonBluffAuctionConfig = {
  generations: [...GENERATIONS],
  demonstrationSeconds: 30,
  rounds: 10,
};

import { z } from 'zod';
import { GENERATIONS } from '../pokemon/types.js';

const firstGeneration = GENERATIONS[0];
const lastGeneration = GENERATIONS.at(-1)!;

/** Canonical generation selection shared by every minigame config schema. */
export const pokemonGenerationsSchema = z.array(z.number().int().min(firstGeneration).max(lastGeneration))
  .min(1)
  .transform((values) => [...new Set(values)].sort((left, right) => left - right));

// Escenarios dorados por motor. Los motores se importan del dist compilado de shared (la referencia
// congelada): npm run build -w @pokemon-universe/shared debe preceder a golden:export y check:golden.
import type { MiniGameModule } from '../../dist/index.js';
import type { GoldenScenario } from '../types.js';
import { guessFromStatsScenarios } from './guess-from-stats.js';
import { higherLowerScenarios } from './higher-lower.js';
import { pokeddleRaceScenarios } from './pokeddle-race.js';
import { pokedexDistanceScenarios } from './pokedex-distance.js';
import { pokemonRedFlagScenarios } from './pokemon-red-flag.js';
import { pokemonPaletteGuessScenarios } from './pokemon-palette-guess.js';
import { pokemonTriviaScenarios } from './pokemon-trivia.js';
import { typeChainScenarios } from './type-chain.js';
import { typeDuelScenarios } from './type-duel.js';

export interface GoldenEngineEntry {
  module: MiniGameModule<any, any, any, any>;
  scenarios: GoldenScenario[];
  /** Entradas crudas para `configSchema.safeParse`. */
  configCases: unknown[];
}

export const scenarios: Record<string, GoldenEngineEntry> = {
  'higher-lower': higherLowerScenarios,
  'pokedex-distance': pokedexDistanceScenarios,
  'guess-from-stats': guessFromStatsScenarios,
  'pokemon-trivia': pokemonTriviaScenarios,
  'pokemon-palette-guess': pokemonPaletteGuessScenarios,
  'type-duel': typeDuelScenarios,
  'type-chain': typeChainScenarios,
  'pokeddle-race': pokeddleRaceScenarios,
  'pokemon-red-flag': pokemonRedFlagScenarios,
};

// Escenarios dorados por motor. Los motores se importan del dist compilado de shared (la referencia
// congelada): npm run build -w @pokemon-universe/shared debe preceder a golden:export y check:golden.
import type { MiniGameModule } from '../../dist/index.js';
import type { GoldenScenario } from '../types.js';
import { guessFromStatsScenarios } from './guess-from-stats.js';
import { higherLowerScenarios } from './higher-lower.js';
import { learnsetGuessScenarios } from './learnset-guess.js';
import { mostLikelyToScenarios } from './most-likely-to.js';
import { oneOfUsIsFakeScenarios } from './one-of-us-is-fake.js';
import { pokeTabooScenarios } from './poke-taboo.js';
import { pokeddleRaceScenarios } from './pokeddle-race.js';
import { pokedexEntryGuessScenarios } from './pokedex-entry-guess.js';
import { pokedexDistanceScenarios } from './pokedex-distance.js';
import { pokemonRedFlagScenarios } from './pokemon-red-flag.js';
import { pokemonCryQuizScenarios } from './pokemon-cry-quiz.js';
import { pokemonPaletteGuessScenarios } from './pokemon-palette-guess.js';
import { pokemonTriviaScenarios } from './pokemon-trivia.js';
import { secretRankingScenarios } from './secret-ranking.js';
import { typeChainScenarios } from './type-chain.js';
import { typeDuelScenarios } from './type-duel.js';
import { whosThatPokemonScenarios } from './whos-that-pokemon.js';
import { wouldYouRatherScenarios } from './would-you-rather.js';

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
  'poke-taboo': pokeTabooScenarios,
  'would-you-rather': wouldYouRatherScenarios,
  'most-likely-to': mostLikelyToScenarios,
  'secret-ranking': secretRankingScenarios,
  'one-of-us-is-fake': oneOfUsIsFakeScenarios,
  'learnset-guess': learnsetGuessScenarios,
  'pokedex-entry-guess': pokedexEntryGuessScenarios,
  'whos-that-pokemon': whosThatPokemonScenarios,
  'pokemon-cry-quiz': pokemonCryQuizScenarios,
};

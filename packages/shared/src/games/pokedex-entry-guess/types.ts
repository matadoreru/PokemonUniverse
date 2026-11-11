import type { GamePhase, GameResults } from '../contracts.js';
import type { GuessAttemptOutcome, GuessedPokemon, PokemonGuessHint } from '../guess-types.js';

export type PokedexEntryGuessHint = PokemonGuessHint;

export interface PokedexEntryGuessAttempt {
  playerId: string;
  guessedPokemon: GuessedPokemon;
  attemptedAt: number;
}

export interface PokedexEntryGuessSolve {
  solveOrder: number;
  solvedAt: number;
  elapsedMs: number;
  points: number;
  attempts: number;
}

export interface PokedexEntryGuessRoundPublicResult {
  pokemon: { name: string; sprite: string; generation: number };
  entry: { text: string; generation: number; versionLabel: string };
  solves: Record<string, PokedexEntryGuessSolve>;
  attemptCounts: Record<string, number>;
}

export interface PokedexEntryGuessPublicState {
  gameId: 'pokedex-entry-guess';
  phase: GamePhase;
  roundNumber: number;
  totalRounds: number;
  referenceGeneration: number;
  entryText: string | null;
  hints: PokedexEntryGuessHint[];
  attempts: PokedexEntryGuessAttempt[];
  solvedPlayers: Array<{ playerId: string; solveOrder: number }>;
  scores: Record<string, number>;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: PokedexEntryGuessRoundPublicResult | null;
  results: GameResults | null;
}

export interface PokedexEntryGuessPlayerState {
  canGuess: boolean;
  solved: boolean;
  solveOrder: number | null;
  cooldownUntil: number | null;
  roundPoints: number;
  attemptCount: number;
  lastAttempt: GuessAttemptOutcome | null;
  /** Solo con `publicAttempts` apagado: los fallos propios de la ronda (los de los demás no llegan). */
  attempts?: PokedexEntryGuessAttempt[];
}

import type { GamePhase, GameResults } from '../contracts.js';
import type { GuessAttemptOutcome, GuessedPokemon, PokemonGuessHint } from '../guess-types.js';

export type WhosThatPokemonHint = PokemonGuessHint;

export interface WhosThatPokemonAttempt {
  playerId: string;
  guessedPokemon: GuessedPokemon;
  attemptedAt: number;
}

export interface WhosThatPokemonSolve {
  solveOrder: number;
  solvedAt: number;
  elapsedMs: number;
  speedPoints: number;
  placementBonus: number;
  points: number;
  attempts: number;
}

export interface WhosThatPokemonRoundPublicResult {
  pokemon: { name: string; sprite: string; generation: number };
  solves: Record<string, WhosThatPokemonSolve>;
  attemptCounts: Record<string, number>;
}

export interface WhosThatPokemonPublicState {
  gameId: 'whos-that-pokemon';
  phase: GamePhase;
  roundNumber: number;
  totalRounds: number;
  silhouetteSprite: string | null;
  visibleHints: WhosThatPokemonHint[];
  attempts: WhosThatPokemonAttempt[];
  solvedPlayers: Array<{ playerId: string; solveOrder: number }>;
  scores: Record<string, number>;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: WhosThatPokemonRoundPublicResult | null;
  results: GameResults | null;
}

export interface WhosThatPokemonPlayerState {
  canGuess: boolean;
  solved: boolean;
  solveOrder: number | null;
  cooldownUntil: number | null;
  roundPoints: number;
  attemptCount: number;
  lastAttempt: GuessAttemptOutcome | null;
  /** Solo con `publicAttempts` apagado: los fallos propios de la ronda (los de los demás no llegan). */
  attempts?: WhosThatPokemonAttempt[];
}

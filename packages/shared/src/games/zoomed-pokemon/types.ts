import type { GamePhase, GameResults } from '../contracts.js';
import type { GuessAttemptOutcome, GuessedPokemon, PokemonGuessHintWithTypes } from '../guess-types.js';

export type ZoomedPokemonHint = PokemonGuessHintWithTypes;

export interface ZoomedPokemonAttempt {
  playerId: string;
  guessedPokemon: GuessedPokemon;
  attemptedAt: number;
}

export interface ZoomedPokemonSolve {
  solvedAt: number;
  elapsedMs: number;
  solveOrder: number;
  zoomStage: number;
  zoom: number;
  zoomBonus: number;
  points: number;
  attempts: number;
}

export interface ZoomedPokemonPublicState {
  gameId: 'zoomed-pokemon';
  phase: GamePhase;
  roundNumber: number;
  totalRounds: number;
  imageUrl: string | null;
  imageSourceType: 'SPRITE' | 'ARTWORK' | null;
  focusPoint: { x: 0.5; y: 0.5 };
  zoomStages: readonly number[];
  currentZoomStage: number;
  currentZoomBonus: number;
  visibleHints: ZoomedPokemonHint[];
  attempts: ZoomedPokemonAttempt[];
  solves: Record<string, Pick<ZoomedPokemonSolve, 'solveOrder' | 'zoomStage'>>;
  scores: Record<string, number>;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: null | {
    pokemon: { name: string; generation: number };
    imageUrl: string;
    initialCropUrl: string;
    imageSourceType: 'SPRITE' | 'ARTWORK';
    solves: Record<string, ZoomedPokemonSolve>;
    attemptCounts: Record<string, number>;
  };
  results: GameResults | null;
}

export interface ZoomedPokemonPlayerState {
  canGuess: boolean;
  solved: boolean;
  solveOrder: number | null;
  cooldownUntil: number | null;
  roundPoints: number;
  attemptCount: number;
  lastAttempt: GuessAttemptOutcome | null;
  /** Solo con `publicAttempts` apagado: los fallos propios de la ronda (los de los demás no llegan). */
  attempts?: ZoomedPokemonAttempt[];
}

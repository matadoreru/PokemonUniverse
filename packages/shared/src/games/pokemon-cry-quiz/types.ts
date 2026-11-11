import type { GamePhase, GameResults, PokemonCryVersion } from '../contracts.js';
import type { GuessAttemptOutcome, GuessedPokemon } from '../guess-types.js';

export interface PokemonCryQuizAttempt {
  playerId: string;
  guessedPokemon: GuessedPokemon;
  attemptedAt: number;
}

export interface PokemonCryQuizSolve {
  solveOrder: number;
  solvedAt: number;
  elapsedMs: number;
  speedPoints: number;
  placementBonus: number;
  points: number;
  attempts: number;
  /** Solo con `streakBonus`: lo que suma la racha en este acierto (ya incluido en `points`). */
  streakBonus?: number;
}

export interface PokemonCryQuizPublicState {
  gameId: 'pokemon-cry-quiz';
  phase: GamePhase;
  roundNumber: number;
  totalRounds: number;
  cryUrl: string | null;
  attempts: PokemonCryQuizAttempt[];
  solvedPlayers: Array<{ playerId: string; solveOrder: number }>;
  scores: Record<string, number>;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: ({ pokemon: { name: string; sprite: string; generation: number }; cryVersion: PokemonCryVersion; cryUrl: string; solves: Record<string, PokemonCryQuizSolve>; attemptCounts: Record<string, number> }) | null;
  results: GameResults | null;
}

export interface PokemonCryQuizPlayerState {
  role: 'PLAYER' | 'SPECTATOR';
  canGuess: boolean;
  solved: boolean;
  solveOrder: number | null;
  cooldownUntil: number | null;
  roundPoints: number;
  attemptCount: number;
  lastAttempt: GuessAttemptOutcome | null;
  /** Solo con `publicAttempts` apagado: los fallos propios de la ronda (los de los demás no llegan). */
  attempts?: PokemonCryQuizAttempt[];
  /** Solo con `streakBonus`: rondas seguidas acertadas hasta ahora (0 si la última se falló). */
  streak?: number;
}

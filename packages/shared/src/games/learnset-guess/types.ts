import type { GamePhase, GameResults } from '../contracts.js';
import type { Generation, MoveCategory, PokemonType } from '../../pokemon/types.js';
import type { LearnsetGuessMode } from './config.js';

export interface LearnsetGuessAttempt {
  playerId: string;
  pokemonId: string;
  pokemonName: string;
  sprite: string;
  attemptedAt: number;
}

export interface LearnsetGuessSolve {
  solveOrder: number;
  solvedAt: number;
  revealStage: number;
  points: number;
}

export interface LearnsetMoveHint {
  moveId: string;
  name: string;
  level: number | null;
  type: PokemonType;
  category: MoveCategory;
}

export interface LearnsetMoveGroup { level: number | null; moves: LearnsetMoveHint[]; stage: number }

export interface LearnsetRoundResult {
  pokemon: { id: string; name: string; sprite: string; nationalDexNumber: number; generation: number };
  referenceGeneration: Generation;
  referenceSource: string;
  revealedMoves: LearnsetMoveHint[];
  learnset: LearnsetMoveHint[];
  solves: Record<string, LearnsetGuessSolve>;
  /** Jugadores sin acierto que no estaban obligados a jugar al cerrar la ronda (desconectados o inactivos): no suman `missed`. */
  absentIds: string[];
  /** Solo en `MANUAL_REVEAL`: cuántos grupos llegó a ver cada jugador. */
  groupsSeen?: Record<string, number>;
  /** Solo en `MANUAL_REVEAL`: grupos de movimientos del learnset. */
  totalGroups?: number;
}

/**
 * En `MANUAL_REVEAL` (Revelación manual) los grupos y los intentos son de cada jugador: durante la ronda
 * `visibleGroups` y `attempts` van vacíos y no hay `nextTransitionAt` de pista (solo el tope `roundEndsAt`).
 */
export interface LearnsetGuessPublicState {
  gameId: 'learnset-guess';
  phase: GamePhase;
  mode: LearnsetGuessMode;
  roundNumber: number;
  totalRounds: number;
  referenceGeneration: Generation;
  referenceSource: string;
  visibleGroups: LearnsetMoveGroup[];
  evolutionHint: string | null;
  attempts: LearnsetGuessAttempt[];
  solvedPlayers: Array<{ playerId: string; solveOrder: number }>;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastWarning: boolean;
  lastRound: LearnsetRoundResult | null;
  scores: Record<string, number>;
  results: GameResults | null;
}

export interface LearnsetGuessPlayerState {
  canGuess: boolean;
  solved: boolean;
  solveOrder: number | null;
  cooldownUntil: number | null;
  roundPoints: number;
  /** Solo en `MANUAL_REVEAL` y para quien juega: los grupos que ve (`stage` = número de grupo extra). */
  revealedGroups?: LearnsetMoveGroup[];
  /** Solo en `MANUAL_REVEAL` y para quien juega: sus intentos fallidos de la ronda. */
  attempts?: LearnsetGuessAttempt[];
  /** Solo en `MANUAL_REVEAL` y para quien juega: grupos del learnset de la ronda. */
  totalGroups?: number;
}

import type { GamePhase, GameResults } from '../contracts.js';

import type { BingoCell } from '../../pokemon/conditions/types.js';
export type { BingoCell, BingoCondition, BingoComparisonOperator, BingoStatKey, BingoEvolutionStatus } from '../../pokemon/conditions/types.js';
export interface BingoPrivateAttempt { cellId: string; pokemonId: string; pokemonName: string; attemptedAt: number; correct: boolean; message: string }

export interface BingoPokemonView { id: string; name: string; sprite: string }
export interface BingoPublicCell extends BingoCell { assignment: BingoPokemonView | null; possibleSolutions: BingoPokemonView[] }
export interface BingoPublicBoard { playerId: string; cells: BingoPublicCell[]; completed: number; total: number; lastProgressAt: number }
export interface PokemonBingoPublicState {
  gameId: 'pokemon-bingo'; phase: GamePhase; width: number; height: number;
  roundEndsAt: number | null; nextTransitionAt: number | null; winnerId: string | null; bingoAt: number | null;
  boards: Record<string, BingoPublicBoard>; results: GameResults | null;
}
export interface PokemonBingoPlayerState {
  canAct: boolean;
  cooldownUntil: number | null;
  lastAttempt: BingoPrivateAttempt | null;
}

import { z } from 'zod';
import type { PokemonLegendaryStatus, PokemonType } from '../../pokemon/types.js';
import type { GamePhase, GameResults } from '../contracts.js';
import type { PokemonBingoConfig } from './config.js';

export type BingoComparisonOperator = 'GT' | 'LT';
export type BingoStatKey = 'hp' | 'attack' | 'defense' | 'specialAttack' | 'specialDefense' | 'speed' | 'baseStatTotal';
export type BingoEvolutionStatus = 'BASE' | 'MIDDLE' | 'FINAL' | 'NONE';
export type BingoCondition =
  | { kind: 'GENERATION'; generation: number }
  | { kind: 'DEX'; operator: BingoComparisonOperator | 'RANGE'; value: number; max?: number }
  | { kind: 'TYPE'; pokemonType: PokemonType }
  | { kind: 'TYPE_COMBINATION'; pokemonTypes: [PokemonType, PokemonType] }
  | { kind: 'TYPE_COUNT'; count: 1 | 2 }
  | { kind: 'STAT'; stat: BingoStatKey; operator: BingoComparisonOperator; value: number }
  | { kind: 'PHYSICAL'; metric: 'heightDecimeters' | 'weightHectograms'; operator: BingoComparisonOperator; value: number }
  | { kind: 'EVOLUTION'; status: BingoEvolutionStatus }
  | { kind: 'LEGENDARY'; status: PokemonLegendaryStatus }
  | { kind: 'COLOR'; color: string }
  | { kind: 'ABILITY'; ability: string };

export interface BingoCell { id: string; conditions: BingoCondition[] }
export interface BingoBoardState {
  cells: BingoCell[];
  assignments: Record<string, string>;
  /** One validated perfect matching retained only in opaque server state. */
  solutionPokemonIds: Record<string, string>;
  lastProgressAt: number;
}
export interface BingoPlayerStats { correctAssignments: number; incorrectAttempts: number }
export interface BingoPrivateAttempt { cellId: string; pokemonId: string; pokemonName: string; attemptedAt: number; correct: boolean; message: string }

export interface PokemonBingoState {
  phase: GamePhase;
  config: PokemonBingoConfig;
  playerIds: string[];
  poolIds: string[];
  boards: Record<string, BingoBoardState>;
  playerStats: Record<string, BingoPlayerStats>;
  cooldownUntil: Record<string, number>;
  lastAttempts: Record<string, BingoPrivateAttempt>;
  winnerId: string | null;
  bingoAt: number | null;
  gameStartedAt: number;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
}

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

export const pokemonBingoActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ASSIGN_POKEMON'), cellId: z.string().min(1).max(64), pokemonId: z.string().min(1).max(64), moveExisting: z.boolean().optional() }).strict(),
  z.object({ type: z.literal('MOVE_POKEMON'), fromCellId: z.string().min(1).max(64), toCellId: z.string().min(1).max(64) }).strict(),
  z.object({ type: z.literal('REMOVE_POKEMON'), cellId: z.string().min(1).max(64) }).strict(),
]);
export type PokemonBingoAction = z.infer<typeof pokemonBingoActionSchema>;


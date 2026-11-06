import { z } from 'zod';
import { POKEMON_TYPES } from '../../pokemon/types.js';
import type { PokemonType } from '../../pokemon/types.js';
import type { GamePhase, GameResults } from '../contracts.js';
import type { TypeDuelConfig, TypeDuelMode } from './config.js';
export interface TypeDuelAttempt { playerId: string; pokemonId: string; pokemonName: string; sprite: string; correct: boolean; attemptedAt: number }
export interface TypeDuelStats { duelsPlayed: number; duelsWon: number; correctAttempts: number; incorrectAttempts: number; correctTimeTotalMs: number }
/** `ALL_FOUND` solo en `COOP`: el grupo encontró todos los Pokémon de la combinación antes del reloj. */
export interface TypeDuelRoundResult { reason: 'WINNER' | 'TIMEOUT' | 'TYPE_TIMEOUT' | 'TYPE_FORFEIT' | 'DISCONNECTED' | 'DISCONNECT_FORFEIT' | 'INVALID_COMBINATION' | 'ALL_FOUND'; winnerId: string | null; attempts: TypeDuelAttempt[]; solutions: Array<{ id: string; name: string; sprite: string }>; requiredTypes: PokemonType[] | null; selectedTypes: Record<string, PokemonType>; disconnectedIds: string[] }
/** `COOP`: un Pokémon de la combinación de la ronda y quién lo encontró primero. */
export interface TypeDuelCoopFind { pokemonId: string; playerId: string; pokemonName: string; sprite: string }
/** En `COOP`, `participants` queda con la pareja inicial y no se usa: busca toda la sala. */
export interface TypeDuelState {
  phase: GamePhase; config: TypeDuelConfig; playerIds: string[]; completedRounds: number; selectionCycles: number; roundNumber: number;
  participants: [string, string]; participationCounts: Record<string, number>; lastPair: [string, string] | null;
  typeSelections: Record<string, PokemonType>; requiredTypes: PokemonType[] | null; invalidCombinations: number; validPokemonIds: string[];
  attempts: TypeDuelAttempt[]; cooldownUntil: Record<string, number>; scores: Record<string, number>; playerStats: Record<string, TypeDuelStats>;
  roundStartedAt: number | null; roundEndsAt: number | null; nextTransitionAt: number | null; lastRound: TypeDuelRoundResult | null;
  /** Solo cuentan en `COOP`: lo encontrado en la ronda, lo aportado por cada jugador y las combinaciones ya sorteadas (`tipo/tipo`). */
  coopFound: TypeDuelCoopFind[]; contributions: Record<string, number>; usedCombinations: string[];
}
export const typeDuelActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('SELECT_TYPE'), pokemonType: z.enum(POKEMON_TYPES) }).strict(),
  z.object({ type: z.literal('ATTEMPT_POKEMON'), pokemonId: z.string().min(1).max(64) }).strict(),
  z.object({ type: z.literal('CONTINUE') }).strict(),
]);
export type TypeDuelAction = z.infer<typeof typeDuelActionSchema>;
/**
 * En `COOP` (Cooperativo) toda la sala busca a la vez: `combination` son los tipos de la ronda, `found` lo encontrado
 * (y quién) y `contributions` lo aportado por cada jugador en la partida; `solutionCount` sigue en el resultado de la
 * ronda. En Clásico esos tres campos no salen.
 */
export interface TypeDuelPublicState {
  gameId: 'type-duel'; phase: GamePhase; mode: TypeDuelMode; playerIds: string[]; completedRounds: number; roundNumber: number; totalRounds: number;
  participants: [string, string]; participationCounts: Record<string, number>; typeSelectionCompletedIds: string[];
  revealedTypes: Record<string, PokemonType>; requiredTypes: PokemonType[] | null; solutionCount: number | null; invalidCombinations: number; finalSelectionCycle: boolean; attempts: TypeDuelAttempt[]; scores: Record<string, number>;
  roundStartedAt: number | null; roundEndsAt: number | null; nextTransitionAt: number | null; lastRound: TypeDuelRoundResult | null; results: GameResults | null;
  combination?: PokemonType[]; found?: TypeDuelCoopFind[]; contributions?: Record<string, number>;
}
export interface TypeDuelPlayerState { participant: boolean; ownType: PokemonType | null; canSelectType: boolean; canAttempt: boolean; cooldownUntil: number; }

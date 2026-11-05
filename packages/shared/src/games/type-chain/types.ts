import { z } from 'zod';
import type { PokemonType } from '../../pokemon/types.js';
import type { GamePhase, GameResults } from '../contracts.js';
import type { TypeChainConfig } from './config.js';

export interface TypeChainPokemonView { id: string; name: string; sprite: string; types: PokemonType[] }
/** Un Pokémon nombrado en la cadena: todos son del tipo de la cadena (`chainType`). */
export interface TypeChainNode {
  pokemon: TypeChainPokemonView;
  playedBy: string;
  turnNumber: number;
}

export type TypeChainInvalidReason = 'ALREADY_USED' | 'WRONG_TYPE' | 'OUT_OF_POOL';
export interface TypeChainInvalidAttempt {
  playerId: string;
  pokemon: TypeChainPokemonView;
  reason: TypeChainInvalidReason;
  attemptedAt: number;
}

export interface TypeChainElimination {
  playerId: string;
  reason: 'TIMEOUT' | 'DISCONNECTED';
  turnNumber: number;
  eliminatedAt: number;
  eliminationOrder: number;
}

export type TypeChainEvent =
  | { kind: 'SUCCESS'; playerId: string; pokemon: TypeChainPokemonView; chainType: PokemonType; at: number }
  | { kind: 'ELIMINATION'; playerId: string; reason: TypeChainElimination['reason']; at: number }
  // Se acabaron los Pokémon sin usar del tipo de la cadena: empieza otra con otro tipo.
  | { kind: 'CHAIN_RESET'; previousLength: number; previousType: PokemonType; chainType: PokemonType; at: number };

export interface TypeChainPlayerStats {
  validSubmissions: number;
  invalidAttempts: number;
  turnsSurvived: number;
  timeoutEliminations: number;
}

export interface TypeChainState {
  phase: GamePhase;
  config: TypeChainConfig;
  playerIds: string[];
  turnOrder: string[];
  activePlayerIds: string[];
  spectatorIds: string[];
  poolIds: string[];
  chainNumber: number;
  /** Tipo de la cadena actual: cada Pokémon nombrado debe tenerlo (`null` antes de empezar). */
  chainType: PokemonType | null;
  /** Tipos de las cadenas de la partida, en orden: la siguiente cadena evita repetirlos mientras pueda. */
  usedChainTypes: PokemonType[];
  chain: TypeChainNode[];
  usedPokemonIds: string[];
  longestChain: number;
  turnNumber: number;
  completedTurns: number;
  currentPlayerId: string | null;
  turnStartedAt: number | null;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  cooldownUntil: Record<string, number>;
  invalidAttempts: TypeChainInvalidAttempt[];
  lastAttempt: Record<string, { reason: TypeChainInvalidReason; pokemonName: string; attemptedAt: number }>;
  eliminations: TypeChainElimination[];
  events: TypeChainEvent[];
  playerStats: Record<string, TypeChainPlayerStats>;
  winnerId: string | null;
  finishReason: 'SURVIVOR' | 'MAX_TURNS' | null;
}

export interface TypeChainPublicState {
  gameId: 'type-chain';
  phase: GamePhase;
  turnOrder: string[];
  activePlayerIds: string[];
  eliminatedPlayerIds: string[];
  currentPlayerId: string | null;
  nextPlayerId: string | null;
  turnNumber: number;
  chainNumber: number;
  chainType: PokemonType | null;
  chain: TypeChainNode[];
  usedPokemonIds: string[];
  longestChain: number;
  /** Pokémon nombrados por cada jugador en toda la partida (lo que decide la clasificación), en el orden de `playerIds`. */
  namedCounts: Record<string, number>;
  turnStartedAt: number | null;
  roundEndsAt: number | null;
  invalidAttempts: TypeChainInvalidAttempt[];
  eliminations: TypeChainElimination[];
  events: TypeChainEvent[];
  results: GameResults | null;
}

export interface TypeChainPlayerState {
  canSubmit: boolean;
  isCurrentPlayer: boolean;
  eliminated: boolean;
  cooldownUntil: number | null;
  lastAttempt: { reason: TypeChainInvalidReason; pokemonName: string; attemptedAt: number } | null;
}

export const typeChainActionSchema = z.object({ type: z.literal('SUBMIT_POKEMON'), pokemonId: z.string().min(1).max(96) }).strict();
export type TypeChainAction = z.infer<typeof typeChainActionSchema>;

import { z } from 'zod';
import type { PokemonType } from '../../pokemon/types.js';
import type { GamePhase, GameResults } from '../contracts.js';
import type { TypeChainConfig } from './config.js';

export interface TypeChainPokemonView { id: string; name: string; sprite: string; types: PokemonType[] }
export interface TypeChainNode {
  pokemon: TypeChainPokemonView;
  playedBy: string | null;
  sharedType: PokemonType | null;
  turnNumber: number;
}

export type TypeChainInvalidReason = 'ALREADY_USED' | 'NO_SHARED_TYPE' | 'MULTIPLE_SHARED_TYPES' | 'OUT_OF_POOL';
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
  | { kind: 'SUCCESS'; playerId: string; from: TypeChainPokemonView; to: TypeChainPokemonView; sharedType: PokemonType; at: number }
  | { kind: 'ELIMINATION'; playerId: string; reason: TypeChainElimination['reason']; at: number }
  | { kind: 'CHAIN_RESET'; previousLength: number; starter: TypeChainPokemonView; at: number };

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
  chain: TypeChainNode[];
  usedPokemonIds: string[];
  longestChain: number;
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

import type { PokemonType } from '../../pokemon/types.js';
import type { GamePhase, GameResults } from '../contracts.js';

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

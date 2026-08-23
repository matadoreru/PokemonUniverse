import type { GamePhase } from '../contracts.js';
import type { GameResults } from '../contracts.js';
import type { PokedexDistanceConfig } from './config.js';
import { z } from 'zod';

export interface PlayerRoundStats {
  exactHits: number;
  distanceTotal: number;
  selections: number;
  roundsSurvived: number;
}

export interface RoundSelection {
  pokemonId: string;
  dexNumber: number;
  distance: number;
  selectedAt: number;
}

export interface EliminationRecord {
  playerIds: string[];
  reason: 'FARTHEST' | 'NO_RESPONSE';
  roundNumber: number;
  remainingAfter: number;
}

export interface RoundResult {
  targetDexNumber: number;
  selections: Record<string, RoundSelection>;
  eliminatedIds: string[];
  reason: 'FARTHEST' | 'NO_RESPONSE' | 'TIE';
  tiedIds: string[];
}

export interface PokedexDistanceState {
  phase: GamePhase;
  config: PokedexDistanceConfig;
  initialPlayerIds: string[];
  survivorIds: string[];
  spectatorIds: string[];
  roundNumber: number;
  tiebreakDepth: number;
  eligibleIds: string[];
  targetDexNumber: number | null;
  selections: Record<string, RoundSelection>;
  lockedPokemonIds: string[];
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  pendingEligibleIds: string[];
  pendingTiebreakDepth: number;
  lastRound: RoundResult | null;
  eliminations: EliminationRecord[];
  playerStats: Record<string, PlayerRoundStats>;
  winnerId: string | null;
}

export const pokedexDistanceActionSchema = z.object({ type: z.literal('SELECT_POKEMON'), pokemonId: z.string().min(1).max(64) }).strict();
export type PokedexDistanceAction = z.infer<typeof pokedexDistanceActionSchema>;

export interface PublicSelection extends RoundSelection {
  pokemonName: string;
  sprite: string;
}

export interface PublicRoundResult extends Omit<RoundResult, 'selections'> {
  eligibleIds: string[];
  targetPokemon: {
    id: string;
    name: string;
    nationalDexNumber: number;
    sprite: string;
  };
  selections: Record<string, PublicSelection>;
}

export interface PokedexDistancePublicState {
  gameId: 'pokedex-distance';
  phase: GamePhase;
  roundNumber: number;
  tiebreakDepth: number;
  targetDexNumber: number | null;
  eligibleIds: string[];
  survivorIds: string[];
  spectatorIds: string[];
  selections: Record<string, PublicSelection>;
  lockedPokemonIds: string[];
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: PublicRoundResult | null;
  winnerId: string | null;
  results: GameResults | null;
}

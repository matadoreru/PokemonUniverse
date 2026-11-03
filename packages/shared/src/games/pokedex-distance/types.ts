import type { GamePhase } from '../contracts.js';
import type { GameResults } from '../contracts.js';
import type { PokedexDistanceConfig } from './config.js';
import { z } from 'zod';

export interface PlayerRoundStats {
  exactHits: number;
  distanceTotal: number;
  selections: number;
  roundsSurvived: number;
  /** Desempates resueltos con alguien eliminado en los que este jugador jugaba y no cayó. */
  tiebreaksWon: number;
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

/**
 * Una ronda resuelta (normal o desempate). `distances` va en el orden de `eligibleIds` de esa ronda; `null` es sin
 * respuesta. `eliminatedIds` va vacío si hubo empate.
 */
export interface DistanceRoundRecord {
  roundNumber: number;
  tiebreakDepth: number;
  targetDexNumber: number;
  distances: Record<string, number | null>;
  eliminatedIds: string[];
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
  /**
   * Solo rondas ya resueltas, así que nunca adelanta elecciones ocultas. Acotado sin tope explícito: cada número de
   * ronda tiene como mucho 1 + MAX_TIEBREAK_DEPTH resoluciones y la última elimina al menos a uno, así que hay
   * ≤ 4·(jugadores − 1) registros.
   */
  roundHistory: DistanceRoundRecord[];
  playerStats: Record<string, PlayerRoundStats>;
  winnerId: string | null;
}

export const pokedexDistanceActionSchema = z.object({ type: z.literal('SELECT_POKEMON'), pokemonId: z.string().min(1).max(64) }).strict();
export type PokedexDistanceAction = z.infer<typeof pokedexDistanceActionSchema>;

export interface PublicSelection extends RoundSelection {
  pokemonName: string;
  sprite: string;
}

export interface PublicActiveSelection {
  pokemonId: string;
  pokemonName: string;
  sprite: string;
  selectedAt: number;
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
  /** Elecciones de la ronda en curso: vacío en `HIDDEN` (el resultado las revela en `lastRound`). */
  selections: Record<string, PublicActiveSelection>;
  /** Quién ha elegido ya en la ronda en curso, en cualquier modo; nunca qué ha elegido. */
  selectedIds: string[];
  lockedPokemonIds: string[];
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: PublicRoundResult | null;
  /** Historial completo en `GAME_RESULTS`; vacío en el resto de fases. */
  roundHistory: DistanceRoundRecord[];
  winnerId: string | null;
  results: GameResults | null;
}

export interface PokedexDistancePlayerState {
  canSelect: boolean;
  selection: { pokemonId: string; selectedAt: number } | null;
  /** Private confirmation for the player who matched the target exactly. */
  exactHit: boolean;
}

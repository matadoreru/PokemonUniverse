import type { GamePhase } from '../contracts.js';
import type { GameResults } from '../contracts.js';
import type { PokedexDistanceMode } from './config.js';

export interface RoundSelection {
  pokemonId: string;
  dexNumber: number;
  distance: number;
  selectedAt: number;
}

export interface RoundResult {
  targetDexNumber: number;
  selections: Record<string, RoundSelection>;
  eliminatedIds: string[];
  /** `SCORED`: ronda del modo `POINTS`, que puntúa y en la que nadie cae. */
  reason: 'FARTHEST' | 'NO_RESPONSE' | 'TIE' | 'SCORED';
  tiedIds: string[];
  /** Solo en `POINTS`: puntos de la ronda por elegible (0 sin elección). */
  points?: Record<string, number>;
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
  mode: PokedexDistanceMode;
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
  /** Solo en `POINTS`: la ronda en curso («N de M»). */
  pointsRound?: number;
  /** Solo en `POINTS`: las rondas de la partida. */
  pointsRounds?: number;
  /** Solo en `POINTS`: el marcador, que solo cambia al revelar cada ronda. */
  scores?: Record<string, number>;
}

export interface PokedexDistancePlayerState {
  canSelect: boolean;
  selection: { pokemonId: string; selectedAt: number } | null;
  /** Private confirmation for the player who matched the target exactly. */
  exactHit: boolean;
}

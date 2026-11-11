import type { GamePhase, GameResults } from '../contracts.js';

export interface ConnectionPokemon {
  id: string;
  name: string;
  sprite: string;
}

export interface ConnectionAnswerGroup {
  id: string;
  categoryId: string;
  label: string;
  explanation: string;
  pokemon: ConnectionPokemon[];
}

export type ConnectionPlayerStatus = 'PLAYING' | 'SOLVED' | 'ELIMINATED' | 'TIMED_OUT';

export interface ConnectionAttemptFeedback {
  kind: 'CORRECT' | 'INCORRECT';
  attemptedPokemonIds: string[];
  nearMiss: boolean;
  attemptedAt: number;
}

export interface PokemonConnectionsRoundResult {
  source: 'CURATED' | 'DYNAMIC';
  groups: ConnectionAnswerGroup[];
  players: Record<string, {
    status: Exclude<ConnectionPlayerStatus, 'PLAYING'>;
    foundGroups: number;
    foundGroupIds: string[];
    mistakesUsed: number;
    completionRank: number | null;
    elapsedMs: number | null;
    pointsAwarded: number;
  }>;
}

export interface PokemonConnectionsPublicState {
  gameId: 'pokemon-connections';
  phase: GamePhase;
  roundNumber: number;
  totalRounds: number;
  groupSize: number;
  groupCount: number;
  board: ConnectionPokemon[];
  playerProgress: Record<string, { foundGroups: number; status: ConnectionPlayerStatus }>;
  scores: Record<string, number>;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: PokemonConnectionsRoundResult | null;
  results: GameResults | null;
}

export type PokemonConnectionsPlayerState =
  | { role: 'SPECTATOR' }
  | {
    role: 'PLAYER';
    canSubmit: boolean;
    foundGroups: ConnectionAnswerGroup[];
    mistakesUsed: number;
    mistakesAllowed: number;
    status: ConnectionPlayerStatus;
    completionRank: number | null;
    roundPoints: number;
    lastAttempt: ConnectionAttemptFeedback | null;
  };

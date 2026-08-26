import { z } from 'zod';
import type { GamePhase, GameResults } from '../contracts.js';
import type { PokemonConnectionsConfig } from './config.js';

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

export interface PokemonConnectionsProgress {
  foundGroupIds: string[];
  mistakesUsed: number;
  status: ConnectionPlayerStatus;
  completedAt: number | null;
  completionRank: number | null;
  roundPoints: number;
  lastAttempt: ConnectionAttemptFeedback | null;
}

export interface PokemonConnectionsStats {
  roundsPlayed: number;
  groupsFound: number;
  boardsSolved: number;
  mistakes: number;
  nearMisses: number;
  podiumFinishes: number;
  solveTimeTotalMs: number;
  bestSolveTimeMs: number;
}

export interface PokemonConnectionsRoundResult {
  source: 'CURATED' | 'DYNAMIC';
  groups: ConnectionAnswerGroup[];
  players: Record<string, {
    status: Exclude<ConnectionPlayerStatus, 'PLAYING'>;
    foundGroups: number;
    mistakesUsed: number;
    completionRank: number | null;
    elapsedMs: number | null;
    pointsAwarded: number;
  }>;
}

export interface PokemonConnectionsState {
  phase: GamePhase;
  config: PokemonConnectionsConfig;
  playerIds: string[];
  roundNumber: number;
  board: ConnectionPokemon[];
  answerGroups: ConnectionAnswerGroup[];
  puzzleSource: 'CURATED' | 'DYNAMIC';
  puzzleKey: string;
  usedPuzzleKeys: string[];
  progress: Record<string, PokemonConnectionsProgress>;
  completionOrder: string[];
  scores: Record<string, number>;
  playerStats: Record<string, PokemonConnectionsStats>;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: PokemonConnectionsRoundResult | null;
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

export const pokemonConnectionsActionSchema = z.object({
  type: z.literal('SUBMIT_GROUP'),
  pokemonIds: z.array(z.string().min(1).max(96)).min(3).max(5),
}).strict();

export type PokemonConnectionsAction = z.infer<typeof pokemonConnectionsActionSchema>;

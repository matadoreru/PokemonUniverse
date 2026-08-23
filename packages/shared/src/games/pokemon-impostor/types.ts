import { z } from 'zod';
import type { GamePhase, GameResults } from '../contracts.js';
import type { PokemonImpostorConfig } from './config.js';

export type ImpostorRole = 'INNOCENT' | 'IMPOSTOR';
export type ImpostorWinner = 'INNOCENTS' | 'IMPOSTORS';

export interface ImpostorClue {
  text: string;
  submittedAt: number;
}

export interface ImpostorVote {
  targetId: string;
  votedAt: number;
}

export interface ImpostorVoteResult {
  kind: 'TIE' | 'ELIMINATION';
  votes: Record<string, ImpostorVote>;
  tallies: Record<string, number>;
  tiedIds: string[];
  eliminatedId: string | null;
}

export interface ImpostorEliminationReveal {
  playerId: string;
  role: ImpostorRole;
}

export interface ImpostorPlayerStats {
  cluesSubmitted: number;
  votesCast: number;
}

export interface PokemonImpostorState {
  phase: GamePhase;
  config: PokemonImpostorConfig;
  playerIds: string[];
  roles: Record<string, ImpostorRole>;
  secretPokemonId: string;
  aliveIds: string[];
  eliminatedIds: string[];
  spectatorIds: string[];
  roundNumber: number;
  clues: Record<number, Record<string, ImpostorClue>>;
  votes: Record<string, ImpostorVote>;
  voteCandidateIds: string[];
  votingRound: number;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastVoteResult: ImpostorVoteResult | null;
  eliminationReveal: ImpostorEliminationReveal | null;
  winnerTeam: ImpostorWinner | null;
  playerStats: Record<string, ImpostorPlayerStats>;
}

export const pokemonImpostorActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('SUBMIT_CLUE'), text: z.string().max(200) }).strict(),
  z.object({ type: z.literal('VOTE'), targetId: z.string().min(1).max(64) }).strict(),
]);
export type PokemonImpostorAction = z.infer<typeof pokemonImpostorActionSchema>;

export interface PokemonImpostorPublicState {
  gameId: 'pokemon-impostor';
  phase: GamePhase;
  playerIds: string[];
  aliveIds: string[];
  eliminatedIds: string[];
  spectatorIds: string[];
  roundNumber: number;
  clues: Record<number, Record<string, ImpostorClue>>;
  cluePendingIds: string[];
  voteCompletedIds: string[];
  voteCandidateIds: string[];
  votingRound: number;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastVoteResult: ImpostorVoteResult | null;
  eliminationReveal: ImpostorEliminationReveal | null;
  winnerTeam: ImpostorWinner | null;
  results: GameResults | null;
}

export interface PokemonImpostorPlayerState {
  role: ImpostorRole | null;
  secretPokemon: { name: string; sprite: string } | null;
  revealedRoles: Record<string, ImpostorRole> | null;
  alive: boolean;
  canSubmitClue: boolean;
  ownClue: ImpostorClue | null;
  canVote: boolean;
  ownVote: ImpostorVote | null;
}

import { z } from 'zod';
import type { GamePhase, GameResults, SubjectiveCategory } from '../contracts.js';
import type { MostLikelyToConfig } from './config.js';

export interface MostLikelyToPokemon {
  id: string;
  name: string;
  sprite: string;
}

export interface MostLikelyToStats {
  roundsPlayed: number;
  answersSubmitted: number;
  roundsMissed: number;
  votesCast: number;
  votesReceived: number;
  roundWins: number;
  soloWins: number;
  sharedWins: number;
  pointsFromRounds: number;
}

export interface MostLikelyToVoteRound {
  number: number;
  candidateIds: string[];
  votes: Record<string, string>;
}

export interface MostLikelyToRoundResult {
  prompt: string;
  answers: Array<{ playerId: string; pokemon: MostLikelyToPokemon; votesReceived: number; won: boolean }>;
  voteRounds: MostLikelyToVoteRound[];
  winnerIds: string[];
  pointsAwarded: Record<string, number>;
}

export interface MostLikelyToState {
  phase: GamePhase;
  config: MostLikelyToConfig;
  playerIds: string[];
  pokemonPoolIds: string[];
  promptPool: SubjectiveCategory[];
  usedPromptIds: string[];
  roundNumber: number;
  currentPromptId: string | null;
  selections: Record<string, MostLikelyToPokemon>;
  votes: Record<string, string>;
  voteCandidates: string[];
  voteRoundNumber: number;
  voteHistory: MostLikelyToVoteRound[];
  scores: Record<string, number>;
  playerStats: Record<string, MostLikelyToStats>;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: MostLikelyToRoundResult | null;
}

export interface MostLikelyToPublicState {
  gameId: 'most-likely-to';
  phase: GamePhase;
  roundNumber: number;
  totalRounds: number;
  prompt: string;
  playerIds: string[];
  selectionCompletedIds: string[];
  revealedAnswers: Array<{ playerId: string; pokemon: MostLikelyToPokemon }>;
  votedPlayerIds: string[];
  voteCandidates: string[];
  voteRoundNumber: number;
  scores: Record<string, number>;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: MostLikelyToRoundResult | null;
  results: GameResults | null;
}

export type MostLikelyToPlayerState =
  | { role: 'PLAYER'; canSelect: boolean; ownChoice: MostLikelyToPokemon | null; canVote: boolean; ownVotePlayerId: string | null }
  | { role: 'SPECTATOR'; canSelect: false; ownChoice: null; canVote: false; ownVotePlayerId: null };

export const mostLikelyToActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('SELECT_POKEMON'), pokemonId: z.string().min(1).max(96) }).strict(),
  z.object({ type: z.literal('VOTE_ANSWER'), playerId: z.string().min(1).max(128) }).strict(),
]);

export type MostLikelyToAction = z.infer<typeof mostLikelyToActionSchema>;

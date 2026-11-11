import type { GamePhase, GameResults } from '../contracts.js';

export interface MostLikelyToPokemon {
  id: string;
  name: string;
  sprite: string;
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

import { z } from 'zod';
import type { GamePhase, GameResults, SubjectiveCategory } from '../contracts.js';
import type { OneOfUsIsFakeConfig } from './config.js';

export interface FakePokemonChoice { id: string; name: string; sprite: string }

export interface OneOfUsIsFakeStats {
  roundsPlayed: number;
  victoriesAsFake: number;
  victoriesAsNormal: number;
  timesFake: number;
  fakeDiscovered: number;
  fakeUndiscovered: number;
  correctVotes: number;
  incorrectVotes: number;
  normalWronglySelected: number;
}

export interface FakeVoteRound {
  number: number;
  candidateIds: string[];
  votes: Record<string, string>;
}

export interface FakeRoundResult {
  fakePlayerId: string;
  selectedPlayerId: string;
  winner: 'NORMALS' | 'FAKE';
  mainCategory: string;
  fakeCategory: string;
  players: Array<{ playerId: string; category: string; pokemon: FakePokemonChoice | null; isFake: boolean }>;
  voteRounds: FakeVoteRound[];
  pointsAwarded: Record<string, number>;
}

export interface OneOfUsIsFakeState {
  phase: GamePhase;
  config: OneOfUsIsFakeConfig;
  playerIds: string[];
  poolIds: string[];
  categoryPool: SubjectiveCategory[];
  usedCategoryIds: string[];
  roundNumber: number;
  fakePlayerId: string | null;
  mainCategoryId: string | null;
  fakeCategoryId: string | null;
  selections: Record<string, FakePokemonChoice>;
  revealOrder: string[];
  revealedCount: number;
  votes: Record<string, string>;
  voteCandidates: string[];
  voteRoundNumber: number;
  voteHistory: FakeVoteRound[];
  scores: Record<string, number>;
  playerStats: Record<string, OneOfUsIsFakeStats>;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: FakeRoundResult | null;
}

export interface OneOfUsIsFakePublicState {
  gameId: 'one-of-us-is-fake';
  phase: GamePhase;
  roundNumber: number;
  totalRounds: number;
  playerIds: string[];
  selectionCompletedIds: string[];
  revealedChoices: Array<{ playerId: string; pokemon: FakePokemonChoice }>;
  votedPlayerIds: string[];
  voteCandidates: string[];
  voteRoundNumber: number;
  scores: Record<string, number>;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: FakeRoundResult | null;
  results: GameResults | null;
}

export type OneOfUsIsFakePlayerState =
  | { role: 'PLAYER'; myCategory: string; isFake?: true; ownChoice: FakePokemonChoice | null; canSelect: boolean; canVote: boolean; ownVotePlayerId: string | null }
  | { role: 'SPECTATOR' };

export const oneOfUsIsFakeActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('SELECT_POKEMON'), pokemonId: z.string().min(1).max(96) }).strict(),
  z.object({ type: z.literal('VOTE_PLAYER'), playerId: z.string().min(1).max(128) }).strict(),
]);
export type OneOfUsIsFakeAction = z.infer<typeof oneOfUsIsFakeActionSchema>;

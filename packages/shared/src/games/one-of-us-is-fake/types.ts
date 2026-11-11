import type { GamePhase, GameResults } from '../contracts.js';

export interface FakePokemonChoice { id: string; name: string; sprite: string }

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

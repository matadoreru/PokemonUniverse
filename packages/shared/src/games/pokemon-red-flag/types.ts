import type { GamePhase, GameResults } from '../contracts.js';

export interface PokemonRedFlagPokemon {
  id: string;
  name: string;
  sprite: string;
}

export type PokemonFlagMode = 'RED' | 'GREEN';

export interface PokemonRedFlagAnswer {
  id: string;
  authorId: string;
  text: string;
}

export interface PokemonRedFlagVoteRound {
  number: number;
  candidateIds: string[];
  votes: Record<string, string>;
}

export interface PokemonRedFlagRoundResult {
  flagMode: PokemonFlagMode;
  pokemon: PokemonRedFlagPokemon;
  answers: Array<PokemonRedFlagAnswer & { votesReceived: number; won: boolean }>;
  voteRounds: PokemonRedFlagVoteRound[];
  winningAnswerIds: string[];
  winnerIds: string[];
  pointsAwarded: Record<string, number>;
  missingPlayerIds: string[];
}

export interface PokemonRedFlagPublicState {
  gameId: 'pokemon-red-flag';
  phase: GamePhase;
  roundNumber: number;
  totalRounds: number;
  pokemon: PokemonRedFlagPokemon | null;
  flagMode: PokemonFlagMode;
  playerIds: string[];
  submittedPlayerIds: string[];
  revealedAnswers: Array<{ id: string; text: string }>;
  votedPlayerIds: string[];
  voteCandidateIds: string[];
  voteRoundNumber: number;
  scores: Record<string, number>;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: PokemonRedFlagRoundResult | null;
  results: GameResults | null;
}

export type PokemonRedFlagPlayerState =
  | { role: 'PLAYER'; canSubmit: boolean; ownDraft: string; ownAnswer: { id: string; text: string } | null; canVote: boolean; ownVoteAnswerId: string | null; ownAnswerId: string | null }
  | { role: 'SPECTATOR'; canSubmit: false; ownDraft: ''; ownAnswer: null; canVote: false; ownVoteAnswerId: null; ownAnswerId: null };

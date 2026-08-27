import { z } from 'zod';
import type { GamePhase, GameResults } from '../contracts.js';
import type { PokemonRedFlagConfig } from './config.js';

export interface PokemonRedFlagPokemon {
  id: string;
  name: string;
  sprite: string;
}

export interface PokemonRedFlagStats {
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
  pokemon: PokemonRedFlagPokemon;
  answers: Array<PokemonRedFlagAnswer & { votesReceived: number; won: boolean }>;
  voteRounds: PokemonRedFlagVoteRound[];
  winningAnswerIds: string[];
  winnerIds: string[];
  pointsAwarded: Record<string, number>;
  missingPlayerIds: string[];
}

export interface PokemonRedFlagState {
  phase: GamePhase;
  config: PokemonRedFlagConfig;
  playerIds: string[];
  pokemonDeckIds: string[];
  roundNumber: number;
  currentPokemon: PokemonRedFlagPokemon | null;
  answerSlots: Record<string, string>;
  answers: Record<string, PokemonRedFlagAnswer>;
  votes: Record<string, string>;
  voteCandidates: string[];
  voteRoundNumber: number;
  voteHistory: PokemonRedFlagVoteRound[];
  scores: Record<string, number>;
  playerStats: Record<string, PokemonRedFlagStats>;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: PokemonRedFlagRoundResult | null;
}

export interface PokemonRedFlagPublicState {
  gameId: 'pokemon-red-flag';
  phase: GamePhase;
  roundNumber: number;
  totalRounds: number;
  pokemon: PokemonRedFlagPokemon | null;
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
  | { role: 'PLAYER'; canSubmit: boolean; ownAnswer: { id: string; text: string } | null; canVote: boolean; ownVoteAnswerId: string | null; ownAnswerId: string | null }
  | { role: 'SPECTATOR'; canSubmit: false; ownAnswer: null; canVote: false; ownVoteAnswerId: null; ownAnswerId: null };

export const pokemonRedFlagActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('SUBMIT_RED_FLAG'), text: z.string().trim().min(4, 'Escribe al menos 4 caracteres.').max(240, 'La red flag no puede superar 240 caracteres.') }).strict(),
  z.object({ type: z.literal('VOTE_RED_FLAG'), answerId: z.string().min(1).max(96) }).strict(),
]);

export type PokemonRedFlagAction = z.infer<typeof pokemonRedFlagActionSchema>;

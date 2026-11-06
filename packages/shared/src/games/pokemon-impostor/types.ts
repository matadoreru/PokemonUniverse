import { z } from 'zod';
import type { GamePhase, GameResults } from '../contracts.js';
import type { PokemonImpostorConfig, PokemonImpostorMode } from './config.js';

export type ImpostorRole = 'INNOCENT' | 'IMPOSTOR';
export type ImpostorWinner = 'INNOCENTS' | 'IMPOSTORS';
/** Motivo del final: acierto de un impostor, paridad, todos los impostores expulsados o rondas seguidas sin expulsión. */
export type ImpostorFinishReason = 'GUESS' | 'PARITY' | 'IMPOSTORS_ELIMINATED' | 'STALEMATE';

/** `targetId` de un voto a «Saltar». Nunca choca con un id de jugador (cuid o `guest_<uuid>`). */
export const IMPOSTOR_SKIP_TARGET = 'SKIP';

export interface ImpostorClue {
  text: string | null;
  submittedAt: number | null;
  status: 'SUBMITTED' | 'TIMEOUT' | 'DISCONNECTED';
}

export interface ImpostorGuess {
  pokemonId: string;
  correct: boolean;
  guessedAt: number;
}

export interface ImpostorVote {
  targetId: string;
  votedAt: number;
}

export interface ImpostorVoteResult {
  kind: 'TIE' | 'ELIMINATION' | 'SKIPPED' | 'DEADLOCK';
  votes: Record<string, ImpostorVote>;
  tallies: Record<string, number>;
  skipVotes: number;
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
  clueOrder: string[];
  currentClueTurnIndex: number;
  guessAttempts: Record<string, ImpostorGuess>;
  votes: Record<string, ImpostorVote>;
  voteCandidateIds: string[];
  votingRound: number;
  roundsWithoutElimination: number;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastVoteResult: ImpostorVoteResult | null;
  eliminationReveal: ImpostorEliminationReveal | null;
  winnerTeam: ImpostorWinner | null;
  finishReason: ImpostorFinishReason | null;
  playerStats: Record<string, ImpostorPlayerStats>;
}

export const pokemonImpostorActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('SUBMIT_CLUE'), text: z.string().max(200) }).strict(),
  z.object({ type: z.literal('VOTE'), targetId: z.string().min(1).max(64) }).strict(),
  z.object({ type: z.literal('GUESS_POKEMON'), pokemonId: z.string().min(1).max(64) }).strict(),
]);
export type PokemonImpostorAction = z.infer<typeof pokemonImpostorActionSchema>;

export interface PokemonImpostorPublicState {
  gameId: 'pokemon-impostor';
  phase: GamePhase;
  mode: PokemonImpostorMode;
  playerIds: string[];
  aliveIds: string[];
  eliminatedIds: string[];
  spectatorIds: string[];
  roundNumber: number;
  clues: Record<number, Record<string, ImpostorClue>>;
  clueOrder: string[];
  currentClueTurnIndex: number;
  currentCluePlayerId: string | null;
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
  finishReason: ImpostorFinishReason | null;
  results: GameResults | null;
  /** Solo en `ONE_WORD`: la vuelta de pistas en curso (1 o 2); ausente en Clásico. */
  clueLap?: number;
}

export interface PokemonImpostorPlayerState {
  role: ImpostorRole | null;
  secretPokemon: { name: string; sprite: string } | null;
  revealedRoles: Record<string, ImpostorRole> | null;
  alive: boolean;
  canSubmitClue: boolean;
  ownClue: ImpostorClue | null;
  canGuessPokemon: boolean;
  guessUsed: boolean;
  guessCorrect: boolean | null;
  canVote: boolean;
  ownVote: ImpostorVote | null;
}

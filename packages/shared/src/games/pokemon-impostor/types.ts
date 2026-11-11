import type { GamePhase, GameResults } from '../contracts.js';
import type { PokemonImpostorMode } from './config.js';

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
  // Solo para un impostor con compañeros; ausente en el resto.
  fellowImpostorIds?: string[];
  alive: boolean;
  canSubmitClue: boolean;
  ownClue: ImpostorClue | null;
  canGuessPokemon: boolean;
  guessUsed: boolean;
  guessCorrect: boolean | null;
  canVote: boolean;
  ownVote: ImpostorVote | null;
}

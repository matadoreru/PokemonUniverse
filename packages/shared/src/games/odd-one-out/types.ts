import { z } from 'zod';
import type { GamePhase, GameResults } from '../contracts.js';

export const ODD_ONE_OUT_OPTION_IDS = ['A', 'B', 'C', 'D'] as const;
export type OddOneOutOptionId = (typeof ODD_ONE_OUT_OPTION_IDS)[number];

export interface OddOneOutOption {
  id: OddOneOutOptionId;
  pokemonId: string;
  pokemonName: string;
  sprite: string;
}

export interface OddOneOutCategory {
  id: string;
  label: string;
  explanation: string;
}

export interface OddOneOutVote {
  optionId: OddOneOutOptionId;
  votedAt: number;
}

export interface OddOneOutRoundResult {
  roundNumber: number;
  intruderOptionId: OddOneOutOptionId;
  category: OddOneOutCategory;
  votes: Record<string, OddOneOutVote>;
  points: Record<string, number>;
}

export interface OddOneOutPlayerState {
  canVote: boolean;
  vote: OddOneOutVote | null;
}

export const oddOneOutActionSchema = z.object({
  type: z.literal('VOTE'),
  optionId: z.enum(ODD_ONE_OUT_OPTION_IDS),
}).strict();
export type OddOneOutAction = z.infer<typeof oddOneOutActionSchema>;

/** Durante `ROUND_ACTIVE` no se publica el intruso, la categoría ni los votos ajenos (solo `votedPlayerIds`). */
export interface OddOneOutPublicState {
  gameId: 'odd-one-out';
  phase: GamePhase;
  roundNumber: number;
  totalRounds: number;
  playerIds: string[];
  options: OddOneOutOption[];
  votedPlayerIds: string[];
  scores: Record<string, number>;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: OddOneOutRoundResult | null;
  results: GameResults | null;
}

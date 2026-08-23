import { z } from 'zod';
import type { GamePhase, GameResults } from '../contracts.js';
import type { ShinyVoteConfig } from './config.js';

export const SHINY_OPTION_IDS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export type ShinyOptionId = (typeof SHINY_OPTION_IDS)[number];

export interface ShinyOption {
  id: ShinyOptionId;
  pokemonId: string;
  pokemonName: string;
  sprite: string;
  visualFilter: string;
}

export interface ShinyVote {
  optionId: ShinyOptionId;
  votedAt: number;
}

export interface ShinyPlayerStats {
  votes: number;
  correctVotes: number;
}

export interface ShinyRoundResult {
  roundNumber: number;
  correctOptionId: ShinyOptionId;
  votes: Record<string, ShinyVote>;
  correctPlayerIds: string[];
  missedPlayerIds: string[];
}

export interface ShinyVoteState {
  phase: GamePhase;
  config: ShinyVoteConfig;
  assetToken: string;
  playerIds: string[];
  roundNumber: number;
  options: ShinyOption[];
  correctOptionId: ShinyOptionId | null;
  votes: Record<string, ShinyVote>;
  scores: Record<string, number>;
  playerStats: Record<string, ShinyPlayerStats>;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: ShinyRoundResult | null;
  preparedOptions: ShinyOption[] | null;
  preparedCorrectOptionId: ShinyOptionId | null;
}

export const shinyVoteActionSchema = z.object({
  type: z.literal('VOTE'),
  optionId: z.enum(SHINY_OPTION_IDS),
}).strict();
export type ShinyVoteAction = z.infer<typeof shinyVoteActionSchema>;

export interface ShinyVotePublicState {
  gameId: 'shiny-vote';
  phase: GamePhase;
  roundNumber: number;
  totalRounds: number;
  playerIds: string[];
  options: ShinyOption[];
  votes: Record<string, ShinyVote>;
  pendingPlayerIds: string[];
  scores: Record<string, number>;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  correctOptionId: ShinyOptionId | null;
  lastRound: ShinyRoundResult | null;
  winnerId: string | null;
  results: GameResults | null;
}

import { z } from 'zod';
import type { GamePhase, GameResults } from '../contracts.js';
import type { ShinyVoteMode, ShinyVoteVisibility } from './config.js';

export const SHINY_OPTION_IDS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export type ShinyOptionId = (typeof SHINY_OPTION_IDS)[number];

export interface ShinyOption {
  id: ShinyOptionId;
  pokemonId: string;
  pokemonName: string;
  sprite: string;
}

export interface ShinyVote {
  optionId: ShinyOptionId;
  votedAt: number;
}

export interface ShinyRoundResult {
  roundNumber: number;
  correctOptionId: ShinyOptionId;
  votes: Record<string, ShinyVote>;
  correctPlayerIds: string[];
  missedPlayerIds: string[];
}

export interface ShinyVotePlayerState {
  canVote: boolean;
  vote: ShinyVote | null;
  roundResult: { correct: boolean; points: number } | null;
}

export const shinyVoteActionSchema = z.object({
  type: z.literal('VOTE'),
  optionId: z.enum(SHINY_OPTION_IDS),
}).strict();
export type ShinyVoteAction = z.infer<typeof shinyVoteActionSchema>;

/**
 * En `SURVIVAL` (Supervivencia): `alive` dice quién sigue en pie y `roundsSurvived` las rondas superadas de cada uno
 * (ambos ausentes en Clásico); `pendingPlayerIds` solo cuenta a quien sigue en pie y cada acierto vale 1 punto.
 */
export interface ShinyVotePublicState {
  gameId: 'shiny-vote';
  phase: GamePhase;
  mode: ShinyVoteMode;
  roundNumber: number;
  totalRounds: number;
  playerIds: string[];
  options: ShinyOption[];
  votes: Record<string, ShinyVote>;
  votedPlayerIds: string[];
  voteVisibility: ShinyVoteVisibility;
  pendingPlayerIds: string[];
  scores: Record<string, number>;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  correctOptionId: ShinyOptionId | null;
  lastRound: ShinyRoundResult | null;
  winnerId: string | null;
  results: GameResults | null;
  alive?: string[];
  roundsSurvived?: Record<string, number>;
}

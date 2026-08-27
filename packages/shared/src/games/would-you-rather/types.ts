import { z } from 'zod';
import type { GamePhase, GameResults, WouldYouRatherPromptPair } from '../contracts.js';
import type { WouldYouRatherConfig } from './config.js';

export const wouldYouRatherOptionSchema = z.enum(['A', 'B']);
export type WouldYouRatherOption = z.infer<typeof wouldYouRatherOptionSchema>;

export interface WouldYouRatherBallot {
  preference: WouldYouRatherOption;
  prediction: WouldYouRatherOption;
}

export interface WouldYouRatherStats {
  roundsPlayed: number;
  ballotsSubmitted: number;
  roundsMissed: number;
  majorityChoices: number;
  correctPredictions: number;
  perfectRounds: number;
  pointsFromRounds: number;
}

export interface WouldYouRatherPlayerRoundResult extends WouldYouRatherBallot {
  playerId: string;
  majorityPoint: number;
  predictionPoints: number;
  totalPoints: number;
}

export interface WouldYouRatherRoundResult {
  prompt: { optionA: string; optionB: string };
  totals: Record<WouldYouRatherOption, number>;
  majority: WouldYouRatherOption | null;
  players: WouldYouRatherPlayerRoundResult[];
  missingPlayerIds: string[];
}

export interface WouldYouRatherState {
  phase: GamePhase;
  config: WouldYouRatherConfig;
  playerIds: string[];
  promptPool: WouldYouRatherPromptPair[];
  usedPromptIds: string[];
  roundNumber: number;
  currentPromptId: string | null;
  ballots: Record<string, WouldYouRatherBallot>;
  scores: Record<string, number>;
  playerStats: Record<string, WouldYouRatherStats>;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: WouldYouRatherRoundResult | null;
}

export interface WouldYouRatherPublicState {
  gameId: 'would-you-rather';
  phase: GamePhase;
  roundNumber: number;
  totalRounds: number;
  prompt: { optionA: string; optionB: string };
  playerIds: string[];
  submittedPlayerIds: string[];
  scores: Record<string, number>;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: WouldYouRatherRoundResult | null;
  results: GameResults | null;
}

export type WouldYouRatherPlayerState =
  | { role: 'PLAYER'; canSubmit: boolean; ownBallot: WouldYouRatherBallot | null }
  | { role: 'SPECTATOR'; canSubmit: false; ownBallot: null };

export const wouldYouRatherActionSchema = z.object({
  type: z.literal('SUBMIT_BALLOT'),
  preference: wouldYouRatherOptionSchema,
  prediction: wouldYouRatherOptionSchema,
}).strict();

export type WouldYouRatherAction = z.infer<typeof wouldYouRatherActionSchema>;

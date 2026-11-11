import { z } from 'zod';
import type { GamePhase, GameResults } from '../contracts.js';

export const wouldYouRatherOptionSchema = z.enum(['A', 'B']);
export type WouldYouRatherOption = z.infer<typeof wouldYouRatherOptionSchema>;

export interface WouldYouRatherBallot {
  preference: WouldYouRatherOption;
  prediction: WouldYouRatherOption;
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

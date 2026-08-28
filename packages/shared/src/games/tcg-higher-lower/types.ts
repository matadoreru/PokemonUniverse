import { z } from 'zod';
import type { GamePhase, GameResults } from '../contracts.js';
import type { TcgComparableCard } from '../../tcg/types.js';
import type { TcgHigherLowerConfig } from './config.js';

export const TCG_HIGHER_LOWER_CHOICES = ['LOWER', 'SAME', 'HIGHER'] as const;
export type TcgHigherLowerChoice = (typeof TCG_HIGHER_LOWER_CHOICES)[number];
export interface TcgHigherLowerAnswer { choice: TcgHigherLowerChoice; answeredAt: number }
export interface TcgHigherLowerStats { comparisons: number; correct: number; incorrect: number; sameCorrect: number; answered: number; bestStreak: number }
export interface TcgHigherLowerOutcome { choice: TcgHigherLowerChoice | null; correct: boolean; awardedPoints: number; streak: number }
export interface TcgHigherLowerRoundResult { previousPrice: string; currentPrice: string; correctAnswer: TcgHigherLowerChoice; outcomes: Record<string, TcgHigherLowerOutcome> }
export interface TcgHigherLowerState {
  phase: GamePhase; config: TcgHigherLowerConfig; playerIds: string[]; sequence: TcgComparableCard[];
  roundNumber: number; answers: Record<string, TcgHigherLowerAnswer>; scores: Record<string, number>;
  streaks: Record<string, number>; playerStats: Record<string, TcgHigherLowerStats>;
  roundStartedAt: number | null; roundEndsAt: number | null; nextTransitionAt: number | null;
  lastRound: TcgHigherLowerRoundResult | null;
}
export const tcgHigherLowerActionSchema = z.object({ type: z.literal('ANSWER'), choice: z.enum(TCG_HIGHER_LOWER_CHOICES) }).strict();
export type TcgHigherLowerAction = z.infer<typeof tcgHigherLowerActionSchema>;
export interface TcgCardPublicView { id: string; name: string; localId: string; setId: string; setName: string; rarity: string | null; imageUrl: string; price: string | null }
export interface TcgHigherLowerPublicState {
  gameId: 'tcg-higher-lower'; phase: GamePhase; playerIds: string[]; roundNumber: number; totalRounds: number;
  currency: string; previousCard: TcgCardPublicView; currentCard: TcgCardPublicView;
  answeredIds: string[]; scores: Record<string, number>; streaks: Record<string, number>;
  roundStartedAt: number | null; roundEndsAt: number | null; nextTransitionAt: number | null;
  lastRound: TcgHigherLowerRoundResult | null; results: GameResults | null;
}
export interface TcgHigherLowerPlayerState { canAnswer: boolean; answer: TcgHigherLowerAnswer | null }


import type { GamePhase, GameResults } from '../contracts.js';

export const TCG_HIGHER_LOWER_CHOICES = ['LOWER', 'SAME', 'HIGHER'] as const;
export type TcgHigherLowerChoice = (typeof TCG_HIGHER_LOWER_CHOICES)[number];
export interface TcgHigherLowerAnswer { choice: TcgHigherLowerChoice; answeredAt: number }
export interface TcgHigherLowerOutcome { choice: TcgHigherLowerChoice | null; correct: boolean; awardedPoints: number; streak: number }
export interface TcgHigherLowerRoundResult { previousPrice: string; currentPrice: string; correctAnswer: TcgHigherLowerChoice; outcomes: Record<string, TcgHigherLowerOutcome> }
export interface TcgCardPublicView { id: string; name: string; localId: string; setId: string; setName: string; rarity: string | null; imageUrl: string; price: string | null }
export interface TcgHigherLowerPublicState {
  gameId: 'tcg-higher-lower'; phase: GamePhase; playerIds: string[]; roundNumber: number; totalRounds: number;
  currency: string; previousCard: TcgCardPublicView; currentCard: TcgCardPublicView;
  answeredIds: string[]; scores: Record<string, number>; streaks: Record<string, number>;
  roundStartedAt: number | null; roundEndsAt: number | null; nextTransitionAt: number | null;
  lastRound: TcgHigherLowerRoundResult | null; results: GameResults | null;
}
export interface TcgHigherLowerPlayerState { canAnswer: boolean; answer: TcgHigherLowerAnswer | null }


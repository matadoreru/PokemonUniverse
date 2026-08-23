import { z } from 'zod';
import type { GamePhase, GameResults } from '../contracts.js';
import type { HigherLowerCategory, HigherLowerConfig } from './config.js';

export const HIGHER_LOWER_CHOICES = ['HIGHER', 'SAME', 'LOWER'] as const;
export type HigherLowerChoice = (typeof HIGHER_LOWER_CHOICES)[number];
export interface HigherLowerAnswer { choice: HigherLowerChoice; answeredAt: number }
export interface HigherLowerStats { correct: number; incorrect: number; sameCorrect: number; answered: number; bestStreak: number }
export interface HigherLowerOutcome { choice: HigherLowerChoice | null; correct: boolean; basePoints: number; streakBonus: number; awardedPoints: number; streak: number }
export interface HigherLowerRoundResult { previousValue: number; currentValue: number; correctAnswer: HigherLowerChoice; outcomes: Record<string, HigherLowerOutcome> }

export interface HigherLowerState {
  phase: GamePhase; config: HigherLowerConfig; playerIds: string[]; roundNumber: number;
  previousPokemonId: string; currentPokemonId: string | null; category: HigherLowerCategory | null;
  answers: Record<string, HigherLowerAnswer>; scores: Record<string, number>; streaks: Record<string, number>;
  playerStats: Record<string, HigherLowerStats>; roundStartedAt: number | null; roundEndsAt: number | null;
  nextTransitionAt: number | null; lastRound: HigherLowerRoundResult | null;
}
export const higherLowerActionSchema = z.object({ type: z.literal('ANSWER'), choice: z.enum(HIGHER_LOWER_CHOICES) }).strict();
export type HigherLowerAction = z.infer<typeof higherLowerActionSchema>;

export interface HigherLowerPokemonView { id: string; name: string; sprite: string; value: number | null }
export interface HigherLowerPublicState {
  gameId: 'higher-lower'; phase: GamePhase; playerIds: string[]; roundNumber: number; totalRounds: number;
  category: HigherLowerCategory; previousPokemon: HigherLowerPokemonView; currentPokemon: HigherLowerPokemonView;
  answers: Record<string, HigherLowerAnswer>; answeredIds: string[]; scores: Record<string, number>; streaks: Record<string, number>;
  roundStartedAt: number | null; roundEndsAt: number | null; nextTransitionAt: number | null;
  lastRound: HigherLowerRoundResult | null; results: GameResults | null;
}
export interface HigherLowerPlayerState { canAnswer: boolean; answer: HigherLowerAnswer | null }

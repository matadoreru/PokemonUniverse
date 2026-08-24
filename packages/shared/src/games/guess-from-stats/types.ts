import { z } from 'zod';
import type { PokemonLegendaryStatus, PokemonType } from '../../pokemon/types.js';
import type { GamePhase, GameResults } from '../contracts.js';
import type { GuessFromStatsConfig, GuessFromStatsField } from './config.js';

export interface GuessFromStatsVisibleStat { key: GuessFromStatsField; value: number }
export type GuessFromStatsEvolution = 'BASE' | 'MIDDLE' | 'FINAL' | 'NO_EVOLUTION';
export type GuessFromStatsHint =
  | { kind: 'GENERATION'; value: number }
  | { kind: 'TYPES'; value: PokemonType[] }
  | { kind: 'TYPE_COUNT'; value: number }
  | { kind: 'EVOLUTION'; value: GuessFromStatsEvolution }
  | { kind: 'HEIGHT'; decimeters: number }
  | { kind: 'WEIGHT'; hectograms: number }
  | { kind: 'CATEGORY'; value: PokemonLegendaryStatus };

export interface GuessFromStatsPokemonSummary { id: string; name: string; sprite: string }
export interface GuessFromStatsPokemonReveal extends GuessFromStatsPokemonSummary {
  generation: number; types: PokemonType[]; hp: number; attack: number; defense: number; specialAttack: number; specialDefense: number; speed: number; bst: number;
}
export interface GuessFromStatsAttempt { playerId: string; guessedPokemon: GuessFromStatsPokemonSummary; attemptedAt: number }
export interface GuessFromStatsSolve { solveOrder: number; solvedAt: number; elapsedMs: number; points: number; attempts: number; submittedPokemonId: string }
export interface GuessFromStatsPublicSolve extends Omit<GuessFromStatsSolve, 'submittedPokemonId'> { submittedPokemon: GuessFromStatsPokemonSummary }

export interface GuessFromStatsPlayerStats {
  correct: number; missed: number; totalAttempts: number; firstTry: number; roundFirsts: number; solveTimeTotalMs: number; bestTimeMs: number; pointsFromRounds: number;
}
export interface GuessFromStatsPreparedRound { sourcePokemonId: string; signature: string; acceptedPokemonIds: string[]; visibleStats: GuessFromStatsVisibleStat[]; hints: GuessFromStatsHint[] }
export interface GuessFromStatsRoundResult {
  answers: GuessFromStatsPokemonReveal[]; visibleStats: GuessFromStatsVisibleStat[]; hints: GuessFromStatsHint[]; solves: Record<string, GuessFromStatsPublicSolve>; attemptCounts: Record<string, number>;
}

export interface GuessFromStatsState {
  phase: GamePhase; config: GuessFromStatsConfig; playerIds: string[]; poolIds: string[]; roundDeck: GuessFromStatsPreparedRound[]; roundNumber: number;
  attempts: GuessFromStatsAttempt[]; attemptCounts: Record<string, number>; solves: Record<string, GuessFromStatsSolve>; cooldownUntil: Record<string, number>;
  lastAttemptResult: Record<string, { result: 'CORRECT' | 'INCORRECT'; attemptedAt: number }>; scores: Record<string, number>; playerStats: Record<string, GuessFromStatsPlayerStats>;
  roundStartedAt: number | null; roundEndsAt: number | null; nextTransitionAt: number | null; lastRound: GuessFromStatsRoundResult | null;
}

export interface GuessFromStatsPublicState {
  gameId: 'guess-from-stats'; phase: GamePhase; roundNumber: number; totalRounds: number; visibleStats: GuessFromStatsVisibleStat[]; hints: GuessFromStatsHint[];
  attempts: GuessFromStatsAttempt[]; solvedPlayers: Array<{ playerId: string; solveOrder: number }>; scores: Record<string, number>;
  roundStartedAt: number | null; roundEndsAt: number | null; nextTransitionAt: number | null; lastRound: GuessFromStatsRoundResult | null; results: GameResults | null;
}
export interface GuessFromStatsPlayerState {
  canGuess: boolean; solved: boolean; solveOrder: number | null; cooldownUntil: number | null; roundPoints: number; attemptCount: number; lastAttempt: { result: 'CORRECT' | 'INCORRECT'; attemptedAt: number } | null;
}

export const guessFromStatsActionSchema = z.object({ type: z.literal('GUESS_POKEMON'), pokemonId: z.string().min(1).max(96) }).strict();
export type GuessFromStatsAction = z.infer<typeof guessFromStatsActionSchema>;

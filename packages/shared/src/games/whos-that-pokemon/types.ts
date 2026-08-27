import { z } from 'zod';
import type { PokemonLegendaryStatus, PokemonType } from '../../pokemon/types.js';
import type { GamePhase, GameResults } from '../contracts.js';
import type { WhosThatPokemonConfig } from './config.js';

export type WhosThatPokemonHint =
  | { kind: 'GENERATION'; value: number }
  | { kind: 'TYPE'; value: PokemonType }
  | { kind: 'TYPE_COUNT'; value: number }
  | { kind: 'EVOLUTION'; stage: number; stages: number }
  | { kind: 'CATEGORY'; value: PokemonLegendaryStatus };

export interface WhosThatPokemonAttempt {
  playerId: string;
  guessedPokemon: { id: string; name: string; sprite: string };
  attemptedAt: number;
}

export interface WhosThatPokemonSolve {
  solveOrder: number;
  solvedAt: number;
  elapsedMs: number;
  speedPoints: number;
  placementBonus: number;
  points: number;
  attempts: number;
}

export interface WhosThatPokemonPlayerStats {
  correct: number;
  missed: number;
  totalAttempts: number;
  firstTry: number;
  roundFirsts: number;
  solveTimeTotalMs: number;
  bestTimeMs: number;
  pointsFromRounds: number;
}

export interface WhosThatPokemonRoundResult {
  pokemon: { id: string; name: string; sprite: string; generation: number };
  solves: Record<string, WhosThatPokemonSolve>;
  attemptCounts: Record<string, number>;
}

export interface WhosThatPokemonState {
  phase: GamePhase;
  config: WhosThatPokemonConfig;
  assetToken: string;
  playerIds: string[];
  poolIds: string[];
  roundNumber: number;
  targetPokemonId: string | null;
  usedPokemonIds: string[];
  attempts: WhosThatPokemonAttempt[];
  attemptCounts: Record<string, number>;
  solves: Record<string, WhosThatPokemonSolve>;
  cooldownUntil: Record<string, number>;
  lastAttemptResult: Record<string, { result: 'CORRECT' | 'INCORRECT'; attemptedAt: number }>;
  scores: Record<string, number>;
  playerStats: Record<string, WhosThatPokemonPlayerStats>;
  revealedHintCount: number;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: WhosThatPokemonRoundResult | null;
}

export interface WhosThatPokemonRoundPublicResult {
  pokemon: { name: string; sprite: string; generation: number };
  solves: Record<string, WhosThatPokemonSolve>;
  attemptCounts: Record<string, number>;
}

export interface WhosThatPokemonPublicState {
  gameId: 'whos-that-pokemon';
  phase: GamePhase;
  roundNumber: number;
  totalRounds: number;
  silhouetteSprite: string | null;
  visibleHints: WhosThatPokemonHint[];
  attempts: WhosThatPokemonAttempt[];
  solvedPlayers: Array<{ playerId: string; solveOrder: number }>;
  scores: Record<string, number>;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: WhosThatPokemonRoundPublicResult | null;
  results: GameResults | null;
}

export interface WhosThatPokemonPlayerState {
  canGuess: boolean;
  solved: boolean;
  solveOrder: number | null;
  cooldownUntil: number | null;
  roundPoints: number;
  attemptCount: number;
  lastAttempt: { result: 'CORRECT' | 'INCORRECT'; attemptedAt: number } | null;
}

export const whosThatPokemonActionSchema = z.object({ type: z.literal('GUESS_POKEMON'), pokemonId: z.string().min(1).max(96) }).strict();
export type WhosThatPokemonAction = z.infer<typeof whosThatPokemonActionSchema>;

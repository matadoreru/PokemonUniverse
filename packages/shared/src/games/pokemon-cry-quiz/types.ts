import { z } from 'zod';
import type { GamePhase, GameResults, PokemonCryVersion } from '../contracts.js';
import type { PokemonCryQuizConfig } from './config.js';

export interface PokemonCryQuizAttempt {
  playerId: string;
  guessedPokemon: { id: string; name: string; sprite: string };
  attemptedAt: number;
}

export interface PokemonCryQuizSolve {
  solveOrder: number;
  solvedAt: number;
  elapsedMs: number;
  speedPoints: number;
  placementBonus: number;
  points: number;
  attempts: number;
}

export interface PokemonCryQuizStats {
  correct: number;
  missed: number;
  totalAttempts: number;
  firstTry: number;
  roundFirsts: number;
  solveTimeTotalMs: number;
  bestTimeMs: number;
  pointsFromRounds: number;
}

export interface PokemonCryQuizRoundResult {
  pokemon: { id: string; name: string; sprite: string; generation: number };
  cryVersion: PokemonCryVersion;
  solves: Record<string, PokemonCryQuizSolve>;
  attemptCounts: Record<string, number>;
}

export interface PokemonCryQuizState {
  phase: GamePhase;
  config: PokemonCryQuizConfig;
  assetToken: string;
  playerIds: string[];
  poolIds: string[];
  roundNumber: number;
  targetPokemonId: string | null;
  currentCryVersion: PokemonCryVersion | null;
  usedPokemonIds: string[];
  attempts: PokemonCryQuizAttempt[];
  attemptCounts: Record<string, number>;
  solves: Record<string, PokemonCryQuizSolve>;
  cooldownUntil: Record<string, number>;
  lastAttemptResult: Record<string, { result: 'CORRECT' | 'INCORRECT'; attemptedAt: number }>;
  scores: Record<string, number>;
  playerStats: Record<string, PokemonCryQuizStats>;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: PokemonCryQuizRoundResult | null;
}

export interface PokemonCryQuizPublicState {
  gameId: 'pokemon-cry-quiz';
  phase: GamePhase;
  roundNumber: number;
  totalRounds: number;
  cryUrl: string | null;
  attempts: PokemonCryQuizAttempt[];
  solvedPlayers: Array<{ playerId: string; solveOrder: number }>;
  scores: Record<string, number>;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: ({ pokemon: { name: string; sprite: string; generation: number }; cryVersion: PokemonCryVersion; cryUrl: string; solves: Record<string, PokemonCryQuizSolve>; attemptCounts: Record<string, number> }) | null;
  results: GameResults | null;
}

export interface PokemonCryQuizPlayerState {
  role: 'PLAYER' | 'SPECTATOR';
  canGuess: boolean;
  solved: boolean;
  solveOrder: number | null;
  cooldownUntil: number | null;
  roundPoints: number;
  attemptCount: number;
  lastAttempt: { result: 'CORRECT' | 'INCORRECT'; attemptedAt: number } | null;
}

export const pokemonCryQuizActionSchema = z.object({ type: z.literal('GUESS_POKEMON'), pokemonId: z.string().min(1).max(96) }).strict();
export type PokemonCryQuizAction = z.infer<typeof pokemonCryQuizActionSchema>;

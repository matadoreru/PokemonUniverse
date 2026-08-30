import { z } from 'zod';
import type { PokemonLegendaryStatus, PokemonType } from '../../pokemon/types.js';
import type { GamePhase, GameResults } from '../contracts.js';
import type { PokemonPaletteGuessConfig } from './config.js';

export interface PokemonPaletteAttempt { playerId: string; guessedPokemon: { id: string; name: string; sprite: string }; attemptedAt: number }
export type PokemonPaletteHint =
  | { kind: 'GENERATION'; value: number }
  | { kind: 'TYPE'; values: PokemonType[] }
  | { kind: 'TYPE_COUNT'; value: number }
  | { kind: 'EVOLUTION'; stage: number; stages: number }
  | { kind: 'CATEGORY'; value: PokemonLegendaryStatus };
export interface PokemonPaletteSolve { solveOrder: number; solvedAt: number; elapsedMs: number; speedPoints: number; placementBonus: number; points: number; attempts: number }
export interface PokemonPaletteStats { correct: number; missed: number; totalAttempts: number; firstTry: number; roundFirsts: number; solveTimeTotalMs: number; bestTimeMs: number; pointsFromRounds: number }
export interface PokemonPaletteRoundResult { pokemon: { id: string; name: string; sprite: string; generation: number }; palette: string[]; paletteWeights: number[]; solves: Record<string, PokemonPaletteSolve>; attemptCounts: Record<string, number> }

export interface PokemonPaletteGuessState {
  phase: GamePhase; config: PokemonPaletteGuessConfig; playerIds: string[]; poolIds: string[]; roundNumber: number; targetPokemonId: string | null; usedPokemonIds: string[];
  attempts: PokemonPaletteAttempt[]; attemptCounts: Record<string, number>; solves: Record<string, PokemonPaletteSolve>; cooldownUntil: Record<string, number>; lastAttemptResult: Record<string, { result: 'CORRECT' | 'INCORRECT'; attemptedAt: number }>;
  scores: Record<string, number>; playerStats: Record<string, PokemonPaletteStats>; roundStartedAt: number | null; roundEndsAt: number | null; nextTransitionAt: number | null; lastRound: PokemonPaletteRoundResult | null;
}

export interface PokemonPaletteGuessPublicState {
  gameId: 'pokemon-palette-guess'; phase: GamePhase; roundNumber: number; totalRounds: number; colors: string[]; colorWeights: number[]; hints: PokemonPaletteHint[]; attempts: PokemonPaletteAttempt[]; solvedPlayers: Array<{ playerId: string; solveOrder: number }>;
  scores: Record<string, number>; roundStartedAt: number | null; roundEndsAt: number | null; nextTransitionAt: number | null;
  lastRound: ({ pokemon: { name: string; sprite: string; generation: number }; palette: string[]; paletteWeights: number[]; solves: Record<string, PokemonPaletteSolve>; attemptCounts: Record<string, number> }) | null; results: GameResults | null;
}

export interface PokemonPaletteGuessPlayerState { role: 'PLAYER' | 'SPECTATOR'; canGuess: boolean; solved: boolean; solveOrder: number | null; cooldownUntil: number | null; roundPoints: number; attemptCount: number; lastAttempt: { result: 'CORRECT' | 'INCORRECT'; attemptedAt: number } | null }

export const pokemonPaletteGuessActionSchema = z.object({ type: z.literal('GUESS_POKEMON'), pokemonId: z.string().min(1).max(96) }).strict();
export type PokemonPaletteGuessAction = z.infer<typeof pokemonPaletteGuessActionSchema>;

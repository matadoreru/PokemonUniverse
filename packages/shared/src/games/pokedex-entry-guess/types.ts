import { z } from 'zod';
import type { PokedexEntry, PokemonLegendaryStatus, PokemonType } from '../../pokemon/types.js';
import type { GamePhase, GameResults } from '../contracts.js';
import type { PokedexEntryGuessConfig } from './config.js';

export type PokedexEntryGuessHint =
  | { kind: 'GENERATION'; value: number }
  | { kind: 'TYPE'; value: PokemonType }
  | { kind: 'TYPE_COUNT'; value: number }
  | { kind: 'EVOLUTION'; stage: number; stages: number }
  | { kind: 'CATEGORY'; value: PokemonLegendaryStatus };

export interface PokedexEntryGuessAttempt {
  playerId: string;
  guessedPokemon: { id: string; name: string; sprite: string };
  attemptedAt: number;
}

export interface PokedexEntryGuessSolve {
  solveOrder: number;
  solvedAt: number;
  elapsedMs: number;
  points: number;
  attempts: number;
}

export interface PokedexEntryGuessPlayerStats {
  correct: number;
  missed: number;
  totalAttempts: number;
  firstTry: number;
  roundFirsts: number;
  solveTimeTotalMs: number;
  bestTimeMs: number;
  pointsFromRounds: number;
}

export interface PokedexEntryGuessRoundTarget { pokemonId: string; entry: PokedexEntry }
export interface PokedexEntryGuessRoundResult {
  pokemon: { id: string; name: string; sprite: string; generation: number };
  entry: PokedexEntry;
  solves: Record<string, PokedexEntryGuessSolve>;
  attemptCounts: Record<string, number>;
}

export interface PokedexEntryGuessState {
  phase: GamePhase;
  config: PokedexEntryGuessConfig;
  referenceGeneration: number;
  playerIds: string[];
  roundDeck: PokedexEntryGuessRoundTarget[];
  roundNumber: number;
  attempts: PokedexEntryGuessAttempt[];
  attemptCounts: Record<string, number>;
  solves: Record<string, PokedexEntryGuessSolve>;
  cooldownUntil: Record<string, number>;
  lastAttemptResult: Record<string, { result: 'CORRECT' | 'INCORRECT'; attemptedAt: number }>;
  scores: Record<string, number>;
  playerStats: Record<string, PokedexEntryGuessPlayerStats>;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: PokedexEntryGuessRoundResult | null;
}

export interface PokedexEntryGuessRoundPublicResult {
  pokemon: { name: string; sprite: string; generation: number };
  entry: { text: string; generation: number; versionLabel: string };
  solves: Record<string, PokedexEntryGuessSolve>;
  attemptCounts: Record<string, number>;
}

export interface PokedexEntryGuessPublicState {
  gameId: 'pokedex-entry-guess';
  phase: GamePhase;
  roundNumber: number;
  totalRounds: number;
  referenceGeneration: number;
  entryText: string | null;
  hints: PokedexEntryGuessHint[];
  attempts: PokedexEntryGuessAttempt[];
  solvedPlayers: Array<{ playerId: string; solveOrder: number }>;
  scores: Record<string, number>;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: PokedexEntryGuessRoundPublicResult | null;
  results: GameResults | null;
}

export interface PokedexEntryGuessPlayerState {
  canGuess: boolean;
  solved: boolean;
  solveOrder: number | null;
  cooldownUntil: number | null;
  roundPoints: number;
  attemptCount: number;
  lastAttempt: { result: 'CORRECT' | 'INCORRECT'; attemptedAt: number } | null;
}

export const pokedexEntryGuessActionSchema = z.object({ type: z.literal('GUESS_POKEMON'), pokemonId: z.string().min(1).max(96) }).strict();
export type PokedexEntryGuessAction = z.infer<typeof pokedexEntryGuessActionSchema>;

import { z } from 'zod';
import type { GamePhase, GameResults } from '../contracts.js';
import type { PokemonLegendaryStatus, PokemonType } from '../../pokemon/types.js';
import type { PokeddleClueKey, PokeddleRaceConfig } from './config.js';

export type PokeddleNumericComparison = 'HIGHER' | 'LOWER' | 'MATCH';
export type PokeddleTypeComparison = 'EXACT' | 'PARTIAL' | 'NONE';
export type PokeddleCategoryComparison = 'MATCH' | 'NONE';

export type PokeddleFeedbackEntry =
  | { kind: 'NUMERIC'; value: number; result: PokeddleNumericComparison }
  | { kind: 'TYPES'; value: PokemonType[]; result: PokeddleTypeComparison }
  | { kind: 'EVOLUTION'; value: { stage: number; stages: number }; result: PokeddleNumericComparison }
  | { kind: 'CATEGORY'; value: string; result: PokeddleCategoryComparison }
  | { kind: 'ABILITIES'; value: string[]; result: 'PARTIAL' | 'NONE'; matches: number };

export type PokeddleFeedback = Partial<Record<PokeddleClueKey, PokeddleFeedbackEntry>>;
export interface PokeddlePokemonReveal { id: string; name: string; sprite: string }
export interface PokeddleRoundGuess { pokemonId: string; submittedAt: number }
export interface PokeddleBoardRow {
  round: number;
  status: 'GUESS' | 'NO_GUESS';
  guessedPokemon: PokeddlePokemonReveal | null;
  feedback: PokeddleFeedback | null;
  correct: boolean;
  submittedAt: number | null;
}
export interface PokeddleSolve { round: number; validGuesses: number; solvedAt: number }
export interface PokeddlePlayerStats {
  roundsParticipated: number;
  validGuesses: number;
  missedRounds: number;
}

export interface PokeddleRaceState {
  phase: GamePhase;
  config: PokeddleRaceConfig;
  playerIds: string[];
  poolIds: string[];
  secretPokemonIds: Record<string, string>;
  roundNumber: number;
  currentGuesses: Record<string, PokeddleRoundGuess>;
  boards: Record<string, PokeddleBoardRow[]>;
  solved: Record<string, PokeddleSolve>;
  playerStats: Record<string, PokeddlePlayerStats>;
  gameStartedAt: number;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
}

export interface PokeddlePublicBoard {
  playerId: string;
  rows: PokeddleBoardRow[];
  solved: boolean;
  solvedRound: number | null;
  solvedAt: number | null;
  validGuesses: number;
  missedRounds: number;
  revealedPokemon: PokeddlePokemonReveal | null;
}

export interface PokeddleRacePublicState {
  gameId: 'pokeddle-race';
  phase: GamePhase;
  roundNumber: number;
  maxRounds: number;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  answeredPlayerIds: string[];
  activePlayerIds: string[];
  boards: Record<string, PokeddlePublicBoard>;
  enabledClues: PokeddleClueKey[];
  results: GameResults | null;
}

export interface PokeddleRacePlayerState {
  canGuess: boolean;
  hasGuessedThisRound: boolean;
  solved: boolean;
}

export interface PokeddleResultStats extends Record<string, number> {
  resolved: number;
  unresolved: number;
  totalGuesses: number;
  guessesToSolveTotal: number;
  resolutionRoundsTotal: number;
  bestResolutionRounds: number;
  bestTimeMs: number;
  missedRounds: number;
  roundsParticipated: number;
}

export const pokeddleRaceActionSchema = z.object({ type: z.literal('GUESS_POKEMON'), pokemonId: z.string().min(1).max(64) }).strict();
export type PokeddleRaceAction = z.infer<typeof pokeddleRaceActionSchema>;

export const legendaryStatusLabels: Record<PokemonLegendaryStatus, string> = {
  NORMAL: 'Normal', LEGENDARY: 'Legendario', MYTHICAL: 'Mítico',
};


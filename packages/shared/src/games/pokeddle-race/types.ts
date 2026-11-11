import type { GamePhase, GameResults } from '../contracts.js';
import type { PokemonType } from '../../pokemon/types.js';
import type { PokeddleClueKey } from './config.js';

export type PokeddleNumericComparison = 'HIGHER' | 'LOWER' | 'MATCH';
export type PokeddleTypeComparison = 'EXACT' | 'PARTIAL' | 'NONE';
export type PokeddleCategoryComparison = 'MATCH' | 'NONE';
/** Etapa evolutiva: `MATCH` exige etapa y total; misma etapa con otro total es `PARTIAL`; si no, mayor o menor. */
export type PokeddleEvolutionComparison = PokeddleNumericComparison | 'PARTIAL';

export type PokeddleFeedbackEntry =
  | { kind: 'NUMERIC'; value: number; result: PokeddleNumericComparison }
  | { kind: 'TYPES'; value: PokemonType[]; result: PokeddleTypeComparison }
  | { kind: 'EVOLUTION'; value: { stage: number; stages: number }; result: PokeddleEvolutionComparison }
  | { kind: 'CATEGORY'; value: string; result: PokeddleCategoryComparison }
  | { kind: 'ABILITIES'; value: string[]; result: 'PARTIAL' | 'NONE'; matches: number };

export type PokeddleFeedback = Partial<Record<PokeddleClueKey, PokeddleFeedbackEntry>>;
export interface PokeddlePokemonReveal { id: string; name: string; sprite: string }
export interface PokeddleBoardRow {
  round: number;
  status: 'GUESS' | 'NO_GUESS';
  guessedPokemon: PokeddlePokemonReveal | null;
  feedback: PokeddleFeedback | null;
  correct: boolean;
  submittedAt: number | null;
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


import { z } from 'zod';
import type { GamePhase, GameResults } from '../contracts.js';
import type { PokemonTriviaConfig, PokemonTriviaQuestionType } from './config.js';

export const POKEMON_TRIVIA_OPTION_IDS = ['A', 'B', 'C', 'D'] as const;
export type PokemonTriviaOptionId = (typeof POKEMON_TRIVIA_OPTION_IDS)[number];

export interface PokemonTriviaOption {
  id: PokemonTriviaOptionId;
  pokemon: { id: string; name: string; sprite: string };
}

export interface PokemonTriviaQuestion {
  key: string;
  type: PokemonTriviaQuestionType;
  prompt: string;
  options: PokemonTriviaOption[];
  correctOptionId: PokemonTriviaOptionId;
  fact: string;
}

export interface PokemonTriviaOptionDetails {
  generation: number;
  types: string[];
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
  baseStatTotal: number;
  heightDecimeters?: number;
  weightHectograms?: number;
}

export interface PokemonTriviaAnswer {
  optionId: PokemonTriviaOptionId;
  answeredAt: number;
}

export interface PokemonTriviaRoundResult {
  correctOptionId: PokemonTriviaOptionId;
  fact: string;
  answers: Record<string, PokemonTriviaAnswer>;
  points: Record<string, number>;
  optionDetails: Partial<Record<PokemonTriviaOptionId, PokemonTriviaOptionDetails>>;
}

export interface PokemonTriviaStats {
  answers: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  fastestCorrectMs: number;
  correctTimeTotalMs: number;
  pointsFromRounds: number;
}

export interface PokemonTriviaState {
  phase: GamePhase;
  config: PokemonTriviaConfig;
  playerIds: string[];
  poolIds: string[];
  roundNumber: number;
  question: PokemonTriviaQuestion | null;
  usedQuestionKeys: string[];
  answers: Record<string, PokemonTriviaAnswer>;
  scores: Record<string, number>;
  playerStats: Record<string, PokemonTriviaStats>;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: PokemonTriviaRoundResult | null;
}

export interface PokemonTriviaPublicState {
  gameId: 'pokemon-trivia';
  phase: GamePhase;
  roundNumber: number;
  totalRounds: number;
  prompt: string | null;
  questionType: PokemonTriviaQuestionType | null;
  options: PokemonTriviaOption[];
  answeredPlayerIds: string[];
  scores: Record<string, number>;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: PokemonTriviaRoundResult | null;
  results: GameResults | null;
}

export interface PokemonTriviaPlayerState {
  role: 'PLAYER' | 'SPECTATOR';
  canAnswer: boolean;
  answer: PokemonTriviaAnswer | null;
}

export const pokemonTriviaActionSchema = z.object({
  type: z.literal('ANSWER'),
  optionId: z.enum(POKEMON_TRIVIA_OPTION_IDS),
}).strict();
export type PokemonTriviaAction = z.infer<typeof pokemonTriviaActionSchema>;

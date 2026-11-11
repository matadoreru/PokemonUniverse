import type { GamePhase, GameResults } from '../contracts.js';
import type { PokemonTriviaConfig, PokemonTriviaQuestionType } from './config.js';

export const POKEMON_TRIVIA_OPTION_IDS = ['A', 'B', 'C', 'D'] as const;
export type PokemonTriviaOptionId = (typeof POKEMON_TRIVIA_OPTION_IDS)[number];

export interface PokemonTriviaOption {
  id: PokemonTriviaOptionId;
  pokemon: { id: string; name: string; sprite: string };
}

export interface PokemonTriviaOptionDetails {
  nationalDexNumber: number;
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

export interface PokemonTriviaPublicState {
  gameId: 'pokemon-trivia';
  phase: GamePhase;
  roundNumber: number;
  totalRounds: number;
  difficulty: PokemonTriviaConfig['difficulty'];
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

import { z } from 'zod';
import type { GamePhase, GameResults, SubjectiveCategory } from '../contracts.js';
import type { SecretRankingConfig } from './config.js';

export interface SecretRankingPokemon {
  id: string;
  name: string;
  sprite: string;
}

export interface SecretRankingPlayerStats {
  roundsPlayed: number;
  rankingsSubmitted: number;
  roundsMissed: number;
  roundWins: number;
  perfectMatches: number;
  distanceTotal: number;
  pointsFromRounds: number;
}

export interface SecretRankingRoundPlayerResult {
  ranking: SecretRankingPokemon[] | null;
  distance: number | null;
  position: number | null;
  pointsAwarded: number;
}

export interface SecretRankingRoundResult {
  prompt: string;
  pokemon: SecretRankingPokemon[];
  consensus: Array<{ pokemon: SecretRankingPokemon; averagePosition: number }>;
  players: Record<string, SecretRankingRoundPlayerResult>;
}

export interface SecretRankingState {
  phase: GamePhase;
  config: SecretRankingConfig;
  playerIds: string[];
  pokemonPoolIds: string[];
  promptPool: SubjectiveCategory[];
  usedPokemonIds: string[];
  usedPromptIds: string[];
  roundNumber: number;
  currentPokemonIds: string[];
  currentPromptId: string | null;
  submissions: Record<string, string[]>;
  scores: Record<string, number>;
  playerStats: Record<string, SecretRankingPlayerStats>;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: SecretRankingRoundResult | null;
}

export interface SecretRankingPublicState {
  gameId: 'secret-ranking';
  phase: GamePhase;
  roundNumber: number;
  totalRounds: number;
  prompt: string;
  pokemon: SecretRankingPokemon[];
  submittedPlayerIds: string[];
  scores: Record<string, number>;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: SecretRankingRoundResult | null;
  results: GameResults | null;
}

export type SecretRankingPlayerState =
  | { role: 'PLAYER'; canSubmit: boolean; ownRanking: SecretRankingPokemon[] | null }
  | { role: 'SPECTATOR'; canSubmit: false; ownRanking: null };

export const secretRankingActionSchema = z.object({
  type: z.literal('SUBMIT_RANKING'),
  pokemonIds: z.array(z.string().min(1).max(96)).length(5),
}).strict().refine((value) => new Set(value.pokemonIds).size === 5, {
  path: ['pokemonIds'],
  message: 'El ranking debe contener cinco Pokémon distintos.',
});

export type SecretRankingAction = z.infer<typeof secretRankingActionSchema>;

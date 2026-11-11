import type { GamePhase, GameResults } from '../contracts.js';

export interface SecretRankingPokemon {
  id: string;
  name: string;
  sprite: string;
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

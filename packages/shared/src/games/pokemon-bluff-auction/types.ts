import { z } from 'zod';
import type { GamePhase, GameResults } from '../contracts.js';
import type { BingoCondition } from '../pokemon-bingo/types.js';
import type { PokemonBluffAuctionConfig } from './config.js';

export interface BluffAuctionCondition {
  key: string;
  conditions: BingoCondition[];
  description: string;
  clauses: string[];
}

export type BluffAuctionBidEvent =
  | { playerId: string; type: 'BID'; amount: number }
  | { playerId: string; type: 'PASS' };

export interface BluffAuctionPokemonView { id: string; name: string; sprite: string }
export interface BluffAuctionAttempt {
  pokemon: BluffAuctionPokemonView;
  result: 'CORRECT' | 'INCORRECT' | 'DUPLICATE';
  submittedAt: number;
}

export interface BluffAuctionPlayerStats {
  roundsWon: number;
  bidderRounds: number;
  completedBids: number;
  failedBids: number;
  correctPokemon: number;
  incorrectPokemon: number;
  highestCompletedBid: number;
  highestAttemptedBid: number;
  impossibleBids: number;
}

export interface BluffAuctionRoundResult {
  bidderId: string;
  bid: number;
  success: boolean;
  reason: 'COMPLETED' | 'TIMEOUT' | 'IMPOSSIBLE' | 'BIDDER_LEFT';
  condition: { description: string; clauses: string[] };
  attempts: BluffAuctionAttempt[];
  correctCount: number;
  incorrectCount: number;
  validPokemonCount: number;
  pointsAwarded: Record<string, number>;
}

export interface PokemonBluffAuctionState {
  phase: GamePhase;
  config: PokemonBluffAuctionConfig;
  playerIds: string[];
  poolIds: string[];
  conditionTemplates: Array<BluffAuctionCondition & { candidatePokemonIds: string[] }>;
  usedConditionKeys: string[];
  roundNumber: number;
  condition: BluffAuctionCondition | null;
  validPokemonIds: string[];
  bidOrder: string[];
  turnIndex: number;
  passedPlayerIds: string[];
  currentBid: number | null;
  currentBidderId: string | null;
  bidHistory: BluffAuctionBidEvent[];
  bidderId: string | null;
  targetBid: number | null;
  attempts: BluffAuctionAttempt[];
  usedPokemonIds: string[];
  correctCount: number;
  incorrectCount: number;
  scores: Record<string, number>;
  playerStats: Record<string, BluffAuctionPlayerStats>;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: BluffAuctionRoundResult | null;
}

export interface PokemonBluffAuctionPublicState {
  gameId: 'pokemon-bluff-auction';
  phase: GamePhase;
  roundNumber: number;
  totalRounds: number;
  playerIds: string[];
  condition: { description: string; clauses: string[] } | null;
  bidOrder: string[];
  currentTurnPlayerId: string | null;
  passedPlayerIds: string[];
  currentBid: number | null;
  minimumBid: number;
  currentBidderId: string | null;
  bidHistory: BluffAuctionBidEvent[];
  maxBid: number;
  bidderId: string | null;
  targetBid: number | null;
  attempts: BluffAuctionAttempt[];
  correctCount: number;
  incorrectCount: number;
  remainingCount: number;
  scores: Record<string, number>;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
  lastRound: BluffAuctionRoundResult | null;
  results: GameResults | null;
}

export type PokemonBluffAuctionPlayerState =
  | { role: 'PLAYER'; canRaise: boolean; canPass: boolean; canSubmitPokemon: boolean }
  | { role: 'SPECTATOR'; canRaise: false; canPass: false; canSubmitPokemon: false };

export const pokemonBluffAuctionActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('RAISE_BID'), amount: z.number().int().min(1) }).strict(),
  z.object({ type: z.literal('PASS_BID') }).strict(),
  z.object({ type: z.literal('SUBMIT_POKEMON'), pokemonId: z.string().min(1).max(96) }).strict(),
]);
export type PokemonBluffAuctionAction = z.infer<typeof pokemonBluffAuctionActionSchema>;

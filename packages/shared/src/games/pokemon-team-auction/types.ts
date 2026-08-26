import { z } from 'zod';
import type { GamePhase, GameResults } from '../contracts.js';
import type { PokemonTeamAuctionConfig } from './config.js';

export interface TeamAuctionPokemon {
  id: string;
  name: string;
  sprite: string;
  baseStatTotal: number;
  legendaryStatus: 'NORMAL' | 'LEGENDARY' | 'MYTHICAL';
}

export interface TeamAuctionLotResult {
  lotNumber: number;
  pokemon: TeamAuctionPokemon;
  winnerId: string | null;
  bid: number;
}

export type TeamAuctionBidEvent =
  | { lotNumber: number; playerId: string; type: 'BID'; amount: number }
  | { lotNumber: number; playerId: string; type: 'PASS' };

export interface TeamAuctionPlayerStats {
  lotsWon: number;
  pokemonWon: number;
  bstTotal: number;
  coinsRemaining: number;
  legendaryCount: number;
  mythicalCount: number;
  unownedLots: number;
}

export interface TeamAuctionParticipant {
  playerId: string;
  coins: number;
  team: TeamAuctionPokemon[];
}

export interface PokemonTeamAuctionState {
  phase: GamePhase;
  config: PokemonTeamAuctionConfig;
  playerIds: string[];
  lots: TeamAuctionPokemon[];
  currentLotIndex: number;
  currentBid: number | null;
  currentBidderId: string | null;
  turnOrder: string[];
  turnIndex: number;
  passedPlayerIds: string[];
  bidHistory: TeamAuctionBidEvent[];
  lotHistory: TeamAuctionLotResult[];
  participants: Record<string, TeamAuctionParticipant>;
  playerStats: Record<string, TeamAuctionPlayerStats>;
  scores: Record<string, number>;
  results: GameResults | null;
}

export interface PokemonTeamAuctionPublicState {
  gameId: 'pokemon-team-auction';
  phase: GamePhase;
  lotNumber: number;
  totalLots: number;
  currentPokemon: TeamAuctionPokemon | null;
  currentBid: number | null;
  minimumBid: number;
  currentBidderId: string | null;
  currentTurnPlayerId: string | null;
  turnOrder: string[];
  passedPlayerIds: string[];
  bidHistory: TeamAuctionBidEvent[];
  lotHistory: TeamAuctionLotResult[];
  participants: Record<string, TeamAuctionParticipant>;
  scores: Record<string, number>;
  results: GameResults | null;
}

export interface PokemonTeamAuctionPlayerState {
  role: 'PLAYER' | 'SPECTATOR';
  canRaise: boolean;
  canPass: boolean;
  minimumBid: number;
  coins: number;
  team: TeamAuctionPokemon[];
}

export const pokemonTeamAuctionActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('RAISE_BID'), amount: z.number().int().min(1).max(100_000) }).strict(),
  z.object({ type: z.literal('PASS_BID') }).strict(),
]);

export type PokemonTeamAuctionAction = z.infer<typeof pokemonTeamAuctionActionSchema>;

import type { GamePhase, GameResults } from '../contracts.js';

export interface TeamAuctionPokemon {
  id: string;
  name: string;
  sprite: string;
  baseStatTotal: number;
  legendaryStatus: 'NORMAL' | 'LEGENDARY' | 'MYTHICAL';
}

/** El lote en subasta en la vista pública: sin su BST, que no se enseña mientras se puja (sí al ganarlo). */
export type TeamAuctionLotPokemon = Omit<TeamAuctionPokemon, 'baseStatTotal'>;

export interface TeamAuctionLotResult {
  lotNumber: number;
  pokemon: TeamAuctionPokemon;
  winnerId: string | null;
  bid: number;
}

export type TeamAuctionBidEvent =
  | { lotNumber: number; playerId: string; type: 'BID'; amount: number }
  | { lotNumber: number; playerId: string; type: 'PASS' };

export interface TeamAuctionParticipant {
  playerId: string;
  coins: number;
  team: TeamAuctionPokemon[];
}

export interface PokemonTeamAuctionPublicState {
  roundEndsAt?: number | null;
  gameId: 'pokemon-team-auction';
  phase: GamePhase;
  lotNumber: number;
  totalLots: number;
  currentPokemon: TeamAuctionLotPokemon | null;
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

import type { GamePhase, GameResults } from '../contracts.js';

export type BluffAuctionBidEvent =
  | { playerId: string; type: 'BID'; amount: number }
  | { playerId: string; type: 'PASS' };

export interface BluffAuctionPokemonView { id: string; name: string; sprite: string }
export interface BluffAuctionAttempt {
  pokemon: BluffAuctionPokemonView;
  result: 'CORRECT' | 'INCORRECT' | 'DUPLICATE';
  submittedAt: number;
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
  validPokemonCount: number | null;
  pointsAwarded: Record<string, number>;
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

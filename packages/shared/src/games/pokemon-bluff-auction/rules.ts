import { buildRankedResults } from '../../scoring.js';
import type { GameResults } from '../contracts.js';
import type { BluffAuctionPlayerStats, PokemonBluffAuctionState } from './types.js';

export const BLUFF_BIDDER_SUCCESS_POINTS = 5;
export const BLUFF_OTHERS_SUCCESS_POINTS = 2;

export function emptyBluffAuctionStats(): BluffAuctionPlayerStats {
  return {
    roundsWon: 0, bidderRounds: 0, completedBids: 0, failedBids: 0,
    correctPokemon: 0, incorrectPokemon: 0, highestCompletedBid: 0,
    highestAttemptedBid: 0, impossibleBids: 0,
  };
}

export function buildPokemonBluffAuctionResults(state: PokemonBluffAuctionState): GameResults {
  if (state.phase !== 'GAME_RESULTS') throw new Error('Results are unavailable before the game finishes');
  return buildRankedResults(state.playerIds.map((playerId) => ({
    playerId, points: state.scores[playerId] ?? 0,
    stats: state.playerStats[playerId] ?? emptyBluffAuctionStats(),
  })), {
    compare: (left, right) => right.points - left.points
      || right.stats.roundsWon - left.stats.roundsWon
      || right.stats.highestCompletedBid - left.stats.highestCompletedBid
      || left.playerId.localeCompare(right.playerId),
    tieKey: (entry) => entry.points,
  });
}

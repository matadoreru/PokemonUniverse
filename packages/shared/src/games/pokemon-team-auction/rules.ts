import { buildRankedResults } from '../../scoring.js';
import type { GameResults } from '../contracts.js';
import type { PokemonTeamAuctionState, TeamAuctionParticipant, TeamAuctionPlayerStats } from './types.js';

function teamStats(participant: TeamAuctionParticipant): Omit<TeamAuctionPlayerStats, 'lotsWon' | 'unownedLots'> {
  return {
    pokemonWon: participant.team.length,
    bstTotal: participant.team.reduce((total, pokemon) => total + pokemon.baseStatTotal, 0),
    coinsRemaining: participant.coins,
    legendaryCount: participant.team.filter((pokemon) => pokemon.legendaryStatus === 'LEGENDARY').length,
    mythicalCount: participant.team.filter((pokemon) => pokemon.legendaryStatus === 'MYTHICAL').length,
  };
}

export function buildTeamAuctionResults(state: PokemonTeamAuctionState): GameResults {
  if (state.phase !== 'GAME_RESULTS') throw new Error('Results are unavailable before the auction finishes');
  return buildRankedResults(state.playerIds.map((playerId) => {
    const participant = state.participants[playerId]!;
    const base = teamStats(participant);
    return {
      playerId,
      points: base.bstTotal,
      stats: {
        ...base,
        lotsWon: state.lotHistory.filter((lot) => lot.winnerId === playerId).length,
        unownedLots: state.lotHistory.filter((lot) => lot.winnerId === null).length,
      },
    };
  }), {
    compare: (left, right) => right.points - left.points
      || right.stats.coinsRemaining - left.stats.coinsRemaining
      || right.stats.legendaryCount - left.stats.legendaryCount
      || right.stats.mythicalCount - left.stats.mythicalCount
      || left.playerId.localeCompare(right.playerId),
    tieKey: (entry) => `${entry.points}:${entry.stats.coinsRemaining}:${entry.stats.legendaryCount}:${entry.stats.mythicalCount}`,
  });
}

export function participantStats(participant: TeamAuctionParticipant, lotsWon: number, unownedLots: number): TeamAuctionPlayerStats {
  return { ...teamStats(participant), lotsWon, unownedLots };
}

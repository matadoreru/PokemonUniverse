import { buildRankedResults, pointsForPosition, rankCompetition } from '../../scoring.js';
import type { GameResults } from '../contracts.js';
import type { SecretRankingPlayerStats, SecretRankingState } from './types.js';

export function emptySecretRankingStats(): SecretRankingPlayerStats {
  return {
    roundsPlayed: 0,
    rankingsSubmitted: 0,
    roundsMissed: 0,
    roundWins: 0,
    perfectMatches: 0,
    distanceTotal: 0,
    pointsFromRounds: 0,
  };
}

export interface RankingDistance {
  playerId: string;
  distance: number;
  distanceUnits: number;
  position: number;
  points: number;
}

/** Spearman footrule distance against the mean positions of every other submitted ranking. */
export function secretRankingDistances(submissions: Record<string, readonly string[]>): RankingDistance[] {
  const entries = Object.entries(submissions);
  if (entries.length < 2) return [];
  const pokemonIds = entries[0]![1];
  const positionMaps = Object.fromEntries(entries.map(([playerId, ranking]) => [
    playerId,
    new Map(ranking.map((pokemonId, index) => [pokemonId, index + 1])),
  ]));
  const peerCount = entries.length - 1;
  const raw = entries.map(([playerId]) => {
    const own = positionMaps[playerId]!;
    const distanceUnits = pokemonIds.reduce((total, pokemonId) => {
      const ownPosition = own.get(pokemonId)!;
      const peerPositionTotal = entries.reduce((sum, [peerId]) => peerId === playerId ? sum : sum + positionMaps[peerId]!.get(pokemonId)!, 0);
      return total + Math.abs(ownPosition * peerCount - peerPositionTotal);
    }, 0);
    return { playerId, distanceUnits, distance: distanceUnits / peerCount };
  });
  return rankCompetition(raw, (left, right) => left.distanceUnits - right.distanceUnits || left.playerId.localeCompare(right.playerId), (entry) => entry.distanceUnits)
    .map(({ entry, position }) => ({ ...entry, position, points: pointsForPosition(entries.length, position) }));
}

export function buildSecretRankingResults(state: SecretRankingState): GameResults {
  if (state.phase !== 'GAME_RESULTS') throw new Error('Results are unavailable before Secret Ranking finishes');
  return buildRankedResults(state.playerIds.map((playerId) => ({
    playerId,
    points: state.scores[playerId] ?? 0,
    stats: state.playerStats[playerId] ?? emptySecretRankingStats(),
  })), {
    compare: (left, right) => right.points - left.points
      || right.stats.roundWins - left.stats.roundWins
      || right.stats.rankingsSubmitted - left.stats.rankingsSubmitted
      || left.stats.distanceTotal - right.stats.distanceTotal
      || left.playerId.localeCompare(right.playerId),
    tieKey: (entry) => `${entry.points}:${entry.stats.roundWins}:${entry.stats.rankingsSubmitted}:${entry.stats.distanceTotal}`,
  });
}

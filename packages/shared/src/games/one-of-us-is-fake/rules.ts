import { buildRankedResults } from '../../scoring.js';
import type { GameResults } from '../contracts.js';
import type { OneOfUsIsFakeState, OneOfUsIsFakeStats } from './types.js';

export const NORMAL_ROUND_POINTS = 2;
export const FAKE_ROUND_POINTS = 4;

export function emptyOneOfUsIsFakeStats(): OneOfUsIsFakeStats {
  return {
    roundsPlayed: 0, victoriesAsFake: 0, victoriesAsNormal: 0, timesFake: 0,
    fakeDiscovered: 0, fakeUndiscovered: 0, correctVotes: 0, incorrectVotes: 0,
    normalWronglySelected: 0,
  };
}

export function buildOneOfUsIsFakeResults(state: OneOfUsIsFakeState): GameResults {
  if (state.phase !== 'GAME_RESULTS') throw new Error('Results are unavailable before the game finishes');
  return buildRankedResults(state.playerIds.map((playerId) => ({
    playerId,
    points: state.scores[playerId] ?? 0,
    stats: state.playerStats[playerId] ?? emptyOneOfUsIsFakeStats(),
  })), {
    compare: (left, right) => right.points - left.points
      || (right.stats.victoriesAsFake + right.stats.victoriesAsNormal) - (left.stats.victoriesAsFake + left.stats.victoriesAsNormal)
      || right.stats.correctVotes - left.stats.correctVotes
      || left.playerId.localeCompare(right.playerId),
    tieKey: (entry) => entry.points,
  });
}

import { buildRankedResults } from '../../scoring.js';
import type { GameResults } from '../contracts.js';
import type { SketchmonPlayerStats, SketchmonState } from './types.js';

export const SKETCHMON_DRAWER_POINTS = 3;

export function sketchmonGuesserPoints(elapsedMs: number): number {
  const elapsed = Math.max(0, elapsedMs);
  if (elapsed < 20_000) return 5;
  if (elapsed < 40_000) return 4;
  if (elapsed < 60_000) return 3;
  return 2;
}

export function emptySketchmonStats(): SketchmonPlayerStats {
  return {
    guessedPokemon: 0,
    firstTry: 0,
    totalAttempts: 0,
    firstCorrectResponses: 0,
    drawingRounds: 0,
    drawingSuccesses: 0,
    drawingFailures: 0,
    pointsFromGuessing: 0,
    pointsFromDrawing: 0,
  };
}

export function buildSketchmonResults(state: SketchmonState): GameResults {
  if (state.phase !== 'GAME_RESULTS') throw new Error('Results are unavailable before the game finishes');
  return buildRankedResults(state.playerIds.map((playerId) => ({
    playerId,
    points: state.scores[playerId] ?? 0,
    stats: state.playerStats[playerId] ?? emptySketchmonStats(),
  })), {
    compare: (left, right) => right.points - left.points
      || right.stats.guessedPokemon - left.stats.guessedPokemon
      || right.stats.drawingSuccesses - left.stats.drawingSuccesses
      || left.playerId.localeCompare(right.playerId),
    tieKey: (entry) => entry.points,
  });
}

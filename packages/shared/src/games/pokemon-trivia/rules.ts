import { buildRankedResults } from '../../scoring.js';
import type { GameResults } from '../contracts.js';
import type { PokemonTriviaState, PokemonTriviaStats } from './types.js';

export function pokemonTriviaPoints(startedAt: number, durationSeconds: number, answeredAt: number): number {
  const durationMs = durationSeconds * 1_000;
  const remainingRatio = Math.max(0, Math.min(1, (startedAt + durationMs - answeredAt) / durationMs));
  return 100 + Math.ceil(remainingRatio * 100);
}

export function emptyPokemonTriviaStats(): PokemonTriviaStats {
  return { answers: 0, correct: 0, incorrect: 0, unanswered: 0, fastestCorrectMs: 0, correctTimeTotalMs: 0, pointsFromRounds: 0 };
}

export function buildPokemonTriviaResults(state: PokemonTriviaState): GameResults {
  if (state.phase !== 'GAME_RESULTS') throw new Error('Results are unavailable before the game finishes');
  return buildRankedResults(state.playerIds.map((playerId) => ({
    playerId,
    points: state.scores[playerId] ?? 0,
    stats: state.playerStats[playerId] ?? emptyPokemonTriviaStats(),
  })), {
    compare: (left, right) => right.points - left.points || right.stats.correct - left.stats.correct || left.playerId.localeCompare(right.playerId),
    tieKey: (entry) => `${entry.points}:${entry.stats.correct}`,
  });
}

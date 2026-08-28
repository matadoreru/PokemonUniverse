import { buildRankedResults } from '../../scoring.js';
import type { GameResults } from '../contracts.js';
import type { PokemonPaletteGuessState, PokemonPaletteStats } from './types.js';

const PODIUM_BONUSES = [3, 2, 1] as const;
export function pokemonPaletteScore(roundStartedAt: number, roundSeconds: number, solvedAt: number, solveOrder: number) {
  const duration = roundSeconds * 1_000; const elapsed = Math.max(0, Math.min(duration, solvedAt - roundStartedAt));
  const speedPoints = Math.max(1, Math.ceil(Math.max(0, 1 - elapsed / duration) * 10)); const placementBonus = PODIUM_BONUSES[solveOrder - 1] ?? 0;
  return { speedPoints, placementBonus, totalPoints: speedPoints + placementBonus };
}
export const emptyPokemonPaletteStats = (): PokemonPaletteStats => ({ correct: 0, missed: 0, totalAttempts: 0, firstTry: 0, roundFirsts: 0, solveTimeTotalMs: 0, bestTimeMs: 0, pointsFromRounds: 0 });
export function buildPokemonPaletteResults(state: PokemonPaletteGuessState): GameResults {
  if (state.phase !== 'GAME_RESULTS') throw new Error('Results are unavailable before the game finishes');
  return buildRankedResults(state.playerIds.map((playerId) => ({ playerId, points: state.scores[playerId] ?? 0, stats: state.playerStats[playerId] ?? emptyPokemonPaletteStats() })), { compare: (left, right) => right.points - left.points || right.stats.correct - left.stats.correct || left.playerId.localeCompare(right.playerId), tieKey: (entry) => entry.points });
}

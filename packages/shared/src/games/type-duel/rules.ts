import type { Pokemon, PokemonType } from '../../pokemon/types.js';
import { buildRankedResults } from '../../scoring.js';
import type { GameResults } from '../contracts.js';
import type { TypeDuelState } from './types.js';
export const TYPE_DUEL_WIN_POINTS = 5;
export const TYPE_DUEL_ATTEMPT_COOLDOWN_MS = 1_000;
export const TYPE_DUEL_MAX_SOLUTIONS = 8;
export function requiredTypeCombination(typeA: PokemonType, typeB: PokemonType): PokemonType[] { return typeA === typeB ? [typeA] : [typeA, typeB]; }
export function isValidPokemonForTypes(pokemon: Pokemon, typeA: PokemonType, typeB: PokemonType): boolean {
  const required = requiredTypeCombination(typeA, typeB);
  if (pokemon.types.length !== required.length) return false;
  return required.every((type) => pokemon.types.includes(type));
}
export function chooseBalancedPair(playerIds: readonly string[], counts: Readonly<Record<string, number>>, lastPair: readonly string[] | null, random: () => number): [string, string] {
  const pairs: Array<[string, string]> = [];
  for (let a = 0; a < playerIds.length; a += 1) for (let b = a + 1; b < playerIds.length; b += 1) pairs.push([playerIds[a]!, playerIds[b]!]);
  const minimum = Math.min(...pairs.map(([a, b]) => (counts[a] ?? 0) + (counts[b] ?? 0)));
  let candidates = pairs.filter(([a, b]) => (counts[a] ?? 0) + (counts[b] ?? 0) === minimum);
  const withoutRepeat = candidates.filter((pair) => !lastPair || !(pair.includes(lastPair[0]!) && pair.includes(lastPair[1]!)));
  if (withoutRepeat.length) candidates = withoutRepeat;
  return candidates[Math.min(Math.floor(random() * candidates.length), candidates.length - 1)]!;
}
export function buildTypeDuelResults(state: TypeDuelState): GameResults {
  if (state.phase !== 'GAME_RESULTS') throw new Error('Results unavailable');
  return buildRankedResults(state.playerIds.map((playerId) => ({ playerId, points: state.scores[playerId] ?? 0, stats: state.playerStats[playerId]! })), {
    compare: (left, right) => right.points - left.points || left.playerId.localeCompare(right.playerId),
    tieKey: (entry) => entry.points,
    mapStats: (entry) => ({ ...entry.stats, winRate: entry.stats.duelsPlayed ? Math.round(entry.stats.duelsWon / entry.stats.duelsPlayed * 100) : 0, averageCorrectTimeMs: entry.stats.correctAttempts ? Math.round(entry.stats.correctTimeTotalMs / entry.stats.correctAttempts) : 0 }),
  });
}

import type { Pokemon, PokemonType } from '../../pokemon/types.js';
import type { GameResults, GameStanding } from '../contracts.js';
import type { TypeDuelState } from './types.js';
export const TYPE_DUEL_WIN_POINTS = 5;
export const TYPE_DUEL_ATTEMPT_COOLDOWN_MS = 1_000;
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
  const ordered = state.playerIds.map((playerId) => ({ playerId, points: state.scores[playerId] ?? 0, stats: state.playerStats[playerId]! })).sort((a, b) => b.points - a.points || a.playerId.localeCompare(b.playerId));
  let prior: number | null = null; let position = 0;
  const standings: GameStanding[] = ordered.map((entry, index) => { if (entry.points !== prior) position = index + 1; prior = entry.points; return { playerId: entry.playerId, position, points: entry.points, stats: { ...entry.stats, winRate: entry.stats.duelsPlayed ? Math.round(entry.stats.duelsWon / entry.stats.duelsPlayed * 100) : 0, averageCorrectTimeMs: entry.stats.correctAttempts ? Math.round(entry.stats.correctTimeTotalMs / entry.stats.correctAttempts) : 0 } }; });
  const leaders = standings.filter((entry) => entry.position === 1); return { winnerId: leaders.length === 1 ? leaders[0]!.playerId : null, standings };
}

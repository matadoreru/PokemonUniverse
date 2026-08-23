import type { Pokemon } from '../../pokemon/types.js';
import type { GameResults, GameStanding } from '../contracts.js';
import type { HigherLowerCategory, HigherLowerDifficulty } from './config.js';
import type { HigherLowerChoice, HigherLowerState } from './types.js';

export const HIGHER_LOWER_POINTS = { HIGHER: 1, SAME: 3, LOWER: 1 } as const;
export const STREAK_BONUSES = [{ streak: 10, bonus: 4 }, { streak: 5, bonus: 2 }, { streak: 3, bonus: 1 }] as const;
export const HIGHER_LOWER_DIFFICULTY_PERCENTILES: Record<HigherLowerDifficulty, number> = {
  VERY_EASY: 1,
  EASY: 0.75,
  NORMAL: 0.5,
  HARD: 0.25,
  VERY_HARD: 0,
};
export const HIGHER_LOWER_DIFFICULTY_CANDIDATE_RATIO = 0.2;

export function pokemonCategoryValue(pokemon: Pokemon, category: HigherLowerCategory): number {
  const fields = { DEX_NUMBER: pokemon.nationalDexNumber, HP: pokemon.hp, ATTACK: pokemon.attack, DEFENSE: pokemon.defense, SPECIAL_ATTACK: pokemon.specialAttack, SPECIAL_DEFENSE: pokemon.specialDefense, SPEED: pokemon.speed, BASE_STAT_TOTAL: pokemon.baseStatTotal };
  return fields[category];
}
export function higherLowerAnswer(previous: number, current: number): HigherLowerChoice { return current > previous ? 'HIGHER' : current < previous ? 'LOWER' : 'SAME'; }
export function selectPokemonByDifficulty(
  previous: Pokemon,
  candidates: readonly Pokemon[],
  category: HigherLowerCategory,
  difficulty: HigherLowerDifficulty,
  random: () => number,
): Pokemon {
  if (!candidates.length) throw new Error('No hay Pokémon candidatos para esta ronda.');
  const previousValue = pokemonCategoryValue(previous, category);
  const ranked = candidates
    .map((pokemon) => ({ pokemon, difference: Math.abs(pokemonCategoryValue(pokemon, category) - previousValue) }))
    .sort((a, b) => a.difference - b.difference || a.pokemon.nationalDexNumber - b.pokemon.nationalDexNumber || a.pokemon.id.localeCompare(b.pokemon.id));
  const targetIndex = Math.round((ranked.length - 1) * HIGHER_LOWER_DIFFICULTY_PERCENTILES[difficulty]);
  const bandSize = Math.max(1, Math.ceil(ranked.length * HIGHER_LOWER_DIFFICULTY_CANDIDATE_RATIO));
  const bandStart = Math.min(Math.max(targetIndex - Math.floor(bandSize / 2), 0), ranked.length - bandSize);
  const targetBand = ranked.slice(bandStart, bandStart + bandSize);
  const minimumDifference = targetBand[0]!.difference;
  const maximumDifference = targetBand[targetBand.length - 1]!.difference;
  const suitable = ranked.filter((entry) => entry.difference >= minimumDifference && entry.difference <= maximumDifference);
  return suitable[Math.min(Math.floor(random() * suitable.length), suitable.length - 1)]!.pokemon;
}
export function streakBonus(streak: number): number { return STREAK_BONUSES.find((entry) => streak >= entry.streak)?.bonus ?? 0; }
export function buildHigherLowerResults(state: HigherLowerState): GameResults {
  if (state.phase !== 'GAME_RESULTS') throw new Error('Results unavailable');
  const ordered = state.playerIds.map((playerId) => ({ playerId, points: state.scores[playerId] ?? 0, stats: state.playerStats[playerId]! })).sort((a, b) => b.points - a.points || a.playerId.localeCompare(b.playerId));
  let prior: number | null = null; let position = 0;
  const standings: GameStanding[] = ordered.map((entry, index) => {
    if (entry.points !== prior) position = index + 1; prior = entry.points;
    const resolvedRounds = entry.stats.correct + entry.stats.incorrect;
    return { playerId: entry.playerId, position, points: entry.points, stats: { ...entry.stats, accuracy: resolvedRounds ? Math.round(entry.stats.correct / resolvedRounds * 100) : 0 } };
  });
  const leaders = standings.filter((entry) => entry.position === 1);
  return { winnerId: leaders.length === 1 ? leaders[0]!.playerId : null, standings };
}

import type { Pokemon } from '../../pokemon/types.js';
import { buildRankedResults } from '../../scoring.js';
import type { GameResults } from '../contracts.js';
import type { WhosThatPokemonHint, WhosThatPokemonPlayerStats, WhosThatPokemonState } from './types.js';

export const WHOS_THAT_POKEMON_MAX_POINTS = 10;
export const WHOS_THAT_POKEMON_MIN_POINTS = 1;
export const WHOS_THAT_POKEMON_PODIUM_BONUSES = [3, 2, 1] as const;

export function isUsableWhoPokemonSprite(pokemon: Pokemon): boolean {
  if (!pokemon.id || !pokemon.name || !pokemon.sprite) return false;
  try {
    const url = new URL(pokemon.sprite);
    return url.protocol === 'https:' && url.hostname === 'raw.githubusercontent.com' && /\.(png|webp)$/i.test(url.pathname);
  } catch { return false; }
}

export interface WhoPokemonScore {
  speedPoints: number;
  placementBonus: number;
  totalPoints: number;
}

export function whoPokemonScore(roundStartedAt: number, roundSeconds: number, solvedAt: number, solveOrder: number): WhoPokemonScore {
  const duration = roundSeconds * 1_000;
  const elapsed = Math.max(0, Math.min(duration, solvedAt - roundStartedAt));
  const remainingRatio = Math.max(0, 1 - elapsed / duration);
  const speedPoints = Math.max(WHOS_THAT_POKEMON_MIN_POINTS, Math.ceil(remainingRatio * WHOS_THAT_POKEMON_MAX_POINTS));
  const placementBonus = WHOS_THAT_POKEMON_PODIUM_BONUSES[solveOrder - 1] ?? 0;
  return { speedPoints, placementBonus, totalPoints: speedPoints + placementBonus };
}

export function whoPokemonPoints(roundStartedAt: number, roundSeconds: number, solvedAt: number, solveOrder = 1): number {
  return whoPokemonScore(roundStartedAt, roundSeconds, solvedAt, solveOrder).totalPoints;
}

export function whoPokemonScoringLabel(): string {
  return '1–10 pts por rapidez · bonus de orden +3 / +2 / +1';
}

export function buildWhoPokemonHints(pokemon: Pokemon): WhosThatPokemonHint[] {
  const hints: WhosThatPokemonHint[] = [
    { kind: 'GENERATION', value: pokemon.generation },
    { kind: 'TYPE', value: pokemon.types[0]! },
  ];
  if (pokemon.evolutionStage && pokemon.evolutionStageCount) hints.push({ kind: 'EVOLUTION', stage: pokemon.evolutionStage, stages: pokemon.evolutionStageCount });
  else hints.push({ kind: 'TYPE_COUNT', value: pokemon.types.length });
  if (hints.length < 3 && pokemon.legendaryStatus) hints.push({ kind: 'CATEGORY', value: pokemon.legendaryStatus });
  return hints.slice(0, 3);
}

export function whoPokemonHintSchedule(roundStartedAt: number, roundSeconds: number, hintCount: number): number[] {
  const duration = roundSeconds * 1_000;
  return Array.from({ length: hintCount }, (_, index) => roundStartedAt + Math.round(duration * (index + 1) / (hintCount + 1)));
}

export function emptyWhoPokemonStats(): WhosThatPokemonPlayerStats {
  return { correct: 0, missed: 0, totalAttempts: 0, firstTry: 0, roundFirsts: 0, solveTimeTotalMs: 0, bestTimeMs: 0, pointsFromRounds: 0 };
}

export function buildWhoPokemonResults(state: WhosThatPokemonState): GameResults {
  if (state.phase !== 'GAME_RESULTS') throw new Error('Results are unavailable before the game finishes');
  return buildRankedResults(state.playerIds.map((playerId) => ({ playerId, points: state.scores[playerId] ?? 0, stats: state.playerStats[playerId] ?? emptyWhoPokemonStats() })), {
    compare: (left, right) => right.points - left.points || right.stats.correct - left.stats.correct || left.playerId.localeCompare(right.playerId),
    tieKey: (entry) => entry.points,
  });
}

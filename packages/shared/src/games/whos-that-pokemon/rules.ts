import type { Pokemon } from '../../pokemon/types.js';
import type { GameResults, GameStanding } from '../contracts.js';
import type { WhosThatPokemonHint, WhosThatPokemonPlayerStats, WhosThatPokemonState } from './types.js';

export const WHOS_THAT_POKEMON_MAX_POINTS = 5;
export const WHOS_THAT_POKEMON_MIN_POINTS = 1;
export const WHOS_THAT_POKEMON_SCORE_BANDS = 5;

export function isUsableWhoPokemonSprite(pokemon: Pokemon): boolean {
  if (!pokemon.id || !pokemon.name || !pokemon.sprite) return false;
  try {
    const url = new URL(pokemon.sprite);
    return url.protocol === 'https:' && url.hostname === 'raw.githubusercontent.com' && /\.(png|webp)$/i.test(url.pathname);
  } catch { return false; }
}

export function whoPokemonPoints(roundStartedAt: number, roundSeconds: number, solvedAt: number): number {
  const duration = roundSeconds * 1_000;
  const elapsed = Math.max(0, Math.min(duration, solvedAt - roundStartedAt));
  const band = Math.min(WHOS_THAT_POKEMON_SCORE_BANDS - 1, Math.floor(elapsed / duration * WHOS_THAT_POKEMON_SCORE_BANDS));
  return Math.max(WHOS_THAT_POKEMON_MIN_POINTS, WHOS_THAT_POKEMON_MAX_POINTS - band);
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
  return { correct: 0, missed: 0, totalAttempts: 0, firstTry: 0, solveTimeTotalMs: 0, bestTimeMs: 0, pointsFromRounds: 0 };
}

export function buildWhoPokemonResults(state: WhosThatPokemonState): GameResults {
  if (state.phase !== 'GAME_RESULTS') throw new Error('Results are unavailable before the game finishes');
  const ordered = state.playerIds.map((playerId) => ({ playerId, points: state.scores[playerId] ?? 0, stats: state.playerStats[playerId] ?? emptyWhoPokemonStats() }))
    .sort((left, right) => right.points - left.points || right.stats.correct - left.stats.correct || left.playerId.localeCompare(right.playerId));
  let priorPoints: number | null = null; let position = 0;
  const standings: GameStanding[] = ordered.map((entry, index) => {
    if (entry.points !== priorPoints) position = index + 1;
    priorPoints = entry.points;
    return { playerId: entry.playerId, position, points: entry.points, won: position === 1, stats: { ...entry.stats } };
  });
  const leaders = standings.filter((standing) => standing.position === 1);
  return { winnerId: leaders.length === 1 ? leaders[0]!.playerId : null, standings };
}

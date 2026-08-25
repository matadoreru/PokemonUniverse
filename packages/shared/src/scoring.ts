import type { GameResults, GameStanding } from './games/contracts.js';

/** Dynamic scoring: field-size base plus a podium multiplier. */
export function pointsForPosition(playerCount: number, position: number): number {
  if (!Number.isInteger(playerCount) || !Number.isInteger(position) || playerCount < 1 || position < 1 || position > playerCount) {
    throw new RangeError('Invalid player count or position');
  }
  const base = playerCount - position + 1;
  if (position === 1) return base * 2;
  if (position === 2) return Math.ceil(base * 1.5);
  if (position === 3) return Math.ceil(base * 1.2);
  return base;
}

export interface ScoreEntry<TStats extends object> {
  playerId: string;
  points: number;
  stats: TStats;
}

export interface RankedEntry<T> {
  entry: T;
  position: number;
}

/**
 * Competition ranking (1, 2, 2, 4) with a game-owned ordering and tie strategy.
 * A new game supplies only its comparison rules; position and tie bookkeeping live here.
 */
export function rankCompetition<T, TTie>(
  entries: readonly T[],
  compare: (left: T, right: T) => number,
  tieKey: (entry: T) => TTie,
): RankedEntry<T>[] {
  const ordered = [...entries].sort(compare);
  let previousKey: TTie | undefined;
  let position = 0;
  return ordered.map((entry, index) => {
    const key = tieKey(entry);
    if (index === 0 || !Object.is(key, previousKey)) position = index + 1;
    previousKey = key;
    return { entry, position };
  });
}

interface RankedResultsOptions<TStats extends object, TTie> {
  compare: (left: ScoreEntry<TStats>, right: ScoreEntry<TStats>) => number;
  tieKey: (entry: ScoreEntry<TStats>) => TTie;
  mapStats?: (entry: ScoreEntry<TStats>) => Record<string, number>;
}

/** Builds the common standings projection while leaving ordering and stats game-specific. */
export function buildRankedResults<TStats extends object, TTie>(
  entries: readonly ScoreEntry<TStats>[],
  options: RankedResultsOptions<TStats, TTie>,
): GameResults {
  const standings: GameStanding[] = rankCompetition(entries, options.compare, options.tieKey)
    .map(({ entry, position }) => ({
      playerId: entry.playerId,
      position,
      points: entry.points,
      won: position === 1,
      stats: options.mapStats ? options.mapStats(entry) : { ...entry.stats } as Record<string, number>,
    }));
  const leaders = standings.filter((standing) => standing.position === 1);
  return { winnerId: leaders.length === 1 ? leaders[0]!.playerId : null, standings };
}

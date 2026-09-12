export interface GuessSolveStats {
  correct: number;
  totalAttempts: number;
  firstTry: number;
  roundFirsts: number;
  solveTimeTotalMs: number;
  bestTimeMs: number;
  pointsFromRounds: number;
}

/** Shared accounting; accepted answers and scoring policy remain game-owned. */
export function recordGuessSolve<T extends GuessSolveStats>(stats: T, attemptCount: number, solveOrder: number, elapsedMs: number, points: number): T {
  return {
    ...stats, correct: stats.correct + 1, totalAttempts: stats.totalAttempts + 1,
    firstTry: stats.firstTry + Number(attemptCount === 1), roundFirsts: stats.roundFirsts + Number(solveOrder === 1),
    solveTimeTotalMs: stats.solveTimeTotalMs + elapsedMs,
    bestTimeMs: stats.bestTimeMs <= 0 ? elapsedMs : Math.min(stats.bestTimeMs, elapsedMs),
    pointsFromRounds: stats.pointsFromRounds + points,
  };
}

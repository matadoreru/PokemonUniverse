export const LEARNSET_INITIAL_POINTS = 5;
export const LEARNSET_MIN_POINTS = 1;
/** Extra for the first and second correct guessers (solveOrder 1 and 2), assigned in server processing order. */
export const LEARNSET_ORDER_BONUSES = [2, 1] as const;

export function learnsetPoints(revealStage: number, solveOrder: number): number {
  const bonus: number = LEARNSET_ORDER_BONUSES[solveOrder - 1] ?? 0;
  return Math.max(LEARNSET_MIN_POINTS, LEARNSET_INITIAL_POINTS - revealStage) + bonus;
}

/** `MANUAL_REVEAL`: acertar con `visibleGroups` grupos a la vista vale `max(1, totalGroups − visibleGroups + 1) × 10`. */
export function learnsetManualRevealPoints(totalGroups: number, visibleGroups: number): number {
  return Math.max(1, totalGroups - visibleGroups + 1) * 10;
}

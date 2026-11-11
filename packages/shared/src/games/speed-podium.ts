/**
 * Copia de presentación de `SpeedPodiumScore` (Java), con la que puntúan ¿Quién es ese Pokémon?, Adivina el Grito y
 * Adivina por la Paleta: de 10 a 1 puntos por rapidez, 3, 2 y 1 extra para los tres primeros y, con rachas, lo que suma
 * cada acierto seguido. `presentation-rules.test.ts` la compara con `web-contracts/presentation-rules.json`.
 */
export const SPEED_PODIUM_MAX_POINTS = 10;
export const SPEED_PODIUM_MIN_POINTS = 1;
export const SPEED_PODIUM_BONUSES = [3, 2, 1] as const;
export const SPEED_PODIUM_MAX_STREAK_BONUS = 3;

/** Lo que suma la racha en un acierto que deja `consecutiveSolves` rondas seguidas acertadas (esta incluida). */
export function speedPodiumStreakBonus(consecutiveSolves: number): number {
  return Math.max(0, Math.min(SPEED_PODIUM_MAX_STREAK_BONUS, consecutiveSolves - 1));
}

/** «3, 2 y 1» a partir de `SPEED_PODIUM_BONUSES`. */
function bonusList(): string {
  const values = SPEED_PODIUM_BONUSES.map(String);
  return `${values.slice(0, -1).join(', ')} y ${values.at(-1) ?? ''}`;
}

/** Ayuda de puntos de la ronda: rapidez y podio y, con rachas, su extra. */
export function speedPodiumScoringText(streakBonus = false): string {
  const base = `Cuanto antes aciertes, más puntos; los ${SPEED_PODIUM_BONUSES.length} primeros suman ${bonusList()} extra.`;
  return streakBonus ? `${base} Racha: +1 por acierto seguido, hasta +${SPEED_PODIUM_MAX_STREAK_BONUS}.` : base;
}

/** Ayuda corta (la revelación de ¿Quién es ese Pokémon?): «1–10 pts por rapidez · bonus de orden +3 / +2 / +1». */
export function speedPodiumScoringLabel(streakBonus = false): string {
  const base = `${SPEED_PODIUM_MIN_POINTS}–${SPEED_PODIUM_MAX_POINTS} pts por rapidez · bonus de orden ${SPEED_PODIUM_BONUSES.map((bonus) => `+${bonus}`).join(' / ')}`;
  return streakBonus ? `${base} · racha hasta +${SPEED_PODIUM_MAX_STREAK_BONUS}` : base;
}

import type { HigherLowerAnswerVisibility, HigherLowerCategory, HigherLowerChoice, HigherLowerOutcome } from '@pokemon-universe/shared/public';

// Etiquetas en español de las tres respuestas de Higher or Lower (botones, revelado y barra lateral).
export const higherLowerChoiceLabels: Record<HigherLowerChoice, string> = { HIGHER: 'Mayor', SAME: 'Igual', LOWER: 'Menor' };

// Nombre de cada stat en la pantalla de juego.
export const higherLowerCategoryLabels: Record<HigherLowerCategory, string> = { DEX_NUMBER: 'N.º Pokédex', HP: 'HP', ATTACK: 'Ataque', DEFENSE: 'Defensa', SPECIAL_ATTACK: 'Ataque Especial', SPECIAL_DEFENSE: 'Defensa Especial', SPEED: 'Velocidad', BASE_STAT_TOTAL: 'Total de stats' };

// Modos de visibilidad de las respuestas del panel de configuración.
export const higherLowerVisibilityLabels: Record<HigherLowerAnswerVisibility, string> = { LIVE: 'En directo', REVEAL: 'Al revelar' };

/** Línea del acierto en el revelado: «Racha 3 (+1) · +1 rapidez» (el bonus de racha va entre paréntesis). */
export function higherLowerOutcomeLine(outcome: HigherLowerOutcome): string {
  const streak = `Racha ${outcome.streak}${outcome.streakBonus ? ` (+${outcome.streakBonus})` : ''}`;
  return outcome.speedBonus ? `${streak} · +${outcome.speedBonus} rapidez` : streak;
}

/** Resultado de un jugador en texto (junto al ✓/✗ y el color): «acierto», «Fallo» o «Sin respuesta». */
export function higherLowerOutcomeStatus(outcome: HigherLowerOutcome | undefined): 'acierto' | 'Fallo' | 'Sin respuesta' {
  if (outcome?.correct) return 'acierto';
  return outcome?.choice ? 'Fallo' : 'Sin respuesta';
}

const STREAK_MILESTONES: readonly number[] = [3, 5, 10];

/**
 * Hito de racha propio (3, 5 o 10 aciertos seguidos) para el cut-in, o `null` si no toca. `spoken` es lo que dice la
 * región viva de la pantalla (el cut-in no es región propia).
 */
export function higherLowerStreakMilestone(outcome: HigherLowerOutcome): { title: string; subtitle: string; spoken: string } | null {
  if (!outcome.correct || !STREAK_MILESTONES.includes(outcome.streak)) return null;
  return {
    title: `¡Racha ×${outcome.streak}!`,
    subtitle: outcome.streakBonus ? `+${outcome.streakBonus}` : '¡Sigue así!',
    spoken: `Hito: ${outcome.streak} aciertos seguidos${outcome.streakBonus ? `, +${outcome.streakBonus} de bonus de racha` : ''}.`,
  };
}

export interface HigherLowerBarsView { previousScale: number; currentScale: number; leader: 'previous' | 'current' | 'tie'; diffLabel: string }

/** Escalas (0–1 sobre el mayor de los dos; 0 y 0 si el mayor es 0), quién va por delante y la diferencia del actual. */
export function higherLowerBars(previous: number, current: number): HigherLowerBarsView {
  const max = Math.max(previous, current);
  const scale = (value: number) => max > 0 ? value / max : 0;
  const diff = current - previous;
  return {
    previousScale: scale(previous),
    currentScale: scale(current),
    leader: diff > 0 ? 'current' : diff < 0 ? 'previous' : 'tie',
    diffLabel: diff > 0 ? `+${diff}` : diff < 0 ? `\u2212${-diff}` : '=',
  };
}

const plural = (count: number, singular: string, pluralForm: string) => `${count} ${count === 1 ? singular : pluralForm}`;

/** Línea de estadísticas de la clasificación final, con singular y plural. */
export function higherLowerStatsLine(stats: Readonly<Record<string, number | undefined>>): string {
  const { correct = 0, sameCorrect = 0, bestStreak = 0, accuracy = 0 } = stats;
  return `${plural(correct, 'acierto', 'aciertos')} · ${plural(sameCorrect, 'igual', 'iguales')} · mejor racha ${bestStreak} · ${accuracy}%`;
}

/** Estadísticas de Racha infinita: en qué ronda cayó (racha + 1) o, si llegó al tope, que sigue en pie. */
export function higherLowerEndlessStatsLine(stats: Readonly<Record<string, number | undefined>>): string {
  const { correct = 0, incorrect = 0 } = stats;
  return incorrect > 0 ? `Cayó en la ronda ${correct + 1}` : 'Sigue en pie';
}

/**
 * El revelado es el último: tras la última ronda (`roundNumber >= rounds`, como el motor) o, en Racha infinita (`alive`
 * presente), cuando ya no queda nadie en pie.
 */
export function higherLowerLastReveal(game: { roundNumber: number; totalRounds: number; alive?: string[] | undefined }): boolean {
  return game.roundNumber >= game.totalRounds || game.alive?.length === 0;
}

/** Cuenta atrás del revelado: tras el último (ver `higherLowerLastReveal`) llega la clasificación. */
export function higherLowerRevealCountdown(game: { roundNumber: number; totalRounds: number; alive?: string[] | undefined }, remainingSeconds: number): string {
  const seconds = Math.max(1, remainingSeconds);
  return higherLowerLastReveal(game) ? `Clasificación en ${seconds}s…` : `Siguiente ronda en ${seconds}s…`;
}

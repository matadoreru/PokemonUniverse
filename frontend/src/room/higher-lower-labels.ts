import type { HigherLowerAnswerVisibility, HigherLowerChoice, HigherLowerOutcome } from '@pokemon-universe/shared/public';

// Etiquetas en español de las tres respuestas de Higher or Lower (botones, revelado y barra lateral).
export const higherLowerChoiceLabels: Record<HigherLowerChoice, string> = { HIGHER: 'Mayor', SAME: 'Igual', LOWER: 'Menor' };

// Modos de visibilidad de las respuestas del panel de configuración.
export const higherLowerVisibilityLabels: Record<HigherLowerAnswerVisibility, string> = { LIVE: 'En directo', REVEAL: 'Al revelar' };

/** Desglose de los bonus de un acierto («+1 racha · +1 rapidez»), o `null` si no hay ninguno. */
export function higherLowerOutcomeDetail(outcome: HigherLowerOutcome): string | null {
  const parts = [outcome.streakBonus ? `+${outcome.streakBonus} racha` : null, outcome.speedBonus ? `+${outcome.speedBonus} rapidez` : null].filter((part) => part !== null);
  return parts.length ? parts.join(' · ') : null;
}

const plural = (count: number, singular: string, pluralForm: string) => `${count} ${count === 1 ? singular : pluralForm}`;

/** Línea de estadísticas de la clasificación final, con singular y plural. */
export function higherLowerStatsLine(stats: Readonly<Record<string, number | undefined>>): string {
  const { correct = 0, sameCorrect = 0, bestStreak = 0, accuracy = 0 } = stats;
  return `${plural(correct, 'acierto', 'aciertos')} · ${plural(sameCorrect, 'igual', 'iguales')} · mejor racha ${bestStreak} · ${accuracy}%`;
}

/** Cuenta atrás del revelado: tras la última ronda (`roundNumber >= rounds`, como el motor) llega la clasificación. */
export function higherLowerRevealCountdown(game: { roundNumber: number; totalRounds: number }, remainingSeconds: number): string {
  const seconds = Math.max(1, remainingSeconds);
  return game.roundNumber >= game.totalRounds ? `Clasificación en ${seconds}s…` : `Siguiente ronda en ${seconds}s…`;
}

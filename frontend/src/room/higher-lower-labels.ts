import type { HigherLowerChoice } from '@pokemon-universe/shared/public';

// Etiquetas en español de las tres respuestas de Higher or Lower (botones, revelado y barra lateral).
export const higherLowerChoiceLabels: Record<HigherLowerChoice, string> = { HIGHER: 'Mayor', SAME: 'Igual', LOWER: 'Menor' };

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

import type { TcgHigherLowerAnswer, TcgHigherLowerChoice, TcgHigherLowerOutcome, TcgHigherLowerPublicState } from '@pokemon-universe/shared/public';

/** Orden de las tres respuestas: el de las píldoras y el de los atajos 1, 2 y 3 (como Higher or Lower). */
export const TCG_CHOICE_ORDER: readonly TcgHigherLowerChoice[] = ['HIGHER', 'SAME', 'LOWER'];

/** Etiquetas de las respuestas: el precio de la nueva carta es «más», «igual» o «menos» que el de la anterior. */
export const tcgChoiceLabels: Record<TcgHigherLowerChoice, string> = { HIGHER: 'Más', SAME: 'Igual', LOWER: 'Menos' };

/** Respuesta de un atajo de teclado («1», «2» o «3»), o `null`. */
export function tcgChoiceFromShortcut(key: string): TcgHigherLowerChoice | null {
  const index = ['1', '2', '3'].indexOf(key);
  return index >= 0 ? TCG_CHOICE_ORDER[index]! : null;
}

/** Precio con su moneda, en español: «4,25 €». */
export function formatTcgPrice(amount: string, currency: string): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount));
}

/** Símbolo de la moneda («€»): acompaña al «¿?» del precio oculto. */
export function tcgCurrencySymbol(currency: string): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).formatToParts(0).find((part) => part.type === 'currency')?.value ?? currency;
}

/** Diferencia de la nueva carta respecto a la anterior, con signo: «+8,25 €», «−1,10 €» o «Mismo precio». */
export function tcgPriceDiff(previous: string, current: string, currency: string): string {
  const diff = Math.round((Number(current) - Number(previous)) * 100) / 100;
  if (diff === 0) return 'Mismo precio';
  const amount = formatTcgPrice(String(Math.abs(diff)), currency);
  return diff > 0 ? `+${amount}` : `−${amount}`;
}

/**
 * Estado de un jugador en el marcador. TCG nunca proyecta qué ha respondido cada uno durante la ronda (solo
 * `answeredIds`): el qué solo sale al revelar, en `lastRound.outcomes`.
 */
export type TcgMemberStatus = { kind: 'outcome'; outcome: TcgHigherLowerOutcome | undefined } | { kind: 'answered' } | { kind: 'pending' };

export function tcgMemberStatus(answeredIds: readonly string[], lastRound: TcgHigherLowerPublicState['lastRound'], id: string): TcgMemberStatus {
  if (lastRound) return { kind: 'outcome', outcome: lastRound.outcomes[id] };
  return answeredIds.includes(id) ? { kind: 'answered' } : { kind: 'pending' };
}

/** Resultado de un jugador en texto: «acierto», «Fallo» o «Sin respuesta». */
export function tcgOutcomeStatus(outcome: TcgHigherLowerOutcome | undefined): 'acierto' | 'Fallo' | 'Sin respuesta' {
  if (outcome?.correct) return 'acierto';
  return outcome?.choice ? 'Fallo' : 'Sin respuesta';
}

/** Pantalla inferior: qué placa toca. */
export type TcgPlateKind = 'answer' | 'locked' | 'watching' | 'reveal' | 'waiting';

export function tcgPlateKind({ phase, canAnswer, answer, revealed }: { phase: TcgHigherLowerPublicState['phase']; canAnswer: boolean; answer: TcgHigherLowerAnswer | null; revealed: boolean }): TcgPlateKind {
  if (phase === 'ROUND_RESULTS' && revealed) return 'reveal';
  if (phase !== 'ROUND_ACTIVE') return 'waiting';
  if (answer) return 'locked';
  return canAnswer ? 'answer' : 'watching';
}

/** Veredicto propio del revelado, en texto. */
export function tcgVerdict(outcome: TcgHigherLowerOutcome | null, participant: boolean): string {
  if (!participant) return 'Estás observando';
  const status = tcgOutcomeStatus(outcome ?? undefined);
  if (status === 'acierto') return '¡Acierto!';
  return status === 'Fallo' ? `Fallo: elegiste ${tcgChoiceLabels[outcome!.choice!]}` : 'Sin respuesta';
}

/**
 * Aviso de la región viva de la pantalla (siempre montada). Dice lo mismo que la placa con otras palabras, para que las
 * E2E localicen los textos visibles sin chocar con él.
 */
export function tcgAnnouncement({ kind, roundNumber, answer, correctAnswer, outcome, participant, prices }: {
  kind: TcgPlateKind;
  roundNumber: number;
  answer: TcgHigherLowerAnswer | null;
  correctAnswer: TcgHigherLowerChoice | null;
  outcome: TcgHigherLowerOutcome | null;
  participant: boolean;
  /** Al revelar: los dos precios ya formateados. */
  prices?: { previous: string; current: string } | null;
}): string {
  switch (kind) {
    case 'reveal': {
      const verdict = !participant ? '' : outcome?.correct ? `Has acertado: +${outcome.awardedPoints} ${outcome.awardedPoints === 1 ? 'punto' : 'puntos'}.` : outcome?.choice ? 'Has fallado: +0 puntos.' : 'No respondiste: +0 puntos.';
      const detail = prices ? ` La anterior valía ${prices.previous} y la nueva, ${prices.current}.` : '';
      return `Precio revelado.${detail} La correcta era ${correctAnswer ? tcgChoiceLabels[correctAnswer] : '—'}. ${verdict}`.trim();
    }
    case 'locked': return `Has elegido ${tcgChoiceLabels[answer!.choice]}. Esperando al resto de entrenadores.`;
    case 'answer': return `Ronda ${roundNumber}: ¿la nueva carta vale más, igual o menos?`;
    case 'watching': return `Ronda ${roundNumber}: estás observando.`;
    default: return 'Preparando la ronda.';
  }
}

/** Clave del foco (ver `useFocusOnTransition`): al bloquear la respuesta y al revelar, el título de la placa. */
export function tcgFocusKey(kind: TcgPlateKind, roundNumber: number): string | null {
  if (kind === 'locked') return `locked-${roundNumber}`;
  return kind === 'reveal' ? `reveal-${roundNumber}` : null;
}

const plural = (count: number, singular: string, pluralForm: string) => `${count} ${count === 1 ? singular : pluralForm}`;

/** Línea de estadísticas de la clasificación final: «3 aciertos de 5 · 1 igual · mejor racha 2 · 60%». */
export function tcgStatsLine(stats: Readonly<Record<string, number | undefined>>): string {
  const { correct = 0, comparisons = 0, sameCorrect = 0, bestStreak = 0, accuracy = 0 } = stats;
  return `${plural(correct, 'acierto', 'aciertos')} de ${comparisons} · ${plural(sameCorrect, 'igual', 'iguales')} · mejor racha ${bestStreak} · ${accuracy}%`;
}

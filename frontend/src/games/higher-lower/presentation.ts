import type { HigherLowerAnswer, HigherLowerChoice, HigherLowerOutcome, HigherLowerPublicState } from '@pokemon-universe/shared/public';
import { higherLowerChoiceLabels, higherLowerOutcomeStatus } from '../../room/higher-lower-labels';

/** Orden de las tres respuestas: el de los botones y el de los atajos 1, 2 y 3. */
export const HIGHER_LOWER_CHOICE_ORDER: readonly HigherLowerChoice[] = ['HIGHER', 'SAME', 'LOWER'];

/** Respuesta de un atajo de teclado («1», «2» o «3»), o `null`. */
export function higherLowerChoiceFromShortcut(key: string): HigherLowerChoice | null {
  const index = ['1', '2', '3'].indexOf(key);
  return index >= 0 ? HIGHER_LOWER_CHOICE_ORDER[index]! : null;
}

/** Marcador ordenado por puntos (empates por nombre) con la posición compartida en los empates. */
export function higherLowerRanking(game: Pick<HigherLowerPublicState, 'playerIds' | 'scores'>, nameOf: (id: string) => string): { id: string; position: number }[] {
  const score = (id: string) => game.scores[id] ?? 0;
  const ranking = [...game.playerIds].sort((left, right) => score(right) - score(left) || nameOf(left).localeCompare(nameOf(right)));
  return ranking.map((id) => ({ id, position: ranking.findIndex((other) => score(other) === score(id)) + 1 }));
}

/**
 * Estado de un jugador en el marcador. Solo usa lo proyectado: con «Al revelar» el servidor manda `answers` vacío hasta
 * el revelado y solo se sabe quién ha respondido (`answeredIds`), nunca qué.
 */
export type HigherLowerMemberStatus =
  | { kind: 'outcome'; outcome: HigherLowerOutcome | undefined }
  | { kind: 'choice'; choice: HigherLowerChoice }
  | { kind: 'answered' }
  | { kind: 'pending' };

export function higherLowerMemberStatus(game: Pick<HigherLowerPublicState, 'phase' | 'answers' | 'answeredIds' | 'lastRound'>, id: string): HigherLowerMemberStatus {
  if (game.phase === 'ROUND_RESULTS' && game.lastRound) return { kind: 'outcome', outcome: game.lastRound.outcomes[id] };
  const answer = game.answers[id];
  if (answer) return { kind: 'choice', choice: answer.choice };
  return game.answeredIds.includes(id) ? { kind: 'answered' } : { kind: 'pending' };
}

/** Pantalla inferior: qué placa toca. */
export type HigherLowerPlateKind = 'answer' | 'locked' | 'watching' | 'reveal' | 'waiting';

export function higherLowerPlateKind({ phase, canAnswer, answer, revealed }: { phase: HigherLowerPublicState['phase']; canAnswer: boolean; answer: HigherLowerAnswer | null; revealed: boolean }): HigherLowerPlateKind {
  if (phase === 'ROUND_RESULTS' && revealed) return 'reveal';
  if (phase !== 'ROUND_ACTIVE') return 'waiting';
  if (answer) return 'locked';
  return canAnswer ? 'answer' : 'watching';
}

/** Veredicto propio del revelado, en texto. */
export function higherLowerVerdict(outcome: HigherLowerOutcome | null, participant: boolean): string {
  if (!participant) return 'Estás observando';
  const status = higherLowerOutcomeStatus(outcome ?? undefined);
  if (status === 'acierto') return '¡Acierto!';
  return status === 'Fallo' ? `Fallo: elegiste ${higherLowerChoiceLabels[outcome!.choice!]}` : 'Sin respuesta';
}

/**
 * Aviso de la región `status` (siempre montada). No repite los textos visibles que localizan las E2E («Respuesta: …»,
 * «Respuesta … bloqueada.», «Clasificación en …»): dice lo mismo con otras palabras.
 */
export function higherLowerAnnouncement({ kind, roundNumber, category, answer, correctAnswer, outcome, participant }: {
  kind: HigherLowerPlateKind;
  roundNumber: number;
  category: string;
  answer: HigherLowerAnswer | null;
  correctAnswer: HigherLowerChoice | null;
  outcome: HigherLowerOutcome | null;
  participant: boolean;
}): string {
  switch (kind) {
    case 'reveal': {
      const verdict = !participant ? '' : outcome?.correct ? `Has acertado: +${outcome.awardedPoints} puntos.` : outcome?.choice ? 'Has fallado: +0 puntos.' : 'No respondiste: +0 puntos.';
      return `Valor revelado. La correcta era ${correctAnswer ? higherLowerChoiceLabels[correctAnswer] : '—'}. ${verdict}`.trim();
    }
    case 'locked': return `Has elegido ${higherLowerChoiceLabels[answer!.choice]}. Esperando al resto de entrenadores.`;
    case 'answer': return `Ronda ${roundNumber}, ${category}: elige mayor, igual o menor.`;
    case 'watching': return `Ronda ${roundNumber}: estás observando.`;
    default: return 'Preparando la ronda.';
  }
}

/** Clave del foco (ver `useFocusOnTransition`): al bloquear la respuesta y al revelar, el título de la placa. */
export function higherLowerFocusKey(kind: HigherLowerPlateKind, roundNumber: number): string | null {
  if (kind === 'locked') return `locked-${roundNumber}`;
  return kind === 'reveal' ? `reveal-${roundNumber}` : null;
}

/** Récord de la partida para los resultados: el mejor valor y quién lo tiene (empates juntos); `null` si nadie puntúa. */
export interface HigherLowerRecord { value: number; names: string[] }

export function higherLowerRecord(entries: readonly { name: string; stats: Readonly<Record<string, number | undefined>> }[], key: string): HigherLowerRecord | null {
  const best = Math.max(0, ...entries.map((entry) => entry.stats[key] ?? 0));
  if (best <= 0) return null;
  return { value: best, names: entries.filter((entry) => (entry.stats[key] ?? 0) === best).map((entry) => entry.name) };
}

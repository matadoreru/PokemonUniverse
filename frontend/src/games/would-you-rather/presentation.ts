import { WOULD_YOU_RATHER_MAJORITY_POINTS, WOULD_YOU_RATHER_PREDICTION_POINTS, type GamePhase, type WouldYouRatherOption, type WouldYouRatherRoundResult } from '@pokemon-universe/shared/public';
import { type PhaseStep, type RunoffRoundLike } from '../../room/social-kit';
import { joinNames } from '../../lib/format';

/**
 * Textos de la pantalla de Would You Rather: fases, título, la vuelta sintética del recuento (cada papeleta es un voto a
 * su preferencia), el resumen, la región viva, el estado de cada jugador en la revelación y el veredicto propio.
 */

export const WYR_OPTIONS = ['A', 'B'] as const satisfies readonly WouldYouRatherOption[];

/** Fases de la ronda: la papeleta (elegir y predecir) y el resultado. */
export const wouldYouRatherSteps: PhaseStep[] = [
  { key: 'ballot', label: 'Elegir y predecir' },
  { key: 'result', label: 'Resultado' },
];

export function wouldYouRatherCurrentStep(phase: GamePhase): string | null {
  if (phase === 'ROUND_ACTIVE') return 'ballot';
  if (phase === 'ROUND_RESULTS') return 'result';
  return null;
}

/** Título (`h1`) de la fase; en la revelación, la mayoría (como la pantalla anterior). */
export function wouldYouRatherHeading(phase: GamePhase, result: WouldYouRatherRoundResult | null): string {
  if (phase === 'ROUND_ACTIVE') return '¿Qué preferirías?';
  if (phase === 'ROUND_RESULTS' && result) return result.majority ? `La mayoría eligió ${result.majority}` : 'La sala quedó dividida';
  return 'Preparando el resultado…';
}

/** La revelación como una vuelta de votación (preferencia de cada papeleta), para `VoteTally`. */
export function wouldYouRatherRound(result: WouldYouRatherRoundResult): RunoffRoundLike[] {
  return [{ number: 1, candidateIds: [...WYR_OPTIONS], votes: Object.fromEntries(result.players.map((entry) => [entry.playerId, entry.preference])) }];
}

/** Resumen en una frase del recuento (también para la región viva). */
export function wouldYouRatherSummary(result: WouldYouRatherRoundResult): string {
  const total = result.totals.A + result.totals.B;
  if (total === 0) return 'Nadie envió su papeleta a tiempo: no hay mayoría.';
  if (!result.majority) return `Empate a ${result.totals.A}: la sala quedó dividida y no se reparten puntos.`;
  return `La mayoría eligió ${result.majority} con ${result.totals[result.majority]} de ${total} ${total === 1 ? 'papeleta' : 'papeletas'}.`;
}

/** Texto de la única región viva: papeleta bloqueada y el resumen de la revelación. */
export function wouldYouRatherAnnouncement({ phase, roundNumber, locked, result }: { phase: GamePhase; roundNumber: number; locked: boolean; result: WouldYouRatherRoundResult | null }): string {
  if (phase === 'ROUND_ACTIVE') return locked ? 'Papeleta bloqueada. Solo tú puedes verla hasta el resultado.' : '';
  if (phase === 'ROUND_RESULTS' && result) return `Ronda ${roundNumber} terminada. ${wouldYouRatherSummary(result)}`;
  return '';
}

/** Estado de un jugador en la revelación: qué eligió y qué predijo, o «Sin papeleta». */
export function wouldYouRatherPlayerLine(result: WouldYouRatherRoundResult, playerId: string): { tone: 'ok' | 'bad' | 'neutral'; text: string } {
  const entry = result.players.find((player) => player.playerId === playerId);
  if (!entry) return { tone: 'bad', text: 'Sin papeleta' };
  return { tone: entry.totalPoints >= 3 ? 'ok' : 'neutral', text: `Eligió ${entry.preference} · Predijo ${entry.prediction}` };
}

/** Veredicto propio de la revelación (kicker de la placa), sus puntos y de dónde salen. */
export function wouldYouRatherVerdict(result: WouldYouRatherRoundResult, selfId: string, participating: boolean): { tone: 'ok' | 'bad' | 'info'; text: string; points: number; detail: string } {
  const rule = result.majority ? `${WOULD_YOU_RATHER_MAJORITY_POINTS} ${WOULD_YOU_RATHER_MAJORITY_POINTS === 1 ? 'punto' : 'puntos'} por estar en la mayoría y ${WOULD_YOU_RATHER_PREDICTION_POINTS} por haberla predicho.` : 'En empate no se reparten puntos de elección ni de predicción.';
  if (!participating) return { tone: 'info', text: 'Estás observando', points: 0, detail: rule };
  const own = result.players.find((entry) => entry.playerId === selfId);
  if (!own) return { tone: 'bad', text: 'No enviaste papeleta', points: 0, detail: rule };
  const parts = [own.majorityPoint ? 'en la mayoría' : null, own.predictionPoints ? 'predicción acertada' : null].filter((part): part is string => part !== null);
  if (own.totalPoints >= 3) return { tone: 'ok', text: '¡Ronda perfecta!', points: own.totalPoints, detail: rule };
  if (own.totalPoints > 0) return { tone: 'ok', text: `Sumas por ${joinNames(parts)}`, points: own.totalPoints, detail: rule };
  return { tone: 'info', text: result.majority ? 'Esta vez no sumas' : 'Empate: nadie suma', points: 0, detail: rule };
}

/**
 * Envío de la papeleta, sin React (para probarlo): marca la ronda como «enviando» y, si el servidor la rechaza, la suelta
 * (solo si sigue siendo esa ronda). Con éxito queda «enviando» a propósito hasta que vuelve `ownBallot` y la placa pasa a
 * «Papeleta bloqueada»: así no hay doble envío. Si el servidor aceptase sin devolverla, se libera en la ronda siguiente.
 */
export async function submitBallot(round: number, submit: () => Promise<void>, setBusyRound: (update: (current: number | null) => number | null) => void): Promise<void> {
  setBusyRound(() => round);
  try {
    await submit();
  } catch {
    // El fallo ya sale en el aviso global de la sala (un dueño por error): aquí solo se suelta el botón.
    setBusyRound((current) => (current === round ? null : current));
  }
}

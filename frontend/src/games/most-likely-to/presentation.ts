import type { GamePhase, MostLikelyToRoundResult } from '@pokemon-universe/shared/public';
import { namesList, tallyOutcome, tallySummary, votesText, type PhaseStep } from '../../room/social-kit';

/**
 * Textos de la pantalla de Most Likely To: fases, título de cada una, región viva y veredicto propio de la revelación.
 */

/** Fases de la ronda: elegir, votar (o la segunda vuelta) y el resultado. */
export function mostLikelySteps(phase: GamePhase): PhaseStep[] {
  return [
    { key: 'choose', label: 'Elegir' },
    { key: 'vote', label: phase === 'REVOTE' ? 'Segunda vuelta' : 'Votar' },
    { key: 'result', label: 'Resultado' },
  ];
}

export function mostLikelyCurrentStep(phase: GamePhase): string | null {
  if (phase === 'ROUND_ACTIVE') return 'choose';
  if (phase === 'VOTING' || phase === 'REVOTE') return 'vote';
  if (phase === 'ROUND_RESULTS') return 'result';
  return null;
}

/** Título (`h1`) de la fase; en la revelación, cómo acabó la votación. */
export function mostLikelyHeading(phase: GamePhase, result: MostLikelyToRoundResult | null): string {
  if (phase === 'ROUND_ACTIVE') return 'Elige tu respuesta';
  if (phase === 'VOTING') return 'Votación';
  if (phase === 'REVOTE') return 'Segunda vuelta';
  if (phase === 'ROUND_RESULTS' && result) {
    const outcome = tallyOutcome(result.winnerIds, result.voteRounds);
    if (outcome === 'none') return 'Sin respuesta ganadora';
    if (outcome === 'solo' || outcome === 'unopposed' || result.winnerIds.length === 1) return 'La respuesta favorita';
    return 'Victoria compartida';
  }
  return 'Preparando el resultado…';
}

/**
 * Texto de la única región viva: lo que cambia para quien juega, dicho una vez (respuesta guardada, votación abierta,
 * segunda vuelta con quién empató, voto bloqueado y el resumen de la revelación).
 */
export function mostLikelyAnnouncement({ phase, roundNumber, ownChoice, locked, tiedNames, result, nameOf }: {
  phase: GamePhase;
  roundNumber: number;
  ownChoice: string | null;
  locked: boolean;
  /** Autores empatados de la segunda vuelta (solo en `REVOTE`). */
  tiedNames: readonly string[];
  result: MostLikelyToRoundResult | null;
  nameOf(playerId: string): string;
}): string {
  if (phase === 'ROUND_ACTIVE') return ownChoice ? `Respuesta guardada: ${ownChoice}.` : '';
  if (phase === 'VOTING') return locked ? 'Voto bloqueado. El resultado sale cuando vote todo el grupo.' : `Ronda ${roundNumber}: votación abierta.`;
  if (phase === 'REVOTE') return locked ? 'Voto bloqueado en la segunda vuelta.' : `Empate: segunda vuelta entre ${namesList(tiedNames)}.`;
  if (phase === 'ROUND_RESULTS' && result) return `Ronda ${roundNumber} terminada. ${tallySummary(result.winnerIds, result.voteRounds, nameOf, 'Nadie respondió a tiempo.')}`;
  return '';
}

/** Veredicto propio de la revelación (kicker de la placa) y los puntos ganados. */
export function mostLikelyVerdict(result: MostLikelyToRoundResult, selfId: string, participating: boolean): { tone: 'ok' | 'bad' | 'info'; text: string; points: number } {
  if (!participating) return { tone: 'info', text: 'Estás observando', points: 0 };
  const own = result.answers.find((answer) => answer.playerId === selfId);
  const points = result.pointsAwarded[selfId] ?? 0;
  if (!own) return { tone: 'bad', text: 'No enviaste respuesta', points };
  const last = result.voteRounds.at(-1);
  if (result.voteRounds.length > 1 && last && !last.candidateIds.includes(selfId)) return { tone: 'info', text: 'Tu respuesta no pasó a la segunda vuelta', points };
  if (own.won) return { tone: 'ok', text: result.winnerIds.length > 1 ? 'Tu respuesta comparte la victoria' : '¡Tu respuesta ganó!', points };
  return { tone: 'info', text: `Tu respuesta: ${votesText(own.votesReceived)}`, points };
}

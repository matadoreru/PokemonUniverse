import type { GamePhase, PokemonFlagMode, PokemonRedFlagRoundResult } from '@pokemon-universe/shared/public';
import { tallySummary, votesText, type PhaseStep } from '../../room/social-kit';

/**
 * Textos de la pantalla de Pokémon Red Flag / Green Flag: fases, título de cada una, consigna, región viva y veredicto
 * propio de la revelación. Es un juego anónimo: nada de aquí nombra a un autor antes de `ROUND_RESULTS`.
 */

/** «red flag» o «green flag» (en minúsculas, para las frases). */
export const flagLabel = (mode: PokemonFlagMode) => (mode === 'GREEN' ? 'green flag' : 'red flag');

/** Fases de la ronda: escribir, votar (o la segunda vuelta) y el resultado. */
export function redFlagSteps(phase: GamePhase): PhaseStep[] {
  return [
    { key: 'write', label: 'Escribir' },
    { key: 'vote', label: phase === 'REVOTE' ? 'Segunda vuelta' : 'Votar' },
    { key: 'result', label: 'Resultado' },
  ];
}

export function redFlagCurrentStep(phase: GamePhase): string | null {
  if (phase === 'ROUND_ACTIVE') return 'write';
  if (phase === 'VOTING' || phase === 'REVOTE') return 'vote';
  if (phase === 'ROUND_RESULTS') return 'result';
  return null;
}

/** Consigna de la ronda (la pregunta del panel de arriba), con el Pokémon. */
export function redFlagQuestion(mode: PokemonFlagMode, pokemonName: string): string {
  return mode === 'GREEN'
    ? `¿Qué detalle positivo de ${pokemonName} te conquistaría?`
    : `¿Qué detalle negativo de ${pokemonName} haría que salieras corriendo?`;
}

/** Título (`h1`) de la fase; en la revelación, cómo acabó la votación (como la pantalla anterior). */
export function redFlagHeading(phase: GamePhase, mode: PokemonFlagMode, result: PokemonRedFlagRoundResult | null): string {
  const label = flagLabel(result?.flagMode ?? mode);
  if (phase === 'ROUND_ACTIVE') return `Escribe su ${label}`;
  if (phase === 'VOTING') return 'Votación';
  if (phase === 'REVOTE') return 'Segunda vuelta';
  if (phase === 'ROUND_RESULTS' && result) {
    if (result.winningAnswerIds.length === 0) return `Sin ${label} ganadora`;
    return result.winningAnswerIds.length === 1 ? `La ${label} de la ronda` : 'Victoria compartida';
  }
  return 'Preparando el resultado…';
}

/**
 * Texto de la única región viva: respuesta bloqueada, votación abierta, segunda vuelta (cuántas empataron, sin autores),
 * voto bloqueado y el resumen de la revelación (ya con autores).
 */
export function redFlagAnnouncement({ phase, roundNumber, answerLocked, voteLocked, tiedCount, result, nameOf }: {
  phase: GamePhase;
  roundNumber: number;
  /** La respuesta propia ya está enviada (escritura). */
  answerLocked: boolean;
  /** El voto propio ya está confirmado (votación). */
  voteLocked: boolean;
  /** Respuestas empatadas de la segunda vuelta (solo en `REVOTE`). */
  tiedCount: number;
  result: PokemonRedFlagRoundResult | null;
  /** Nombre de cada respuesta en el resumen (su autor). */
  nameOf(answerId: string): string;
}): string {
  if (phase === 'ROUND_ACTIVE') return answerLocked ? 'Respuesta bloqueada. Solo tú puedes verla hasta la votación.' : '';
  if (phase === 'VOTING') return voteLocked ? 'Voto bloqueado. El resultado sale cuando vote todo el grupo.' : `Ronda ${roundNumber}: votación anónima abierta.`;
  if (phase === 'REVOTE') return voteLocked ? 'Voto bloqueado en la segunda vuelta.' : `Empate: segunda vuelta entre ${tiedCount} respuestas.`;
  if (phase === 'ROUND_RESULTS' && result) return `Ronda ${roundNumber} terminada. ${tallySummary(result.winningAnswerIds, result.voteRounds, nameOf, 'Nadie escribió una respuesta a tiempo.')}`;
  return '';
}

/** Veredicto propio de la revelación (kicker de la placa) y los puntos ganados. */
export function redFlagVerdict(result: PokemonRedFlagRoundResult, selfId: string, participating: boolean): { tone: 'ok' | 'bad' | 'info'; text: string; points: number } {
  if (!participating) return { tone: 'info', text: 'Estás observando', points: 0 };
  const own = result.answers.find((answer) => answer.authorId === selfId);
  const points = result.pointsAwarded[selfId] ?? 0;
  const label = flagLabel(result.flagMode);
  if (!own) return { tone: 'bad', text: 'No enviaste respuesta', points };
  const last = result.voteRounds.at(-1);
  if (result.voteRounds.length > 1 && last && !last.candidateIds.includes(own.id)) return { tone: 'info', text: 'Tu respuesta no pasó a la segunda vuelta', points };
  if (own.won) return { tone: 'ok', text: result.winningAnswerIds.length > 1 ? 'Tu respuesta comparte la victoria' : `¡Tu ${label} ganó!`, points };
  return { tone: 'info', text: `Tu respuesta: ${votesText(own.votesReceived)}`, points };
}


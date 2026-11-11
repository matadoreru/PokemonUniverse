import type { FakeRoundResult, GamePhase } from '@pokemon-universe/shared/public';
import { runoffCounts, runoffLeaders, tallyOutcome, votesText, type PhaseStep } from '../../room/social-kit';
import { joinNames } from '../../lib/format';

/**
 * Textos de la pantalla de One of Us Is Fake: fases, título de cada una, región viva, resumen del recuento y veredicto
 * propio de la revelación. Antes de `ROUND_RESULTS` nada de aquí nombra al fake ni su categoría.
 */

/** Etiquetas de las pestañas del recuento (la votación puede repetirse más de una vez). */
export const FAKE_ROUND_LABELS = ['Primera vuelta', 'Segunda vuelta', 'Tercera vuelta', 'Cuarta vuelta', 'Quinta vuelta'] as const;

/** Nombre de la vuelta N de la votación («Segunda vuelta», «Vuelta 7»). */
export const fakeVoteRoundLabel = (voteRound: number) => FAKE_ROUND_LABELS[voteRound - 1] ?? `Vuelta ${voteRound}`;

/**
 * Fases de la ronda, una por fase del motor: elegir, revelación de las elecciones, debate y voto (el motor vota durante
 * la discusión: no hay una fase de votación aparte), la segunda vuelta y el resultado. La segunda vuelta solo aparece si
 * la hay (en ella o en un resultado con varias vueltas): así nunca sale como hecha sin haberse jugado.
 */
export function fakeSteps(phase: GamePhase, voteRound: number, resultRounds: number): PhaseStep[] {
  const runoff = phase === 'REVOTE' || resultRounds > 1;
  const rounds = phase === 'REVOTE' ? voteRound : resultRounds;
  return [
    { key: 'choose', label: 'Elegir' },
    { key: 'reveal', label: 'Revelación' },
    { key: 'discuss', label: 'Debate y voto' },
    // «Desempate» (corto: con cinco pasos, «Segunda vuelta» no cabe a 1280); el título de la fase dice la vuelta.
    ...(runoff ? [{ key: 'revote', label: rounds > 2 ? `Desempate ${rounds - 1}` : 'Desempate' }] : []),
    { key: 'result', label: 'Resultado' },
  ];
}

export function fakeCurrentStep(phase: GamePhase): string | null {
  if (phase === 'ROUND_ACTIVE') return 'choose';
  if (phase === 'CHOICE_REVEAL') return 'reveal';
  if (phase === 'DISCUSSION') return 'discuss';
  if (phase === 'REVOTE') return 'revote';
  if (phase === 'ROUND_RESULTS') return 'result';
  return null;
}

/** Título (`h1`) de la fase; en la revelación, quién ganó la ronda. */
export function fakeHeading(phase: GamePhase, voteRound: number, result: FakeRoundResult | null): string {
  if (phase === 'ROUND_ACTIVE') return 'Elige tu Pokémon';
  if (phase === 'CHOICE_REVEAL') return 'Las elecciones';
  if (phase === 'DISCUSSION') return '¿Quién es el fake?';
  if (phase === 'REVOTE') return fakeVoteRoundLabel(voteRound);
  if (phase === 'ROUND_RESULTS' && result) return result.winner === 'NORMALS' ? 'Ganan los normales' : 'Gana el fake';
  return 'Preparando el resultado…';
}

/**
 * Resumen del recuento en una frase (también para la región viva): quién sale y cómo. Un empate en la última vuelta lo
 * decide el sorteo del motor y se dice así, nunca «Sale X con N votos». Después, si quien sale era el fake.
 */
export function fakeTallySummary(result: FakeRoundResult, nameOf: (playerId: string) => string): string {
  const rounds = result.voteRounds;
  const selected = nameOf(result.selectedPlayerId);
  const after = rounds.length === 2 ? ' tras la segunda vuelta' : rounds.length > 2 ? ` tras ${rounds.length} vueltas` : '';
  const inLast = rounds.length > 1 ? ` en la ${fakeVoteRoundLabel(rounds.length).toLowerCase()}` : '';
  const last = rounds.at(-1);
  const counts = last ? runoffCounts(last) : [];
  const top = Math.max(0, ...counts.map((count) => count.votes));
  const tied = joinNames(runoffLeaders(counts).map(nameOf));
  const outcome = tallyOutcome([result.selectedPlayerId], rounds);
  const how = !last
    ? `Sale ${selected} sin votación.`
    : outcome === 'noVotes'
      ? `Nadie votó${inLast}: el sorteo eligió a ${selected}.`
      : outcome === 'lot'
        ? `Empate a ${votesText(top)} entre ${tied}${after}: el sorteo eligió a ${selected}.`
        : `Sale ${selected} con ${votesText(top)}${after}.`;
  const fake = result.selectedPlayerId === result.fakePlayerId ? `${selected} era el fake.` : `${selected} no era el fake: el fake era ${nameOf(result.fakePlayerId)}.`;
  return `${how} ${fake}`;
}

/**
 * Texto de la única región viva: elección guardada, revelación, debate abierto, segunda vuelta (entre quiénes), voto
 * bloqueado y el resumen de la revelación.
 */
export function fakeAnnouncement({ phase, roundNumber, voteRound, ownChoice, locked, tiedNames, result, nameOf }: {
  phase: GamePhase;
  roundNumber: number;
  voteRound: number;
  ownChoice: string | null;
  locked: boolean;
  /** Empatados de la segunda vuelta (solo en `REVOTE`). */
  tiedNames: readonly string[];
  result: FakeRoundResult | null;
  nameOf(playerId: string): string;
}): string {
  if (phase === 'ROUND_ACTIVE') return ownChoice ? `Elección guardada: ${ownChoice}.` : '';
  if (phase === 'CHOICE_REVEAL') return `Ronda ${roundNumber}: se revelan las elecciones.`;
  if (phase === 'DISCUSSION') return locked ? 'Voto bloqueado. El resultado sale cuando vote todo el grupo.' : `Ronda ${roundNumber}: debate y votación abiertos.`;
  if (phase === 'REVOTE') return locked ? `Voto bloqueado en la ${fakeVoteRoundLabel(voteRound).toLowerCase()}.` : `Empate: ${fakeVoteRoundLabel(voteRound).toLowerCase()} entre ${joinNames(tiedNames)}.`;
  if (phase === 'ROUND_RESULTS' && result) return `Ronda ${roundNumber} terminada. ${fakeTallySummary(result, nameOf)} ${result.winner === 'NORMALS' ? 'Ganan los normales.' : 'Gana el fake.'}`;
  return '';
}

/** Veredicto propio de la revelación (kicker de la placa) y los puntos ganados. */
export function fakeVerdict(result: FakeRoundResult, selfId: string, participating: boolean): { tone: 'ok' | 'bad' | 'info'; text: string; points: number } {
  if (!participating || !result.players.some((entry) => entry.playerId === selfId)) return { tone: 'info', text: 'Estás observando', points: 0 };
  const points = result.pointsAwarded[selfId] ?? 0;
  const normals = result.winner === 'NORMALS';
  if (result.fakePlayerId === selfId) return normals ? { tone: 'bad', text: 'Eras el fake y te descubrieron', points } : { tone: 'ok', text: '¡Eras el fake y engañaste al grupo!', points };
  return normals ? { tone: 'ok', text: '¡El grupo descubrió al fake!', points } : { tone: 'bad', text: 'El fake engañó al grupo', points };
}

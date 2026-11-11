import type { ImpostorVoteResult, PokemonImpostorPlayerState, PokemonImpostorPublicState } from '@pokemon-universe/shared/public';
import { impostorCluePhaseTitle, impostorFellowsShort } from '../../room/pokemon-impostor-texts';

type NameOf = (id: string) => string;

type RoundLabelGame = Pick<PokemonImpostorPublicState, 'phase' | 'roundNumber'> & { mode?: PokemonImpostorPublicState['mode'] };

/**
 * Ronda para el jugador. En `ONE_WORD` cada vuelta de pistas es un `roundNumber` propio (las claves de `clues`), así que
 * la ronda visible es ⌈n/2⌉ y la vuelta es 1 o 2. Aparece «· Vuelta k» solo mientras se dan pistas; en la votación
 * (que cierra las dos vueltas) queda «Ronda c» a secas, porque no es una vuelta.
 */
export function impostorRoundLabel(game: RoundLabelGame): string {
  const round = Math.max(1, game.roundNumber);
  if (game.mode !== 'ONE_WORD') return `Ronda ${round}`;
  const label = `Ronda ${Math.ceil(round / 2)}`;
  return game.phase === 'CLUE_PHASE' || game.phase === 'ROLE_REVEAL' ? `${label} · Vuelta ${(round - 1) % 2 + 1}` : label;
}

/** Etiqueta corta de un grupo de pistas del tablero: «R2» en Clásico, «R1·V2» en `ONE_WORD`. */
export function impostorClueGroupLabel(mode: PokemonImpostorPublicState['mode'] | undefined, round: number): string {
  return mode === 'ONE_WORD' ? `R${Math.ceil(round / 2)}·V${(round - 1) % 2 + 1}` : `R${round}`;
}

/** Título de la fase (el `h1` de la placa de la ronda). */
export function impostorPhaseTitle(game: Pick<PokemonImpostorPublicState, 'phase' | 'currentCluePlayerId' | 'votingRound'>, nameOf: NameOf): string {
  switch (game.phase) {
    case 'ROLE_REVEAL':
      return 'Descubre tu rol';
    case 'CLUE_PHASE':
      return impostorCluePhaseTitle(game.currentCluePlayerId ? nameOf(game.currentCluePlayerId) : null);
    case 'VOTING':
      return game.votingRound > 1 ? 'Votación de desempate' : '¿Quién es el impostor?';
    case 'VOTE_RESULTS':
      return 'Resultado de la votación';
    default:
      return 'Jugador eliminado';
  }
}

/** Etiqueta del temporizador de la placa: el turno, la votación o lo que falta para la fase siguiente. */
export function impostorTimerLabel(phase: PokemonImpostorPublicState['phase']): string {
  if (phase === 'CLUE_PHASE') return 'Turno';
  if (phase === 'VOTING') return 'Votación';
  if (phase === 'ROLE_REVEAL') return 'Pistas en';
  return 'Sigue en';
}

/** Votación cerrada, en palabras distintas del titular visible (las E2E lo localizan por su texto: no se duplica). */
function voteClosedAnnouncement(result: ImpostorVoteResult, nameOf: NameOf): string {
  switch (result.kind) {
    case 'ELIMINATION':
      return `Votación cerrada: ${result.eliminatedId ? nameOf(result.eliminatedId) : 'un jugador'} es quien más votos tiene.`;
    case 'SKIPPED':
      return 'Votación cerrada: esta vez no sale nadie.';
    case 'TIE':
      return 'Votación cerrada con empate: se vota otra vez entre los empatados.';
    case 'DEADLOCK':
      return 'Votación cerrada con otro empate: esta vez no sale nadie.';
  }
}

/**
 * Texto de la única región `status` de la pantalla (siempre montada; solo cambia su texto). En la expulsión no dice
 * nada: la pantalla usa `impostorEliminationAnnouncement`, que respeta la pausa de 1 s antes del rol.
 */
export function impostorAnnouncement(game: Pick<PokemonImpostorPublicState, 'phase' | 'currentCluePlayerId' | 'lastVoteResult'>, player: Pick<PokemonImpostorPlayerState, 'role' | 'canSubmitClue' | 'ownClue' | 'canVote' | 'ownVote' | 'fellowImpostorIds'>, selfId: string, nameOf: NameOf): string {
  switch (game.phase) {
    case 'ROLE_REVEAL':
      if (!player.role) return 'Reparto de roles: observas la partida.';
      if (player.role === 'IMPOSTOR') {
        const fellows = impostorFellowsShort((player.fellowImpostorIds ?? []).map(nameOf));
        return `Reparto de roles: eres impostor${fellows ? `, ${fellows}` : ''}.`;
      }
      return 'Reparto de roles: eres inocente.';
    case 'CLUE_PHASE':
      if (player.canSubmitClue) return 'Es tu turno: escribe tu pista.';
      if (player.ownClue?.status === 'SUBMITTED') return 'Pista registrada. Esperando al resto de turnos.';
      if (game.currentCluePlayerId && game.currentCluePlayerId !== selfId) return `Ahora da su pista ${nameOf(game.currentCluePlayerId)}.`;
      return '';
    case 'VOTING':
      if (player.ownVote) return 'Voto registrado. Esperando al resto de jugadores.';
      return player.canVote ? 'Votación abierta: elige a quién expulsar o salta.' : 'Votación abierta: estás observando.';
    case 'VOTE_RESULTS':
      return game.lastVoteResult ? voteClosedAnnouncement(game.lastVoteResult, nameOf) : '';
    default:
      return '';
  }
}

/**
 * Clave de foco (ver `useFocusOnTransition`): llega tu turno (el campo de la pista), envías la pista o gastas el
 * intento de adivinar (el título de la placa inferior) o confirmas el voto. Sin estado con foco, `null`.
 */
export function impostorFocusKey(game: Pick<PokemonImpostorPublicState, 'phase' | 'roundNumber' | 'votingRound'>, player: Pick<PokemonImpostorPlayerState, 'canSubmitClue' | 'ownClue' | 'guessUsed' | 'ownVote'>): string | null {
  if (game.phase === 'CLUE_PHASE') {
    if (player.canSubmitClue) return `turn:${game.roundNumber}`;
    if (player.ownClue || player.guessUsed) return `clue:${game.roundNumber}:${player.ownClue?.status ?? '-'}:${player.guessUsed}`;
    return null;
  }
  if (game.phase === 'VOTING' && player.ownVote) return `vote:${game.roundNumber}:${game.votingRound}`;
  return null;
}

/** Pista de un jugador en una ronda, en texto: la enviada, la que faltó o lo que se espera. */
export function impostorClueLine(game: Pick<PokemonImpostorPublicState, 'phase' | 'clues' | 'clueOrder' | 'currentClueTurnIndex' | 'currentCluePlayerId' | 'roundNumber'>, playerId: string, round: number): { text: string; tone: 'clue' | 'missing' | 'turn' | 'waiting' } {
  const entry = game.clues[round]?.[playerId];
  if (entry?.status === 'SUBMITTED') return { text: `«${entry.text ?? ''}»`, tone: 'clue' };
  if (entry) return { text: `Sin pista · ${entry.status === 'TIMEOUT' ? 'tiempo agotado' : 'desconectado'}`, tone: 'missing' };
  const current = round === game.roundNumber && game.phase === 'CLUE_PHASE';
  if (current && game.currentCluePlayerId === playerId) return { text: 'Escribiendo…', tone: 'turn' };
  if (current && game.clueOrder.indexOf(playerId) > game.currentClueTurnIndex) return { text: 'Esperando…', tone: 'waiting' };
  return { text: 'Sin pista', tone: 'missing' };
}

/** Recuento de una votación cerrada, de más a menos votos («Saltar» al final). */
export function impostorTallies(result: ImpostorVoteResult, nameOf: NameOf): { id: string; label: string; count: number }[] {
  const rows = Object.entries(result.tallies)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => ({ id, label: nameOf(id), count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
  return result.skipVotes > 0 ? [...rows, { id: 'SKIP', label: 'Saltar', count: result.skipVotes }] : rows;
}

/** «1 voto», «2 votos». */
export function votesLabel(count: number): string {
  return `${count} ${count === 1 ? 'voto' : 'votos'}`;
}

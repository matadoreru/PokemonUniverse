import { IMPOSTOR_CLUE_MAX_CODE_POINTS, IMPOSTOR_SKIP_TARGET, type ImpostorEliminationReveal, type ImpostorFinishReason, type ImpostorVoteResult } from '@pokemon-universe/shared/public';
import { joinNames } from '../lib/format';

/** Titular del resultado de una votación según su tipo. */
export function impostorVoteHeadline(result: ImpostorVoteResult, nameOf: (id: string) => string): string {
  switch (result.kind) {
    case 'TIE':
      return '⚔️ Empate: habrá una nueva votación';
    case 'ELIMINATION':
      return `${result.eliminatedId ? nameOf(result.eliminatedId) : '?'} recibió más votos`;
    case 'SKIPPED':
      return '⏭️ Se salta la votación: nadie es expulsado';
    case 'DEADLOCK':
      return '⚔️ Empate otra vez: nadie es expulsado';
  }
}

/**
 * Cut-in de la expulsión: el nombre primero y el rol en la línea que aparece tras la pausa de 1 s.
 * Solo se llama con la revelación que publica el motor en `ELIMINATION`.
 */
export function impostorEliminationCutIn(reveal: ImpostorEliminationReveal, name: string): { tone: 'red' | 'info'; title: string; delayedLine: string } {
  const impostor = reveal.role === 'IMPOSTOR';
  return { tone: impostor ? 'red' : 'info', title: name, delayedLine: impostor ? '…era impostor' : '…era inocente' };
}

/**
 * Aviso de la expulsión en la región viva de la pantalla (el cut-in solo se ve): el nombre y, como la `delayedLine`
 * del cut-in, el rol solo cuando ha pasado la pausa (`roleShown`).
 */
export function impostorEliminationAnnouncement(reveal: ImpostorEliminationReveal, name: string, roleShown: boolean): string {
  if (!roleShown) return `Expulsión: ${name}.`;
  return `Expulsión: ${name} era ${reveal.role === 'IMPOSTOR' ? 'impostor' : 'inocente'}.`;
}

/** Título de la fase de pistas: sin nadie conectado el orden está vacío y no hay turno que anunciar. */
export function impostorCluePhaseTitle(currentName: string | null): string {
  return currentName ? `Turno de ${currentName}` : 'Nadie conectado para dar pistas';
}

/** Destino de un voto: «Saltar» o el nombre del jugador. */
export function impostorVoteTargetLabel(targetId: string, nameOf: (id: string) => string): string {
  return targetId === IMPOSTOR_SKIP_TARGET ? 'Saltar' : nameOf(targetId);
}

/** Motivo del final de la partida. `guesserName` es quien adivinó el Pokémon, si lo hubo. */
export function impostorFinishText(reason: ImpostorFinishReason | null, guesserName: string | null): string | null {
  switch (reason) {
    case 'GUESS':
      return `${guesserName ?? 'Un impostor'} adivinó el Pokémon secreto.`;
    case 'PARITY':
      return 'Los impostores igualaron en número a los inocentes.';
    case 'IMPOSTORS_ELIMINATED':
      return 'Todos los impostores fueron expulsados.';
    case 'STALEMATE':
      return 'Tres rondas seguidas sin expulsar a nadie.';
    case null:
      return null;
  }
}

/** Longitud de la pista como la cuenta el motor: puntos de código tras `trim()` y NFC. */
export function impostorClueLength(value: string): number {
  return [...value.trim().normalize('NFC')].length;
}

/**
 * Recorta la pista a los puntos de código que acepta el motor, que cuenta el texto sin espacios en los bordes: conserva
 * los espacios iniciales tal como se escriben y solo corta si el texto recortado supera el máximo (NFC).
 */
export function clampImpostorClue(value: string): string {
  const normalized = value.normalize('NFC');
  const points = [...normalized.trim()];
  if (points.length <= IMPOSTOR_CLUE_MAX_CODE_POINTS) return normalized;
  const leading = normalized.slice(0, normalized.length - normalized.trimStart().length);
  return leading + points.slice(0, IMPOSTOR_CLUE_MAX_CODE_POINTS).join('');
}

/** Encabezado de la línea de aliados: «Otro impostor: » o «Otros impostores: ». */
export function impostorFellowsLead(count: number): string {
  return count === 1 ? 'Otro impostor: ' : 'Otros impostores: ';
}

/** Línea de aliados del impostor; un compañero expulsado lleva « (fuera)». `null` si no tiene aliados. */
export function impostorFellowsText(names: readonly { name: string; out: boolean }[]): string | null {
  if (names.length === 0) return null;
  return `${impostorFellowsLead(names.length)}${joinNames(names.map((fellow) => (fellow.out ? `${fellow.name} (fuera)` : fellow.name)))}`;
}

/** Versión corta para la línea del móvil: «con Ana y Bea», sin sufijo. */
export function impostorFellowsShort(names: readonly string[]): string | null {
  return names.length === 0 ? null : `con ${joinNames(names)}`;
}

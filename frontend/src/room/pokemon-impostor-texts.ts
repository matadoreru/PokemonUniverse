import { IMPOSTOR_CLUE_MAX_CODE_POINTS, IMPOSTOR_SKIP_TARGET, type ImpostorFinishReason, type ImpostorVoteResult } from '@pokemon-universe/shared/public';

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

/** Recorta la pista a los puntos de código que acepta el motor (tras NFC), no a unidades UTF-16. */
export function clampImpostorClue(value: string): string {
  return [...value.normalize('NFC')].slice(0, IMPOSTOR_CLUE_MAX_CODE_POINTS).join('');
}

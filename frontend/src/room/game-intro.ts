import type { GameIntroView, RoomMemberView } from '@pokemon-universe/shared/public';

export interface GameIntroProgress {
  /** Jugadores conectados que ya han pulsado «Saltar». */
  skipped: number;
  /** Jugadores conectados que deciden la intro (los espectadores y desconectados no cuentan). */
  total: number;
  selfSkipped: boolean;
  /** Solo un jugador conectado puede saltar (el servidor rechaza al resto). */
  canSkip: boolean;
}

/** Cuenta como la sala Java (`RoomCoordinator.introDeciderIds`): rol `PLAYER` y presencia `CONNECTED`. */
export function gameIntroProgress(intro: GameIntroView, members: readonly RoomMemberView[], selfId: string): GameIntroProgress {
  const deciders = members.filter((member) => member.role === 'PLAYER' && member.presence === 'CONNECTED');
  const skippedIds = new Set(intro.skippedIds);
  return {
    skipped: deciders.filter((member) => skippedIds.has(member.id)).length,
    total: deciders.length,
    selfSkipped: skippedIds.has(selfId),
    canSkip: deciders.some((member) => member.id === selfId),
  };
}

export function introReadyLabel({ skipped, total }: Pick<GameIntroProgress, 'skipped' | 'total'>): string {
  return `${skipped} de ${total} listos`;
}

/** Mientras se envía sigue diciendo «Saltar» (con `aria-busy`); confirmado, «Esperando al resto». */
export function introSkipLabel(selfSkipped: boolean): string {
  return selfSkipped ? 'Esperando al resto' : 'Saltar';
}

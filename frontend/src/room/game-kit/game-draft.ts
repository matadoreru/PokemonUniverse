import type { RoomView } from '@pokemon-universe/shared/public';
import { draftKey, type DraftKey } from '../../hooks/useDraft';

/**
 * Clave del borrador de un campo de texto de un juego (Q7, para `useDraft`): sala + partida (`gameInstanceId`) + campo,
 * con la ronda o el turno. Sobrevive a una recarga en la misma ronda y nunca reaparece en otra. Sin partida, `null`.
 */
export function gameDraftKey(room: Pick<RoomView, 'code' | 'gameSkipState'>, field: string, round: string | number | null): DraftKey | null {
  return draftKey([room.code, room.gameSkipState?.gameInstanceId, field], round);
}

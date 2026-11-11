import type { RoomMemberView } from '@pokemon-universe/shared/public';
import { useMemo } from 'react';
import { playerColor } from './player-color';

/** Nombre de un jugador que ya no está en `room.members` (nunca su id interno). */
export const UNKNOWN_PLAYER_NAME = 'Entrenador';

/** Los miembros de la sala por id, con el nombre y el color que les dan todas las pantallas. */
export interface RoomMembers {
  /** Cada miembro por su id (las piezas de cada juego reciben este mapa). */
  byId: ReadonlyMap<string, RoomMemberView>;
  /** Orden de llegada de cada miembro, para `playerColor`. */
  colorIndex: ReadonlyMap<string, number>;
  get(playerId: string): RoomMemberView | undefined;
  /** Su `displayName`, o «Entrenador» si no está en la sala. */
  nameOf(playerId: string): string;
  /** `playerColor` de su orden de llegada a la sala; el primero si no está. */
  colorOf(playerId: string): string;
}

export function roomMembers(members: readonly RoomMemberView[]): RoomMembers {
  const byId = new Map<string, RoomMemberView>();
  const colorIndex = new Map<string, number>();
  members.forEach((member, index) => {
    if (byId.has(member.id)) return;
    byId.set(member.id, member);
    colorIndex.set(member.id, index);
  });
  return {
    byId,
    colorIndex,
    get: (playerId) => byId.get(playerId),
    nameOf: (playerId) => byId.get(playerId)?.displayName ?? UNKNOWN_PLAYER_NAME,
    colorOf: (playerId) => playerColor(colorIndex.get(playerId) ?? 0),
  };
}

/** `roomMembers` de la sala, estable mientras no cambie `room.members`. */
export function useRoomMembers(room: { members: readonly RoomMemberView[] }): RoomMembers {
  return useMemo(() => roomMembers(room.members), [room.members]);
}

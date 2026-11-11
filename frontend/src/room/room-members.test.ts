import type { RoomMemberView } from '@pokemon-universe/shared/public';
import { describe, expect, it } from 'vitest';
import { playerColor } from './player-color';
import { roomMembers } from './room-members';
import { standingRows } from './ResultsShell';

const member = (id: string, displayName: string): RoomMemberView => ({
  id, displayName, avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: 'MEMBER', role: 'PLAYER', isHost: false, ready: true, sessionPoints: 0,
});
const MEMBERS = [member('p1', 'Misty'), member('p2', 'Ash'), member('p3', 'Brock')];

describe('roomMembers', () => {
  it('nombre, color por orden de llegada y miembro por id', () => {
    const members = roomMembers(MEMBERS);
    expect(members.nameOf('p2')).toBe('Ash');
    expect(members.colorOf('p3')).toBe(playerColor(2));
    expect(members.get('p1')?.displayName).toBe('Misty');
    expect(members.byId.get('p3')?.displayName).toBe('Brock');
    expect(members.colorIndex.get('p2')).toBe(1);
  });
  it('quien ya no está en la sala es «Entrenador» (nunca su id) con el primer color', () => {
    const members = roomMembers(MEMBERS);
    expect(members.nameOf('gone')).toBe('Entrenador');
    expect(members.colorOf('gone')).toBe(playerColor(0));
    expect(members.get('gone')).toBeUndefined();
  });
});

describe('standingRows', () => {
  it('puesto, puntos, nombre, avatar y color de la sala, más lo propio del juego', () => {
    const rows = standingRows([{ playerId: 'p2', position: 1, points: 7 }, { playerId: 'gone', position: 2, points: 3 }], roomMembers(MEMBERS), (standing) => ({ meta: `${standing.points} aciertos` }));
    expect(rows).toEqual([
      { id: 'p2', position: 1, name: 'Ash', points: 7, avatar: MEMBERS[1]!.avatar, color: playerColor(1), meta: '7 aciertos' },
      { id: 'gone', position: 2, name: 'Entrenador', points: 3, avatar: undefined, color: playerColor(0), meta: '3 aciertos' },
    ]);
  });
});

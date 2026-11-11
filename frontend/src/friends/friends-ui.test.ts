import { describe, expect, it } from 'vitest';
import { friendsButtonLabel } from './FriendsButton';
import { canInviteFriend } from './FriendsDrawer';
import { inviteText } from './InviteToasts';
import { member, roomView } from '../room/test-support/room-view';

const lobby = roomView({ members: [member({ id: 'self', displayName: 'Yo' }), member({ id: 'inside', displayName: 'Dentro' })] });

describe('canInviteFriend', () => {
  it('solo en el lobby, a un amigo conectado o en otra sala que no esté ya en la tuya', () => {
    expect(canInviteFriend(lobby, { id: 'a', status: 'ONLINE' })).toBe(true);
    expect(canInviteFriend(lobby, { id: 'a', status: 'IN_ROOM' })).toBe(true);
    expect(canInviteFriend(lobby, { id: 'a', status: 'PLAYING' })).toBe(false);
    expect(canInviteFriend(lobby, { id: 'a', status: 'OFFLINE' })).toBe(false);
    expect(canInviteFriend(lobby, { id: 'inside', status: 'IN_ROOM' })).toBe(false);
    expect(canInviteFriend({ ...lobby, phase: 'ROUND_ACTIVE' }, { id: 'a', status: 'ONLINE' })).toBe(false);
    expect(canInviteFriend(null, { id: 'a', status: 'ONLINE' })).toBe(false);
  });
});

describe('textos', () => {
  it('la placa nombra las solicitudes pendientes', () => {
    expect(friendsButtonLabel(0)).toBe('Amigos');
    expect(friendsButtonLabel(1)).toBe('Amigos, 1 solicitud pendiente');
    expect(friendsButtonLabel(3)).toBe('Amigos, 3 solicitudes pendientes');
  });

  it('el aviso lleva el minijuego si hay uno elegido', () => {
    expect(inviteText({ roomCode: 'ABC234', gameName: null })).toBe('Sala ABC234');
    expect(inviteText({ roomCode: 'ABC234', gameName: 'Más o menos' })).toBe('Más o menos · sala ABC234');
  });
});

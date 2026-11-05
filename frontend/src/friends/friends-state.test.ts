import type { FriendInvite } from '@pokemon-universe/shared/public';
import { describe, expect, it } from 'vitest';
import type { FriendsResponse } from '../lib/api-contract';
import { addInvite, applyPresence, emptyFriendsState, friendErrorMessage, pendingCount, pruneInvites, removeInvite, setOverview, sortFriends, type FriendEntry } from './friends-state';

const avatar: FriendEntry['avatar'] = { type: 'DEFAULT' };
const friend = (id: string, username: string, status: FriendEntry['status']): FriendEntry => ({ id, username, avatar, level: null, status });
const party = (id: string) => ({ id, username: id, avatar });
const overview = (friends: FriendEntry[]): FriendsResponse => ({
  friends,
  incoming: [{ id: 'r1', from: party('ana'), createdAt: '2026-11-05T10:00:00Z' }, { id: 'r2', from: party('beto'), createdAt: '2026-11-05T10:00:00Z' }],
  outgoing: [{ id: 'r3', to: party('cris'), createdAt: '2026-11-05T10:00:00Z' }],
});
const NOW = Date.parse('2026-11-05T12:00:00Z');
const invite = (inviteId: string, fromId: string, expiresAt = '2026-11-05T12:10:00Z'): FriendInvite => ({ inviteId, from: party(fromId), roomCode: 'ABC234', gameName: null, expiresAt });

describe('sortFriends', () => {
  it('ordena Jugando, En una sala, Conectado, Desconectado y alfabético dentro de cada estado', () => {
    const sorted = sortFriends([friend('1', 'zoe', 'OFFLINE'), friend('2', 'Ángel', 'ONLINE'), friend('3', 'bea', 'PLAYING'), friend('4', 'ada', 'ONLINE'), friend('5', 'max', 'IN_ROOM')]);
    expect(sorted.map((f) => f.username)).toEqual(['bea', 'max', 'ada', 'Ángel', 'zoe']);
  });
});

describe('applyPresence', () => {
  it('actualiza el estado del amigo y reordena la lista', () => {
    const state = setOverview(emptyFriendsState, overview([friend('1', 'ana', 'ONLINE'), friend('2', 'beto', 'OFFLINE')]));
    const next = applyPresence(state, { userId: '2', status: 'PLAYING' });
    expect(next.overview?.friends.map((f) => [f.username, f.status])).toEqual([['beto', 'PLAYING'], ['ana', 'ONLINE']]);
  });

  it('ignora la presencia de quien no es amigo, y sin lista no hace nada', () => {
    const state = setOverview(emptyFriendsState, overview([friend('1', 'ana', 'ONLINE')]));
    expect(applyPresence(state, { userId: '9', status: 'PLAYING' })).toBe(state);
    expect(applyPresence(emptyFriendsState, { userId: '1', status: 'PLAYING' })).toBe(emptyFriendsState);
  });
});

describe('invitaciones', () => {
  it('una invitación nueva del mismo amigo sustituye a la anterior', () => {
    const state = addInvite(addInvite(addInvite(emptyFriendsState, invite('a', 'ana'), NOW), invite('b', 'beto'), NOW), invite('c', 'ana'), NOW);
    expect(state.invites.map((i) => i.inviteId)).toEqual(['b', 'c']);
  });

  it('descarta las caducadas, y no añade una que ya llegó caducada', () => {
    const state = addInvite(addInvite(emptyFriendsState, invite('a', 'ana', '2026-11-05T12:01:00Z'), NOW), invite('b', 'beto'), NOW);
    expect(pruneInvites(state, Date.parse('2026-11-05T12:05:00Z')).invites.map((i) => i.inviteId)).toEqual(['b']);
    expect(addInvite(emptyFriendsState, invite('x', 'ana', '2026-11-05T11:59:00Z'), NOW).invites).toEqual([]);
  });

  it('sin caducadas devuelve el mismo estado; quitar por id', () => {
    const state = addInvite(emptyFriendsState, invite('a', 'ana'), NOW);
    expect(pruneInvites(state, NOW)).toBe(state);
    expect(removeInvite(state, 'a').invites).toEqual([]);
  });
});

describe('pendingCount', () => {
  it('cuenta solo las solicitudes recibidas', () => {
    expect(pendingCount(overview([]))).toBe(2);
    expect(pendingCount(null)).toBe(0);
  });
});

describe('friendErrorMessage', () => {
  it.each([
    ['Cannot send a friend request to this user', 'No se puede enviar la solicitud a ese usuario.'],
    ['Friend limit reached', 'Has llegado al límite de 200 amigos.'],
    ['Too many pending requests', 'Tienes demasiadas solicitudes pendientes.'],
    ['Friend request not found', 'Esa solicitud ya no existe.'],
  ])('«%s» se traduce', (message, spanish) => {
    expect(friendErrorMessage(new Error(message))).toBe(spanish);
  });

  it('lo desconocido queda en el genérico', () => {
    expect(friendErrorMessage(new Error('Boom'))).toBe('No se pudo completar. Inténtalo de nuevo en unos segundos.');
  });
});

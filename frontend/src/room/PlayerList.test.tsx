import type { PokedexDistancePublicState } from '@pokemon-universe/shared/public';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FriendsContextValue } from '../friends/FriendsContext';
import type { FriendsResponse } from '../lib/api-contract';
import { MemberMenu, memberReadiness, PlayerList } from './PlayerList';
import { playerColor } from '../lib/player-color';
import { member } from './test-support/room-view';


let friends: FriendsContextValue | null = null;
vi.mock('../friends/FriendsContext', () => ({ useOptionalFriends: () => friends }));

const avatar = { type: 'DEFAULT' } as const;
const noop = () => Promise.resolve();
/** Contexto de amigos de una cuenta registrada (con `enabled`) o de un invitado. */
function friendsOf(overview: FriendsResponse | null, enabled = true): FriendsContextValue {
  return {
    overview, pendingCount: 0, invites: [], invited: new Set(), enabled, drawerOpen: false, openDrawer: () => undefined,
    closeDrawer: () => undefined, send: (username) => Promise.resolve({ kind: 'request' as const, username }), accept: noop, decline: noop, remove: noop, invite: noop,
    dismissInvite: () => undefined,
  };
}

const members = [
  member({ id: 'host', displayName: 'Eru', roomRole: 'HOST', isHost: true, sessionPoints: 12 }),
  member({ id: 'co', displayName: 'Ana', roomRole: 'CO_HOST', ready: true }),
  member({ id: 'away', displayName: 'Leo', connected: false, presence: 'TEMPORARILY_DISCONNECTED' }),
];

const render = (props: Partial<Parameters<typeof PlayerList>[0]> = {}) =>
  renderToStaticMarkup(createElement(PlayerList, { members, selfId: 'host', ...props }));

describe('PlayerList', () => {
  beforeEach(() => { friends = null; });

  it('pinta franjas con insignias de texto: Host con corona, Co-host, Listo y puntos; «(tú)» solo para lectores', () => {
    const markup = render();
    expect(markup).toContain('lucide-crown');
    expect(markup).toContain('Host</span>');
    expect(markup).toContain('Co-host');
    expect(markup).toContain('Listo');
    expect(markup).toContain('12<small> pts</small>');
    expect(markup.match(/<span class="sr-only">\(tú\)<\/span>/g)).toHaveLength(1);
    // El host no lleva descripción («Controla el inicio»): basta la insignia.
    expect(markup).not.toContain('Controla el inicio');
    expect(markup).toContain('title="Leo"');
  });

  it('da a cada jugador el color de su orden en la sala', () => {
    const markup = render();
    expect(markup).toContain(`--player:${playerColor(0)}`);
    expect(markup).toContain(`--player:${playerColor(2)}`);
  });

  it('dice en texto quién está desconectado', () => {
    const markup = render();
    expect(markup).toContain('Sin conexión');
    expect(markup).toContain('Reconectando…');
    expect(memberReadiness(member({ id: 'x', displayName: 'X', presence: 'LEFT', connected: false }))).toEqual({ kind: 'away', label: 'Fuera de la sala' });
    expect(memberReadiness(member({ id: 'x', displayName: 'X' }))).toEqual({ kind: 'pending', label: 'Sin confirmar' });
  });

  it('solo el host ve «Gestionar a…» y nunca para sí mismo ni para el Host', () => {
    expect(render()).not.toContain('Gestionar a');
    const managed = render({ canManage: true });
    expect(managed).toContain('aria-label="Gestionar a Ana"');
    expect(managed).toContain('aria-label="Gestionar a Leo"');
    expect(managed).not.toContain('aria-label="Gestionar a Eru"');
    // Los diálogos (menú y confirmación) están montados pero cerrados.
    expect(managed.match(/<dialog/g)).toHaveLength(2);
  });

  it('en Pokédex Distance muestra la elección y oculta las insignias del lobby', () => {
    const game = { eligibleIds: ['host', 'co'], survivorIds: ['host', 'co'], spectatorIds: [], selectedIds: ['host'], selections: { host: { pokemonId: 25, pokemonName: 'Pikachu', sprite: '/p.png' } } } as unknown as PokedexDistancePublicState;
    const markup = render({ game });
    expect(markup).not.toContain('Controla el inicio');
    expect(markup).not.toContain(' pts');
    expect(markup).toContain('→ Pikachu');
    expect(markup).toContain('src="/p.png"');
    expect(markup).toContain('seleccionando…');
  });
});

describe('PlayerList: silencio del chat', () => {
  const lobby = [
    member({ id: 'host', displayName: 'Eru', roomRole: 'HOST', isHost: true }),
    member({ id: 'co', displayName: 'Ana', roomRole: 'CO_HOST' }),
    member({ id: 'co2', displayName: 'Bea', roomRole: 'CO_HOST' }),
    member({ id: 'leo', displayName: 'Leo', chatMuted: true }),
  ];
  const list = (props: Partial<Parameters<typeof PlayerList>[0]> = {}) =>
    renderToStaticMarkup(createElement(PlayerList, { members: lobby, selfId: 'leo', onSetChatMute: () => undefined, ...props }));
  beforeEach(() => { friends = null; });

  it('marca al silenciado con el chip «Silenciado», visible para todos', () => {
    // Sin `onSetChatMute` (quien mira no modera): el chip se ve igual.
    const markup = renderToStaticMarkup(createElement(PlayerList, { members: lobby, selfId: 'leo' }));
    expect(markup).toContain('lucide-message-square-off');
    expect(markup.match(/Silenciado/g)).toHaveLength(1);
    expect(markup).toContain('Silenciado<span class="sr-only"> en el chat</span>');
  });

  it('el Host y el Co-host pueden silenciar a los miembros; un miembro no', () => {
    // Un Co-host no gestiona personas (`canManage` falso), pero ve «Gestionar a…» sobre los miembros sin rol.
    const co = list({ selfId: 'co' });
    expect(co).toContain('aria-label="Gestionar a Leo"');
    expect(co).not.toContain('aria-label="Gestionar a Eru"');
    expect(co).not.toContain('aria-label="Gestionar a Bea"');
    const host = list({ selfId: 'host', canManage: true });
    expect(host).toContain('aria-label="Gestionar a Ana"');
    expect(host).toContain('aria-label="Gestionar a Leo"');
    expect(list({ selfId: 'leo' })).not.toContain('Gestionar a');
  });
});

describe('PlayerList: amistad desde «Gestionar a…»', () => {
  const lobby = [
    member({ id: 'host', displayName: 'Eru', roomRole: 'HOST', isHost: true }),
    member({ id: 'me', displayName: 'Yo' }),
    member({ id: 'ana', displayName: 'Ana' }),
    member({ id: 'guest_4f2a7c1e-0b9d-4c8e-9a3b-2d5e6f7a8b9c', displayName: 'Invi' }),
  ];
  const list = (props: Partial<Parameters<typeof PlayerList>[0]> = {}) =>
    renderToStaticMarkup(createElement(PlayerList, { members: lobby, selfId: 'me', friendActions: true, ...props }));
  beforeEach(() => { friends = friendsOf({ friends: [], incoming: [], outgoing: [] }); });

  it('una cuenta registrada ve «Gestionar a…» sobre las otras cuentas, también el Host, pero no sobre sí ni sobre invitados', () => {
    const markup = list();
    expect(markup).toContain('aria-label="Gestionar a Eru"');
    expect(markup).toContain('aria-label="Gestionar a Ana"');
    expect(markup).not.toContain('aria-label="Gestionar a Yo"');
    expect(markup).not.toContain('aria-label="Gestionar a Invi"');
    // Un no-host solo tiene el menú: sin diálogo de confirmación.
    expect(markup.match(/<dialog/g)).toHaveLength(1);
  });

  it('un invitado (o fuera del lobby, sin `friendActions`) no ve «Gestionar a…»', () => {
    friends = friendsOf(null, false);
    expect(list()).not.toContain('Gestionar a');
    friends = null;
    expect(list()).not.toContain('Gestionar a');
    friends = friendsOf({ friends: [], incoming: [], outgoing: [] });
    expect(list({ friendActions: false })).not.toContain('Gestionar a');
  });

  it('el host sigue sin poder gestionar al Host ni a sí mismo, pero gestiona a los invitados', () => {
    const markup = list({ selfId: 'host', canManage: true });
    expect(markup).not.toContain('aria-label="Gestionar a Eru"');
    expect(markup).toContain('aria-label="Gestionar a Invi"');
    expect(markup).toContain('aria-label="Gestionar a Yo"');
  });
});

describe('MemberMenu', () => {
  const ana = member({ id: 'ana', displayName: 'Ana' });
  const party = (id: string) => ({ id, username: id, avatar });
  const menu = (overview: FriendsResponse | null, props: Partial<Parameters<typeof MemberMenu>[0]> = {}) =>
    renderToStaticMarkup(createElement(MemberMenu, { member: ana, hostActions: false, canMuteChat: false, friends: friendsOf(overview), ...props }));
  const createdAt = '2026-11-06T10:00:00Z';

  it('sin relación: «Enviar solicitud de amistad», con su región para el resultado', () => {
    const markup = menu({ friends: [], incoming: [], outgoing: [] });
    expect(markup).toContain('Enviar solicitud de amistad');
    expect(markup).not.toMatch(/<button[^>]*disabled[^>]*>.*Enviar solicitud de amistad/);
    expect(markup).toContain('role="status"');
    expect(markup).toContain('role="alert"');
  });

  it('solicitud enviada: «Solicitud enviada», desactivado', () => {
    const markup = menu({ friends: [], incoming: [], outgoing: [{ id: 'r1', to: party('ana'), createdAt }] });
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Solicitud enviada/);
    expect(markup).not.toContain('Enviar solicitud de amistad');
  });

  it('solicitud recibida: «Aceptar solicitud de amistad»', () => {
    const markup = menu({ friends: [], incoming: [{ id: 'r2', from: party('ana'), createdAt }], outgoing: [] });
    expect(markup).toContain('Aceptar solicitud de amistad');
    expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Aceptar solicitud de amistad/);
  });

  it('ya amigos: «Ya sois amigos», desactivado', () => {
    const markup = menu({ friends: [{ id: 'ana', username: 'Ana', avatar, level: 2, status: 'IN_ROOM' }], incoming: [], outgoing: [] });
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Ya sois amigos/);
  });

  it('el host ve además Co-host, Transferir y Expulsar; un no-host solo la amistad', () => {
    const host = menu({ friends: [], incoming: [], outgoing: [] }, { hostActions: true });
    expect(host).toContain('Hacer Co-host');
    expect(host).toContain('Transferir Host');
    expect(host).toContain('Expulsar de la sala');
    expect(host).toContain('Enviar solicitud de amistad');
    const guest = menu({ friends: [], incoming: [], outgoing: [] });
    expect(guest).not.toContain('Hacer Co-host');
    expect(guest).not.toContain('Transferir Host');
    expect(guest).not.toContain('Expulsar de la sala');
  });

  it('«Silenciar en el chat» solo con `canMuteChat`, sin depender de las acciones del host', () => {
    expect(menu(null)).not.toContain('chat');
    const co = menu(null, { canMuteChat: true });
    expect(co).toContain('Silenciar en el chat');
    expect(co).not.toContain('Expulsar de la sala');
    expect(menu(null, { canMuteChat: true, member: { ...ana, chatMuted: true } })).toContain('Quitar el silencio del chat');
  });

  it('sin amistad posible (viendo un invitado, o siendo invitado) el host solo ve sus acciones', () => {
    const guestMember = member({ id: 'guest_1', displayName: 'Invi' });
    const markup = menu(null, { member: guestMember, hostActions: true });
    expect(markup).toContain('Expulsar de la sala');
    expect(markup).not.toContain('amistad');
    const asGuest = renderToStaticMarkup(createElement(MemberMenu, { member: ana, hostActions: true, canMuteChat: false, friends: friendsOf(null, false) }));
    expect(asGuest).not.toContain('amistad');
  });
});

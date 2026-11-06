import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FriendsResponse } from '../lib/api-contract';
import type { FriendsContextValue } from './FriendsContext';
import { AddFriendDialog, FriendsDrawer } from './FriendsDrawer';
import { sentText } from './friends-state';

const avatar = { type: 'DEFAULT' } as const;
const party = (id: string) => ({ id, username: id, avatar });
let friends: FriendsContextValue;

vi.mock('./FriendsContext', () => ({ useFriends: () => friends }));
vi.mock('../room/RoomContext', () => ({ useRoom: () => ({ room: null }) }));

const noop = () => Promise.resolve();
function context(overview: FriendsResponse | null): FriendsContextValue {
  return {
    overview, pendingCount: overview?.incoming.length ?? 0, invites: [], invited: new Set(), enabled: true, drawerOpen: true,
    openDrawer: () => undefined, closeDrawer: () => undefined, send: () => Promise.resolve('request'), accept: noop, decline: noop,
    remove: noop, invite: noop, dismissInvite: () => undefined,
  };
}

const empty: FriendsResponse = { friends: [], incoming: [], outgoing: [] };
const full: FriendsResponse = {
  friends: [{ id: 'f1', username: 'dani', avatar, level: 3, status: 'ONLINE' }],
  incoming: [{ id: 'r1', from: party('ana'), createdAt: '2026-11-05T10:00:00Z' }, { id: 'r2', from: party('beto'), createdAt: '2026-11-05T10:00:00Z' }],
  outgoing: [{ id: 'r3', to: party('cris'), createdAt: '2026-11-05T10:00:00Z' }],
};

const render = () => renderToStaticMarkup(createElement(FriendsDrawer));
const tabs = (markup: string) => [...markup.matchAll(/role="tab"[^>]*aria-selected="(true|false)"[^>]*>(.*?)<\/button>/g)].map((m) => ({ selected: m[1] === 'true', html: m[2]! }));

describe('FriendsDrawer', () => {
  beforeEach(() => { friends = context(empty); });

  it('abre con «Añadir amigo» bajo el título y tres pestañas, «Amigos» activa', () => {
    const markup = render();
    expect(markup).toContain('Añadir amigo');
    expect(markup.indexOf('Añadir amigo')).toBeLessThan(markup.indexOf('role="tablist"'));
    const list = tabs(markup);
    expect(list.map((t) => t.html.replace(/<[^>]+>/g, ''))).toEqual(['Amigos', 'Solicitudes', 'Enviadas']);
    expect(list.map((t) => t.selected)).toEqual([true, false, false]);
    // El formulario ya no está en el panel: va en el diálogo.
    expect(markup).not.toContain('Nombre de usuario');
  });

  it('cada pestaña tiene su estado vacío', () => {
    const markup = render();
    expect(markup).toContain('Todavía no tienes amigos. Añade a alguien por su nombre de usuario.');
    expect(markup).toContain('No tienes solicitudes pendientes.');
    expect(markup).toContain('No has enviado solicitudes.');
    expect(markup.match(/role="tabpanel"/g)).toHaveLength(3);
  });

  it('«Solicitudes» lleva el número de pendientes, y «Amigos» sigue siendo la activa', () => {
    friends = context(full);
    const markup = render();
    const [amigos, solicitudes] = tabs(markup);
    expect(amigos?.selected).toBe(true);
    expect(solicitudes?.html).toContain('>2</span>');
    expect(solicitudes?.html).toContain('(2 pendientes)');
    expect(markup).toContain('aria-label="Aceptar a ana"');
    expect(markup).toContain('aria-label="Rechazar a beto"');
    expect(markup).toContain('aria-label="Cancelar la solicitud a cris"');
    expect(markup).toContain('aria-label="Quitar a dani"');
  });

  it('sin pendientes, «Solicitudes» no lleva número', () => {
    const solicitudes = tabs(render())[1];
    expect(solicitudes?.html).not.toMatch(/\d/);
  });
});

describe('AddFriendDialog', () => {
  it('pide el nombre de usuario con «Enviar solicitud» y «Cerrar»; el resultado va dentro', () => {
    const markup = renderToStaticMarkup(createElement(AddFriendDialog, { open: true, onClose: () => undefined, send: () => Promise.resolve('request' as const) }));
    expect(markup).toContain('Añadir amigo');
    expect(markup).toContain('Nombre de usuario');
    expect(markup).toContain('Enviar solicitud');
    expect(markup).toContain('>Cerrar<');
    expect(markup).toContain('role="status"');
  });

  it('textos del éxito', () => {
    expect(sentText('request', 'ana')).toBe('Solicitud enviada a ana.');
    expect(sentText('friend', 'ana')).toBe('Ya sois amigos: ana te había enviado una solicitud.');
  });
});

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { FriendsContextValue } from '../friends/FriendsContext';
import type { PublicProfileResponse } from '../lib/api-contract';
import { FriendshipAction, privateText } from './PublicProfilePage';

const noop = () => Promise.resolve();
const friends: Partial<FriendsContextValue> = { overview: null, send: (username) => Promise.resolve({ kind: 'request' as const, username }), accept: noop };
vi.mock('../friends/FriendsContext', () => ({ useFriends: () => friends }));

const base: PublicProfileResponse = {
  user: { id: 'u2', username: 'misty', avatar: { type: 'DEFAULT' } },
  visibility: 'FRIENDS',
  friendship: 'NONE',
  private: true,
};
const render = (profile: Partial<PublicProfileResponse>) =>
  renderToStaticMarkup(createElement(FriendshipAction, { profile: { ...base, ...profile }, onChanged: () => undefined }));

describe('FriendshipAction', () => {
  it('sin relación, «Añadir amigo»', () => {
    expect(render({})).toContain('Añadir amigo');
  });
  it('solicitud enviada, deshabilitada', () => {
    const html = render({ friendship: 'PENDING_SENT', requestId: 'r1' });
    expect(html).toContain('Solicitud enviada');
    expect(html).toContain('disabled');
  });
  it('solicitud recibida, «Aceptar solicitud»', () => {
    expect(render({ friendship: 'PENDING_RECEIVED', requestId: 'r1' })).toContain('Aceptar solicitud');
  });
  it('amigos, «Ya sois amigos»', () => {
    expect(render({ friendship: 'FRIENDS' })).toContain('Ya sois amigos');
  });
  it('el éxito en status y el fallo en alert, siempre montados', () => {
    expect(render({}).match(/role="(status|alert)"/g)).toEqual(['role="status"', 'role="alert"']);
  });
});

describe('privateText', () => {
  it('distingue «Solo amigos» de «Nadie»', () => {
    expect(privateText({ visibility: 'FRIENDS' })).toContain('Solo sus amigos');
    expect(privateText({ visibility: 'NOBODY' })).toContain('a nadie');
  });
});

import type { ChatMessage, RoomMemberView, RoomRole } from '@pokemon-universe/shared/public';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { canDeleteChatMessage, draftAfterSend, canMuteInChat, ChatModerationMenu, LobbyChat } from './LobbyChat';

function member(id: string, displayName: string, roomRole: RoomRole = 'MEMBER', extra: Partial<RoomMemberView> = {}): RoomMemberView {
  return { id, displayName, avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole, role: 'PLAYER', isHost: roomRole === 'HOST', ready: false, sessionPoints: 0, ...extra };
}

const members = [member('host', 'Eru', 'HOST'), member('co', 'Ana', 'CO_HOST'), member('co2', 'Bea', 'CO_HOST'), member('leo', 'Leo')];
const message = (seq: number, authorId: string, authorName: string, text = 'hola'): ChatMessage => ({ seq, authorId, authorName, text, sentAt: Date.UTC(2026, 10, 7, 17, 3) });
const messages = [message(1, 'host', 'Eru'), message(2, 'co', 'Ana'), message(3, 'leo', 'Leo'), message(4, 'gone', 'Sam')];
const noop = () => Promise.resolve();

const render = (selfId: string, selfRole: RoomRole, extra: Partial<Parameters<typeof LobbyChat>[0]> = {}) =>
  renderToStaticMarkup(createElement(LobbyChat, { messages, members, selfId, selfRole, onSend: noop, onDelete: noop, onSetMute: noop, ...extra }));

describe('LobbyChat', () => {
  it('tras el ack solo vacía el campo si sigue con el texto enviado', () => {
    expect(draftAfterSend('hola', 'hola')).toBe('');
    expect(draftAfterSend('hola, qué tal', 'hola')).toBe('hola, qué tal');
  });

  it('es el panel «Chat» con la lista y el campo de escribir', () => {
    const html = render('leo', 'MEMBER');
    expect(html).toContain('>Chat<');
    expect(html).toMatch(/<ol[^>]*aria-label="Mensajes del chat"/);
    expect(html).toContain('Escribe un mensaje');
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain('aria-live');
  });

  it('el silenciado ve el motivo y no el campo', () => {
    const html = render('leo', 'MEMBER', { members: members.map((m) => m.id === 'leo' ? { ...m, chatMuted: true } : m) });
    expect(html).toContain('Un moderador te ha silenciado en el chat de esta sala.');
    expect(html).not.toContain('placeholder="Escribe un mensaje"');
  });

  it('el Host y el Co-host ven «Moderar el mensaje de X»; un miembro no', () => {
    const host = render('host', 'HOST');
    expect(host).toContain('aria-label="Moderar el mensaje de Ana"');
    expect(host).toContain('aria-label="Moderar el mensaje de Eru"');
    const co = render('co', 'CO_HOST');
    expect(co).toContain('aria-label="Moderar el mensaje de Leo"');
    expect(co).toContain('aria-label="Moderar el mensaje de Sam"');
    // El Co-host no puede hacer nada con los mensajes del Host: sin botón.
    expect(co).not.toContain('aria-label="Moderar el mensaje de Eru"');
    expect(render('leo', 'MEMBER')).not.toContain('Moderar el mensaje');
  });

  it('el estado vacío lleva «Hablando es mejor» y no es región viva', () => {
    const html = render('leo', 'MEMBER', { messages: [] });
    expect(html).toContain('Hablando es mejor');
    expect(html).toContain('Discord, Zoom');
    expect(html).not.toContain('role="status"');
  });

  it('pinta el autor con el color de su orden en la sala y en neutro si ya salió', () => {
    const html = render('leo', 'MEMBER');
    expect(html).toContain('--player:var(--info)');
    const items = html.match(/<li[^>]*>(?:(?!<\/li>).)*<\/li>/g) ?? [];
    expect(items.find((item) => item.includes('Leo'))).toContain(`--player:var(--red)`);
    expect(items.find((item) => item.includes('Sam'))).not.toContain('--player');
  });
});

describe('reglas de moderación del chat', () => {
  const [host, co, co2, leo] = members as [RoomMemberView, RoomMemberView, RoomMemberView, RoomMemberView];
  it('borrar: el Host cualquiera; el Co-host todos salvo los del Host; el miembro ninguno', () => {
    expect(canDeleteChatMessage('HOST', 'HOST')).toBe(true);
    expect(canDeleteChatMessage('CO_HOST', 'MEMBER')).toBe(true);
    expect(canDeleteChatMessage('CO_HOST', null)).toBe(true);
    expect(canDeleteChatMessage('CO_HOST', 'HOST')).toBe(false);
    expect(canDeleteChatMessage('MEMBER', 'MEMBER')).toBe(false);
  });

  it('silenciar: nunca al Host, a uno mismo ni a quien ya salió; el Co-host tampoco a otro Co-host', () => {
    expect(canMuteInChat('host', 'HOST', co)).toBe(true);
    expect(canMuteInChat('host', 'HOST', leo)).toBe(true);
    expect(canMuteInChat('host', 'HOST', host)).toBe(false);
    expect(canMuteInChat('co', 'CO_HOST', leo)).toBe(true);
    expect(canMuteInChat('co', 'CO_HOST', host)).toBe(false);
    expect(canMuteInChat('co', 'CO_HOST', co2)).toBe(false);
    expect(canMuteInChat('co', 'CO_HOST', co)).toBe(false);
    expect(canMuteInChat('co', 'CO_HOST', undefined)).toBe(false);
    expect(canMuteInChat('leo', 'MEMBER', co)).toBe(false);
  });
});

describe('ChatModerationMenu', () => {
  const menu = (props: Partial<Parameters<typeof ChatModerationMenu>[0]>) =>
    renderToStaticMarkup(createElement(ChatModerationMenu, { text: 'hola', authorName: 'Ana', canDelete: true, canMute: true, muted: false, onDelete: () => undefined, onToggleMute: () => undefined, ...props }));
  const forActor = (selfId: string, selfRole: RoomRole, author: RoomMemberView) => menu({
    authorName: author.displayName, canDelete: canDeleteChatMessage(selfRole, author.roomRole), canMute: canMuteInChat(selfId, selfRole, author),
  });

  it('cita el texto y ofrece eliminar y silenciar', () => {
    const html = menu({});
    expect(html).toContain('hola');
    expect(html).toContain('Eliminar mensaje');
    expect(html).toContain('Silenciar a Ana en el chat');
    expect(menu({ muted: true })).toContain('Quitar el silencio a Ana');
  });

  it('el del Co-host no ofrece silenciar a otro Co-host; el del Host sí', () => {
    expect(forActor('co', 'CO_HOST', members[2]!)).not.toContain('Silenciar a Bea');
    expect(forActor('co', 'CO_HOST', members[2]!)).toContain('Eliminar mensaje');
    expect(forActor('host', 'HOST', members[1]!)).toContain('Silenciar a Ana en el chat');
  });

  it('no ofrece silenciar en el mensaje propio', () => {
    const html = forActor('host', 'HOST', members[0]!);
    expect(html).toContain('Eliminar mensaje');
    expect(html).not.toContain('Silenciar a');
    expect(forActor('co', 'CO_HOST', members[1]!)).not.toContain('Silenciar a');
  });
});

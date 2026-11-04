import type { PokedexDistancePublicState, RoomMemberView } from '@pokemon-universe/shared/public';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { memberReadiness, PlayerList } from './PlayerList';
import { playerColor } from './player-color';

function member(overrides: Partial<RoomMemberView> & Pick<RoomMemberView, 'id' | 'displayName'>): RoomMemberView {
  return {
    avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: 'MEMBER', role: 'PLAYER', isHost: false,
    ready: false, sessionPoints: 0, ...overrides,
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
  it('pinta franjas con insignias de texto: Host con corona, Co-host, Listo, puntos y «(tú)»', () => {
    const markup = render();
    expect(markup).toContain('lucide-crown');
    expect(markup).toContain('Host</span>');
    expect(markup).toContain('Co-host');
    expect(markup).toContain('Listo');
    expect(markup).toContain('12<small> pts</small>');
    expect(markup.match(/\(tú\)/g)).toHaveLength(1);
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
    const game = { survivorIds: ['host', 'co'], selectedIds: ['host'], selections: { host: { pokemonId: 25, pokemonName: 'Pikachu', sprite: '/p.png' } } } as unknown as PokedexDistancePublicState;
    const markup = render({ game });
    expect(markup).not.toContain('Controla el inicio');
    expect(markup).not.toContain(' pts');
    expect(markup).toContain('→ Pikachu');
    expect(markup).toContain('src="/p.png"');
    expect(markup).toContain('seleccionando…');
  });
});

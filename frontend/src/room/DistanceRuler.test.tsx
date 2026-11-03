import type { PublicRoundResult, RoomMemberView } from '@pokemon-universe/shared/public';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DistanceRuler } from './DistanceRuler';

const members = ['Eru', 'Ana', 'Leo'].map((displayName, index) => ({ id: `p${index + 1}`, displayName, avatar: { type: 'DEFAULT' as const }, connected: true, presence: 'CONNECTED' as const, roomRole: 'MEMBER' as const, role: 'PLAYER' as const, isHost: false, ready: false, sessionPoints: 0 })) as RoomMemberView[];

const round: PublicRoundResult = {
  targetDexNumber: 25, eligibleIds: ['p1', 'p2', 'p3'], eliminatedIds: ['p3'], reason: 'NO_RESPONSE', tiedIds: [],
  targetPokemon: { id: 'pikachu', name: 'Pikachu', nationalDexNumber: 25, sprite: '/25.png' },
  selections: {
    p1: { pokemonId: 'pikachu', pokemonName: 'Pikachu', sprite: '/25.png', dexNumber: 25, distance: 0, selectedAt: 1 },
    p2: { pokemonId: 'charmander', pokemonName: 'Charmander', sprite: '/4.png', dexNumber: 4, distance: 21, selectedAt: 2 },
  },
};

describe('DistanceRuler', () => {
  const html = renderToStaticMarkup(createElement(DistanceRuler, { round, members, selfId: 'p2' }));

  it('pone el objetivo en el centro y cada respuesta en la regla, animada', () => {
    expect(html).toContain('Distancia al objetivo');
    expect(html).toContain('#025');
    expect(html).toContain('alt="Pikachu"');
    expect(html.match(/data-testid="distance-ruler-marker"/g)).toHaveLength(2);
    expect(html.match(/class="motion-enter-up/g)).toHaveLength(2);
    expect(html).toContain('left:50%');
    expect(html).toContain('Eru: #025, acierto exacto');
    expect(html).toContain('Ana: #004, a 21');
  });

  it('deja fuera de la regla a quien no respondió', () => {
    expect(html).toContain('Leo: sin respuesta, eliminado');
  });
});

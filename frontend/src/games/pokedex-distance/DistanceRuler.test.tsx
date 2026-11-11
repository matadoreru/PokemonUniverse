import type { PublicRoundResult } from '@pokemon-universe/shared/public';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DistanceRuler } from './DistanceRuler';
import { member } from '../../room/test-support/room-view';

const members = ['Eru', 'Ana', 'Leo'].map((displayName, index) => member({ id: `p${index + 1}`, displayName }));

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

  it('pinta cada marcador con el color de su jugador y marca el propio', () => {
    expect(html).toContain('--player:var(--blue-l)');
    expect(html).toContain('--player:var(--yellow)');
    expect(html.match(/data-self="true"/g)).toHaveLength(1);
    expect(html).toContain('data-tone="ok"');
  });

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

  it('con más de tres carriles pasa a marcadores compactos, sin sprite', () => {
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const crowd: PublicRoundResult = {
      ...round, eligibleIds: ids, eliminatedIds: ['p5'], reason: 'FARTHEST',
      selections: Object.fromEntries(ids.map((id, i) => [id, { pokemonId: id, pokemonName: id, sprite: `/${i + 1}.png`, dexNumber: i + 1, distance: 24 - i, selectedAt: 1 }])),
    };
    const crowded = renderToStaticMarkup(createElement(DistanceRuler, { round: crowd, members, selfId: 'p1' }));
    expect(crowded.match(/data-testid="distance-ruler-marker"/g)).toHaveLength(5);
    expect(crowded.match(/<img /g)).toHaveLength(1);
    expect(crowded).toContain('height:calc(5 * var(--lane-compact))');
  });

  it('marca en eléctrico a los empatados que no caen', () => {
    const tie: PublicRoundResult = { ...round, eliminatedIds: [], reason: 'TIE', tiedIds: ['p2'] };
    const tied = renderToStaticMarkup(createElement(DistanceRuler, { round: tie, members, selfId: 'p1' }));
    expect(tied).toContain('data-tone="warn"');
    expect(tied).toContain('Ana: #004, a 21, empate');
  });
});

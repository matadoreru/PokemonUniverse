import type { RoomView } from '@pokemon-universe/shared/public';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { activeGameManifest } from './active-game';
import { GameHelpButton, gameHelpRules, gameHelpSections } from './GameHelpButton';
import { GameRulesButton } from './GameRulesButton';
import { manifest, member, roomView } from './test-support/room-view';

const RULES = ['Primera regla del juego.', 'Segunda regla del juego.', 'Tercera regla del juego.'];
const TRIVIA = manifest({ id: 'pokemon-trivia', name: 'Pokémon Trivia', howTo: RULES });

function room(overrides: Partial<RoomView> = {}): RoomView {
  return roomView({
    phase: 'ROUND_ACTIVE', selectedGameId: 'pokemon-trivia', availableGames: [TRIVIA],
    members: [member({ id: 'p1', displayName: 'Misty', isHost: true }), member({ id: 'p2', displayName: 'Ash' })],
    ...overrides,
  });
}

describe('«Cómo se juega» en la partida', () => {
  it('el manifiesto en curso sale del estado público o, sin él, del juego elegido', () => {
    expect(activeGameManifest(room())?.howTo).toEqual(RULES);
    expect(activeGameManifest(room({ game: { gameId: 'otro' } }))).toBeNull();
  });

  it('solo en las fases de una partida en juego', () => {
    expect(gameHelpRules(room())).toEqual({ name: 'Pokémon Trivia', rules: RULES });
    for (const phase of ['LOBBY', 'GAME_RESULTS', 'NEXT_GAME_VOTE', 'SESSION_RESULTS'] as const) {
      expect(gameHelpRules(room({ phase }))).toBeNull();
    }
    expect(gameHelpRules(room({ availableGames: [] }))).toBeNull();
  });

  it('la píldora «?» tiene nombre accesible; sin reglas no hay píldora', () => {
    expect(renderToStaticMarkup(createElement(GameHelpButton, { room: room() }))).toContain('aria-label="Cómo se juega"');
    expect(renderToStaticMarkup(createElement(GameHelpButton, { room: room({ phase: 'LOBBY' }) }))).not.toContain('Cómo se juega');
  });

  it('el diálogo lleva «Reglas» si las hay y «Atajos de teclado» si la pantalla tiene alguno', () => {
    const atajos = [{ keys: ['1'], label: 'Mayor' }];
    expect(gameHelpSections(RULES, atajos).map((section) => section.title)).toEqual(['Reglas', 'Atajos de teclado']);
    expect(gameHelpSections(RULES, []).map((section) => section.title)).toEqual(['Reglas']);
    expect(gameHelpSections(null, atajos).map((section) => section.title)).toEqual(['Atajos de teclado']);
    expect(gameHelpSections(null, [])).toEqual([]);
  });
});

describe('«?» de las cartas del lobby', () => {
  it('es un botón con el nombre del juego, 44 px de área y diálogo cerrado al montar', () => {
    const html = renderToStaticMarkup(createElement(GameRulesButton, { game: TRIVIA }));
    expect(html).toContain('aria-label="Cómo se juega: Pokémon Trivia"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('type="button"');
    expect(html).not.toContain('Primera regla');
  });

  it('sin reglas en el manifiesto no pinta nada', () => {
    expect(renderToStaticMarkup(createElement(GameRulesButton, { game: { name: 'X', howTo: [] } }))).toBe('');
  });
});

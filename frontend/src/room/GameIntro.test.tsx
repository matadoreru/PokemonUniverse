import type { RoomView } from '@pokemon-universe/shared/public';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GameHelpButton, gameHelpRules, gameHelpSections } from './GameHelpButton';
import { GameIntro } from './GameIntro';
import { activeGameManifest, introActionTitle, introAnnouncement, introStatus } from './game-intro';
import { manifest, member, roomView } from './test-support/room-view';

const RULES = ['Primera regla del juego.', 'Segunda regla del juego.', 'Tercera regla del juego.'];
const TRIVIA = manifest({ id: 'pokemon-trivia', name: 'Pokémon Trivia', howTo: RULES });

function intro(readyPlayerIds: string[], overrides: Partial<RoomView> = {}): RoomView {
  return roomView({
    phase: 'GAME_INTRO', selectedGameId: 'pokemon-trivia', availableGames: [TRIVIA], serverNow: 10_000,
    members: [member({ id: 'p1', displayName: 'Misty', isHost: true }), member({ id: 'p2', displayName: 'Ash' }), member({ id: 'p3', displayName: 'Gary', role: 'SPECTATOR' })],
    gameSkipState: { gameInstanceId: '123e4567-e89b-42d3-a456-426614174000', voterIds: [], votes: 0, requiredVotes: 2, currentUserVoted: false, canVote: true },
    intro: { endsAt: 18_000, playerIds: ['p1', 'p2'], readyPlayerIds },
    ...overrides,
  });
}

const render = (room: RoomView, selfId: string) => renderToStaticMarkup(createElement(GameIntro, { room, selfId, onReady: vi.fn(async () => undefined) }));

describe('intro de partida', () => {
  it('muestra el nombre, las tres reglas, la cuenta atrás y «¡Listo!» con una sola región viva', () => {
    const html = render(intro([]), 'p2');
    expect(html).toContain('Pokémon Trivia');
    for (const rule of RULES) expect(html).toContain(rule);
    expect(html).toContain('Empieza en');
    expect(html).toContain('¡Listo!');
    expect(html).toContain('0/2 listos');
    expect(html).toContain('Partida 1 · Cómo se juega');
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html.match(/aria-live/g)).toHaveLength(1);
    expect(html).toContain('Empieza Pokémon Trivia. 0 de 2 jugadores listos.');
  });

  it('quien ya pulsó ve su «Listo» deshabilitado y el recuento sube', () => {
    const html = render(intro(['p2']), 'p2');
    expect(html).toContain('1/2 listos');
    expect(html).toContain('Esperando al resto…');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*Listo<\/span>/);
  });

  it('el espectador la ve sin botón: no cuenta', () => {
    const html = render(intro(['p1']), 'p3');
    expect(html).toContain('Miras como espectador');
    expect(html).toContain('Espectador');
    expect(html).not.toContain('¡Listo!</span></button>');
    // Solo los jugadores de la partida salen en la lista.
    expect(html).not.toContain('Gary');
  });

  it('el reto diario también tiene intro, con su antetítulo', () => {
    const html = render(intro([], { daily: { gameId: 'higher-lower', date: '2026-11-11', roundCount: 5, result: null }, availableGames: [{ ...TRIVIA, id: 'higher-lower' }] }), 'p1');
    expect(html).toContain('Reto diario · Cómo se juega');
  });

  it('estado, título y anuncio a partir de la proyección', () => {
    expect(introStatus(intro(['p1']), 'p2')).toEqual({ counts: true, ready: false, readyCount: 1, total: 2 });
    expect(introStatus(intro(['p1']), 'p3').counts).toBe(false);
    expect(introActionTitle({ counts: true, ready: true, readyCount: 2, total: 2 })).toBe('¡Empieza!');
    expect(introActionTitle({ counts: true, ready: false, readyCount: 0, total: 2 })).toBe('¿Listo para jugar?');
    expect(introAnnouncement('Shiny Quiz', { counts: true, ready: true, readyCount: 1, total: 1 })).toBe('Empieza Shiny Quiz. 1 de 1 jugador listo.');
    expect(activeGameManifest(intro([]))?.howTo).toEqual(RULES);
  });
});

describe('«Cómo se juega»', () => {
  it('solo en las fases de una partida en juego (en la intro las reglas ya se ven)', () => {
    expect(gameHelpRules({ ...intro([]), phase: 'ROUND_ACTIVE' })).toEqual({ name: 'Pokémon Trivia', rules: RULES });
    for (const phase of ['LOBBY', 'GAME_INTRO', 'GAME_RESULTS', 'NEXT_GAME_VOTE', 'SESSION_RESULTS'] as const) {
      expect(gameHelpRules({ ...intro([]), phase })).toBeNull();
    }
    expect(gameHelpRules({ ...intro([]), phase: 'ROUND_ACTIVE', availableGames: [] })).toBeNull();
  });

  it('la píldora «?» tiene nombre accesible y el diálogo lleva las tres reglas', () => {
    const html = renderToStaticMarkup(createElement(GameHelpButton, { room: { ...intro([]), phase: 'ROUND_ACTIVE' } }));
    expect(html).toContain('aria-label="Cómo se juega"');
    // Sin reglas no hay píldora; el diálogo (cerrado) sigue montado para la tecla «?» si la pantalla tiene atajos.
    expect(renderToStaticMarkup(createElement(GameHelpButton, { room: intro([]) }))).not.toContain('Cómo se juega');
  });

  it('el diálogo lleva «Reglas» si las hay y «Atajos de teclado» si la pantalla tiene alguno', () => {
    const atajos = [{ keys: ['1'], label: 'Mayor' }];
    expect(gameHelpSections(RULES, atajos).map((section) => section.title)).toEqual(['Reglas', 'Atajos de teclado']);
    expect(gameHelpSections(RULES, []).map((section) => section.title)).toEqual(['Reglas']);
    expect(gameHelpSections(null, atajos).map((section) => section.title)).toEqual(['Atajos de teclado']);
    expect(gameHelpSections(null, [])).toEqual([]);
  });
});

import type { GameSkipStateView, RoomView } from '@pokemon-universe/shared';
import { createElement, type PropsWithChildren } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { RoomPlate, roomPlateHeading } from './RoomPlate';
import { RoomNotice } from './RoomNotice';
import { ConnectionNoticeRegion, RoomSessionLayout } from './RoomSessionLayout';
import { GameSkipSlot } from './GameSkipSlot';

const context = vi.hoisted(() => ({ room: null as RoomView | null, connected: true as boolean, error: null as string | null, clearError: vi.fn(), setGameSkipVote: vi.fn(), leaveRoom: vi.fn(), holdRoomSession: vi.fn(() => () => undefined) }));
vi.mock('./RoomContext', () => ({ useRoom: () => context, RoomProvider: ({ children }: PropsWithChildren) => children }));
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'self' } }) }));

const skip: GameSkipStateView = { gameInstanceId: '123e4567-e89b-42d3-a456-426614174000', voterIds: [], votes: 0, requiredVotes: 4, currentUserVoted: false, canVote: true };
function render(gameId: string, phase: RoomView['phase'], state: GameSkipStateView | null) {
  context.room = { code: 'ABC234', selectedGameId: gameId, phase, game: { gameId }, gameSkipState: state } as RoomView;
  return renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(RoomSessionLayout)));
}

describe('global room actions', () => {
  it.each(['future-minigame', 'another-future-minigame'])('renders exactly one skip control for %s', (gameId) => {
    expect(render(gameId, 'ROUND_ACTIVE', skip).match(/aria-label="Votar para saltar el minijuego"/g)).toHaveLength(1);
  });

  it('keeps the control during an internal reveal and restores its authoritative own vote', () => {
    const markup = render('future-minigame', 'ROUND_RESULTS', { ...skip, voterIds: ['self'], votes: 1, currentUserVoted: true });
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('Cancelar voto');
    expect(markup).toContain('1/4');
  });

  it.each(['pokedex-distance', 'shiny-vote', 'pokemon-impostor', 'higher-lower', 'type-duel', 'learnset-guess', 'whos-that-pokemon', 'zoomed-pokemon', 'pokemon-palette-guess', 'pokemon-cry-quiz', 'pokedex-entry-guess', 'guess-from-stats', 'pokeddle-race', 'type-chain', 'pokemon-trivia', 'tcg-higher-lower', 'pokemon-connections', 'pokemon-bingo', 'most-likely-to', 'pokemon-red-flag', 'would-you-rather', 'one-of-us-is-fake', 'secret-ranking', 'poke-taboo', 'sketchmon', 'pokemon-team-auction', 'pokemon-bluff-auction', 'who-is-who-pokemon', 'absurd-pokedex', 'unown-translator'])('%s pinta «Saltar minijuego» dentro de su pantalla, no en el armazón', (gameId) => {
    expect(render(gameId, 'ROUND_ACTIVE', skip)).not.toContain('Votar para saltar el minijuego');
  });

  it('no pinta «Saltar minijuego» en el reto diario, aunque la sala lleve el estado de salto (de él sale el id de la partida)', () => {
    const dailyView = { gameId: 'higher-lower', date: '2026-11-07', roundCount: 10, result: null };
    expect(render('future-minigame', 'ROUND_ACTIVE', skip)).toContain('Votar para saltar el minijuego');
    context.room = { ...context.room, daily: dailyView } as RoomView;
    expect(renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(RoomSessionLayout)))).not.toContain('Votar para saltar el minijuego');
    render('higher-lower', 'ROUND_ACTIVE', skip);
    expect(renderToStaticMarkup(createElement(GameSkipSlot))).toContain('Votar para saltar el minijuego');
    context.room = { ...context.room, daily: dailyView } as RoomView;
    expect(renderToStaticMarkup(createElement(GameSkipSlot))).toBe('');
  });

  it.each(['LOBBY', 'GAME_RESULTS', 'SESSION_RESULTS', 'NEXT_GAME_VOTE'] as const)('has no skip control in %s', (phase) => {
    expect(render('higher-lower', phase, null)).not.toContain('Saltar minijuego');
  });
});

describe('room plate', () => {
  it('no longer renders the floating «Reportar problema» link', () => {
    expect(render('higher-lower', 'LOBBY', null)).not.toContain('Reportar problema');
    expect(render('higher-lower', 'ROUND_ACTIVE', skip)).not.toContain('Reportar problema');
  });

  it('shows the code with its copy button and an accessible «Salir de la sala»', () => {
    const room = { code: 'ABC234', selectedGameId: 'higher-lower', phase: 'LOBBY', game: null, availableGames: [] } as unknown as RoomView;
    const markup = renderToStaticMarkup(createElement(RoomPlate, { room, onLeave: vi.fn() }));
    expect(markup).toContain('aria-label="Copiar código de sala ABC234"');
    expect(markup).toContain('Lobby de la sala');
    expect(markup).toContain('Prepara la partida');
    expect(markup.match(/aria-label="Salir de la sala"/g)).toHaveLength(2);
    expect(markup).not.toContain('<h1');
  });

  it('names the current game during a match', () => {
    const room = { phase: 'ROUND_ACTIVE', selectedGameId: 'higher-lower', game: { gameId: 'higher-lower' }, availableGames: [{ id: 'higher-lower', name: 'Más o menos' }] } as unknown as RoomView;
    expect(roomPlateHeading(room)).toEqual({ kicker: 'Sala', title: 'Más o menos' });
  });

  it('adds the mode to the title when the running game is not Classic', () => {
    const base = { phase: 'GAME_STARTING', selectedGameId: 'pokedex-distance', availableGames: [{ id: 'pokedex-distance', name: 'Pokédex Distance' }, { id: 'pokemon-impostor', name: 'Pokémon Impostor' }] };
    const fromState = { ...base, game: { gameId: 'pokedex-distance', mode: 'POINTS' }, selectedGameConfig: { mode: 'CLASSIC' } } as unknown as RoomView;
    expect(roomPlateHeading(fromState).title).toBe('Pokédex Distance · Por puntos');
    // Un estado sin `mode` (de antes del modo): el título lo toma de la configuración elegida. Prueba pura de `roomPlateHeading`.
    const fromConfig = { ...base, selectedGameId: 'type-duel', game: { gameId: 'type-duel' }, availableGames: [{ id: 'type-duel', name: 'Type Duel' }], selectedGameConfig: { mode: 'COOP' } } as unknown as RoomView;
    expect(roomPlateHeading(fromConfig).title).toBe('Type Duel · Cooperativo');
    const classic = { ...base, game: { gameId: 'pokedex-distance', mode: 'CLASSIC' }, selectedGameConfig: { mode: 'POINTS' } } as unknown as RoomView;
    expect(roomPlateHeading(classic).title).toBe('Pokédex Distance');
    const noModes = { ...base, selectedGameId: 'type-chain', game: { gameId: 'type-chain' }, availableGames: [{ id: 'type-chain', name: 'Type Chain' }], selectedGameConfig: { mode: 'POINTS' } } as unknown as RoomView;
    expect(roomPlateHeading(noModes).title).toBe('Type Chain');
  });
});

describe('daily room plate', () => {
  const daily = { gameId: 'pokedex-distance', date: '2026-11-07', roundCount: 5, result: null };
  const room = (phase: RoomView['phase']) => ({ code: 'DAILY1', phase, selectedGameId: 'pokedex-distance', selectedGameConfig: { mode: 'POINTS' }, game: { gameId: 'pokedex-distance', mode: 'POINTS' }, availableGames: [{ id: 'pokedex-distance', name: 'Pokédex Distance' }], daily } as unknown as RoomView);

  it.each(['ROUND_ACTIVE', 'GAME_RESULTS'] as const)('lleva «Reto diario», el juego y su modo en %s', (phase) => {
    expect(roomPlateHeading(room(phase))).toEqual({ kicker: 'Reto diario', title: 'Pokédex Distance · Por puntos' });
  });

  it('no enseña el código ni su botón de copiar, pero sí «Salir»', () => {
    const markup = renderToStaticMarkup(createElement(RoomPlate, { room: room('ROUND_ACTIVE'), onLeave: vi.fn() }));
    expect(markup).not.toContain('DAILY1');
    expect(markup).not.toContain('Copiar código');
    expect(markup).not.toContain('aria-live');
    expect(markup.match(/aria-label="Salir de la sala"/g)).toHaveLength(2);
  });
});

describe('room connection notice', () => {
  it('renders nothing on the first paint while still connecting (the notice waits for its delay)', () => {
    context.connected = false;
    try {
      const markup = render('higher-lower', 'LOBBY', null);
      expect(markup).toMatch(/<div class="connection-notice-region [^"]*" role="status" aria-live="polite" data-layer="notice"><\/div>/);
      expect(markup).not.toContain('Conectando con la sala');
    } finally { context.connected = true; }
  });

  it('renders the connecting and lost notices as a floating card, with a spinner only while connecting', () => {
    const connecting = renderToStaticMarkup(createElement(ConnectionNoticeRegion, { kind: 'connecting' }));
    expect(connecting).toMatch(/class="connection-notice [^"]*card/);
    expect(connecting).toContain('spinner');
    expect(connecting).toContain('Conectando con la sala');
    expect(connecting).not.toMatch(/\bfixed\b/);
    const lost = renderToStaticMarkup(createElement(ConnectionNoticeRegion, { kind: 'lost' }));
    expect(lost).toContain('Conexión perdida');
    expect(lost).toContain('Reconectando… Tu sesión sigue guardada.');
    expect(lost).not.toContain('<button');
    expect(lost).not.toContain('spinner');
  });

  it('keeps an empty status region while connected', () => {
    const markup = render('higher-lower', 'LOBBY', null);
    expect(markup).toMatch(/<div class="connection-notice-region [^"]*" role="status" aria-live="polite" data-layer="notice"><\/div>/);
  });
});

describe('room error toast', () => {
  it('shows the (already translated) room error once, as a catalogue toast with a 44 px close button', () => {
    context.error = 'Este ajuste solo se puede cambiar en el lobby.';
    try {
      const markup = renderToStaticMarkup(createElement(RoomNotice));
      expect(markup.match(/role="alert"/g)).toHaveLength(1);
      expect(markup).toContain('Este ajuste solo se puede cambiar en el lobby.');
      expect(markup).toContain('aria-label="Cerrar aviso"');
      expect(markup).not.toContain('bg-berry');
    } finally { context.error = null; }
  });

  it('renders no alert without an error', () => {
    expect(renderToStaticMarkup(createElement(RoomNotice))).toBe('');
  });

  it('the room session no longer renders it: `Layout` owns it on every page (one owner)', () => {
    context.error = 'Este ajuste solo se puede cambiar en el lobby.';
    try { expect(render('higher-lower', 'LOBBY', null)).not.toContain('role="alert"'); } finally { context.error = null; }
  });
});

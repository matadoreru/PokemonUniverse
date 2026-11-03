import type { GameSkipStateView, RoomView } from '@pokemon-universe/shared';
import { createElement, type PropsWithChildren } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ConnectionNoticeRegion, RoomSessionLayout } from './RoomSessionLayout';

const context = vi.hoisted(() => ({ room: null as RoomView | null, connected: true as boolean, error: null, clearError: vi.fn(), setGameSkipVote: vi.fn() }));
vi.mock('./RoomContext', () => ({ useRoom: () => context, RoomProvider: ({ children }: PropsWithChildren) => children }));

const skip: GameSkipStateView = { gameInstanceId: '123e4567-e89b-42d3-a456-426614174000', voterIds: [], votes: 0, requiredVotes: 4, currentUserVoted: false, canVote: true };
function render(gameId: string, phase: RoomView['phase'], state: GameSkipStateView | null) {
  context.room = { code: 'ABC234', selectedGameId: gameId, phase, game: { gameId }, gameSkipState: state } as RoomView;
  return renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(RoomSessionLayout)));
}

describe('global room actions', () => {
  it.each(['shiny-vote', 'higher-lower', 'future-minigame'])('renders exactly one skip control for %s', (gameId) => {
    expect(render(gameId, 'ROUND_ACTIVE', skip).match(/aria-label="Votar para saltar el minijuego"/g)).toHaveLength(1);
  });

  it('keeps the control during an internal reveal and restores its authoritative own vote', () => {
    const markup = render('shiny-vote', 'ROUND_RESULTS', { ...skip, voterIds: ['self'], votes: 1, currentUserVoted: true });
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('Cancelar voto');
    expect(markup).toContain('1/4');
  });

  it.each(['LOBBY', 'GAME_RESULTS', 'SESSION_RESULTS', 'NEXT_GAME_VOTE'] as const)('has no skip control in %s', (phase) => {
    expect(render('higher-lower', phase, null)).not.toContain('Saltar minijuego');
  });
});

describe('room connection notice', () => {
  it('renders nothing on the first paint while still connecting (the notice waits for its delay)', () => {
    context.connected = false;
    try {
      const markup = render('higher-lower', 'LOBBY', null);
      expect(markup).toContain('<div class="connection-notice-region" role="status" aria-live="polite"></div>');
      expect(markup).not.toContain('Conectando con la sala');
    } finally { context.connected = true; }
  });

  it('renders the connecting and lost notices in the flow, never as a fixed overlay', () => {
    const connecting = renderToStaticMarkup(createElement(ConnectionNoticeRegion, { kind: 'connecting' }));
    expect(connecting).toContain('class="connection-notice"');
    expect(connecting).toContain('Conectando con la sala');
    expect(connecting).not.toMatch(/\bfixed\b/);
    const lost = renderToStaticMarkup(createElement(ConnectionNoticeRegion, { kind: 'lost' }));
    expect(lost).toContain('Conexión perdida');
    expect(lost).toContain('Reconectando… Tu sesión sigue guardada.');
    expect(lost).not.toContain('<button');
  });

  it('keeps an empty status region while connected', () => {
    const markup = render('higher-lower', 'LOBBY', null);
    expect(markup).toContain('<div class="connection-notice-region" role="status" aria-live="polite"></div>');
  });
});

import type { GameSkipStateView, RoomView } from '@pokemon-universe/shared';
import { createElement, type PropsWithChildren } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ConnectionNotice, RoomSessionLayout } from './RoomSessionLayout';

const context = vi.hoisted(() => ({ room: null as RoomView | null, connected: true as boolean, error: null, clearError: vi.fn(), reconnect: vi.fn(), setGameSkipVote: vi.fn() }));
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
  it('renders the connecting notice in the flow, never as a fixed overlay', () => {
    context.connected = false;
    try {
      const markup = render('higher-lower', 'LOBBY', null);
      expect(markup).toContain('role="status"');
      expect(markup).toContain('Conectando con la sala');
      expect(markup).toContain('class="connection-notice"');
      expect(markup).not.toMatch(/class="[^"]*\bfixed\b[^"]*"[^>]*role="status"/);
    } finally { context.connected = true; }
  });

  it('offers an immediate retry only after a lost connection', () => {
    const lost = renderToStaticMarkup(createElement(ConnectionNotice, { connected: false, wasConnected: true, onReconnect: vi.fn() }));
    expect(lost).toContain('Conexión perdida');
    expect(lost).toMatch(/<button type="button" class="btn-ghost[^"]*"[^>]*>.*Reintentar ahora<\/button>/);
    const connecting = renderToStaticMarkup(createElement(ConnectionNotice, { connected: false, wasConnected: false, onReconnect: vi.fn() }));
    expect(connecting).not.toContain('Reintentar ahora');
  });

  it('keeps an empty status region while connected', () => {
    const markup = render('higher-lower', 'LOBBY', null);
    expect(markup).toContain('<div class="connection-notice-region" role="status" aria-live="polite"></div>');
  });
});

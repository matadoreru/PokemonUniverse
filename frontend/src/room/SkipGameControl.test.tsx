import type { GameSkipStateView } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SkipGameControl } from './SkipGameControl';

const state: GameSkipStateView = {
  gameInstanceId: '123e4567-e89b-42d3-a456-426614174000',
  voterIds: ['p2', 'p3'],
  votes: 2,
  requiredVotes: 4,
  currentUserVoted: false,
  canVote: true,
};

describe('SkipGameControl', () => {
  it('shows the live consensus count and an unpressed accessible action', () => {
    const markup = renderToStaticMarkup(createElement(SkipGameControl, { state, connected: true, onSetVote: vi.fn() }));
    expect(markup).toContain('Saltar minijuego');
    expect(markup).toContain('2/4');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain('aria-label="Votar para saltar el minijuego"');
  });

  it('communicates a reversible registered vote without relying on color', () => {
    const markup = renderToStaticMarkup(createElement(SkipGameControl, { state: { ...state, currentUserVoted: true, voterIds: ['p1', 'p2', 'p3'], votes: 3 }, connected: true, onSetVote: vi.fn() }));
    expect(markup).toContain('Cancelar voto');
    expect(markup).toContain('Tu voto está registrado');
    expect(markup).toContain('3/4');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-label="Retirar voto para saltar el minijuego"');
  });

  it('keeps the consensus visible but disables voting for spectators', () => {
    const markup = renderToStaticMarkup(createElement(SkipGameControl, { state: { ...state, canVote: false }, connected: true, onSetVote: vi.fn() }));
    expect(markup).toContain('2/4');
    expect(markup).toContain('disabled=""');
  });
});

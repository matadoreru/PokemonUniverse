import type { GameIntroView, RoomMemberView, RoomView } from '@pokemon-universe/shared/public';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GameIntro } from './GameIntro';

const intro: GameIntroView = { gameInstanceId: '6f1c1f2e-3f4b-4c55-8a9b-0c1d2e3f4a5b', endsAt: Date.now() + 10_000, skippedIds: ['p2'] };

function member(id: string, role: RoomMemberView['role'] = 'PLAYER'): RoomMemberView {
  return { id, displayName: id, avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: id === 'p1' ? 'HOST' : 'MEMBER', role, isHost: id === 'p1', ready: false, sessionPoints: 0 };
}

function room(): RoomView {
  return {
    code: 'ABC234', phase: 'GAME_STARTING', hostId: 'p1', maxPlayers: 8,
    availableGames: [{ id: 'learnset-guess', name: 'Learnset Guess', icon: '📘', description: 'Adivina por sus movimientos.', minPlayers: 2, profileStats: { metrics: [] } }],
    selectedGameId: 'learnset-guess', selectedGameConfig: {}, sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'FIXED' },
    nextGameVote: null, gamesPlayed: 0, sessionStandings: [], sessionHistory: [], gameIntro: intro,
    game: { gameId: 'learnset-guess', phase: 'GAME_STARTING' }, gamePlayerState: null, serverNow: Date.now(),
    members: [member('p1'), member('p2'), member('p3'), member('watcher', 'SPECTATOR')],
  };
}

const render = (selfId: string) => renderToStaticMarkup(createElement(GameIntro, { room: room(), intro, selfId, onSkip: async () => undefined }));

describe('GameIntro', () => {
  it('shows the cut-in, the steps of the game, the countdown and who is ready', () => {
    const markup = render('p1');
    expect(markup).toContain('aria-label="Intro de Learnset Guess"');
    expect(markup).toContain('¡Empieza la partida!');
    expect(markup).toContain('Cómo se juega a Learnset Guess');
    expect(markup).toContain('Paso 1 de 3');
    expect(markup).toContain('role="timer"');
    expect(markup).toContain('1 de 3 listos');
    expect(markup).toMatch(/<button type="button" class="[^"]*"[^>]*>(?:(?!<\/button>).)*Empezar ya<\/span><\/button>/);
    // Sin estilos heredados: la acción es una píldora del catálogo en la franja de abajo, tras la navegación de pasos.
    expect(markup).not.toMatch(/btn-|class="card/);
    expect(markup.indexOf('Ver paso 1')).toBeLessThan(markup.indexOf('Empezar ya'));
    expect(markup).toContain('data-layer="screen-bottom"');
  });

  it('falls back to a panel with the name when the game has no steps', () => {
    const markup = renderToStaticMarkup(createElement(GameIntro, { room: { ...room(), selectedGameId: 'unknown', game: { gameId: 'unknown' }, availableGames: [{ ...room().availableGames[0]!, id: 'unknown', name: 'Juego raro' }] }, intro, selfId: 'p1', onSkip: async () => undefined }));
    expect(markup).toContain('Juego raro');
    expect(markup).toContain('Prepárate: la partida empieza enseguida.');
    expect(markup).not.toContain('Paso 1 de 3');
  });

  it('waits for the others once the player has skipped', () => {
    const markup = render('p2');
    expect(markup).toContain('Esperando al resto');
    expect(markup).not.toMatch(/>Empezar ya</);
  });

  it('gives spectators no skip button', () => {
    const markup = render('watcher');
    expect(markup).not.toContain('Empezar ya');
    expect(markup).toContain('Empieza cuando los jugadores estén listos.');
  });
});

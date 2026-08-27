import type { RoomView, SketchmonPlayerState, SketchmonPublicState } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SketchmonGame } from './SketchmonGame';

function publicGame(): SketchmonPublicState {
  return {
    gameId: 'sketchmon', phase: 'ROUND_ACTIVE', roundNumber: 1, totalRounds: 3, lapNumber: 1, totalLaps: 1,
    drawerId: 'p1', nextDrawerId: 'p2', drawerOrder: ['p1', 'p2', 'p3'],
    strokes: [{ id: 'line_1', tool: 'PENCIL', color: '#182033', width: 8, points: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.5 }] }],
    visibleHints: [{ kind: 'GENERATION', generation: 4 }],
    attempts: [{ playerId: 'p3', guessedPokemon: { id: 'gengar', name: 'Gengar', sprite: '/gengar.png' }, attemptedAt: 2_000 }],
    scores: { p1: 0, p2: 0, p3: 0 }, roundStartedAt: 1_000, roundEndsAt: 91_000,
    nextTransitionAt: 31_000, lastRound: null, gallery: [], results: null,
  };
}

function room(player: SketchmonPlayerState): RoomView {
  return {
    code: 'ABC234', phase: 'ROUND_ACTIVE', hostId: 'p1', maxPlayers: 8,
    members: [
      { id: 'p1', displayName: 'Ana', avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: 'HOST', role: 'PLAYER', isHost: true, ready: false, sessionPoints: 0 },
      { id: 'p2', displayName: 'Pedro', avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: 'MEMBER', role: 'PLAYER', isHost: false, ready: false, sessionPoints: 0 },
      { id: 'p3', displayName: 'Carlos', avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: 'MEMBER', role: 'PLAYER', isHost: false, ready: false, sessionPoints: 0 },
    ],
    availableGames: [{ id: 'sketchmon', name: 'Sketchmon', icon: '🎨', description: 'Dibuja', minPlayers: 2, profileStats: { metrics: [] } }],
    selectedGameId: 'sketchmon', selectedGameConfig: { generations: [1, 4], roundSeconds: 90, laps: 1, hintsEnabled: true, memoryPreviewEnabled: false, includeForms: false },
    sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'FIXED' }, nextGameVote: null, gamesPlayed: 0,
    sessionStandings: [], sessionHistory: [], game: publicGame(), gamePlayerState: player, serverNow: 1_000,
  };
}

describe('Sketchmon role presentation', () => {
  it('shows the secret and drawing tools only to the drawer', () => {
    const markup = renderToStaticMarkup(createElement(SketchmonGame, { room: room({ role: 'DRAWER', canDraw: true, secretPokemon: {
      name: 'Lucario', sprite: '/lucario.png', previewEndsAt: null, types: ['fighting', 'steel'],
    } }), selfId: 'p1', onAction: async () => undefined }));
    expect(markup).toContain('SOLO TÚ PUEDES VER ESTO'); expect(markup).toContain('Lucario');
    expect(markup).toContain('Lápiz'); expect(markup).toContain('Limpiar lienzo');
    expect(markup).not.toContain('Buscar respuesta para el dibujo');
  });

  it('gives guessers the live canvas, public attempts and search without leaking the secret', () => {
    const markup = renderToStaticMarkup(createElement(SketchmonGame, { room: room({ role: 'GUESSER', canGuess: true, cooldownUntil: null, attemptCount: 0 }), selfId: 'p2', onAction: async () => undefined }));
    expect(markup).toContain('Ana está dibujando'); expect(markup).toContain('Dibujo en directo de Ana');
    expect(markup).toContain('Generación 4'); expect(markup).toContain('Gengar'); expect(markup).toContain('Buscar Pokémon');
    expect(markup).not.toContain('SOLO TÚ PUEDES VER ESTO'); expect(markup).not.toContain('Lucario');
  });

  it('lets spectators watch without drawing or guessing controls', () => {
    const markup = renderToStaticMarkup(createElement(SketchmonGame, { room: room({ role: 'SPECTATOR' }), selfId: 'p3', onAction: async () => undefined }));
    expect(markup).toContain('Estás observando esta ronda'); expect(markup).toContain('Dibujo en directo de Ana');
    expect(markup).not.toContain('Limpiar lienzo'); expect(markup).not.toContain('Buscar respuesta para el dibujo');
  });
});

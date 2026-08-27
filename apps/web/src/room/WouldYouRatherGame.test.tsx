import { defaultWouldYouRatherConfig, type RoomView, type WouldYouRatherPlayerState, type WouldYouRatherPublicState } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WouldYouRatherGame } from './WouldYouRatherGame';
import { WouldYouRatherResults } from './WouldYouRatherResults';

function publicGame(phase: 'ROUND_ACTIVE' | 'ROUND_RESULTS' | 'GAME_RESULTS' = 'ROUND_ACTIVE'): WouldYouRatherPublicState {
  const lastRound = phase === 'ROUND_ACTIVE' ? null : {
    prompt: { optionA: 'Vivir con Gengar', optionB: 'Viajar con Magikarp' }, totals: { A: 2, B: 1 }, majority: 'A' as const,
    players: [
      { playerId: 'p1', preference: 'A' as const, prediction: 'A' as const, majorityPoint: 1, predictionPoints: 2, totalPoints: 3 },
      { playerId: 'p2', preference: 'A' as const, prediction: 'B' as const, majorityPoint: 1, predictionPoints: 0, totalPoints: 1 },
      { playerId: 'p3', preference: 'B' as const, prediction: 'A' as const, majorityPoint: 0, predictionPoints: 2, totalPoints: 2 },
    ], missingPlayerIds: [],
  };
  return {
    gameId: 'would-you-rather', phase, roundNumber: 1, totalRounds: 5,
    prompt: { optionA: 'Vivir con Gengar', optionB: 'Viajar con Magikarp' }, playerIds: ['p1', 'p2', 'p3'], submittedPlayerIds: ['p1'],
    scores: { p1: 3, p2: 1, p3: 2 }, roundEndsAt: phase === 'ROUND_ACTIVE' ? 46_000 : null, nextTransitionAt: phase === 'ROUND_RESULTS' ? 9_000 : null, lastRound,
    results: phase === 'GAME_RESULTS' ? { winnerId: 'p1', standings: [
      { playerId: 'p1', position: 1, points: 3, won: true, stats: { roundsPlayed: 1, ballotsSubmitted: 1, roundsMissed: 0, majorityChoices: 1, correctPredictions: 1, perfectRounds: 1, pointsFromRounds: 3 } },
      { playerId: 'p3', position: 2, points: 2, won: false, stats: { roundsPlayed: 1, ballotsSubmitted: 1, roundsMissed: 0, majorityChoices: 0, correctPredictions: 1, perfectRounds: 0, pointsFromRounds: 2 } },
      { playerId: 'p2', position: 3, points: 1, won: false, stats: { roundsPlayed: 1, ballotsSubmitted: 1, roundsMissed: 0, majorityChoices: 1, correctPredictions: 0, perfectRounds: 0, pointsFromRounds: 1 } },
    ] } : null,
  };
}

function room(game: WouldYouRatherPublicState, player: WouldYouRatherPlayerState): RoomView {
  const members = ['Eru', 'Ana', 'Leo'].map((displayName, index) => ({ id: `p${index + 1}`, displayName, avatar: { type: 'DEFAULT' as const }, connected: true, presence: 'CONNECTED' as const, roomRole: index === 0 ? 'HOST' as const : 'MEMBER' as const, role: 'PLAYER' as const, isHost: index === 0, ready: false, sessionPoints: game.scores[`p${index + 1}`] ?? 0 }));
  return { code: 'ABC234', phase: game.phase, hostId: 'p1', maxPlayers: 8, availableGames: [{ id: 'would-you-rather', name: 'Would You Rather Pokémon', icon: '⚖️', description: 'Dilemas', minPlayers: 3, profileStats: { metrics: [] } }], selectedGameId: 'would-you-rather', selectedGameConfig: defaultWouldYouRatherConfig, sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'FIXED' }, nextGameVote: null, gamesPlayed: 0, sessionStandings: [], sessionHistory: [], serverNow: 1_000, game, gamePlayerState: player, members };
}

describe('Would You Rather client', () => {
  it('renders two independent secret decisions and public completion only', () => {
    const html = renderToStaticMarkup(createElement(WouldYouRatherGame, { room: room(publicGame(), { role: 'PLAYER', canSubmit: true, ownBallot: null }), selfId: 'p1', onAction: async () => undefined }));
    expect(html).toContain('¿Qué preferirías tú?'); expect(html).toContain('¿Cuál será la mayoría?'); expect(html).toContain('Mayoría A'); expect(html).toContain('Elección y predicción permanecen secretas');
  });

  it('restores only the owner ballot and reveals synchronized scoring afterwards', () => {
    const locked = renderToStaticMarkup(createElement(WouldYouRatherGame, { room: room(publicGame(), { role: 'PLAYER', canSubmit: false, ownBallot: { preference: 'A', prediction: 'B' } }), selfId: 'p1', onAction: async () => undefined }));
    expect(locked).toContain('Papeleta bloqueada'); expect(locked).toContain('predijiste');
    const reveal = renderToStaticMarkup(createElement(WouldYouRatherGame, { room: room(publicGame('ROUND_RESULTS'), { role: 'PLAYER', canSubmit: false, ownBallot: { preference: 'A', prediction: 'A' } }), selfId: 'p1', onAction: async () => undefined }));
    expect(reveal).toContain('La mayoría eligió A'); expect(reveal).toContain('Eligió'); expect(reveal).toContain('+3 pts');
  });

  it('renders final prediction statistics and host actions', () => {
    const html = renderToStaticMarkup(createElement(WouldYouRatherResults, { room: room(publicGame('GAME_RESULTS'), { role: 'SPECTATOR', canSubmit: false, ownBallot: null }), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(html).toContain('Quien mejor leyó la sala'); expect(html).toContain('1 predicciones'); expect(html).toContain('Continuar sesión');
  });
});

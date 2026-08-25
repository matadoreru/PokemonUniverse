import { defaultTypeChainConfig, type RoomView, type TypeChainPlayerState, type TypeChainPublicState } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PokemonTypeBadge } from '../components/PokemonTypeBadge';
import { TypeChainConfigPanel } from '../games/type-chain/ConfigPanel';
import { TypeChainGame } from './TypeChainGame';
import { TypeChainResults } from './TypeChainResults';

function publicGame(phase: 'TURN_ACTIVE' | 'GAME_RESULTS' = 'TURN_ACTIVE'): TypeChainPublicState {
  const charizard = { id: 'charizard', name: 'Charizard', sprite: '/charizard.png', types: ['fire', 'flying'] as const };
  const staraptor = { id: 'staraptor', name: 'Staraptor', sprite: '/staraptor.png', types: ['normal', 'flying'] as const };
  return {
    gameId: 'type-chain', phase, turnOrder: ['p1', 'p2', 'p3'], activePlayerIds: phase === 'TURN_ACTIVE' ? ['p1', 'p2'] : ['p1'], eliminatedPlayerIds: phase === 'TURN_ACTIVE' ? ['p3'] : ['p3', 'p2'], currentPlayerId: phase === 'TURN_ACTIVE' ? 'p1' : null, nextPlayerId: phase === 'TURN_ACTIVE' ? 'p2' : null,
    turnNumber: 4, chainNumber: 1, chain: [
      { pokemon: { ...charizard, types: [...charizard.types] }, playedBy: null, sharedType: null, turnNumber: 0 },
      { pokemon: { ...staraptor, types: [...staraptor.types] }, playedBy: 'p2', sharedType: 'flying', turnNumber: 3 },
    ], usedPokemonIds: ['charizard', 'staraptor'], longestChain: 7, turnStartedAt: 1_000, roundEndsAt: phase === 'TURN_ACTIVE' ? Date.now() + 15_000 : null,
    invalidAttempts: [{ playerId: 'p2', pokemon: { id: 'talonflame', name: 'Talonflame', sprite: '/talonflame.png', types: ['fire', 'flying'] }, reason: 'MULTIPLE_SHARED_TYPES', attemptedAt: 900 }],
    eliminations: [{ playerId: 'p3', reason: 'TIMEOUT', turnNumber: 2, eliminatedAt: 800, eliminationOrder: 1 }],
    events: [{ kind: 'SUCCESS', playerId: 'p2', from: { ...charizard, types: [...charizard.types] }, to: { ...staraptor, types: [...staraptor.types] }, sharedType: 'flying', at: 950 }],
    results: phase === 'GAME_RESULTS' ? { winnerId: 'p1', standings: [
      { playerId: 'p1', position: 1, points: 8, won: true, stats: { validSubmissions: 3, invalidAttempts: 1, turnsSurvived: 3, timeoutEliminations: 0, longestChain: 7 } },
      { playerId: 'p2', position: 2, points: 5, won: false, stats: { validSubmissions: 2, invalidAttempts: 2, turnsSurvived: 2, timeoutEliminations: 1, longestChain: 7 } },
      { playerId: 'p3', position: 3, points: 2, won: false, stats: { validSubmissions: 0, invalidAttempts: 1, turnsSurvived: 0, timeoutEliminations: 1, longestChain: 7 } },
    ] } : null,
  };
}

function room(game: TypeChainPublicState, player: TypeChainPlayerState): RoomView {
  return { code: 'ABC234', phase: game.phase, hostId: 'p1', maxPlayers: 8, availableGames: [], selectedGameId: 'type-chain', selectedGameConfig: defaultTypeChainConfig, sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'FIXED' }, nextGameVote: null, gamesPlayed: 0, sessionStandings: [], sessionHistory: [], serverNow: Date.now(), game, gamePlayerState: player, members: [
    { id: 'p1', displayName: 'Eru', avatar: { type: 'PRESET', value: 'trainer-berry' }, connected: true, presence: 'CONNECTED', roomRole: 'HOST', role: 'PLAYER', isHost: true, ready: false, sessionPoints: 8 },
    { id: 'p2', displayName: 'Ana', avatar: { type: 'PRESET', value: 'trainer-aqua' }, connected: true, presence: 'CONNECTED', roomRole: 'MEMBER', role: 'PLAYER', isHost: false, ready: false, sessionPoints: 5 },
    { id: 'p3', displayName: 'Marta', avatar: { type: 'DEFAULT' }, connected: false, presence: 'TEMPORARILY_DISCONNECTED', roomRole: 'MEMBER', role: 'SPECTATOR', isHost: false, ready: false, sessionPoints: 2 },
  ] };
}

describe('Type Chain client', () => {
  it('makes the current Pokémon, exact-one rule, chain link and public failures scannable', () => {
    const game = publicGame();
    const markup = renderToStaticMarkup(createElement(TypeChainGame, { room: room(game, { canSubmit: true, isCurrentPlayer: true, eliminated: false, cooldownUntil: null, lastAttempt: null }), selfId: 'p1', onAction: async () => undefined }));
    expect(markup).toContain('Pokémon actual'); expect(markup).toContain('Staraptor'); expect(markup).toContain('exactamente un tipo');
    expect(markup).toContain('↓</span>Volador'); expect(markup).toContain('Talonflame'); expect(markup).toContain('Comparte los dos tipos');
    expect(markup).toContain('Buscar Pokémon para continuar desde Staraptor'); expect(markup).toContain('Siguiente: Ana'); expect(markup).toContain('Marta'); expect(markup).toContain('Eliminado');
  });

  it('hides the search action outside the current turn and supports eliminated spectators', () => {
    const waiting = renderToStaticMarkup(createElement(TypeChainGame, { room: room(publicGame(), { canSubmit: false, isCurrentPlayer: false, eliminated: false, cooldownUntil: null, lastAttempt: null }), selfId: 'p2', onAction: async () => undefined }));
    expect(waiting).toContain('Esperando a Eru'); expect(waiting).not.toContain('Buscar Pokémon para continuar');
    const observing = renderToStaticMarkup(createElement(TypeChainGame, { room: room(publicGame(), { canSubmit: false, isCurrentPlayer: false, eliminated: true, cooldownUntil: null, lastAttempt: null }), selfId: 'p3', onAction: async () => undefined }));
    expect(observing).toContain('Observas la cadena'); expect(observing).not.toContain('Buscar Pokémon para continuar');
  });

  it('renders accessible type badges and non-slider configuration defaults', () => {
    const badge = renderToStaticMarkup(createElement(PokemonTypeBadge, { type: 'fire' }));
    expect(badge).toContain('Fuego'); expect(badge).toContain('aria-label="Tipo Fuego"');
    const config = renderToStaticMarkup(createElement(TypeChainConfigPanel, { config: defaultTypeChainConfig, disabled: false, onChange: async () => undefined }));
    expect(config).toContain('Tiempo por turno'); expect(config).toContain('15s'); expect(config).toContain('Exactamente un tipo compartido'); expect(config).not.toContain('type="range"');
  });

  it('shows survivor ranking, Type Chain stats, avatars and session continuation', () => {
    const game = publicGame('GAME_RESULTS');
    const markup = renderToStaticMarkup(createElement(TypeChainResults, { room: room(game, { canSubmit: false, isCurrentPlayer: false, eliminated: false, cooldownUntil: null, lastAttempt: null }), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(markup).toContain('Clasificación final'); expect(markup).toContain('Cadena más larga: 7'); expect(markup).toContain('3 válidos'); expect(markup).toContain('Continuar sesión'); expect(markup).toContain('Avatar de Eru');
  });
});

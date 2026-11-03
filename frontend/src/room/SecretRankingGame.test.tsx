import { defaultSecretRankingConfig, type RoomView, type SecretRankingPlayerState, type SecretRankingPokemon, type SecretRankingPublicState } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SecretRankingGame } from './SecretRankingGame';
import { SecretRankingResults } from './SecretRankingResults';

const pokemon: SecretRankingPokemon[] = ['Pikachu', 'Eevee', 'Snorlax', 'Gengar', 'Psyduck'].map((name) => ({ id: name.toLowerCase(), name, sprite: `/${name.toLowerCase()}.png` }));

function publicGame(phase: 'ROUND_ACTIVE' | 'ROUND_RESULTS' | 'GAME_RESULTS' = 'ROUND_ACTIVE'): SecretRankingPublicState {
  const players = {
    p1: { ranking: pokemon, distance: 2, position: 1, pointsAwarded: 6 },
    p2: { ranking: [...pokemon].reverse(), distance: 8, position: 2, pointsAwarded: 3 },
    p3: { ranking: null, distance: null, position: null, pointsAwarded: 0 },
  };
  const lastRound = phase === 'ROUND_ACTIVE' ? null : { prompt: 'De más adorable a menos adorable', pokemon, consensus: pokemon.map((entry, index) => ({ pokemon: entry, averagePosition: index + 1.25 })), players };
  return {
    gameId: 'secret-ranking', phase, roundNumber: 1, totalRounds: 3, prompt: 'De más adorable a menos adorable', pokemon,
    submittedPlayerIds: ['p1'], scores: { p1: 6, p2: 3, p3: 0 }, roundEndsAt: phase === 'ROUND_ACTIVE' ? 46_000 : null,
    nextTransitionAt: phase === 'ROUND_RESULTS' ? 54_000 : null, lastRound,
    results: phase === 'GAME_RESULTS' ? { winnerId: 'p1', standings: [
      { playerId: 'p1', position: 1, points: 6, won: true, stats: { roundsPlayed: 1, rankingsSubmitted: 1, roundsMissed: 0, roundWins: 1, perfectMatches: 0, distanceTotal: 2, pointsFromRounds: 6 } },
      { playerId: 'p2', position: 2, points: 3, won: false, stats: { roundsPlayed: 1, rankingsSubmitted: 1, roundsMissed: 0, roundWins: 0, perfectMatches: 0, distanceTotal: 8, pointsFromRounds: 3 } },
      { playerId: 'p3', position: 3, points: 0, won: false, stats: { roundsPlayed: 1, rankingsSubmitted: 0, roundsMissed: 1, roundWins: 0, perfectMatches: 0, distanceTotal: 0, pointsFromRounds: 0 } },
    ] } : null,
  };
}

function room(game: SecretRankingPublicState, player: SecretRankingPlayerState): RoomView {
  const members = ['Eru', 'Ana', 'Leo'].map((displayName, index) => ({ id: `p${index + 1}`, displayName, avatar: { type: 'DEFAULT' as const }, connected: true, presence: 'CONNECTED' as const, roomRole: index === 0 ? 'HOST' as const : 'MEMBER' as const, role: 'PLAYER' as const, isHost: index === 0, ready: false, sessionPoints: game.scores[`p${index + 1}`] ?? 0 }));
  return { code: 'ABC234', phase: game.phase, hostId: 'p1', maxPlayers: 8, availableGames: [{ id: 'secret-ranking', name: 'Secret Ranking', icon: '📋', description: 'Ranking', minPlayers: 3, profileStats: { metrics: [] } }], selectedGameId: 'secret-ranking', selectedGameConfig: defaultSecretRankingConfig, sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'FIXED' }, nextGameVote: null, gamesPlayed: 0, sessionStandings: [], sessionHistory: [], serverNow: 1_000, game, gamePlayerState: player, members };
}

describe('Secret Ranking client', () => {
  it('renders an accessible five-item ordering and keeps other rankings hidden while active', () => {
    const html = renderToStaticMarkup(createElement(SecretRankingGame, { room: room(publicGame(), { role: 'PLAYER', canSubmit: true, ownRanking: null }), selfId: 'p1', onAction: async () => undefined }));
    expect(html).toContain('De más adorable a menos adorable');
    expect(html).toContain('Bloquear ranking');
    expect(html).toContain('Subir Eevee');
    expect(html).toContain('Bajar Pikachu');
    expect(html).toContain('Solo se muestra quién ha terminado');
    expect(html).toContain('h-20 w-20');
    expect(html).not.toContain('Distancia 8');
  });

  it('restores the owner ranking after submission without showing edit controls', () => {
    const html = renderToStaticMarkup(createElement(SecretRankingGame, { room: room(publicGame(), { role: 'PLAYER', canSubmit: false, ownRanking: [...pokemon].reverse() }), selfId: 'p1', onAction: async () => undefined }));
    expect(html).toContain('Ranking bloqueado');
    expect(html).not.toContain('Bloquear ranking');
    expect(html).not.toContain('Subir Eevee');
  });

  it('reveals consensus, distances, missing answers and every submitted ranking', () => {
    const html = renderToStaticMarkup(createElement(SecretRankingGame, { room: room(publicGame('ROUND_RESULTS'), { role: 'PLAYER', canSubmit: false, ownRanking: pokemon }), selfId: 'p1', onAction: async () => undefined }));
    expect(html).toContain('Ranking promedio del grupo');
    expect(html).toContain('Distancia 2.00');
    expect(html).toContain('Sin ranking');
    expect(html).toContain('Ver todos los rankings revelados');
  });

  it('renders integrated final results and host continuation actions', () => {
    const html = renderToStaticMarkup(createElement(SecretRankingResults, { room: room(publicGame('GAME_RESULTS'), { role: 'SPECTATOR', canSubmit: false, ownRanking: null }), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(html).toContain('La mente más sincronizada');
    expect(html).toContain('distancia media 2.00');
    expect(html).toContain('Continuar sesión');
  });
});

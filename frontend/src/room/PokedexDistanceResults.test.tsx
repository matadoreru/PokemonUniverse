import { defaultPokedexDistanceConfig, type DistanceRoundRecord, type GameResults, type PokedexDistancePublicState, type RoomView } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PokedexDistanceResults } from './PokedexDistanceResults';

const stats = (exactHits: number, tiebreaksWon: number) => ({ exactHits, roundsSurvived: 1, selections: 2, averageDistance: 4.5, tiebreaksWon });

function room(roundHistory: DistanceRoundRecord[], results: GameResults, extra: Partial<PokedexDistancePublicState> = {}): RoomView {
  const game: PokedexDistancePublicState = {
    gameId: 'pokedex-distance', phase: 'GAME_RESULTS', mode: 'CLASSIC', roundNumber: 2, tiebreakDepth: 0, targetDexNumber: 100, eligibleIds: [],
    survivorIds: results.winnerId ? [results.winnerId] : [], spectatorIds: [], selections: {}, selectedIds: [], lockedPokemonIds: [],
    roundStartedAt: null, roundEndsAt: null, nextTransitionAt: null, lastRound: null, roundHistory, winnerId: results.winnerId, results, ...extra,
  };
  const members = ['Eru', 'Ana', 'Leo'].map((displayName, index) => ({ id: `p${index + 1}`, displayName, avatar: { type: 'DEFAULT' as const }, connected: true, presence: 'CONNECTED' as const, roomRole: index === 0 ? 'HOST' as const : 'MEMBER' as const, role: 'PLAYER' as const, isHost: index === 0, ready: false, sessionPoints: 0 }));
  return { code: 'ABC234', phase: 'GAME_RESULTS', hostId: 'p1', maxPlayers: 8, availableGames: [], selectedGameId: 'pokedex-distance', selectedGameConfig: defaultPokedexDistanceConfig, sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'ORDER', gameIds: ['pokedex-distance'] }, nextGameVote: null, gamesPlayed: 1, sessionStandings: [], sessionHistory: [], serverNow: 1_000, game, gamePlayerState: null, members };
}

const render = (view: RoomView, selfId = 'p1') => renderToStaticMarkup(createElement(PokedexDistanceResults, { room: view, selfId, onLobby: () => undefined, onEnd: () => undefined }));

describe('PokedexDistanceResults', () => {
  it('renders the ranking, the best hit and the per-round table', () => {
    const html = render(room([
      { roundNumber: 1, tiebreakDepth: 0, targetDexNumber: 83, distances: { p1: 9, p2: 9, p3: 40 }, eliminatedIds: [] },
      { roundNumber: 1, tiebreakDepth: 1, targetDexNumber: 90, distances: { p1: 0, p2: 161 }, eliminatedIds: ['p2'] },
    ], { winnerId: 'p1', standings: [
      { playerId: 'p1', position: 1, points: 6, stats: stats(1, 1) },
      { playerId: 'p3', position: 2, points: 3, stats: stats(0, 0) },
      { playerId: 'p2', position: 3, points: 2, stats: stats(0, 0) },
    ] }));
    expect(html).toContain('Resultado de la partida');
    expect(html).toContain('Ganador');
    expect(html).toContain('Cayó en la ronda 1');
    expect(html).toContain('1 desempate superado');
    expect(html).toContain('Mejor acierto');
    expect(html).toContain('Distancia por ronda');
    expect(html).toContain('R1 · D1');
    expect(html).toContain('R1 · D1: a 161, cayó');
    expect(html).toContain('<span class="sr-only">R1 · D1: a 161, cayó</span>');
    expect(html).toContain('Acierto exacto en R1 · D1');
    expect(html).not.toContain('aria-label="R1');
    expect(html).toContain('role="region"');
    expect(html).not.toMatch(/btn-|ranking-row|text-berry/);
    expect(html.match(/Ganador/g)).toHaveLength(1);
    expect(html).toContain('Continuar sesión');
  });

  it('a deserted game with a player who never answered shows no NaN, Infinity or round 0', () => {
    const html = render(room([
      { roundNumber: 1, tiebreakDepth: 0, targetDexNumber: 5, distances: { p1: null, p2: null }, eliminatedIds: ['p1', 'p2'] },
    ], { winnerId: null, standings: [
      { playerId: 'p1', position: 1, points: 0, stats: { exactHits: 0, roundsSurvived: 0, selections: 0, averageDistance: 0, tiebreaksWon: 0 } },
      { playerId: 'p2', position: 1, points: 0, stats: { exactHits: 0, roundsSurvived: 0, selections: 0, averageDistance: 0, tiebreaksWon: 0 } },
    ] }), 'p2');
    expect(html).toContain('Partida desierta');
    expect(html).toContain('Nadie llegó a elegir un Pokémon en esta partida.');
    expect(html).toContain('R1: sin respuesta, cayó');
    expect(html).toContain('Esperando al host…');
    expect(html).not.toMatch(/NaN|Infinity|ronda 0|Ganador/);
  });

  it('Por puntos: subtítulo con el modo, clasificación por puntos con empate compartido y sin «cayó»', () => {
    const pointsStats = (exactHits: number) => ({ exactHits, selections: 2, averageDistance: 15.5 });
    const html = render(room([
      { roundNumber: 1, tiebreakDepth: 0, targetDexNumber: 130, distances: { p1: 0, p2: 105, p3: 30 }, eliminatedIds: [] },
      { roundNumber: 2, tiebreakDepth: 0, targetDexNumber: 158, distances: { p1: 157, p2: 0, p3: null }, eliminatedIds: [] },
    ], { winnerId: 'p3', standings: [
      { playerId: 'p3', position: 1, points: 169, won: true, stats: pointsStats(0) },
      { playerId: 'p1', position: 2, points: 150, won: false, stats: pointsStats(1) },
      { playerId: 'p2', position: 2, points: 150, won: false, stats: pointsStats(1) },
    ] }, { mode: 'POINTS', pointsRound: 2, pointsRounds: 2, scores: { p1: 150, p2: 150, p3: 169 } }));
    expect(html).toContain('Pokédex Distance · Por puntos · Partida 1');
    expect(html).toContain('Resultado de la partida');
    expect(html).toContain('169 pts');
    expect(html.indexOf('Leo')).toBeLessThan(html.indexOf('Eru'));
    expect(html).not.toMatch(/Cayó|cayó|desempates/);
  });

  it('Por puntos: empate en cabeza no es una partida desierta', () => {
    const zero = { exactHits: 0, selections: 1, averageDistance: 10 };
    const html = render(room([], { winnerId: null, standings: [
      { playerId: 'p1', position: 1, points: 90, won: true, stats: zero },
      { playerId: 'p2', position: 1, points: 90, won: true, stats: zero },
    ] }, { mode: 'POINTS' }));
    expect(html).toContain('Empate en cabeza');
    expect(html).not.toContain('Partida desierta');
  });
});

import { defaultPokemonConnectionsConfig, type ConnectionAnswerGroup, type PokemonConnectionsPlayerState, type PokemonConnectionsPublicState, type RoomView } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PokemonConnectionsConfigPanel } from '../games/pokemon-connections/ConfigPanel';
import { PokemonConnectionsGame } from './PokemonConnectionsGame';
import { PokemonConnectionsResults } from './PokemonConnectionsResults';

const pokemon = Array.from({ length: 12 }, (_, index) => ({ id: `pokemon-${index + 1}`, name: `Pokémon ${index + 1}`, sprite: `/pokemon-${index + 1}.png` }));
const groups: ConnectionAnswerGroup[] = Array.from({ length: 3 }, (_, index) => ({
  id: `group-${index + 1}`,
  categoryId: `secret-${index + 1}`,
  label: ['Pokémon fósiles', 'Evoluciones de Eevee', 'Aspecto canino'][index]!,
  explanation: `Explicación secreta ${index + 1}`,
  pokemon: pokemon.slice(index * 4, index * 4 + 4),
}));

function publicGame(phase: 'ROUND_ACTIVE' | 'ROUND_RESULTS' | 'GAME_RESULTS' = 'ROUND_ACTIVE'): PokemonConnectionsPublicState {
  const result = {
    source: 'CURATED' as const,
    groups,
    players: {
      p1: { status: 'SOLVED' as const, foundGroups: 3, foundGroupIds: ['group-1', 'group-2', 'group-3'], mistakesUsed: 1, completionRank: 1, elapsedMs: 12_000, pointsAwarded: 6 },
      p2: { status: 'TIMED_OUT' as const, foundGroups: 1, foundGroupIds: ['group-1'], mistakesUsed: 2, completionRank: null, elapsedMs: null, pointsAwarded: 1 },
    },
  };
  return {
    gameId: 'pokemon-connections', phase, roundNumber: 1, totalRounds: 5, groupSize: 4, groupCount: 3,
    board: pokemon, playerProgress: { p1: { foundGroups: phase === 'ROUND_ACTIVE' ? 1 : 3, status: phase === 'ROUND_ACTIVE' ? 'PLAYING' : 'SOLVED' }, p2: { foundGroups: 1, status: phase === 'ROUND_ACTIVE' ? 'PLAYING' : 'TIMED_OUT' } },
    scores: { p1: 6, p2: 1 }, roundStartedAt: 1_000, roundEndsAt: phase === 'ROUND_ACTIVE' ? 121_000 : null,
    nextTransitionAt: phase === 'ROUND_RESULTS' ? 130_000 : null, lastRound: phase === 'ROUND_ACTIVE' ? null : result,
    results: phase === 'GAME_RESULTS' ? { winnerId: 'p1', standings: [
      { playerId: 'p1', position: 1, points: 6, won: true, stats: { roundsPlayed: 1, groupsFound: 3, boardsSolved: 1, mistakes: 1, nearMisses: 1, podiumFinishes: 1, solveTimeTotalMs: 12_000, bestSolveTimeMs: 12_000 } },
      { playerId: 'p2', position: 2, points: 1, won: false, stats: { roundsPlayed: 1, groupsFound: 1, boardsSolved: 0, mistakes: 2, nearMisses: 0, podiumFinishes: 0, solveTimeTotalMs: 0, bestSolveTimeMs: 0 } },
    ] } : null,
  };
}

function room(game: PokemonConnectionsPublicState, player: PokemonConnectionsPlayerState): RoomView {
  return {
    code: 'ABC234', phase: game.phase, hostId: 'p1', maxPlayers: 8,
    availableGames: [{ id: 'pokemon-connections', name: 'Pokémon Connections', icon: '🧩', description: 'Conexiones', minPlayers: 1, profileStats: { metrics: [] } }],
    selectedGameId: 'pokemon-connections', selectedGameConfig: { ...defaultPokemonConnectionsConfig, generations: [1], pokemonCount: 12 },
    sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'FIXED' }, nextGameVote: null, gamesPlayed: 0,
    sessionStandings: [], sessionHistory: [], serverNow: 1_000, game, gamePlayerState: player,
    members: [
      { id: 'p1', displayName: 'Eru', avatar: { type: 'PRESET', value: 'trainer-berry' }, connected: true, presence: 'CONNECTED', roomRole: 'HOST', role: 'PLAYER', isHost: true, ready: false, sessionPoints: 6 },
      { id: 'p2', displayName: 'Ana', avatar: { type: 'PRESET', value: 'trainer-aqua' }, connected: true, presence: 'CONNECTED', roomRole: 'MEMBER', role: 'PLAYER', isHost: false, ready: false, sessionPoints: 1 },
    ],
  };
}

const playing: PokemonConnectionsPlayerState = { role: 'PLAYER', canSubmit: true, foundGroups: [], mistakesUsed: 1, mistakesAllowed: 4, status: 'PLAYING', completionRank: null, roundPoints: 0, lastAttempt: { kind: 'INCORRECT', attemptedPokemonIds: ['pokemon-1', 'pokemon-2', 'pokemon-3', 'pokemon-5'], nearMiss: true, attemptedAt: 2_000 } };

describe('Pokémon Connections client', () => {
  it('renders an accessible private board without leaking unopened categories', () => {
    const markup = renderToStaticMarkup(createElement(PokemonConnectionsGame, { room: room(publicGame(), playing), selfId: 'p1', onAction: async () => undefined }));
    expect(markup).toContain('aria-labelledby="connections-board"');
    expect(markup).toContain('Comprobar 0/4');
    expect(markup).toContain('Te falta uno');
    expect(markup).toContain('Pokémon 12');
    expect(markup).not.toContain('Pokémon fósiles');
    expect(markup).not.toContain('Explicación secreta');
  });

  it('reveals only the current player’s found groups during active play', () => {
    const player: PokemonConnectionsPlayerState = { ...playing, foundGroups: [groups[0]!], roundPoints: 1, lastAttempt: { kind: 'CORRECT', attemptedPokemonIds: groups[0]!.pokemon.map((entry) => entry.id), nearMiss: false, attemptedAt: 3_000 } };
    const markup = renderToStaticMarkup(createElement(PokemonConnectionsGame, { room: room(publicGame(), player), selfId: 'p1', onAction: async () => undefined }));
    expect(markup).toContain('Tus conexiones');
    expect(markup).toContain('Pokémon fósiles');
    expect(markup).not.toContain('Evoluciones de Eevee');
    expect(markup).toContain('Grupo encontrado');
  });

  it('supports spectators and reveals every solution only after round closure', () => {
    const spectator = renderToStaticMarkup(createElement(PokemonConnectionsGame, { room: room(publicGame(), { role: 'SPECTATOR' }), selfId: 'watcher', onAction: async () => undefined }));
    expect(spectator).toContain('Estás observando');
    expect(spectator).not.toContain('Comprobar 0/4');
    const reveal = renderToStaticMarkup(createElement(PokemonConnectionsGame, { room: room(publicGame('ROUND_RESULTS'), playing), selfId: 'p1', onAction: async () => undefined }));
    expect(reveal).toContain('Estas eran las conexiones');
    expect(reveal).toContain('Pokémon fósiles');
    expect(reveal).toContain('Evoluciones de Eevee');
    expect(reveal).toContain('12.0s');
    expect(reveal).toContain('Siguiente puzle');
    const missedReveal = renderToStaticMarkup(createElement(PokemonConnectionsGame, { room: room(publicGame('ROUND_RESULTS'), playing), selfId: 'p2', onAction: async () => undefined }));
    expect(missedReveal).toContain('No encontrada');
    expect(missedReveal).toContain('Encontrada');
  });

  it('offers every agreed setting and the standard session result actions', () => {
    const config = renderToStaticMarkup(createElement(PokemonConnectionsConfigPanel, { config: defaultPokemonConnectionsConfig, disabled: false, onChange: async () => undefined }));
    expect(config).toContain('Pokémon por grupo');
    expect(config).toContain('Total del tablero');
    expect(config).toContain('Errores permitidos');
    expect(config).toContain('Tiempo por puzle');
    expect(config).toContain('Un intento con todos menos uno');
    const results = renderToStaticMarkup(createElement(PokemonConnectionsResults, { room: room(publicGame('GAME_RESULTS'), playing), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(results).toContain('Mentes bien conectadas');
    expect(results).toContain('Continuar sesión');
    expect(results).toContain('3 grupos');
  });
});

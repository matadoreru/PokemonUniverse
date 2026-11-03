import type { RoomView, ShinyVotePlayerState, ShinyVotePublicState } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ShinyVoteGame } from './ShinyVoteGame';
import { ShinyVoteResults } from './ShinyVoteResults';

const members: RoomView['members'] = ['Eru', 'Ana', 'Leo', 'Marta', 'Iris'].map((displayName, index): RoomView['members'][number] => ({
  id: `p${index + 1}`,
  displayName,
  avatar: { type: 'DEFAULT' },
  connected: true,
  presence: 'CONNECTED',
  roomRole: index === 0 ? 'HOST' : 'MEMBER',
  role: 'PLAYER',
  isHost: index === 0,
  ready: false,
  sessionPoints: 0,
}));

const options: ShinyVotePublicState['options'] = ['A', 'B', 'C', 'D'].map((id) => ({
  id: id as 'A' | 'B' | 'C' | 'D',
  pokemonId: 'simisear',
  pokemonName: 'Simisear',
  sprite: `/api/rooms/ABC234/games/token/rounds/1/options/${id}/sprite`,
}));

function publicGame(overrides: Partial<ShinyVotePublicState> = {}): ShinyVotePublicState {
  return {
    gameId: 'shiny-vote',
    phase: 'ROUND_ACTIVE',
    roundNumber: 1,
    totalRounds: 10,
    playerIds: members.map((member) => member.id),
    options,
    votes: {},
    votedPlayerIds: [],
    showVotes: true,
    pendingPlayerIds: members.map((member) => member.id),
    scores: Object.fromEntries(members.map((member) => [member.id, 0])),
    roundStartedAt: 1_000,
    roundEndsAt: 21_000,
    nextTransitionAt: null,
    correctOptionId: null,
    lastRound: null,
    winnerId: null,
    results: null,
    ...overrides,
  };
}

function player(overrides: Partial<ShinyVotePlayerState> = {}): ShinyVotePlayerState {
  return { canVote: true, vote: null, roundResult: null, ...overrides };
}

function room(game: ShinyVotePublicState, playerState: ShinyVotePlayerState | null): RoomView {
  const candidateMode = new Set(game.options.map((option) => option.pokemonId)).size <= 1 ? 'SAME_POKEMON' : 'DIFFERENT_POKEMON';
  return {
    code: 'ABC234',
    phase: game.phase,
    hostId: 'p1',
    maxPlayers: 8,
    members,
    availableGames: [],
    selectedGameId: 'shiny-vote',
    selectedGameConfig: { generations: [1], rounds: 10, roundSeconds: 20, optionCount: game.options.length, candidateMode, showVotes: game.showVotes },
    sessionMode: { type: 'INFINITE' },
    gameSelectionMode: { type: 'FIXED' },
    nextGameVote: null,
    gamesPlayed: 0,
    sessionStandings: [],
    sessionHistory: [],
    serverNow: 1_000,
    game,
    gamePlayerState: playerState,
  };
}

function render(game: ShinyVotePublicState, playerState: ShinyVotePlayerState | null = player()) {
  return renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(ShinyVoteGame, { room: room(game, playerState), selfId: 'p1', onAction: async () => undefined })));
}

function revealGame(showVotes = true): ShinyVotePublicState {
  const votes = showVotes ? {
    p1: { optionId: 'B' as const, votedAt: 2_000 },
    p2: { optionId: 'A' as const, votedAt: 2_100 },
  } : {};
  return publicGame({
    phase: 'ROUND_RESULTS',
    showVotes,
    votes,
    votedPlayerIds: ['p1', 'p2'],
    pendingPlayerIds: ['p3', 'p4', 'p5'],
    scores: { p1: 4, p2: 0, p3: 0, p4: 0, p5: 0 },
    roundEndsAt: null,
    nextTransitionAt: 4_000,
    correctOptionId: 'B',
    lastRound: { roundNumber: 1, correctOptionId: 'B', votes, correctPlayerIds: showVotes ? ['p1'] : [], missedPlayerIds: showVotes ? ['p2', 'p3', 'p4', 'p5'] : [] },
  });
}

describe('Shiny Quiz UI', () => {
  it('makes the Pokémon options the responsive, accessible primary surface', () => {
    const html = render(publicGame());
    expect(html).toContain('Ronda 1 de 10');
    expect(html).toContain('¿Cuál es el shiny verdadero?');
    expect(html).toContain('grid-cols-2');
    expect(html).toContain('lg:grid-cols-[minmax(0,1fr)_18rem]');
    expect(html).toContain('aria-label="Opción A: Simisear"');
    expect(html).toContain('shiny-sprite');
    expect(html).toContain('Selecciona uno de los Pokémon');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('Shiny verdadero');
    expect(html).not.toContain('—');
  });

  it('restores and locks a confirmed vote after a fresh projection', () => {
    const vote = { optionId: 'B' as const, votedAt: 2_000 };
    const html = render(publicGame({ votes: { p1: vote }, votedPlayerIds: ['p1'], pendingPlayerIds: ['p2', 'p3', 'p4', 'p5'] }), player({ canVote: false, vote }));
    expect(html).toContain('Voto confirmado:');
    expect(html).toContain('Tu voto');
    expect(html).toContain('aria-label="Opción B: Simisear, voto confirmado"');
    expect(html).not.toContain('Confirmar voto');
  });

  it('transforms the board into a successful reveal without a modal', () => {
    const html = render(revealGame(), player({ canVote: false, vote: { optionId: 'B', votedAt: 2_000 }, roundResult: { correct: true, points: 4 } }));
    expect(html).toContain('Shiny verdadero');
    expect(html).toContain('¡Correcto!');
    expect(html).toContain('+4 puntos');
    expect(html).toContain('Respuesta correcta:');
    expect(html).not.toContain('role="dialog"');
  });

  it('shows an incorrect choice and timeout without hiding the Pokémon', () => {
    const wrong = render(revealGame(), player({ canVote: false, vote: { optionId: 'C', votedAt: 2_000 }, roundResult: { correct: false, points: 0 } }));
    expect(wrong).toContain('No era ese shiny');
    expect(wrong).toContain('Tu elección:');
    expect(wrong).toContain('Respuesta correcta:');
    expect(wrong).toContain('C');
    expect(wrong).toContain('Simisear');
    const timeout = render(revealGame(false), player({ canVote: false, vote: null, roundResult: { correct: false, points: 0 } }));
    expect(timeout).toContain('Tiempo agotado');
  });

  it('shows bounded avatar summaries only when public voting is enabled', () => {
    const allVotes = Object.fromEntries(members.map((member, index) => [member.id, { optionId: 'A' as const, votedAt: 2_000 + index }]));
    const visible = render(publicGame({ votes: allVotes, votedPlayerIds: members.map((member) => member.id), pendingPlayerIds: [] }), player({ canVote: false, vote: allVotes.p1! }));
    expect(visible).toContain('data-testid="shiny-voters-A"');
    expect(visible).toContain('5 votos');
    expect(visible).toContain('+2');
    const hidden = render(publicGame({ showVotes: false, votes: {}, votedPlayerIds: members.map((member) => member.id), pendingPlayerIds: [] }), player({ canVote: false, vote: allVotes.p1! }));
    expect(hidden).not.toContain('data-testid="shiny-voters-A"');
    expect(hidden).not.toContain('5 votos');
    expect(hidden).toContain('Elección privada');
  });

  it('renders a non-interactive spectator state', () => {
    const spectatorGame = publicGame({ playerIds: ['p1', 'p2', 'p3', 'p4', 'p5'] });
    const spectatorRoom = { ...room(spectatorGame, null), members: [...members, { ...members[0]!, id: 'watcher', displayName: 'Nora', role: 'SPECTATOR' as const }] };
    const html = renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(ShinyVoteGame, { room: spectatorRoom, selfId: 'watcher', onAction: async () => undefined })));
    expect(html).toContain('Estás viendo la votación como espectador');
    expect(html).not.toContain('Confirmar voto');
  });

  it('keeps long, different Pokémon names inside a consistent six-option grid', () => {
    const differentOptions: ShinyVotePublicState['options'] = ['A', 'B', 'C', 'D', 'E', 'F'].map((id, index) => ({
      id: id as 'A' | 'B' | 'C' | 'D' | 'E' | 'F',
      pokemonId: `pokemon-${index}`,
      pokemonName: index === 0 ? 'Oricorio Estilo Apasionado' : `Pokémon ${index + 1}`,
      sprite: `/pokemon-${index}.png`,
    }));
    const html = render(publicGame({ options: differentOptions }));
    expect(html).toContain('Pokémon diferentes');
    expect(html).toContain('md:grid-cols-3');
    expect(html).toContain('title="Oricorio Estilo Apasionado"');
    expect(html).toContain('aria-keyshortcuts="F 6"');
  });

  it('keeps a stable loading surface while the next round is prepared', () => {
    const html = render(publicGame({ phase: 'GAME_STARTING', options: [], roundEndsAt: null }), player({ canVote: false }));
    expect(html).toContain('Cargando opciones');
    expect(html).toContain('Preparando la ronda');
    expect(html).toContain('shiny-option-card');
  });

  it('preserves the dedicated final standings and host controls', () => {
    const finished = publicGame({
      phase: 'GAME_RESULTS',
      roundEndsAt: null,
      winnerId: 'p1',
      results: { winnerId: 'p1', standings: [
        { playerId: 'p1', position: 1, points: 12, won: true, stats: { votes: 3, correctVotes: 3, accuracy: 100 } },
        { playerId: 'p2', position: 2, points: 4, won: false, stats: { votes: 3, correctVotes: 1, accuracy: 33 } },
      ] },
    });
    const html = renderToStaticMarkup(createElement(ShinyVoteResults, { room: room(finished, null), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(html).toContain('Clasificación shiny');
    expect(html).toContain('100% de precisión');
    expect(html).toContain('Continuar sesión');
  });
});

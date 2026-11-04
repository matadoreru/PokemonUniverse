import type { RoomView, ShinyVotePlayerState, ShinyVotePublicState } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { shinyCardState } from '../games/shiny-vote/ShinyOptionCard';
import { shinyRanking } from '../games/shiny-vote/ShinyGameSidebar';
import { ShinyVoteGame } from './ShinyVoteGame';
import { ShinyVoteResults, shinyStatsLine } from './ShinyVoteResults';

// «Saltar minijuego» va dentro de la pantalla (`GameSkipSlot` lee la sala): sin votación de salto no pinta nada.
vi.mock('./RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));

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
    voteVisibility: 'LIVE',
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
    selectedGameConfig: { generations: [1], rounds: 10, roundSeconds: 20, optionCount: game.options.length, candidateMode, voteVisibility: game.voteVisibility, revealSeconds: 4 },
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

const revealVotes: ShinyVotePublicState['votes'] = {
  p1: { optionId: 'B', votedAt: 2_000 },
  p2: { optionId: 'A', votedAt: 2_100 },
};

function revealGame(voteVisibility: ShinyVotePublicState['voteVisibility'] = 'LIVE', votes = revealVotes): ShinyVotePublicState {
  const correctPlayerIds = Object.keys(votes).filter((id) => votes[id]?.optionId === 'B');
  return publicGame({
    phase: 'ROUND_RESULTS',
    voteVisibility,
    votes,
    votedPlayerIds: Object.keys(votes),
    pendingPlayerIds: ['p3', 'p4', 'p5'],
    scores: { p1: 4, p2: 0, p3: 0, p4: 0, p5: 0 },
    roundEndsAt: null,
    nextTransitionAt: 4_000,
    correctOptionId: 'B',
    lastRound: { roundNumber: 1, correctOptionId: 'B', votes, correctPlayerIds, missedPlayerIds: members.map((member) => member.id).filter((id) => !correctPlayerIds.includes(id)) },
  });
}

describe('Shiny Quiz UI', () => {
  it('pinta la placa de la ronda y las opciones como cartas del catálogo, accesibles y con atajos', () => {
    const html = render(publicGame());
    expect(html).toContain('Ronda 1 de 10');
    expect(html).toContain('¿Cuál es el shiny verdadero?');
    expect(html).toContain('role="group" aria-label="Opciones de Pokémon"');
    expect(html).toContain('data-count="4"');
    expect(html).toContain('aria-label="Opción A: Simisear"');
    expect(html).toContain('aria-keyshortcuts="A 1"');
    expect(html).toContain('role="timer"');
    expect(html).toContain('Atajos: A–F o 1–6 · Enter confirma');
    expect(html).not.toContain('shiny verdadero,');
    expect(html).not.toContain('Antes / después');
  });

  it('enseña esqueletos que no se pueden votar hasta que cargan los sprites', () => {
    const html = render(publicGame());
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Cargando cartas…');
    expect(html.match(/data-testid="shiny-card-skeleton"/g)).toHaveLength(4);
    // La imagen sigue montada (para que cargue) bajo el esqueleto.
    expect(html).toContain('/api/rooms/ABC234/games/token/rounds/1/options/A/sprite');
    expect(html.match(/<button[^>]*data-shiny-option="[A-D]"[^>]*disabled=""/g)).toHaveLength(4);
  });

  it('nunca pide el sprite normal antes de revelar', () => {
    expect(render(publicGame())).not.toContain('/api/pokemon/');
  });

  it('con los votos al revelar no deja ver a quién ni qué se votó antes de tiempo', () => {
    // Aunque la proyección trajera votos ajenos, ni las cartas ni el marcador los pintan hasta revelar.
    const votes = { p1: { optionId: 'A' as const, votedAt: 2_000 }, p2: { optionId: 'C' as const, votedAt: 2_100 } };
    const hidden = render(publicGame({ voteVisibility: 'REVEAL', votes, votedPlayerIds: ['p1', 'p2'], pendingPlayerIds: ['p3', 'p4', 'p5'] }), player({ canVote: false, vote: votes.p1 }));
    expect(hidden).not.toContain('data-testid="shiny-voters-');
    expect(hidden).not.toMatch(/>\d votos?</);
    expect(hidden).toContain('Votos al revelar');
    expect(hidden).toContain('Elección privada');
    // El marcador solo dice quién ha votado: ni una letra de opción en las franjas.
    expect(hidden.match(/>Votó</g)).toHaveLength(2);
    expect(hidden).not.toContain(': acertó');
    expect(hidden).not.toContain(': falló');
    // Al revelar, los votantes de cada carta y la opción de cada uno en el marcador.
    const revealed = render(revealGame('REVEAL'), player({ canVote: false, vote: revealVotes.p1!, roundResult: { correct: true, points: 4 } }));
    expect(revealed).toContain('data-testid="shiny-voters-A"');
    expect(revealed).toContain('data-testid="shiny-voters-B"');
    expect(revealed).toContain(': acertó');
    expect(revealed).toContain(': falló');
    expect(revealed).not.toContain('Elección privada');
  });

  it('en directo resume los votantes de cada carta con avatares acotados y su insignia', () => {
    const allVotes = Object.fromEntries(members.map((member, index) => [member.id, { optionId: 'A' as const, votedAt: 2_000 + index }]));
    const visible = render(publicGame({ votes: allVotes, votedPlayerIds: members.map((member) => member.id), pendingPlayerIds: [] }), player({ canVote: false, vote: allVotes.p1! }));
    expect(visible).toContain('data-testid="shiny-voters-A"');
    expect(visible).toContain('5 votos');
    expect(visible).toContain('+2');
    expect(visible).toContain('Votos en directo');
    expect(visible).toContain('Todos han votado');
  });

  it('restaura y bloquea un voto confirmado: cartas fijas, sin botones ni confirmar', () => {
    const vote = { optionId: 'B' as const, votedAt: 2_000 };
    const html = render(publicGame({ votes: { p1: vote }, votedPlayerIds: ['p1'], pendingPlayerIds: ['p2', 'p3', 'p4', 'p5'] }), player({ canVote: false, vote }));
    expect(html).toContain('Voto confirmado:');
    expect(html).toContain('Tu voto');
    expect(html).toContain('Opción B: Simisear, voto confirmado');
    expect(html).not.toContain('Confirmar voto');
    expect(html).not.toMatch(/<button[^>]*data-shiny-option/);
  });

  it('espectador: sin controles de voto, sin atajos y con su estado', () => {
    const spectatorGame = publicGame({ playerIds: ['p1', 'p2', 'p3', 'p4', 'p5'] });
    const spectatorRoom = { ...room(spectatorGame, null), members: [...members, { ...members[0]!, id: 'watcher', displayName: 'Nora', role: 'SPECTATOR' as const }] };
    const html = renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(ShinyVoteGame, { room: spectatorRoom, selfId: 'watcher', onAction: async () => undefined })));
    expect(html).toContain('Estás viendo la votación como espectador');
    expect(html).not.toContain('Confirmar voto');
    expect(html).not.toContain('Atajos:');
    expect(html).not.toContain('aria-keyshortcuts');
    expect(html).not.toMatch(/<button[^>]*data-shiny-option/);
  });

  it('revela un acierto sin modal: la correcta gira, «+N», antes y después y el veredicto', () => {
    const html = render(revealGame(), player({ canVote: false, vote: { optionId: 'B', votedAt: 2_000 }, roundResult: { correct: true, points: 4 } }));
    expect(html).toContain('Opción B: Simisear, shiny verdadero, tu voto acertado, +4 puntos');
    expect(html).toMatch(/<div data-shiny-option="B" data-correct="true" class="[^"]*_flip_/);
    expect(html).toContain('Correcta');
    expect(html).toMatch(/aria-hidden="true">\+4<\/span>/);
    expect(html).not.toContain('aria-busy');
    expect(html.match(/data-testid="shiny-before-after"/g)).toHaveLength(1);
    expect(html).toContain('/api/pokemon/simisear/sprite');
    expect(html).toContain('>Normal</figcaption>');
    expect(html).toContain('>Shiny</figcaption>');
    expect(html).toContain('¡Correcto!');
    expect(html).toContain('Respuesta correcta:');
    expect(html).toContain('Siguiente ronda');
    expect(html).not.toContain('role="dialog"');
  });

  it('enseña un fallo y el tiempo agotado sin esconder el Pokémon; «+0» en la pantalla inferior', () => {
    const wrong = render(revealGame(), player({ canVote: false, vote: { optionId: 'C', votedAt: 2_000 }, roundResult: { correct: false, points: 0 } }));
    expect(wrong).toContain('No era ese shiny');
    expect(wrong).toContain('Opción C: Simisear, tu voto, incorrecta, +0 puntos');
    expect(wrong).toContain('Incorrecta');
    // Sin «+N» flotante ni su sonido en un fallo: el «+0» va en el veredicto.
    expect(wrong).not.toMatch(/aria-hidden="true">\+0<\/span>/);
    expect(wrong).toMatch(/\+0<small> puntos<\/small>/);
    // Solo se apagan los sprites de las incorrectas que no votaste.
    expect(wrong.match(/data-dimmed="true"/g)).toHaveLength(2);
    expect(wrong).toContain('Tu elección:');
    const timeout = render(revealGame('LIVE', { p2: revealVotes.p2! }), player({ canVote: false, vote: null, roundResult: { correct: false, points: 0 } }));
    expect(timeout).toContain('Tiempo agotado');
  });

  it('mantiene los nombres largos dentro de una rejilla de seis opciones', () => {
    const differentOptions: ShinyVotePublicState['options'] = ['A', 'B', 'C', 'D', 'E', 'F'].map((id, index) => ({
      id: id as 'A' | 'B' | 'C' | 'D' | 'E' | 'F',
      pokemonId: `pokemon-${index}`,
      pokemonName: index === 0 ? 'Oricorio Estilo Apasionado' : `Pokémon ${index + 1}`,
      sprite: `/pokemon-${index}.png`,
    }));
    const html = render(publicGame({ options: differentOptions }));
    expect(html).toContain('Pokémon diferentes');
    expect(html).toContain('data-count="6"');
    expect(html).toContain('title="Oricorio Estilo Apasionado"');
    expect(html).toContain('aria-keyshortcuts="F 6"');
  });

  it('deja una superficie de carga estable mientras se prepara la ronda', () => {
    const html = render(publicGame({ phase: 'GAME_STARTING', options: [], roundEndsAt: null }), player({ canVote: false }));
    expect(html).toContain('aria-label="Cargando opciones"');
    expect(html).toContain('Preparando la ronda');
  });

  it('elige el estado de la carta del catálogo', () => {
    expect(shinyCardState({ reveal: false, selected: false, correct: false })).toBe('idle');
    expect(shinyCardState({ reveal: false, selected: true, correct: false })).toBe('selected');
    expect(shinyCardState({ reveal: true, selected: true, correct: false })).toBe('wrong');
    expect(shinyCardState({ reveal: true, selected: false, correct: true })).toBe('correct');
    expect(shinyCardState({ reveal: true, selected: false, correct: false })).toBe('idle');
  });

  it('ordena el marcador por puntos y comparte la posición en los empates', () => {
    const byId = new Map(members.map((member) => [member.id, member]));
    expect(shinyRanking({ playerIds: ['p1', 'p2', 'p3'], scores: { p1: 2, p2: 5, p3: 2 } }, byId)).toEqual([
      { id: 'p2', position: 1 },
      { id: 'p1', position: 2 },
      { id: 'p3', position: 2 },
    ]);
  });

  it('conserva la clasificación final propia y los controles del host', () => {
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
    expect(html).toContain('3 aciertos · 100% de precisión');
    expect(html).toContain('1 acierto · 33% de precisión');
    expect(html).toContain('Ganador');
    expect(html).toContain('Continuar sesión');
    const guest = renderToStaticMarkup(createElement(ShinyVoteResults, { room: room(finished, null), selfId: 'p2', onLobby: () => undefined, onEnd: () => undefined }));
    expect(guest).toContain('Esperando al host…');
    expect(guest).not.toContain('Continuar sesión');
    expect(shinyStatsLine({})).toBe('0 aciertos · 0% de precisión');
  });
});

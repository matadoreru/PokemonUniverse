import { defaultOddOneOutConfig, type OddOneOutPlayerState, type OddOneOutPublicState, type RoomView } from '@pokemon-universe/shared/public';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { OddOneOutGame } from './OddOneOutGame';
import { OddOneOutResults } from './OddOneOutResults';
import s from './OddOneOut.module.css';
import { expectSingleLiveRegion } from '../../room/test-support/live-regions';
import { member, roomView } from '../../room/test-support/room-view';

// «Saltar minijuego» va dentro de la pantalla (`GameSkipSlot` lee la sala): sin votación de salto no pinta nada.
vi.mock('../../room/RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));

const members: RoomView['members'] = ['Eru', 'Ana', 'Leo'].map((displayName, index) => member({ id: `p${index + 1}`, displayName, roomRole: index === 0 ? 'HOST' : 'MEMBER', isHost: index === 0 }));
const NAMES = ['Aerodactyl', 'Kabuto', 'Omanyte', 'Pikachu'];
const options: OddOneOutPublicState['options'] = (['A', 'B', 'C', 'D'] as const).map((id, index) => ({ id, pokemonId: NAMES[index]!.toLowerCase(), pokemonName: NAMES[index]!, sprite: `/${id}.png` }));
const LONG = 'Evolucionan al intercambiarlos con un objeto';

function publicGame(overrides: Partial<OddOneOutPublicState> = {}): OddOneOutPublicState {
  return {
    gameId: 'odd-one-out', phase: 'ROUND_ACTIVE', roundNumber: 1, totalRounds: 10, playerIds: members.map((m) => m.id), options, votedPlayerIds: [],
    scores: { p1: 0, p2: 0, p3: 0 }, roundStartedAt: 1_000, roundEndsAt: 21_000, nextTransitionAt: null, lastRound: null, results: null, ...overrides,
  };
}

function revealGame(label = 'Pokémon fósiles'): OddOneOutPublicState {
  return publicGame({
    phase: 'ROUND_RESULTS', votedPlayerIds: ['p1', 'p2'], scores: { p1: 4, p2: 0, p3: 0 }, roundEndsAt: null, nextTransitionAt: 5_000,
    lastRound: {
      roundNumber: 1, intruderOptionId: 'D', category: { id: 'fossil', label, explanation: 'Se resucitan de un fósil.' },
      votes: { p1: { optionId: 'D', votedAt: 2_000 }, p2: { optionId: 'A', votedAt: 2_100 } }, points: { p1: 4, p2: 0, p3: 0 },
    },
  });
}

const player = (overrides: Partial<OddOneOutPlayerState> = {}): OddOneOutPlayerState => ({ canVote: true, vote: null, ...overrides });

function room(game: OddOneOutPublicState, playerState: OddOneOutPlayerState | null): RoomView {
  return roomView({ phase: game.phase, members, selectedGameId: 'odd-one-out', selectedGameConfig: defaultOddOneOutConfig, game, gamePlayerState: playerState });
}

const render = (game: OddOneOutPublicState, playerState: OddOneOutPlayerState | null = player()) =>
  renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(OddOneOutGame, { room: room(game, playerState), selfId: 'p1', onAction: async () => undefined })));

describe('El Intruso: pantalla', () => {
  it('en ronda activa pinta cuatro cartas y no revela categoría ni marcas de correcto', () => {
    const html = render(publicGame());
    expect(html).toContain('¿Quién es el intruso?');
    expect(html).toContain('Ronda 1 de 10');
    expect(html.match(/data-odd-option="[A-D]"/g)).toHaveLength(4);
    expect(html).toContain('Aerodactyl');
    expect(html).not.toContain('Categoría');
    expect(html).not.toContain('data-mark="correct"');
    expect(html).not.toContain('El intruso era');
    expect(html).not.toContain('Voto bloqueado');
  });

  it('con voto propio sale «Voto bloqueado» y la carta elegida va seleccionada', () => {
    const html = render(publicGame({ votedPlayerIds: ['p1'] }), player({ canVote: false, vote: { optionId: 'B', votedAt: 2_000 } }));
    expect(html).toContain('Voto bloqueado');
    expect(html).toContain('data-mark="selected"');
    expect(html).toContain('1 de 3 ha votado');
  });

  it('en la revelación dice la categoría, quién era el intruso y quién votó qué', () => {
    const html = render(revealGame(), player({ canVote: false, vote: { optionId: 'D', votedAt: 2_000 } }));
    expect(html).toContain('Categoría: Pokémon fósiles');
    expect(html).toContain('Se resucitan de un fósil.');
    expect(html).toContain('El intruso era Pikachu');
    expect(html).toContain('¡Era el intruso!');
    expect(html.match(/data-mark="correct"/g)).toHaveLength(3);
    expect(html.match(/data-mark="wrong"/g)).toHaveLength(1);
    expect(html).toContain('data-testid="odd-voters-D"');
    expect(html).toContain('data-testid="odd-voters-A"');
  });

  it('el espectador ve «El intruso era» una sola vez', () => {
    const html = renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(OddOneOutGame, { room: room(revealGame(), null), selfId: 'espectador', onAction: async () => undefined })));
    expect(html).toContain('Resultado de la ronda');
    expect(html.match(/El intruso era/g)).toHaveLength(1);
  });

  it('longCategoryWraps: el nombre largo de la categoría parte palabras en vez de desbordar', () => {
    const html = render(revealGame(LONG));
    expect(html).toContain(`Categoría: ${LONG}`);
    expect(html).toContain(`class="${s.category}`);
    const css = readFileSync(new URL('./OddOneOut.module.css', import.meta.url), 'utf8');
    expect(/\.category\s*\{[^}]*overflow-wrap:\s*anywhere/.test(css)).toBe(true);
  });

  it('tiene exactamente una región viva en cada fase', () => {
    expectSingleLiveRegion(render(publicGame()));
    expectSingleLiveRegion(render(publicGame({ votedPlayerIds: ['p1'] }), player({ canVote: false, vote: { optionId: 'B', votedAt: 2_000 } })));
    expectSingleLiveRegion(render(revealGame()));
    expectSingleLiveRegion(render(publicGame(), null));
  });

  it('el espectador mira sin cartas-botón', () => {
    const html = render(publicGame(), player({ canVote: false }));
    expect(html).not.toMatch(/<button[^>]*data-odd-option/);
  });
});

describe('El Intruso: resultados', () => {
  it('lista la clasificación con aciertos y precisión', () => {
    const game = publicGame({
      phase: 'GAME_RESULTS', roundNumber: 10,
      results: { winnerId: 'p1', standings: [
        { playerId: 'p1', position: 1, points: 20, stats: { correctVotes: 7, accuracy: 70 } },
        { playerId: 'p2', position: 2, points: 5, stats: { correctVotes: 1, accuracy: 10 } },
      ] },
    });
    const html = renderToStaticMarkup(createElement(OddOneOutResults, { room: room(game, null), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(html).toContain('7 aciertos · 70% de precisión');
    expect(html).toContain('1 acierto · 10% de precisión');
    expect(html).toContain('Eru');
  });
});

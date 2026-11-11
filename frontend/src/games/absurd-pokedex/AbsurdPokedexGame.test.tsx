import { defaultAbsurdPokedexConfig, type AbsurdPokedexPlayerState, type AbsurdPokedexPublicState, type AbsurdPokedexRoundResult, type RoomView } from '@pokemon-universe/shared/public';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AbsurdPokedexConfigPanel } from './ConfigPanel';
import { AbsurdPokedexGame } from './AbsurdPokedexGame';
import { AbsurdPokedexResults } from './AbsurdPokedexResults';
import { expectSingleLiveRegion } from '../../room/test-support/live-regions';
import { member, roomView } from '../../room/test-support/room-view';

// «Saltar minijuego» lee la sala: sin votación de salto no pinta nada.
vi.mock('../../room/RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));

const NAMES = ['Eru', 'Ana', 'Leo'];
type Mode = 'CLASSIC' | 'REAL_ENTRY';
type Phase = 'ROUND_ACTIVE' | 'VOTING' | 'ROUND_RESULTS' | 'GAME_RESULTS';
const pokemon = { id: 'gengar', name: 'Gengar', sprite: '/gengar.png', nationalDexNumber: 94, types: ['ghost', 'poison'] };

const lastRound = (mode: Mode, skipped = false): AbsurdPokedexRoundResult => ({
  mode, pokemon, skipped,
  entries: skipped ? [] : [
    { id: 'e-real', text: 'Se esconde en la sombra de quien corre.', authorId: null, isReal: true, votesReceived: 1, funnyVotesReceived: 0, votedBy: ['p3'], funnyVotedBy: [] },
    { id: 'e-ana', text: 'Colecciona calcetines desparejados.', authorId: 'p2', isReal: false, votesReceived: 1, funnyVotesReceived: 2, votedBy: ['p1'], funnyVotedBy: ['p1', 'p3'] },
    { id: 'e-leo', text: 'Odia los lunes.', authorId: 'p3', isReal: false, votesReceived: 0, funnyVotesReceived: 0, votedBy: [], funnyVotedBy: [] },
  ],
  realEntry: mode === 'REAL_ENTRY' && !skipped ? { id: 'e-real', versionLabel: 'Pokémon Rojo' } : null,
  winnerPlayerIds: skipped ? [] : ['p2'], pointsAwarded: { p1: 0, p2: 3, p3: 2 }, missingPlayerIds: [],
});

function publicGame(phase: Phase, mode: Mode = 'REAL_ENTRY', round: AbsurdPokedexRoundResult | null = null): AbsurdPokedexPublicState {
  return {
    gameId: 'absurd-pokedex', phase, mode, roundNumber: 1, totalRounds: 5, pokemon, playerIds: ['p1', 'p2', 'p3'],
    submittedPlayerIds: ['p1'], votedPlayerIds: phase === 'VOTING' ? ['p2'] : [],
    entries: phase === 'VOTING' ? [{ id: 'e-ana', text: 'Colecciona calcetines desparejados.' }, { id: 'e-real', text: 'Se esconde en la sombra de quien corre.' }, { id: 'e-leo', text: 'Odia los lunes.' }] : [],
    scores: { p1: 0, p2: 3, p3: 2 }, roundEndsAt: phase === 'ROUND_ACTIVE' || phase === 'VOTING' ? 31_000 : null, nextTransitionAt: phase === 'ROUND_RESULTS' ? 9_000 : null,
    lastRound: round, results: phase === 'GAME_RESULTS' ? { winnerId: 'p2', standings: [
      { playerId: 'p2', position: 1, points: 3, won: true, stats: { roundsPlayed: 1, entriesSubmitted: 1, votesReceived: 1, funnyVotesReceived: 2, roundWins: 1, realGuessed: 0, playersFooled: 1, pointsFromRounds: 3 } },
      { playerId: 'p3', position: 2, points: 2, won: false, stats: { roundsPlayed: 1, entriesSubmitted: 1, votesReceived: 0, funnyVotesReceived: 0, roundWins: 0, realGuessed: 1, playersFooled: 0, pointsFromRounds: 2 } },
      { playerId: 'p1', position: 3, points: 0, won: false, stats: { roundsPlayed: 1, entriesSubmitted: 1, votesReceived: 0, funnyVotesReceived: 0, roundWins: 0, realGuessed: 0, playersFooled: 0, pointsFromRounds: 0 } },
    ] } : null,
  };
}

function room(game: AbsurdPokedexPublicState, player: AbsurdPokedexPlayerState | null): RoomView {
  const members = NAMES.map((displayName, index) => member({ id: `p${index + 1}`, displayName, roomRole: index === 0 ? 'HOST' : 'MEMBER', isHost: index === 0, sessionPoints: game.scores[`p${index + 1}`] ?? 0 }));
  return roomView({ phase: game.phase, availableGames: [{ id: 'absurd-pokedex', name: 'Pokédex Absurda', icon: '📖', description: 'Entradas', minPlayers: 3, profileStats: { metrics: [] } }], selectedGameId: 'absurd-pokedex', selectedGameConfig: { ...defaultAbsurdPokedexConfig, mode: game.mode }, game, gamePlayerState: player, members });
}

const WRITING: AbsurdPokedexPlayerState = { role: 'PLAYER', canSubmit: true, ownDraft: '', ownEntry: null, canVote: false, ownVoteEntryId: null, ownFunnyEntryId: null };
const VOTER: AbsurdPokedexPlayerState = { role: 'PLAYER', canSubmit: false, ownDraft: '', ownEntry: { id: 'e-leo', text: 'Odia los lunes.' }, canVote: true, ownVoteEntryId: null, ownFunnyEntryId: null };
const render = (game: AbsurdPokedexPublicState, player: AbsurdPokedexPlayerState | null, selfId = 'p3') => renderToStaticMarkup(createElement(AbsurdPokedexGame, { room: room(game, player), selfId, onAction: async () => undefined }));
/** La lista de tarjetas de la votación: ahí no puede haber autores ni la oficial. */
const ballot = (html: string) => html.slice(html.indexOf('data-testid="absurd-entries"'), html.indexOf('</ul>', html.indexOf('data-testid="absurd-entries"')));

describe('Pokédex Absurda: pantalla', () => {
  it('escribir: la ficha del Pokémon, el título y el contador 0 / 150', () => {
    const html = render(publicGame('ROUND_ACTIVE'), WRITING);
    expect(html).toContain('Gengar');
    expect(html).toContain('Nº 094');
    expect(html).toContain('Fantasma');
    expect(html).toContain('Escribe su entrada de Pokédex');
    expect(html).toContain('0 / 150');
    expect(html).toContain('maxLength="150"');
  });

  it('no pinta autores ni la oficial al votar, aunque llegue un lastRound sobrante', () => {
    const html = render(publicGame('VOTING', 'REAL_ENTRY', lastRound('REAL_ENTRY')), VOTER);
    expect(html).not.toContain('Entrada oficial');
    expect(html).not.toContain('Engañó');
    expect(html).not.toContain('Pokémon Rojo');
    const cards = ballot(html);
    expect(cards.length).toBeGreaterThan(10);
    for (const name of NAMES) expect(cards).not.toContain(name);
    expect(cards).not.toContain('Hecha por');
  });

  it('la entrada propia lleva «Tu entrada» y ningún botón de voto', () => {
    const cards = ballot(render(publicGame('VOTING'), VOTER));
    const own = cards.split('<li').find((li) => li.includes('Odia los lunes.')) ?? '';
    expect(own).toContain('Tu entrada');
    expect(own).not.toContain('<button');
    const other = cards.split('<li').find((li) => li.includes('calcetines')) ?? '';
    expect(other).toContain('<button');
  });

  it('REAL_ENTRY: «Es la real» y el conmutador de graciosa en cada ajena; Clásico, solo «La más absurda»', () => {
    const real = ballot(render(publicGame('VOTING', 'REAL_ENTRY'), VOTER));
    expect(real.match(/Es la real/g)).toHaveLength(2);
    expect(real.match(/aria-pressed="false"/g)).toHaveLength(2);
    expect(real).toContain('😂 La más graciosa');
    const classic = ballot(render(publicGame('VOTING', 'CLASSIC'), VOTER));
    expect(classic.match(/La más absurda/g)).toHaveLength(2);
    expect(classic).not.toContain('Es la real');
    expect(classic).not.toContain('aria-pressed');
  });

  it('la revelación muestra la oficial, el autor y a quién engañó', () => {
    const html = render(publicGame('ROUND_RESULTS', 'REAL_ENTRY', lastRound('REAL_ENTRY')), VOTER);
    expect(html).toContain('Entrada oficial · Pokémon Rojo');
    expect(html).toContain('Engañó a Eru');
    expect(html).toContain('Ana');
  });

  it('el panel de puntos: gana antes que «Sin entrada» y los demás ven los votos de su entrada', () => {
    const base = lastRound('REAL_ENTRY');
    // Eru (p1) no escribió pero acertó la oficial y gana; Leo (p3) no gana y su entrada recibió dos votos.
    const round: AbsurdPokedexRoundResult = {
      ...base,
      entries: base.entries.map((entry) => (entry.authorId === 'p3' ? { ...entry, votesReceived: 2, votedBy: ['p1', 'p2'] } : entry)),
      winnerPlayerIds: ['p1'], missingPlayerIds: ['p1'], pointsAwarded: { p1: 2, p2: 1, p3: 2 },
    };
    const html = render(publicGame('ROUND_RESULTS', 'REAL_ENTRY', round), VOTER);
    const side = html.slice(html.indexOf('Puntos de la ronda'));
    // El recorte no incluye las tarjetas reveladas: los votos que se leen son los del panel.
    expect(side).not.toContain('Colecciona calcetines');
    expect(side).toContain('Ganó');
    expect(side).not.toContain('Sin entrada');
    expect(side).not.toContain('En juego');
    expect(side).toContain('2 votos');
    expect(side).toContain('1 voto');
  });

  it('una ronda saltada lo dice', () => {
    expect(render(publicGame('ROUND_RESULTS', 'REAL_ENTRY', lastRound('REAL_ENTRY', true)), VOTER)).toContain('Ronda sin suficientes entradas');
  });

  it('hay exactamente una región viva en cada fase', () => {
    for (const html of [render(publicGame('ROUND_ACTIVE'), WRITING), render(publicGame('VOTING'), VOTER), render(publicGame('ROUND_RESULTS', 'CLASSIC', lastRound('CLASSIC')), VOTER)]) {
      expectSingleLiveRegion(html);
    }
  });
});

describe('Pokédex Absurda: resultados y ajustes', () => {
  it('los resultados clasifican y no usan clases heredadas', () => {
    const html = renderToStaticMarkup(createElement(AbsurdPokedexResults, { room: room(publicGame('GAME_RESULTS'), null), selfId: 'p2', onLobby: () => undefined, onEnd: () => undefined }));
    expect(html).toContain('Ana');
    expect(html).toContain('Récords de la partida');
  });

  it('el panel ofrece el selector de modo', () => {
    const html = renderToStaticMarkup(createElement(AbsurdPokedexConfigPanel, { config: defaultAbsurdPokedexConfig, disabled: false, onChange: async () => undefined }));
    expect(html).toContain('Modo');
    expect(html).toContain('Tiempo para escribir');
  });
});

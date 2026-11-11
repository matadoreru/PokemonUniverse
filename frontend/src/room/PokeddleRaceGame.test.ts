import { defaultPokeddleRaceConfig, type PokeddleClueKey, type PokeddlePublicBoard, type PokeddleRacePlayerState, type PokeddleRacePublicState, type RoomView } from '@pokemon-universe/shared/public';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppHeader } from '../components/Layout';
import { PokeddleRaceConfigPanel } from '../games/pokeddle-race/ConfigPanel';
import { PokeddleBoard } from './PokeddleBoard';
import {
  formatPokeddleFeedback, getPokeddleColumns, pokeddleAnnouncement, pokeddleFocusKey, pokeddleMatchCount, pokeddlePlateKind, pokeddleRivalStatus, pokeddleVisibleSecret,
} from './pokeddle-presentation';
import { PokeddleRaceGame } from './PokeddleRaceGame';
import { PokeddleRaceResults } from './PokeddleRaceResults';
import { expectSingleLiveRegion } from './test-support/live-regions';

// «Saltar minijuego» va en la cabecera (`GameSkipSlot` lee la sala): sin votación de salto no pinta nada.
vi.mock('./RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));
vi.mock('../hooks/usePokemonPool', () => ({ usePokemonPool: () => ({ pokemon: [], loading: false, error: '', retry: () => undefined }) }));

const allClues: PokeddleClueKey[] = ['generation', 'dexNumber', 'types', 'typeCount', 'hp', 'attack', 'defense', 'specialAttack', 'specialDefense', 'speed', 'height', 'weight'];
const SECRET = { id: 'lucario', name: 'Lucario', sprite: '/secret-lucario.png' };
const RIVAL_SECRET = { id: 'garchomp', name: 'Garchomp', sprite: '/secret-garchomp.png' };

function board(playerId = 'p1', solved = false, guesses: [string, string] = ['Charmander', 'Lucario']): PokeddlePublicBoard {
  return {
    playerId,
    rows: [
      { round: 1, status: 'GUESS', guessedPokemon: { id: guesses[0].toLowerCase(), name: guesses[0], sprite: `/${guesses[0].toLowerCase()}.png` }, correct: false, submittedAt: 10, feedback: {
        generation: { kind: 'NUMERIC', value: 1, result: 'HIGHER' }, dexNumber: { kind: 'NUMERIC', value: 4, result: 'HIGHER' }, types: { kind: 'TYPES', value: ['fire'], result: 'NONE' }, typeCount: { kind: 'NUMERIC', value: 1, result: 'HIGHER' }, hp: { kind: 'NUMERIC', value: 39, result: 'HIGHER' }, attack: { kind: 'NUMERIC', value: 52, result: 'LOWER' }, defense: { kind: 'NUMERIC', value: 43, result: 'MATCH' }, specialAttack: { kind: 'NUMERIC', value: 60, result: 'HIGHER' }, specialDefense: { kind: 'NUMERIC', value: 50, result: 'LOWER' }, speed: { kind: 'NUMERIC', value: 65, result: 'LOWER' }, height: { kind: 'NUMERIC', value: 6, result: 'HIGHER' }, weight: { kind: 'NUMERIC', value: 85, result: 'LOWER' },
      } },
      { round: 2, status: 'NO_GUESS', guessedPokemon: null, feedback: null, correct: false, submittedAt: null },
      { round: 3, status: 'GUESS', guessedPokemon: { id: guesses[1].toLowerCase(), name: guesses[1], sprite: `/${guesses[1].toLowerCase()}.png` }, correct: solved, submittedAt: 30, feedback: {
        generation: { kind: 'NUMERIC', value: 4, result: 'MATCH' }, dexNumber: { kind: 'NUMERIC', value: 448, result: 'MATCH' }, types: { kind: 'TYPES', value: ['fighting', 'steel'], result: solved ? 'EXACT' : 'PARTIAL' }, typeCount: { kind: 'NUMERIC', value: 2, result: 'MATCH' }, hp: { kind: 'NUMERIC', value: 70, result: 'MATCH' }, attack: { kind: 'NUMERIC', value: 110, result: 'MATCH' }, defense: { kind: 'NUMERIC', value: 70, result: 'MATCH' }, specialAttack: { kind: 'NUMERIC', value: 115, result: 'MATCH' }, specialDefense: { kind: 'NUMERIC', value: 70, result: 'MATCH' }, speed: { kind: 'NUMERIC', value: 90, result: 'MATCH' }, height: { kind: 'NUMERIC', value: 12, result: 'MATCH' }, weight: { kind: 'NUMERIC', value: 540, result: 'MATCH' },
      } },
    ],
    solved,
    solvedRound: solved ? 3 : null,
    solvedAt: solved ? 30 : null,
    validGuesses: 2,
    missedRounds: 1,
    revealedPokemon: solved ? SECRET : null,
  };
}

type Phase = PokeddleRacePublicState['phase'];
function gameState(phase: Phase = 'ROUND_ACTIVE', boards: Record<string, PokeddlePublicBoard> = { p1: board('p1'), p2: board('p2', false, ['Pikachu', 'Gible']), p3: board('p3', false, ['Eevee', 'Riolu']) }): PokeddleRacePublicState {
  return { gameId: 'pokeddle-race', phase, roundNumber: 3, maxRounds: 10, roundStartedAt: 0, roundEndsAt: phase === 'ROUND_ACTIVE' ? 20_000 : null, nextTransitionAt: phase === 'ROUND_RESULTS' ? 23_000 : null, answeredPlayerIds: ['p2'], activePlayerIds: ['p1', 'p2', 'p3'], boards, enabledClues: allClues, results: null };
}

const guessing: PokeddleRacePlayerState = { canGuess: true, hasGuessedThisRound: false, solved: false };

function roomOf(game: PokeddleRacePublicState, player: PokeddleRacePlayerState | null, spectator = false): RoomView {
  return { code: 'ABC234', phase: game.phase, hostId: 'p1', maxPlayers: 8, selectedGameId: 'pokeddle-race', selectedGameConfig: { ...defaultPokeddleRaceConfig, generations: [1, 2, 3, 4] }, sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'ORDER', gameIds: ['pokeddle-race'] }, nextGameVote: null, gamesPlayed: 0, sessionStandings: [], sessionHistory: [], daily: null, serverNow: Date.now(), availableGames: [], game, gamePlayerState: player,
    members: ['p1', 'p2', 'p3'].map((id, index) => ({ id, displayName: ['Eru', 'Ana', 'Pedro'][index]!, avatar: { type: 'DEFAULT' }, connected: true, presence: index === 2 ? 'TEMPORARILY_DISCONNECTED' : 'CONNECTED', roomRole: index ? 'MEMBER' : 'HOST', role: index === 0 && spectator ? 'SPECTATOR' : 'PLAYER', isHost: index === 0, ready: false, sessionPoints: 0 })) } as RoomView;
}
const render = (view: RoomView) => renderToStaticMarkup(createElement(PokeddleRaceGame, { room: view, selfId: 'p1', onAction: async () => undefined }));

describe('Pokédle: presentación de las pistas', () => {
  it.each([
    ['HIGHER', 'higher', 'Mayor', 'Distinto: el secreto es mayor', 'bad'],
    ['LOWER', 'lower', 'Menor', 'Distinto: el secreto es menor', 'bad'],
    ['MATCH', 'match', 'Igual', 'Igual', 'ok'],
  ] as const)('%s tiene su palabra, su frase y su tono', (result, semantic, word, sentence, tone) => {
    expect(formatPokeddleFeedback('attack', { kind: 'NUMERIC', value: 84, result })).toMatchObject({ value: '84', result: word, accessibleResult: sentence, semantic, tone });
  });

  it('los tipos parciales y sin coincidencia no dependen del color', () => {
    expect(formatPokeddleFeedback('types', { kind: 'TYPES', value: ['fire'], result: 'PARTIAL' })).toMatchObject({ result: 'Parcial', semantic: 'partial', tone: 'warn', value: 'Fuego' });
    expect(formatPokeddleFeedback('types', { kind: 'TYPES', value: ['water'], result: 'NONE' })).toMatchObject({ result: 'Distinto', semantic: 'none', tone: 'bad' });
  });

  it('sin línea evolutiva no dice «etapa 1»: el texto largo para lectores y el corto en la casilla', () => {
    const presentation = formatPokeddleFeedback('evolutionStage', { kind: 'EVOLUTION', value: { stage: 1, stages: 1 }, result: 'MATCH' });
    expect(presentation.value).toBe('Sin evolución · No tiene etapas evolutivas');
    expect(presentation.short).toBe('Única');
    expect(formatPokeddleFeedback('evolutionStage', { kind: 'EVOLUTION', value: { stage: 2, stages: 3 }, result: 'LOWER' })).toMatchObject({ value: 'Etapa 2/3', short: '2/3' });
  });

  it('la etapa evolutiva es parcial si coincide la etapa pero no el total, y lo dice a los lectores', () => {
    expect(formatPokeddleFeedback('evolutionStage', { kind: 'EVOLUTION', value: { stage: 1, stages: 2 }, result: 'PARTIAL' })).toMatchObject({
      value: 'Etapa 1/2', short: '1/2', result: 'Parcial', semantic: 'partial', tone: 'warn',
      accessibleResult: 'Parcial: misma etapa, distinto número de etapas',
    });
  });

  it('formatea altura, peso y número de Pokédex', () => {
    expect(formatPokeddleFeedback('height', { kind: 'NUMERIC', value: 12, result: 'MATCH' }).value).toBe('1.2 m');
    expect(formatPokeddleFeedback('weight', { kind: 'NUMERIC', value: 540, result: 'MATCH' })).toMatchObject({ value: '54.0 kg', short: '54.0' });
    expect(formatPokeddleFeedback('dexNumber', { kind: 'NUMERIC', value: 4, result: 'MATCH' }).value).toBe('#004');
  });

  it('solo genera las columnas configuradas', () => {
    expect(getPokeddleColumns(['generation', 'types', 'attack']).map((column) => column.key)).toEqual(['generation', 'types', 'attack']);
    expect(getPokeddleColumns(['types', 'attack']).map((column) => column.wide)).toEqual([true, false]);
  });

  it('cuenta las coincidencias exactas de un intento', () => {
    expect(pokeddleMatchCount(board().rows[0]!)).toBe(1);
    expect(pokeddleMatchCount(board('p1', true).rows[2]!)).toBe(12);
    expect(pokeddleMatchCount(board().rows[1]!)).toBe(0);
  });
});

describe('Pokédle: estado de la placa, foco y anuncios', () => {
  it('elige la placa según la fase y el jugador', () => {
    expect(pokeddlePlateKind('ROUND_ACTIVE', guessing, true)).toBe('guess');
    expect(pokeddlePlateKind('ROUND_ACTIVE', { ...guessing, canGuess: false, hasGuessedThisRound: true }, true)).toBe('submitted');
    expect(pokeddlePlateKind('ROUND_ACTIVE', { ...guessing, canGuess: false }, true)).toBe('out');
    expect(pokeddlePlateKind('ROUND_RESULTS', guessing, true)).toBe('reveal');
    expect(pokeddlePlateKind('ROUND_RESULTS', { ...guessing, solved: true }, true)).toBe('solved');
    expect(pokeddlePlateKind('GAME_STARTING', guessing, true)).toBe('waiting');
    expect(pokeddlePlateKind('ROUND_ACTIVE', null, false)).toBe('watching');
    expect(pokeddlePlateKind('ROUND_ACTIVE', guessing, false)).toBe('watching');
  });

  it('mueve el foco al enviar, al cerrar cada ronda y al encontrar el Pokémon (una vez)', () => {
    expect(pokeddleFocusKey('guess', 2)).toBeNull();
    expect(pokeddleFocusKey('submitted', 2)).toBe('submitted-2');
    expect(pokeddleFocusKey('reveal', 2)).toBe('reveal-2');
    expect(pokeddleFocusKey('solved', 2)).toBe(pokeddleFocusKey('solved', 3));
  });

  it('anuncia el intento, la ronda cerrada, el acierto y los rivales que lo encuentran', () => {
    expect(pokeddleAnnouncement({ kind: 'submitted', roundNumber: 3, own: board(), submittedName: 'Riolu', rivalsSolved: [] })).toBe('Intento enviado: Riolu. Esperando al resto.');
    expect(pokeddleAnnouncement({ kind: 'reveal', roundNumber: 3, own: board(), rivalsSolved: [{ player: 'Ana', pokemon: 'Gible' }] })).toBe('Ronda 3 cerrada: Lucario coincide en 11 de 12 pistas. Ana ha encontrado su Pokémon: Gible.');
    expect(pokeddleAnnouncement({ kind: 'reveal', roundNumber: 2, own: board(), rivalsSolved: [] })).toBe('Ronda 2 cerrada: sin respuesta.');
    expect(pokeddleAnnouncement({ kind: 'solved', roundNumber: 3, own: board('p1', true), rivalsSolved: [] })).toBe('¡Pokémon encontrado! Era Lucario, en la ronda 3.');
    expect(pokeddleAnnouncement({ kind: 'solved', roundNumber: 5, own: board('p1', true), rivalsSolved: [] })).toBe('');
    expect(pokeddleAnnouncement({ kind: 'guess', roundNumber: 3, own: board(), rivalsSolved: [] })).toBe('');
  });

  it('resume a un rival sin enseñar sus intentos', () => {
    expect(pokeddleRivalStatus(board('p2', true), 'ROUND_ACTIVE', false)).toMatchObject({ kind: 'solved', label: 'Resuelto · Lucario', detail: 'Ronda 3 · 2 intentos' });
    expect(pokeddleRivalStatus(board('p2'), 'ROUND_ACTIVE', true)).toMatchObject({ kind: 'answered', label: 'Intento enviado', detail: '2 intentos · 1 sin responder' });
    expect(pokeddleRivalStatus(board('p2'), 'ROUND_ACTIVE', false).kind).toBe('thinking');
    expect(pokeddleRivalStatus(board('p2'), 'ROUND_RESULTS', false).kind).toBe('waiting');
  });

  it('el Pokémon secreto solo se lee si está resuelto o la partida terminó', () => {
    const leaked = { ...board('p1'), revealedPokemon: SECRET };
    expect(pokeddleVisibleSecret(leaked, 'ROUND_ACTIVE')).toBeNull();
    expect(pokeddleVisibleSecret(leaked, 'ROUND_RESULTS')).toBeNull();
    expect(pokeddleVisibleSecret(leaked, 'GAME_RESULTS')).toEqual(SECRET);
    expect(pokeddleVisibleSecret(board('p1', true), 'ROUND_ACTIVE')).toEqual(SECRET);
  });
});

describe('Pokédle: tablero', () => {
  it('una casilla por pista configurada, con valor, icono y la frase para lectores', () => {
    const markup = renderToStaticMarkup(createElement(PokeddleBoard, { board: board(), clues: ['generation', 'types', 'attack'] }));
    expect(markup.match(/data-clue-key="generation"/g)).toHaveLength(2);
    expect(markup).not.toContain('data-clue-key="weight"');
    expect(markup).toContain('Ataque: 52. Distinto: el secreto es menor.');
    expect(markup).toContain('data-feedback="lower"');
    expect(markup).toContain('>Menor<');
    expect(markup).toContain('data-type="fire"');
    // Sin emojis ni clases heredadas.
    expect(markup).not.toMatch(/🔥|text-aqua|bg-night|text-\[1[01]px\]/);
  });

  it('el último intento va primero y marcado; las rondas sin respuesta son una franja', () => {
    const markup = renderToStaticMarkup(createElement(PokeddleBoard, { board: board(), clues: ['generation'] }));
    expect(markup).toContain('data-row-status="no-guess"');
    expect(markup).toContain('Ronda 2 · Sin respuesta');
    expect(markup.indexOf('Lucario')).toBeLessThan(markup.indexOf('Charmander'));
    expect(markup.match(/data-latest="true"/g)).toHaveLength(1);
    expect(markup).toContain('Último');
  });

  it('el intento acertado dice «Encontrado»', () => {
    const markup = renderToStaticMarkup(createElement(PokeddleBoard, { board: board('p1', true), clues: ['generation', 'types'] }));
    expect(markup).toContain('data-correct="true"');
    expect(markup).toContain('Encontrado');
    expect(markup).toContain('Tipos: Lucha / Acero. Igual.');
  });

  it('con intentos, la leyenda compacta queda fija a la vista con las mismas palabras que las casillas', () => {
    const markup = renderToStaticMarkup(createElement(PokeddleBoard, { board: board(), clues: allClues }));
    expect(markup).toContain('aria-label="Cómo leer el tablero"');
    for (const word of ['Igual', 'Parcial', 'Distinto', 'El secreto es mayor', 'El secreto es menor']) expect(markup).toContain(word);
    expect(markup).not.toMatch(/Coincide|No coincide/);
  });

  it('el tablero de un rival habla en tercera persona y nunca enseña su secreto sin resolver', () => {
    const markup = renderToStaticMarkup(createElement(PokeddleBoard, { board: { ...board('p2', false, ['Pikachu', 'Gible']), revealedPokemon: RIVAL_SECRET }, clues: allClues, mode: 'rival', owner: 'Ana', title: 'Sus intentos' }));
    expect(markup).toContain('data-board-mode="rival"');
    expect(markup).toContain('aria-label="Tablero de intentos de Ana"');
    expect(markup).toContain('Intentos de Ana, el último primero');
    expect(markup).toContain('Pikachu');
    expect(markup).toContain('Gible');
    expect(markup).not.toMatch(/Garchomp|secret-garchomp/);
    const empty = renderToStaticMarkup(createElement(PokeddleBoard, { board: { ...board('p2'), rows: [] }, clues: allClues, mode: 'rival', owner: 'Ana' }));
    expect(empty).toContain('Todavía no hay intentos.');
  });

  it('el vacío enseña a jugar con la leyenda', () => {
    const markup = renderToStaticMarkup(createElement(PokeddleBoard, { board: { ...board(), rows: [], validGuesses: 0, missedRounds: 0 }, clues: allClues }));
    expect(markup).toContain('Tu primer intento aparecerá aquí.');
    expect(markup).toContain('aria-label="Cómo leer el tablero"');
    expect(markup).toContain('El secreto es mayor');
  });
});

describe('Pokédle Race: privacidad', () => {
  const NAMES = /Lucario|secret-lucario|Garchomp|secret-garchomp/;
  it('en la ronda no pinta ningún Pokémon secreto, aunque llegue uno en un tablero sin resolver', () => {
    const boards = { p1: { ...board('p1', false, ['Charmander', 'Riolu']), revealedPokemon: SECRET }, p2: { ...board('p2', false, ['Pikachu', 'Gible']), revealedPokemon: RIVAL_SECRET }, p3: board('p3', false, ['Eevee', 'Abra']) };
    for (const phase of ['ROUND_ACTIVE', 'ROUND_RESULTS'] as const) {
      expect(render(roomOf(gameState(phase, boards), guessing))).not.toMatch(NAMES);
      expect(render(roomOf(gameState(phase, boards), { ...guessing, canGuess: false, hasGuessedThisRound: true }))).not.toMatch(NAMES);
      expect(render(roomOf(gameState(phase, { p2: boards.p2, p3: boards.p3 }), null, true))).not.toMatch(NAMES);
    }
  });

  it('cada rival es un botón «Ver tablero de X»; su tablero solo se monta al abrirlo (diálogo cerrado)', () => {
    const html = render(roomOf(gameState(), guessing));
    expect(html).toContain('aria-label="Ver tablero de Ana: Intento enviado, 2 intentos · 1 sin responder"');
    expect(html).toContain('aria-label="Ver tablero de Pedro: Pensando…, 2 intentos · 1 sin responder"');
    expect(html).not.toContain('Ver tablero de Eru');
    expect(html.match(/<button type="button"[^>]*aria-label="Ver tablero de/g)).toHaveLength(2);
    // Cerrado, el diálogo no pinta los intentos del rival.
    for (const name of ['Pikachu', 'Gible', 'Eevee', '/gible.png']) expect(html).not.toContain(name);
  });

  it('el Pokémon de un rival resuelto sí es público (como hasta ahora)', () => {
    const boards = { p1: board('p1'), p2: { ...board('p2', true, ['Pikachu', 'Garchomp']), revealedPokemon: RIVAL_SECRET } };
    const html = render(roomOf(gameState('ROUND_ACTIVE', boards), guessing));
    expect(html).toContain('Resuelto · Garchomp');
    expect(html).toContain('/secret-garchomp.png');
  });
});

describe('Pokédle Race: pantalla', () => {
  it('ronda: tablero propio, buscador con su etiqueta, la carrera en franjas y una sola región viva', () => {
    const html = render(roomOf(gameState(), guessing));
    expect(html.match(/data-board-mode="self"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Buscar respuesta para la ronda 3"');
    expect(html.match(/data-testid="pokeddle-race-row"/g)).toHaveLength(3);
    expect(html).toContain('Eru (tú)');
    expect(html).toContain('Sin conexión');
    expect(html).toContain('Ronda 3 de 10');
    expect(html).toMatch(/<h1[^>]*>Busca tu Pokémon<\/h1>/);
    expectSingleLiveRegion(html);
    expect(html).not.toContain('aria-live="polite" role');
    expect(html).not.toMatch(/reveal-pop|btn-|role="tablist"/);
  });

  it('intento enviado: sin buscador, con la espera en texto', () => {
    const html = render(roomOf(gameState(), { ...guessing, canGuess: false, hasGuessedThisRound: true }));
    expect(html).not.toContain('Buscar respuesta para la ronda');
    expect(html).toContain('Intento enviado');
    expect(html).toContain('Esperando al resto');
  });

  it('ronda cerrada: la cuenta atrás y cómo fue el intento propio', () => {
    const html = render(roomOf(gameState('ROUND_RESULTS'), guessing));
    expect(html).toMatch(/<h1[^>]*>Pistas de la ronda 3<\/h1>/);
    expect(html).toContain('Ronda 3 cerrada');
    expect(html).toMatch(/Siguiente ronda en \d+s/);
    expect(html).toContain('Lucario coincide en 11 de 12 pistas.');
  });

  it('encontrado: «¡Era X!», el Pokémon en la placa y sin buscador', () => {
    const html = render(roomOf(gameState('ROUND_ACTIVE', { p1: board('p1', true), p2: board('p2') }), { canGuess: false, hasGuessedThisRound: false, solved: true }));
    expect(html).toMatch(/<h1[^>]*>¡Era Lucario!<\/h1>/);
    expect(html).toContain('¡Pokémon encontrado!');
    expect(html).not.toContain('Buscar respuesta para la ronda');
  });

  it('espectador (sin estado de jugador): ve la carrera sin controles ni tablero propio', () => {
    const html = render(roomOf(gameState('ROUND_ACTIVE', { p2: board('p2'), p3: board('p3') }), null, true));
    expect(html).toContain('Estás observando');
    expect(html).toContain('abre el tablero de cada jugador desde su franja');
    expect(html).not.toMatch(/privados|son de cada uno/);
    expect(html).toContain('Ver tablero de Ana');
    expect(html).not.toContain('Buscar respuesta para la ronda');
    expect(html).not.toContain('data-board-mode="self"');
    expect(html.match(/data-testid="pokeddle-race-row"/g)).toHaveLength(2);
  });
});

describe('Pokédle Race: resultados y ajustes', () => {
  const finished = (): PokeddleRacePublicState => ({
    ...gameState('GAME_RESULTS', { p1: board('p1', true), p2: { ...board('p2'), revealedPokemon: RIVAL_SECRET } }),
    results: { winnerId: 'p1', standings: [
      { playerId: 'p1', position: 1, points: 10, won: true, stats: { resolved: 1, unresolved: 0, totalGuesses: 2, guessesToSolveTotal: 2, resolutionRoundsTotal: 3, bestResolutionRounds: 3, bestTimeMs: 42_000, missedRounds: 1, roundsParticipated: 3 } },
      { playerId: 'p2', position: 2, points: 0, won: false, stats: { resolved: 0, unresolved: 1, totalGuesses: 2, guessesToSolveTotal: 0, resolutionRoundsTotal: 0, bestResolutionRounds: 0, bestTimeMs: 0, missedRounds: 1, roundsParticipated: 3 } },
    ] },
  });

  it('clasificación con el Pokémon de cada uno, métricas en texto y récords', () => {
    const html = renderToStaticMarkup(createElement(PokeddleRaceResults, { room: roomOf(finished(), null), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(html).toContain('Clasificación final');
    expect(html).toContain('Lucario · ronda 3');
    expect(html).toContain('No resuelto');
    expect(html).toContain('Era Garchomp');
    // El sprite del Pokémon de cada uno, en su franja.
    expect(html.match(/data-testid="results-sprite"/g)).toHaveLength(2);
    expect(html).toContain('2 intentos · 1 sin responder · resuelto a los 42.0s');
    expect(html).toContain('En menos rondas');
    expect(html).toContain('Resolución más rápida');
    expect(html).not.toMatch(/🥇|btn-primary|class="card"/);
  });

  it('ajustes: un interruptor por pista, rondas desde 1 y aviso sin pistas', () => {
    const html = renderToStaticMarkup(createElement(PokeddleRaceConfigPanel, { config: defaultPokeddleRaceConfig, disabled: false, onChange: async () => undefined }));
    expect(html.match(/role="switch"/g)).toHaveLength(17);
    expect(html).toContain('min="1" max="30"');
    expect(html).not.toContain('class="chip');
    const none = { ...defaultPokeddleRaceConfig, clues: Object.fromEntries(Object.keys(defaultPokeddleRaceConfig.clues).map((key) => [key, false])) };
    expect(renderToStaticMarkup(createElement(PokeddleRaceConfigPanel, { config: none, disabled: false, onChange: async () => undefined }))).toContain('Selecciona al menos una pista.');
  });
});

describe('Global header accessibility', () => {
  it('puts the brand and actions in HUD plates and exposes profile and logout actions', () => {
    const user = { id: 'p1', displayName: 'Eru', kind: 'USER' as const, email: 'eru@example.com', avatar: { type: 'DEFAULT' as const } };
    const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(AppHeader, { user, onLogout: () => undefined })));
    expect(markup).toContain('data-layout="hud-plates"');
    expect(markup).not.toContain('Pokémon Universe, inicio');
    expect(markup).not.toContain('Novedades');
    expect(markup).not.toContain('Más opciones');
    expect(markup).toContain('aria-label="Ir al inicio"');
    expect(markup).toContain('aria-label="Ajustes de sonido"');
    expect(markup).toContain('aria-label="Enviar feedback"');
    expect(markup).toContain('aria-label="Abrir perfil de Eru"');
    expect(markup).toContain('aria-label="Cerrar sesión"');
    expect(markup).not.toContain('Abrir panel de administración');
    const admin = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(AppHeader, { user: { ...user, role: 'ADMIN' as const }, onLogout: () => undefined })));
    expect(admin).toContain('aria-label="Abrir panel de administración"');
    const loggedOut = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(AppHeader, { user: null, onLogout: () => undefined })));
    expect(loggedOut).toContain('aria-label="Ajustes de sonido"');
    expect(loggedOut).not.toContain('Enviar feedback');
  });
});

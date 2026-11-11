import { defaultPokedexEntryGuessConfig, type PokedexEntryGuessPlayerState, type PokedexEntryGuessPublicState, type RoomView } from '@pokemon-universe/shared/public';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PokedexEntryGuessConfigPanel } from './ConfigPanel';
import { describePokedexEntryHint, entrySegments, fitFontSize } from './presentation';
import { PokedexEntryGuessGame } from './PokedexEntryGuessGame';
import { PokedexEntryGuessResults } from './PokedexEntryGuessResults';
import { expectSingleLiveRegion } from '../../room/test-support/live-regions';
import { member, roomView } from '../../room/test-support/room-view';

// «Saltar minijuego» va en la cabecera (`GameSkipSlot` lee la sala): sin votación de salto no pinta nada.
vi.mock('../../room/RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));
vi.mock('../../hooks/usePokemonPool', () => ({ usePokemonPool: () => ({ pokemon: [], loading: false, error: '', retry: () => undefined }) }));

const MASKED = 'Se dice que ??? aparece para advertir de catástrofes. ??? huye de los humanos.';
const REVEAL_SPRITE = '/api/rooms/ABC234/games/token/rounds/1/options/reveal/sprite';
const reveal: NonNullable<PokedexEntryGuessPublicState['lastRound']> = {
  pokemon: { name: 'Absol', sprite: REVEAL_SPRITE, generation: 3 },
  entry: { text: 'Se dice que Absol aparece para advertir de catástrofes. Absol huye de los humanos.', generation: 3, versionLabel: 'Pokémon Esmeralda' },
  solves: { p1: { solveOrder: 1, solvedAt: 2_000, elapsedMs: 1_000, points: 4, attempts: 1 } }, attemptCounts: { p1: 1, p2: 1 },
};

function publicGame(phase: 'ROUND_ACTIVE' | 'ROUND_RESULTS' | 'GAME_RESULTS' = 'ROUND_ACTIVE', overrides: Partial<PokedexEntryGuessPublicState> = {}): PokedexEntryGuessPublicState {
  return {
    gameId: 'pokedex-entry-guess', phase, roundNumber: 1, totalRounds: 10, referenceGeneration: 5, entryText: phase === 'ROUND_ACTIVE' ? MASKED : null, hints: [],
    attempts: [{ playerId: 'p2', guessedPokemon: { id: 'umbreon', name: 'Umbreon', sprite: '/umbreon.png' }, attemptedAt: 1_500 }],
    solvedPlayers: [], scores: { p1: 4, p2: 0 }, roundStartedAt: 1_000, roundEndsAt: phase === 'ROUND_ACTIVE' ? Date.now() + 25_000 : null,
    nextTransitionAt: phase === 'ROUND_RESULTS' ? Date.now() + 4_000 : null, lastRound: phase === 'ROUND_ACTIVE' ? null : reveal,
    results: phase === 'GAME_RESULTS' ? { winnerId: 'p1', standings: [
      { playerId: 'p1', position: 1, points: 4, won: true, stats: { correct: 1, missed: 0, totalAttempts: 1, firstTry: 1, roundFirsts: 1, solveTimeTotalMs: 1_000, bestTimeMs: 1_000, pointsFromRounds: 4 } },
      { playerId: 'p2', position: 2, points: 0, won: false, stats: { correct: 0, missed: 1, totalAttempts: 1, firstTry: 0, roundFirsts: 0, solveTimeTotalMs: 0, bestTimeMs: 0, pointsFromRounds: 0 } },
    ] } : null,
    ...overrides,
  };
}

const guessing: PokedexEntryGuessPlayerState = { canGuess: true, solved: false, solveOrder: null, cooldownUntil: null, roundPoints: 0, attemptCount: 0, lastAttempt: null };
const solvedPlayer: PokedexEntryGuessPlayerState = { canGuess: false, solved: true, solveOrder: 1, cooldownUntil: null, roundPoints: 4, attemptCount: 1, lastAttempt: { result: 'CORRECT', attemptedAt: 2_000 } };
const watching: PokedexEntryGuessPlayerState = { ...guessing, canGuess: false };

function room(game: PokedexEntryGuessPublicState, player: PokedexEntryGuessPlayerState | null, spectator = false): RoomView {
  return roomView({ phase: game.phase, selectedGameId: 'pokedex-entry-guess', selectedGameConfig: { ...defaultPokedexEntryGuessConfig, generations: [1, 2, 3, 4, 5] }, serverNow: Date.now(), game, gamePlayerState: player, members: [
    member({ id: 'p1', displayName: 'Eru', roomRole: 'HOST', role: spectator ? 'SPECTATOR' : 'PLAYER', isHost: true, sessionPoints: 4 }),
    member({ id: 'p2', displayName: 'Ana' }),
  ] });
}
const render = (view: RoomView) => renderToStaticMarkup(createElement(PokedexEntryGuessGame, { room: view, selfId: 'p1', onAction: async () => undefined }));
const ANSWER = /Absol|options\/reveal|Esmeralda/;

describe('Pokédex Entry Guess: privacidad', () => {
  it('nunca pinta la respuesta en la ronda, ni con un lastRound sobrante, ni a quien ya acertó, ni al espectador', () => {
    const stale = publicGame('ROUND_ACTIVE', { lastRound: reveal });
    expect(render(room(stale, guessing))).not.toMatch(ANSWER);
    expect(render(room({ ...stale, solvedPlayers: [{ playerId: 'p1', solveOrder: 1 }] }, solvedPlayer))).not.toMatch(ANSWER);
    expect(render(room(stale, watching, true))).not.toMatch(ANSWER);
    expect(render(room(stale, null))).not.toMatch(ANSWER);
  });

  it('en la revelación sí sale: «¡Era X!», la carta, la versión y la entrada completa con el nombre', () => {
    const html = render(room(publicGame('ROUND_RESULTS'), solvedPlayer));
    expect(html).toContain('¡Era Absol!');
    expect(html).toContain('alt="Absol"');
    expect(html).toContain(REVEAL_SPRITE);
    expect(html).toContain('Pokémon Esmeralda · Generación 3');
    expect(html).toContain('La entrada completa');
    expect(html).toContain('Se dice que Absol aparece');
  });
});

describe('Pokédex Entry Guess: pantalla', () => {
  it('la entrada va en un panel crema, con el nombre tapado («???» en texto y «nombre oculto» para lectores)', () => {
    const html = render(room(publicGame(), guessing));
    expect(html).toMatch(/<section class="[^"]*_cream_[^"]*" aria-label="Entrada de la Pokédex">/);
    expect(html).toContain('data-testid="pokedex-entry"');
    expect(html).toContain('<span aria-hidden="true">???</span><span class="sr-only">nombre oculto</span>');
    expect(html).toContain('aparece para advertir de catástrofes.');
    expect(html.match(/nombre oculto/g)).toHaveLength(2);
    expect(html).toContain('Referencia Gen 5');
    expect(html).toMatch(/<h1[^>]*>Reconoce su entrada<\/h1>/);
  });

  it('trozos de la entrada y ajuste del tamaño de letra (mayor que quepa, nunca menos del mínimo)', () => {
    expect(entrySegments('??? es fuerte. Como ???')).toEqual([
      { masked: true, text: '???' }, { masked: false, text: ' es fuerte. Como ' }, { masked: true, text: '???' },
    ]);
    expect(fitFontSize((px) => px <= 31, 15, 56)).toBe(31);
    expect(fitFontSize(() => true, 15, 56)).toBe(56);
    expect(fitFontSize(() => false, 15, 56)).toBe(15);
  });

  it('ronda: buscador con su etiqueta, marcador, intentos y una sola región viva', () => {
    const html = render(room(publicGame(), guessing));
    expect(html).toContain('aria-label="Buscar respuesta para la ronda 1"');
    expect(html).toContain('¿De quién es esta entrada?');
    expect(html).toContain('Ana probó');
    expect(html).toContain('Umbreon');
    expect(html).toContain('Ronda 1 de 10');
    expectSingleLiveRegion(html);
    expect(html.match(/role="alert"/g)).toBeNull();
    expect(html).not.toMatch(/btn-|reveal-pop|text-berry|text-leaf|text-aqua|class="label|aria-live="polite" class="max-h/);
  });

  it('acertado: «¡Acertado!» con puesto y puntos, sin buscador; el marcador lo dice en texto', () => {
    const html = render(room(publicGame('ROUND_ACTIVE', { solvedPlayers: [{ playerId: 'p1', solveOrder: 1 }] }), solvedPlayer));
    expect(html).toContain('¡Acertado!');
    expect(html).toContain('1.º en acertar');
    expect(html).toContain('Acertó · 1.º');
    expect(html).not.toContain('Buscar respuesta para la ronda');
    expect(html).toContain('Acierto, 1.º en acertar: 4 puntos esta ronda.');
  });

  it('tras un fallo propio: aviso visible y un anuncio fijo, y el buscador sigue', () => {
    const game = publicGame('ROUND_ACTIVE', { attempts: [{ playerId: 'p1', guessedPokemon: { id: 'umbreon', name: 'Umbreon', sprite: '/umbreon.png' }, attemptedAt: 1_500 }] });
    const html = render(room(game, { ...guessing, attemptCount: 1, lastAttempt: { result: 'INCORRECT', attemptedAt: 1_500 } }));
    expect(html).toContain('Umbreon</span> no era');
    expect(html).toContain('Incorrecto (1 intento): Umbreon no era.');
    expect(html).toContain('aria-label="Buscar respuesta para la ronda 1"');
  });

  it('el espectador ve la entrada y el marcador sin buscador', () => {
    const html = render(room(publicGame(), watching, true));
    expect(html).toContain('Estás observando');
    expect(html).toContain('aparece para advertir');
    expect(html).not.toContain('Buscar respuesta para la ronda');
  });

  it('pistas: las que manda el servidor, con su texto', () => {
    const html = render(room(publicGame('ROUND_ACTIVE', { hints: [{ kind: 'GENERATION', value: 3 }, { kind: 'TYPE', value: 'dark' }] }), guessing));
    expect(html).toContain('Generación 3');
    expect(html).toContain('Tipo Siniestro');
    expect(render(room(publicGame(), guessing))).not.toContain('data-testid="guess-hint"');
    expect(describePokedexEntryHint({ kind: 'EVOLUTION', stage: 1, stages: 1 })).toBe('No evoluciona');
  });

  it('revelación: puntos de la ronda por orden de acierto, con tiempo, intentos y «No acertó»', () => {
    const html = render(room(publicGame('ROUND_RESULTS'), solvedPlayer));
    expect(html).toContain('1.0s · 1 intento');
    expect(html).toContain('+4');
    expect(html).toContain('No acertó');
    expect(html).toContain('¡Acertaste! 1.º en acertar');
    expect(html).not.toMatch(/🥇|🥈|🥉/);
  });
});

describe('Pokédex Entry Guess: resultados y ajustes', () => {
  it('clasificación con las métricas en texto, récords y acciones del host', () => {
    const html = renderToStaticMarkup(createElement(PokedexEntryGuessResults, { room: room(publicGame('GAME_RESULTS'), null), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(html).toContain('Clasificación final');
    expect(html).toContain('Pokédex Entry Guess · 10 rondas');
    expect(html).toContain('1 acierto · 0 sin acertar · 1 intento · 100% precisión · media 1.0s · mejor 1.0s · 1 al primer intento');
    expect(html).toContain('0 aciertos · 1 sin acertar · 1 intento · 0% precisión · media — · mejor — · 0 al primer intento');
    expect(html).toContain('Récords de la partida');
    expect(html).toContain('entrada reconocida');
    expect(html).toContain('Continuar sesión');
    expect(html).toContain('Avatar de Eru');
    expect(html).not.toMatch(/🥇|🥈|🥉|btn-/);
  });

  it('ajustes con los controles del catálogo: referencia, tiempos y pistas', () => {
    const html = renderToStaticMarkup(createElement(PokedexEntryGuessConfigPanel, { config: { ...defaultPokedexEntryGuessConfig, hintsEnabled: true }, disabled: false, onChange: async () => undefined }));
    expect(html).toContain('Generación de referencia: 9');
    expect(html).toContain('primera posterior disponible');
    expect(html).toContain('25 segundos');
    expect(html).toContain('Número de rondas');
    expect(html).toContain('Pistas adicionales');
    expect(html).toContain('role="switch"');
    expect(html).toContain('Etapa evolutiva');
    // `GenerationSelector` sigue siendo el heredado (F9); el resto, del catálogo.
    expect(html).not.toMatch(/btn-|on-cream|type="checkbox"|text-electric|bg-leaf/);
  });
});

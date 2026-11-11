import type { PokemonCryQuizPlayerState, PokemonCryQuizPublicState, RoomView } from '@pokemon-universe/shared/public';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PokemonCryQuizConfigPanel } from './ConfigPanel';
import { CRY_PLAY_FAILED, CRY_UNAVAILABLE, cryAnnouncement, cryAudioEvents, cryVersionLabel, releaseCryDuck } from './presentation';
import { PokemonCryQuizGame } from './PokemonCryQuizGame';
import { PokemonCryQuizResults } from './PokemonCryQuizResults';
import { expectSingleLiveRegion } from '../../room/test-support/live-regions';
import { labelledRadiogroup } from '../../ui/segmented-markup';
import { member, roomView } from '../../room/test-support/room-view';

// «Saltar minijuego» va en la cabecera (`GameSkipSlot` lee la sala): sin votación de salto no pinta nada.
vi.mock('../../room/RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));
vi.mock('../../hooks/usePokemonPool', () => ({ usePokemonPool: () => ({ pokemon: [], loading: false, error: '', retry: () => undefined }) }));
const duck = vi.fn();
vi.mock('../../audio', () => ({ audio: { music: { duck: (on: boolean) => duck(on) } } }));

const CRY = '/api/rooms/ABC234/games/opaque/rounds/1/options/cry/audio';
const REVEAL_SPRITE = '/api/rooms/ABC234/games/opaque/rounds/1/options/reveal/sprite';
const config = { generations: [1], roundSeconds: 20, rounds: 10, cryVersion: 'LATEST', includeRegionalForms: false };
const reveal: NonNullable<PokemonCryQuizPublicState['lastRound']> = {
  pokemon: { name: 'Pikachu', sprite: REVEAL_SPRITE, generation: 1 }, cryVersion: 'LATEST', cryUrl: CRY,
  solves: { p1: { solveOrder: 1, solvedAt: 2_000, elapsedMs: 1_000, speedPoints: 10, placementBonus: 3, points: 13, attempts: 1 } }, attemptCounts: { p1: 1, p2: 1 },
};

function publicGame(phase: 'ROUND_ACTIVE' | 'ROUND_RESULTS' | 'GAME_RESULTS' = 'ROUND_ACTIVE', overrides: Partial<PokemonCryQuizPublicState> = {}): PokemonCryQuizPublicState {
  return {
    gameId: 'pokemon-cry-quiz', phase, roundNumber: 1, totalRounds: 10, cryUrl: phase === 'ROUND_ACTIVE' ? CRY : null,
    attempts: [{ playerId: 'p2', guessedPokemon: { id: 'raichu', name: 'Raichu', sprite: '/raichu.png' }, attemptedAt: 1_500 }],
    solvedPlayers: [], scores: { p1: 13, p2: 0 }, roundStartedAt: 1_000, roundEndsAt: phase === 'ROUND_ACTIVE' ? Date.now() + 20_000 : null,
    nextTransitionAt: phase === 'ROUND_RESULTS' ? Date.now() + 4_000 : null, lastRound: phase === 'ROUND_ACTIVE' ? null : reveal,
    results: phase === 'GAME_RESULTS' ? { winnerId: 'p1', standings: [
      { playerId: 'p1', position: 1, points: 13, won: true, stats: { correct: 1, missed: 0, totalAttempts: 1, firstTry: 1, roundFirsts: 1, solveTimeTotalMs: 1_000, bestTimeMs: 1_000, pointsFromRounds: 13 } },
      { playerId: 'p2', position: 2, points: 0, won: false, stats: { correct: 0, missed: 1, totalAttempts: 1, firstTry: 0, roundFirsts: 0, solveTimeTotalMs: 0, bestTimeMs: 0, pointsFromRounds: 0 } },
    ] } : null,
    ...overrides,
  };
}

const guessing: PokemonCryQuizPlayerState = { role: 'PLAYER', canGuess: true, solved: false, solveOrder: null, cooldownUntil: null, roundPoints: 0, attemptCount: 0, lastAttempt: null };
const solvedPlayer: PokemonCryQuizPlayerState = { role: 'PLAYER', canGuess: false, solved: true, solveOrder: 1, cooldownUntil: null, roundPoints: 13, attemptCount: 1, lastAttempt: { result: 'CORRECT', attemptedAt: 2_000 } };
const spectator: PokemonCryQuizPlayerState = { ...guessing, role: 'SPECTATOR', canGuess: false };

function room(game: PokemonCryQuizPublicState, player: PokemonCryQuizPlayerState | null): RoomView {
  return roomView({ phase: game.phase, selectedGameId: 'pokemon-cry-quiz', selectedGameConfig: config, serverNow: Date.now(), game, gamePlayerState: player, members: [
    member({ id: 'p1', displayName: 'Eru', roomRole: 'HOST', isHost: true }),
    member({ id: 'p2', displayName: 'Ana' }),
  ] });
}
const render = (view: RoomView) => renderToStaticMarkup(createElement(PokemonCryQuizGame, { room: view, selfId: 'p1', onAction: async () => undefined }));
const ANSWER = /Pikachu|options\/reveal|raw\.githubusercontent|\.ogg/;

describe('Adivina el Grito: privacidad', () => {
  it('nunca pinta la respuesta en la ronda, ni con un lastRound sobrante, ni a quien ya acertó, ni al espectador', () => {
    const stale = publicGame('ROUND_ACTIVE', { lastRound: reveal });
    expect(render(room(stale, guessing))).not.toMatch(ANSWER);
    expect(render(room({ ...stale, solvedPlayers: [{ playerId: 'p1', solveOrder: 1 }] }, solvedPlayer))).not.toMatch(ANSWER);
    expect(render(room(stale, spectator))).not.toMatch(ANSWER);
    expect(render(room(stale, null))).not.toMatch(ANSWER);
  });

  it('el grito va por su ruta opaca, sin autoplay, y en la revelación sale la carta con el grito para volver a oírlo', () => {
    const html = render(room(publicGame(), guessing));
    expect(html).toContain(`src="${CRY}"`);
    expect(html).toContain('preload="auto"');
    expect(html).not.toMatch(/autoplay/i);
    const revealed = render(room(publicGame('ROUND_RESULTS'), solvedPlayer));
    expect(revealed).toContain('¡Era Pikachu!');
    expect(revealed).toContain('alt="Pikachu"');
    expect(revealed).toContain('Su grito');
    expect(revealed).toContain('Volver a escuchar');
    expect(revealed).toContain('Generación 1 · grito actual');
  });
});

describe('Adivina el Grito: pantalla', () => {
  it('el error del grito no es otra región: se suma al aviso de la única región viva', () => {
    expect(cryAnnouncement('Ronda 2: escucha el grito.', CRY_PLAY_FAILED)).toBe(`Ronda 2: escucha el grito. ${CRY_PLAY_FAILED}`);
    expect(cryAnnouncement('', CRY_UNAVAILABLE)).toBe(CRY_UNAVAILABLE);
    expect(cryAnnouncement('Ronda 2: escucha el grito.', '')).toBe('Ronda 2: escucha el grito.');
  });

  it('el botón del grito es un Pill grande con su estado en texto y el ecualizador es decorativo', () => {
    const html = render(room(publicGame(), guessing));
    expect(html).toMatch(/<button[^>]*data-testid="cry-play"[^>]*>.*Reproducir grito<\/span><\/button>/);
    expect(html).toContain('aria-label="Grito del Pokémon misterioso"');
    expect(html).toMatch(/<span class="[^"]*waves[^"]*" aria-hidden="true">/);
    expect(html).toMatch(/<h1[^>]*>Reconoce su grito<\/h1>/);
  });

  it('ronda: buscador con su etiqueta por grito, marcador, intentos y una sola región viva', () => {
    const html = render(room(publicGame(), guessing));
    expect(html).toContain('aria-label="Buscar respuesta para el grito 1"');
    expect(html).toContain('¿De quién es este grito?');
    expect(html).toContain('Ana probó');
    expect(html).toContain('Raichu');
    expect(html).toContain('Ronda 1 de 10');
    expectSingleLiveRegion(html);
    expect(html).not.toMatch(/btn-|reveal-pop|text-berry|text-leaf|text-aqua|text-electric|animate-pulse/);
  });

  it('acertado: «¡Grito acertado!» con puesto y puntos, sin buscador; el marcador lo dice en texto', () => {
    const html = render(room(publicGame('ROUND_ACTIVE', { solvedPlayers: [{ playerId: 'p1', solveOrder: 1 }] }), solvedPlayer));
    expect(html).toContain('¡Grito acertado!');
    expect(html).toContain('1.º en acertar');
    expect(html).toContain('Acertó · 1.º');
    expect(html).not.toContain('Buscar respuesta para el grito');
    expect(html).toContain('Acierto, 1.º en acertar: 13 puntos esta ronda.');
  });

  it('tras un fallo propio: aviso visible y un anuncio fijo, y el buscador sigue', () => {
    const game = publicGame('ROUND_ACTIVE', { attempts: [{ playerId: 'p1', guessedPokemon: { id: 'raichu', name: 'Raichu', sprite: '/raichu.png' }, attemptedAt: 1_500 }] });
    const html = render(room(game, { ...guessing, attemptCount: 1, lastAttempt: { result: 'INCORRECT', attemptedAt: 1_500 } }));
    expect(html).toContain('Raichu</span> no era');
    expect(html).toContain('Incorrecto (1 intento): Raichu no era.');
    expect(html).toContain('aria-label="Buscar respuesta para el grito 1"');
  });

  it('intentos públicos apagados: sin el panel; el marcador ocupa la columna y el fallo propio sigue saliendo', () => {
    // El servidor ya no manda los fallos de nadie en la vista pública: los propios llegan en `player.attempts`.
    const view = { ...room(publicGame('ROUND_ACTIVE', { attempts: [] }), { ...guessing, attemptCount: 1, lastAttempt: { result: 'INCORRECT', attemptedAt: 1_500 }, attempts: [{ playerId: 'p1', guessedPokemon: { id: 'raichu', name: 'Raichu', sprite: '/raichu.png' }, attemptedAt: 1_500 }] }), selectedGameConfig: { ...config, publicAttempts: false } };
    const html = render(view);
    expect(html).not.toContain('Intentos públicos');
    expect(html).not.toContain('Intentos de la ronda');
    expect(html).toContain('aria-label="Marcador"');
    expect(html).toContain('Raichu</span> no era');
    expect(html).toContain('Incorrecto (1 intento): Raichu no era.');
  });

  it('el espectador (por su `player.role`) puede escuchar el grito y ve el marcador, sin buscador', () => {
    const html = render(room(publicGame(), spectator));
    expect(html).toContain('Estás observando');
    expect(html).toContain('Puedes escuchar el grito');
    expect(html).toContain('Reproducir grito');
    expect(html).not.toContain('Buscar respuesta para el grito');
  });

  it('revelación: puntos de la ronda por orden de acierto, con el desglose y «No acertó»', () => {
    const html = render(room(publicGame('ROUND_RESULTS'), solvedPlayer));
    expect(html).toContain('Rapidez 10 + orden 3');
    expect(html).toContain('1.0s · 1 intento');
    expect(html).toContain('+13');
    expect(html).toContain('No acertó');
    expect(html).toContain('¡Acertaste! 1.º en acertar');
    expect(html).not.toMatch(/🥇|🥈|🥉/);
    expect(cryVersionLabel('LEGACY')).toBe('grito clásico');
  });
});

describe('Adivina el Grito: la música baja mientras suena (F2)', () => {
  beforeEach(() => duck.mockClear());

  it('play baja la música; pausa, fin y error la devuelven; el estado «Sonando…» sigue a los eventos', () => {
    const playing = vi.fn(); const error = vi.fn();
    const events = cryAudioEvents({ playing, error });
    events.onPlay();
    expect(duck).toHaveBeenLastCalledWith(true); expect(playing).toHaveBeenLastCalledWith(true);
    events.onPause();
    expect(duck).toHaveBeenLastCalledWith(false); expect(playing).toHaveBeenLastCalledWith(false);
    events.onPlay(); events.onEnded();
    expect(duck).toHaveBeenLastCalledWith(false); expect(playing).toHaveBeenLastCalledWith(false);
    events.onPlay(); events.onError();
    expect(duck).toHaveBeenLastCalledWith(false); expect(error).toHaveBeenCalledWith(CRY_UNAVAILABLE);
    duck.mockClear();
    releaseCryDuck();
    expect(duck).toHaveBeenCalledWith(false);
  });

  it('pintar la pantalla no toca la música (sin autoplay)', () => {
    render(room(publicGame(), guessing));
    expect(duck).not.toHaveBeenCalledWith(true);
  });
});

describe('Adivina el Grito: resultados y ajustes', () => {
  it('clasificación con las métricas en texto, récords y acciones del host', () => {
    const html = renderToStaticMarkup(createElement(PokemonCryQuizResults, { room: room(publicGame('GAME_RESULTS'), null), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(html).toContain('Clasificación final');
    expect(html).toContain('Adivina el Grito · 10 rondas');
    expect(html).toContain('1 acierto · 0 sin acertar · 1 intento · 100% precisión · media 1.0s · mejor 1.0s · 1 al primer intento');
    expect(html).toContain('0 aciertos · 1 sin acertar · 1 intento · 0% precisión · media — · mejor — · 0 al primer intento');
    expect(html).toContain('Récords de la partida');
    expect(html).toContain('grito reconocido');
    expect(html).toContain('Continuar sesión');
    expect(html).not.toMatch(/🥇|🥈|🥉|btn-/);
  });

  it('ajustes con los controles del catálogo: versión del grito, formas y tiempos', () => {
    const html = renderToStaticMarkup(createElement(PokemonCryQuizConfigPanel, { config, disabled: false, onChange: async () => undefined }));
    expect(html).toMatch(labelledRadiogroup('Versión del grito'));
    expect(html).toContain('Clásico');
    expect(html).toContain('El grito moderno de cada Pokémon.');
    expect(html).toContain('Formas regionales');
    expect(html).toContain('role="switch"');
    expect(html).toContain('Tiempo por ronda');
    expect(html).toContain('Número de rondas');
    // `GenerationSelector` sigue siendo el heredado (F9); el resto, del catálogo.
    expect(html).not.toMatch(/btn-|on-cream|type="checkbox"/);
  });
});

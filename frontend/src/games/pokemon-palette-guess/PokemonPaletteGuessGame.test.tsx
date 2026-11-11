import type { PokemonPaletteGuessPlayerState, PokemonPaletteGuessPublicState, RoomView } from '@pokemon-universe/shared/public';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PokemonPaletteGuessConfigPanel } from './ConfigPanel';
import { colorName, describePaletteHint, paletteSwatches } from './presentation';
import { PokemonPaletteGuessGame } from './PokemonPaletteGuessGame';
import { PokemonPaletteGuessResults } from './PokemonPaletteGuessResults';
import { expectSingleLiveRegion } from '../../room/test-support/live-regions';
import { labelledRadiogroup } from '../../ui/segmented-markup';
import { member, roomView } from '../../room/test-support/room-view';

// «Saltar minijuego» va en la cabecera (`GameSkipSlot` lee la sala): sin votación de salto no pinta nada.
vi.mock('../../room/RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));
vi.mock('../../hooks/usePokemonPool', () => ({ usePokemonPool: () => ({ pokemon: [], loading: false, error: '', retry: () => undefined }) }));

const colors = ['#183048', '#d86048', '#f0c030', '#4878c0', '#78a848'];
const weights = [0.4, 0.25, 0.15, 0.12, 0.08];
const REVEAL_SPRITE = '/api/rooms/ABC234/games/token/rounds/1/options/reveal/sprite';
const config = { generations: [1], roundSeconds: 25, rounds: 10, paletteSize: 5, hintsEnabled: false, hintKinds: ['GENERATION', 'TYPE', 'EVOLUTION'] };
const reveal: NonNullable<PokemonPaletteGuessPublicState['lastRound']> = {
  pokemon: { name: 'Pikachu', sprite: REVEAL_SPRITE, generation: 1 }, palette: colors, paletteWeights: weights,
  solves: { p1: { solveOrder: 1, solvedAt: 2_000, elapsedMs: 1_000, speedPoints: 10, placementBonus: 3, points: 13, attempts: 1 } }, attemptCounts: { p1: 1, p2: 1 },
};

function publicGame(phase: 'ROUND_ACTIVE' | 'ROUND_RESULTS' | 'GAME_RESULTS' = 'ROUND_ACTIVE', overrides: Partial<PokemonPaletteGuessPublicState> = {}): PokemonPaletteGuessPublicState {
  return {
    gameId: 'pokemon-palette-guess', phase, roundNumber: 1, totalRounds: 10, colors, colorWeights: weights, hints: [],
    attempts: [{ playerId: 'p2', guessedPokemon: { id: 'raichu', name: 'Raichu', sprite: '/raichu.png' }, attemptedAt: 1_500 }],
    solvedPlayers: [], scores: { p1: 13, p2: 0 }, roundStartedAt: 1_000, roundEndsAt: phase === 'ROUND_ACTIVE' ? 26_000 : null,
    nextTransitionAt: phase === 'ROUND_RESULTS' ? 30_000 : null, lastRound: phase === 'ROUND_ACTIVE' ? null : reveal,
    results: phase === 'GAME_RESULTS' ? { winnerId: 'p1', standings: [
      { playerId: 'p1', position: 1, points: 13, won: true, stats: { correct: 1, missed: 0, totalAttempts: 1, firstTry: 1, roundFirsts: 1, solveTimeTotalMs: 1_000, bestTimeMs: 1_000, pointsFromRounds: 13 } },
      { playerId: 'p2', position: 2, points: 0, won: false, stats: { correct: 0, missed: 1, totalAttempts: 1, firstTry: 0, roundFirsts: 0, solveTimeTotalMs: 0, bestTimeMs: 0, pointsFromRounds: 0 } },
    ] } : null,
    ...overrides,
  };
}

const guessing: PokemonPaletteGuessPlayerState = { role: 'PLAYER', canGuess: true, solved: false, solveOrder: null, cooldownUntil: null, roundPoints: 0, attemptCount: 0, lastAttempt: null };
const solvedPlayer: PokemonPaletteGuessPlayerState = { role: 'PLAYER', canGuess: false, solved: true, solveOrder: 1, cooldownUntil: null, roundPoints: 13, attemptCount: 1, lastAttempt: { result: 'CORRECT', attemptedAt: 2_000 } };
const spectator: PokemonPaletteGuessPlayerState = { ...guessing, role: 'SPECTATOR', canGuess: false };

function room(game: PokemonPaletteGuessPublicState, player: PokemonPaletteGuessPlayerState | null): RoomView {
  return roomView({ phase: game.phase, selectedGameId: 'pokemon-palette-guess', selectedGameConfig: config, serverNow: Date.now(), game, gamePlayerState: player, members: [
    member({ id: 'p1', displayName: 'Eru', roomRole: 'HOST', isHost: true }),
    member({ id: 'p2', displayName: 'Ana' }),
  ] });
}
const render = (view: RoomView) => renderToStaticMarkup(createElement(PokemonPaletteGuessGame, { room: view, selfId: 'p1', onAction: async () => undefined }));
const ANSWER = /Pikachu|options\/reveal|targetPokemon/;

describe('Adivina por la Paleta: privacidad', () => {
  it('nunca pinta la respuesta en la ronda, ni con un lastRound sobrante, ni a quien ya acertó, ni al espectador', () => {
    const stale = publicGame('ROUND_ACTIVE', { lastRound: reveal });
    expect(render(room(stale, guessing))).not.toMatch(ANSWER);
    expect(render(room({ ...stale, solvedPlayers: [{ playerId: 'p1', solveOrder: 1 }] }, solvedPlayer))).not.toMatch(ANSWER);
    expect(render(room(stale, spectator))).not.toMatch(ANSWER);
    expect(render(room(stale, null))).not.toMatch(ANSWER);
  });

  it('en la revelación sí sale: «¡Era X!», la carta con su sprite y su paleta', () => {
    const html = render(room(publicGame('ROUND_RESULTS'), solvedPlayer));
    expect(html).toContain('¡Era Pikachu!');
    expect(html).toContain('alt="Pikachu"');
    expect(html).toContain(REVEAL_SPRITE);
    expect(html).toContain('Su paleta');
    expect(html).toContain('background-color:#183048');
  });
});

describe('Adivina por la Paleta: pantalla', () => {
  it('la paleta es la pista: barra con su nombre accesible y, en texto, el nombre y el porcentaje de cada color', () => {
    const html = render(room(publicGame(), guessing));
    expect(html).toContain('role="img" aria-label="Paleta de 5 colores con peso aproximado: azul oscuro, aproximadamente 40%;');
    expect(html).toContain('background-color:#183048');
    expect(html).toContain('title="azul oscuro, aproximadamente 40%"');
    // La leyenda: un elemento por color con su nombre y su porcentaje como texto (el color nunca va solo).
    const legend = html.slice(html.indexOf('data-testid="palette-legend"'), html.indexOf('</ol>', html.indexOf('data-testid="palette-legend"')));
    expect(legend.match(/<li/g)).toHaveLength(5);
    for (const swatch of paletteSwatches(colors, weights)) expect(legend).toContain(`>${swatch.name}</span>`);
    expect(legend).toContain('>40%</span>');
    expect(legend).toContain('>8%</span>');
    expect(html).toMatch(/<h1[^>]*>Reconoce sus colores<\/h1>/);
  });

  it('sin pesos válidos el peso se reparte por igual', () => {
    expect(paletteSwatches(colors, [1, 2]).map((swatch) => swatch.percent)).toEqual([20, 20, 20, 20, 20]);
    expect(colorName('#f0c030')).toBe('amarillo');
    expect(colorName('#000000')).toBe('negro');
  });

  it('ronda: buscador con su etiqueta por paleta, marcador, intentos y una sola región viva', () => {
    const html = render(room(publicGame(), guessing));
    expect(html).toContain('aria-label="Buscar respuesta para la paleta 1"');
    expect(html).toContain('¿De quién son estos colores?');
    expect(html).toContain('Ana probó');
    expect(html).toContain('Raichu');
    expect(html).toContain('Ronda 1 de 10');
    expectSingleLiveRegion(html);
    expect(html).not.toMatch(/btn-|reveal-pop|text-berry|text-leaf|aria-live="polite" class="max-h/);
  });

  it('acertado: «¡Paleta acertada!» con puesto y puntos, sin buscador; el marcador lo dice en texto', () => {
    const html = render(room(publicGame('ROUND_ACTIVE', { solvedPlayers: [{ playerId: 'p1', solveOrder: 1 }] }), solvedPlayer));
    expect(html).toContain('¡Paleta acertada!');
    expect(html).toContain('1.º en acertar');
    expect(html).toContain('Acertó · 1.º');
    expect(html).not.toContain('Buscar respuesta para la paleta');
    expect(html).toContain('Acierto, 1.º en acertar: 13 puntos esta ronda.');
  });

  it('tras un fallo propio: aviso visible y un anuncio fijo, y el buscador sigue', () => {
    const game = publicGame('ROUND_ACTIVE', { attempts: [{ playerId: 'p1', guessedPokemon: { id: 'raichu', name: 'Raichu', sprite: '/raichu.png' }, attemptedAt: 1_500 }] });
    const html = render(room(game, { ...guessing, attemptCount: 1, lastAttempt: { result: 'INCORRECT', attemptedAt: 1_500 } }));
    expect(html).toContain('Raichu</span> no era');
    expect(html).toContain('Incorrecto (1 intento): Raichu no era.');
    expect(html).toContain('aria-label="Buscar respuesta para la paleta 1"');
  });

  it('el espectador (por su `player.role`) ve la paleta y el marcador sin buscador', () => {
    const html = render(room(publicGame(), spectator));
    expect(html).toContain('Estás observando');
    expect(html).toContain('background-color:#183048');
    expect(html).not.toContain('Buscar respuesta para la paleta');
  });

  it('pistas: las que manda el servidor, con su texto', () => {
    const html = render(room(publicGame('ROUND_ACTIVE', { hints: [{ kind: 'GENERATION', value: 1 }, { kind: 'TYPE', values: ['electric'] }] }), guessing));
    expect(html).toContain('Generación 1');
    expect(html).toContain('Eléctrico');
    expect(render(room(publicGame(), guessing))).not.toContain('Pistas adicionales');
    expect(describePaletteHint({ kind: 'EVOLUTION', stage: 2, stages: 3 })).toBe('Evolución intermedia');
  });

  it('revelación: puntos de la ronda por orden de acierto, con el desglose y «No acertó»', () => {
    const html = render(room(publicGame('ROUND_RESULTS'), solvedPlayer));
    expect(html).toContain('Rapidez 10 + orden 3');
    expect(html).toContain('1.0s · 1 intento');
    expect(html).toContain('+13');
    expect(html).toContain('No acertó');
    expect(html).toContain('¡Acertaste! 1.º en acertar');
    expect(html).not.toMatch(/🥇|🥈|🥉/);
  });
});

describe('Adivina por la Paleta: resultados y ajustes', () => {
  it('clasificación con las métricas en texto, récords y acciones del host', () => {
    const html = renderToStaticMarkup(createElement(PokemonPaletteGuessResults, { room: room(publicGame('GAME_RESULTS'), null), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(html).toContain('Clasificación final');
    expect(html).toContain('Adivina por la Paleta · 10 rondas');
    expect(html).toContain('1 acierto · 0 sin acertar · 1 intento · 100% precisión · media 1.0s · mejor 1.0s · 1 al primer intento');
    expect(html).toContain('0 aciertos · 1 sin acertar · 1 intento · 0% precisión · media — · mejor — · 0 al primer intento');
    expect(html).toContain('Récords de la partida');
    expect(html).toContain('Continuar sesión');
    expect(html).not.toMatch(/🥇|🥈|🥉/);
  });

  it('ajustes con los controles del catálogo: tamaño de la paleta, pistas y tiempos', () => {
    const html = renderToStaticMarkup(createElement(PokemonPaletteGuessConfigPanel, { config: { ...config, hintsEnabled: true }, disabled: false, onChange: async () => undefined }));
    expect(html).toMatch(labelledRadiogroup('Máximo de colores visibles'));
    expect(html).toContain('todos los colores dominantes');
    expect(html).toContain('Pistas adicionales');
    expect(html).toContain('role="switch"');
    expect(html).toContain('Etapa evolutiva');
    expect(html).toContain('Número de rondas');
    // `GenerationSelector` sigue siendo el heredado (F9); el resto, del catálogo.
    expect(html).not.toMatch(/btn-|on-cream|type="checkbox"/);
  });
});

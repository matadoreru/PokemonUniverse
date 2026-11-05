import { defaultZoomedPokemonConfig, type RoomView, type ZoomedPokemonPlayerState, type ZoomedPokemonPublicState } from '@pokemon-universe/shared';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ZoomedPokemonConfigPanel } from '../games/zoomed-pokemon/ConfigPanel';
import { describeZoomedHint } from '../games/zoomed-pokemon/presentation';
import { ZoomedPokemonGame, ZoomViewport } from './ZoomedPokemonGame';
import { ZoomedPokemonResults } from './ZoomedPokemonResults';

// «Saltar minijuego» va en la cabecera (`GameSkipSlot` lee la sala): sin votación de salto no pinta nada.
vi.mock('./RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));
vi.mock('../hooks/usePokemonPool', () => ({ usePokemonPool: () => ({ pokemon: [], loading: false, error: '', retry: () => undefined }) }));

const BASE = '/api/rooms/ABC234/games/token/rounds/1/options';
const REVEAL_IMAGE = `${BASE}/reveal/sprite`;
const reveal: NonNullable<ZoomedPokemonPublicState['lastRound']> = {
  pokemon: { name: 'Lucario', generation: 4 }, imageUrl: REVEAL_IMAGE, initialCropUrl: `${BASE}/stage-0/sprite`, imageSourceType: 'SPRITE',
  solves: { p1: { solvedAt: 2_000, elapsedMs: 1_000, solveOrder: 1, zoomStage: 0, zoom: 5, zoomBonus: 4, points: 14, attempts: 1 } }, attemptCounts: { p1: 1, p2: 1 },
};

function publicGame(phase: 'ROUND_ACTIVE' | 'ROUND_RESULTS' | 'GAME_RESULTS' = 'ROUND_ACTIVE', overrides: Partial<ZoomedPokemonPublicState> = {}): ZoomedPokemonPublicState {
  return {
    gameId: 'zoomed-pokemon', phase, roundNumber: 1, totalRounds: 10, imageUrl: phase === 'ROUND_ACTIVE' ? `${BASE}/stage-0/sprite` : null, imageSourceType: phase === 'ROUND_ACTIVE' ? 'SPRITE' : null,
    focusPoint: { x: 0.5, y: 0.5 }, zoomStages: [5, 3.5, 2.5, 1.7], currentZoomStage: 0, currentZoomBonus: 4, visibleHints: [],
    attempts: [{ playerId: 'p2', guessedPokemon: { id: 'raichu', name: 'Raichu', sprite: '/raichu.png' }, attemptedAt: 1_500 }],
    solves: {}, scores: { p1: 14, p2: 0 }, roundStartedAt: 1_000, roundEndsAt: phase === 'ROUND_ACTIVE' ? 31_000 : null,
    nextTransitionAt: phase === 'ROUND_ACTIVE' ? 8_500 : phase === 'ROUND_RESULTS' ? 35_000 : null, lastRound: phase === 'ROUND_ACTIVE' ? null : reveal,
    results: phase === 'GAME_RESULTS' ? { winnerId: 'p1', standings: [
      { playerId: 'p1', position: 1, points: 14, won: true, stats: { correct: 1, missed: 0, totalAttempts: 1, firstTry: 1, firstPositions: 1, solveTimeTotalMs: 1_000, bestTimeMs: 1_000, maxZoomSolves: 1, solveStageTotal: 1, pointsFromRounds: 14, solvesBySprite: 1, solvesByArtwork: 0 } },
      { playerId: 'p2', position: 2, points: 0, won: false, stats: { correct: 0, missed: 1, totalAttempts: 1, firstTry: 0, firstPositions: 0, solveTimeTotalMs: 0, bestTimeMs: 0, maxZoomSolves: 0, solveStageTotal: 0, pointsFromRounds: 0, solvesBySprite: 0, solvesByArtwork: 0 } },
    ] } : null,
    ...overrides,
  };
}

const guessing: ZoomedPokemonPlayerState = { canGuess: true, solved: false, solveOrder: null, cooldownUntil: null, roundPoints: 0, attemptCount: 0, lastAttempt: null };
const solvedPlayer: ZoomedPokemonPlayerState = { canGuess: false, solved: true, solveOrder: 1, cooldownUntil: null, roundPoints: 14, attemptCount: 1, lastAttempt: { result: 'CORRECT', attemptedAt: 2_000 } };

function room(game: ZoomedPokemonPublicState, player: ZoomedPokemonPlayerState | null, spectator = false): RoomView {
  return { code: 'ABC234', phase: game.phase, hostId: 'p1', maxPlayers: 8, availableGames: [], selectedGameId: 'zoomed-pokemon', selectedGameConfig: defaultZoomedPokemonConfig, sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'ORDER', gameIds: ['zoomed-pokemon'] }, nextGameVote: null, gamesPlayed: 0, sessionStandings: [], sessionHistory: [], serverNow: Date.now(), game, gamePlayerState: player, members: [
    { id: 'p1', displayName: 'Eru', avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: 'HOST', role: spectator ? 'SPECTATOR' : 'PLAYER', isHost: true, ready: false, sessionPoints: 5 },
    { id: 'p2', displayName: 'Ana', avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: 'MEMBER', role: 'PLAYER', isHost: false, ready: false, sessionPoints: 0 },
  ] } as RoomView;
}
const render = (view: RoomView) => renderToStaticMarkup(createElement(ZoomedPokemonGame, { room: view, selfId: 'p1', onAction: async () => undefined }));
const ANSWER = /Lucario|options\/reveal|targetPokemon/;

describe('Zoomed Pokémon: privacidad', () => {
  it('nunca pinta la respuesta en la ronda (ni la imagen completa), ni con un lastRound sobrante, ni a quien ya acertó', () => {
    const stale = publicGame('ROUND_ACTIVE', { lastRound: reveal });
    expect(render(room(stale, guessing))).not.toMatch(ANSWER);
    expect(render(room({ ...stale, solves: { p1: { solveOrder: 1, zoomStage: 0 } } }, solvedPlayer))).not.toMatch(ANSWER);
    expect(render(room(stale, { ...guessing, canGuess: false }, true))).not.toMatch(ANSWER);
  });

  it('el recorte es una imagen opaca sin nombre: rol img con nombre genérico, alt vacío y sin title', () => {
    const html = render(room(publicGame(), guessing));
    expect(html).toContain('role="img" aria-label="Detalle ampliado del Pokémon misterioso"');
    expect(html).toContain(`src="${BASE}/stage-0/sprite" alt=""`);
    const start = html.indexOf('aria-label="Recorte ampliado del Pokémon misterioso"');
    expect(html.slice(start, html.indexOf('</section>', start))).not.toContain('title=');
    expect(html).toMatch(/<h1[^>]*>¿Qué Pokémon es\?<\/h1>/);
  });

  it('en la revelación sí sale: «¡Era X!», la carta con la imagen completa y el recorte inicial', () => {
    const html = render(room(publicGame('ROUND_RESULTS'), solvedPlayer));
    expect(html).toContain('¡Era Lucario!');
    expect(html).toContain('alt="Lucario"');
    expect(html).toContain(REVEAL_IMAGE);
    expect(html).toContain(`${BASE}/stage-0/sprite`);
    expect(html).toContain('Así empezó · Zoom ×5');
  });
});

describe('Zoomed Pokémon: pantalla', () => {
  it('lets the browser smooth enlarged sprites instead of forcing pixelated scaling', () => {
    const markup = renderToStaticMarkup(createElement(ZoomViewport, { source: '/sprite.png', sourceType: 'SPRITE', alt: 'Detalle ampliado' }));
    expect(markup).not.toContain('pixelated');
    const css = readFileSync(new URL('../games/zoomed-pokemon/Zoomed.module.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.viewport > img \{[^}]*image-rendering: auto;/);
    expect(css).not.toMatch(/image-rendering: pixelated/);
    // El recorte lo hace el servidor por etapas: el visor no escala ni transforma la imagen.
    expect(css).not.toMatch(/transform:|scale\(/);
  });

  it('ronda: zoom y bonificación en texto, cuándo se aleja, buscador por ronda, marcador, intentos y una sola región viva', () => {
    const html = render(room(publicGame(), guessing));
    expect(html).toContain('Zoom ×5');
    expect(html).toContain('Nivel 1 de 4 · bonificación +4');
    expect(html).toMatch(/Menos zoom en \d+s/);
    expect(html).toContain('aria-label="Buscar respuesta para la ronda 1"');
    expect(html).toContain('Ana probó');
    expect(html).toContain('Raichu');
    expect(html).toContain('Ronda 1 de 10');
    expect(html.match(/role="status"/g)).toHaveLength(1);
    // Sin las clases heredadas.
    expect(html).not.toMatch(/btn-|reveal-pop|text-berry|text-leaf/);
  });

  it('en la última etapa ya no hay cuenta atrás de zoom', () => {
    const html = render(room(publicGame('ROUND_ACTIVE', { currentZoomStage: 3, currentZoomBonus: 1, nextTransitionAt: null }), guessing));
    expect(html).toContain('Zoom ×1.7');
    expect(html).toContain('Nivel 4 de 4 · bonificación +1');
    expect(html).toContain('Último nivel de zoom');
  });

  it('acertado: «¡Acertado!» con puesto y puntos, sin buscador; el marcador lo dice en texto', () => {
    const html = render(room(publicGame('ROUND_ACTIVE', { solves: { p1: { solveOrder: 1, zoomStage: 0 } } }), solvedPlayer));
    expect(html).toContain('¡Acertado!');
    expect(html).toContain('1.º en acertar');
    expect(html).toContain('Acertó · 1.º');
    expect(html).not.toContain('Buscar respuesta para la ronda');
    expect(html).toContain('Acierto, 1.º en acertar: 14 puntos esta ronda.');
  });

  it('tras un fallo propio: aviso visible y un anuncio fijo, y el buscador sigue', () => {
    const game = publicGame('ROUND_ACTIVE', { attempts: [{ playerId: 'p1', guessedPokemon: { id: 'raichu', name: 'Raichu', sprite: '/raichu.png' }, attemptedAt: 1_500 }] });
    const html = render(room(game, { ...guessing, attemptCount: 1, lastAttempt: { result: 'INCORRECT', attemptedAt: 1_500 } }));
    expect(html).toContain('Raichu</span> no era');
    expect(html).toContain('Incorrecto (1 intento): Raichu no era.');
    expect(html).toContain('aria-label="Buscar respuesta para la ronda 1"');
  });

  it('el espectador ve el recorte y el marcador sin buscador', () => {
    const html = render(room(publicGame(), { ...guessing, canGuess: false }, true));
    expect(html).toContain('Estás observando');
    expect(html).toContain(`${BASE}/stage-0/sprite`);
    expect(html).not.toContain('Buscar respuesta para la ronda');
  });

  it('pistas: las que manda el servidor, con su texto', () => {
    const html = render(room(publicGame('ROUND_ACTIVE', { visibleHints: [{ kind: 'GENERATION', value: 4 }, { kind: 'TYPE', values: ['fighting', 'steel'] }] }), guessing));
    expect(html).toContain('Generación 4');
    expect(html).toContain('Lucha / Acero');
    expect(render(room(publicGame(), guessing))).not.toContain('Pistas adicionales');
    expect(describeZoomedHint({ kind: 'EVOLUTION', stage: 2, stages: 3 })).toBe('Evolución intermedia');
    expect(describeZoomedHint({ kind: 'TYPE_COUNT', value: 1 })).toBe('Monotipo');
  });

  it('revelación: puntos de la ronda por orden de acierto, con el zoom, su extra y «No acertó»', () => {
    const html = render(room(publicGame('ROUND_RESULTS'), solvedPlayer));
    expect(html).toContain('Zoom ×5 · +4 extra');
    expect(html).toContain('1.0s · 1 intento');
    expect(html).toContain('+14');
    expect(html).toContain('No acertó');
    expect(html.indexOf('Eru')).toBeLessThan(html.indexOf('No acertó'));
    expect(html).toContain('¡Acertaste! 1.º en acertar');
    expect(html).not.toMatch(/🥇|🥈|🥉/);
  });
});

describe('Zoomed Pokémon: resultados y ajustes', () => {
  it('clasificación con las métricas en texto, a máximo zoom, récords y acciones del host', () => {
    const html = renderToStaticMarkup(createElement(ZoomedPokemonResults, { room: room(publicGame('GAME_RESULTS'), guessing), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(html).toContain('Clasificación final');
    expect(html).toContain('1 acierto · 0 sin acertar · 1 intento · 100% precisión · media 1.0s · mejor 1.0s · 1 al primer intento · 1 a máximo zoom');
    expect(html).toContain('0 aciertos · 1 sin acertar · 1 intento · 0% precisión · media — · mejor — · 0 al primer intento · 0 a máximo zoom');
    expect(html).toContain('Récords de la partida');
    expect(html).toContain('A máximo zoom');
    expect(html).toContain('Continuar sesión');
    expect(html).not.toMatch(/🥇|🥈|🥉/);
  });

  it('ajustes con los controles del catálogo, en los límites del contrato', () => {
    const html = renderToStaticMarkup(createElement(ZoomedPokemonConfigPanel, { config: { ...defaultZoomedPokemonConfig, hintsEnabled: true }, disabled: false, onChange: async () => undefined }));
    expect(html).toContain('role="radiogroup" aria-label="Imagen"');
    expect(html).toContain('Tiempo por ronda');
    expect(html).toContain('min="15"');
    expect(html).toContain('Número de rondas');
    expect(html).toContain('role="switch"');
    expect(html).toContain('Formas y variantes');
    expect(html).toContain('Etapa evolutiva');
    expect(html).not.toMatch(/btn-|on-cream|type="checkbox"/);
  });
});

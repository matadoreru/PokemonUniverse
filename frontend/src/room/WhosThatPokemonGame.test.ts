import { defaultWhosThatPokemonConfig, type RoomView, type WhosThatPokemonPlayerState, type WhosThatPokemonPublicState } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WhosThatPokemonConfigPanel } from '../games/whos-that-pokemon/ConfigPanel';
import { describeWhosThatHint } from '../games/whos-that-pokemon/presentation';
import { WhosThatPokemonGame } from './WhosThatPokemonGame';
import { WhosThatPokemonResults } from './WhosThatPokemonResults';

// «Saltar minijuego» va en la cabecera (`GameSkipSlot` lee la sala): sin votación de salto no pinta nada.
vi.mock('./RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));
vi.mock('../hooks/usePokemonPool', () => ({ usePokemonPool: () => ({ pokemon: [], loading: false, error: '', retry: () => undefined }) }));

const REVEAL_SPRITE = '/api/rooms/ABC234/games/token/rounds/1/options/reveal/sprite';
const reveal = { pokemon: { name: 'Lucario', sprite: REVEAL_SPRITE, generation: 4 }, solves: { p1: { solveOrder: 1, solvedAt: 2_000, elapsedMs: 1_000, speedPoints: 10, placementBonus: 3, points: 13, attempts: 1 } }, attemptCounts: { p1: 1, p2: 1 } };

function publicGame(phase: 'ROUND_ACTIVE' | 'ROUND_RESULTS' | 'GAME_RESULTS' = 'ROUND_ACTIVE', overrides: Partial<WhosThatPokemonPublicState> = {}): WhosThatPokemonPublicState {
  return { gameId: 'whos-that-pokemon', phase, roundNumber: 1, totalRounds: 10, silhouetteSprite: phase === 'ROUND_ACTIVE' ? '/api/rooms/ABC234/games/token/rounds/1/options/shadow/sprite' : null, visibleHints: [], attempts: [{ playerId: 'p2', guessedPokemon: { id: 'raichu', name: 'Raichu', sprite: '/raichu.png' }, attemptedAt: 1_500 }], solvedPlayers: [{ playerId: 'p1', solveOrder: 1 }], scores: { p1: 13, p2: 0 }, roundStartedAt: 1_000, roundEndsAt: phase === 'ROUND_ACTIVE' ? 21_000 : null, nextTransitionAt: phase === 'ROUND_RESULTS' ? 25_000 : null, lastRound: phase === 'ROUND_ACTIVE' ? null : reveal, results: phase === 'GAME_RESULTS' ? { winnerId: 'p1', standings: [{ playerId: 'p1', position: 1, points: 13, won: true, stats: { correct: 1, missed: 0, totalAttempts: 1, firstTry: 1, roundFirsts: 1, solveTimeTotalMs: 1_000, bestTimeMs: 1_000, pointsFromRounds: 13 } }, { playerId: 'p2', position: 2, points: 0, won: false, stats: { correct: 0, missed: 1, totalAttempts: 1, firstTry: 0, roundFirsts: 0, solveTimeTotalMs: 0, bestTimeMs: 0, pointsFromRounds: 0 } }] } : null, ...overrides };
}

const guessing: WhosThatPokemonPlayerState = { canGuess: true, solved: false, solveOrder: null, cooldownUntil: null, roundPoints: 0, attemptCount: 0, lastAttempt: null };
const solvedPlayer: WhosThatPokemonPlayerState = { canGuess: false, solved: true, solveOrder: 1, cooldownUntil: null, roundPoints: 13, attemptCount: 1, lastAttempt: { result: 'CORRECT', attemptedAt: 2_000 } };

function room(game: WhosThatPokemonPublicState, player: WhosThatPokemonPlayerState, spectator = false, config = defaultWhosThatPokemonConfig): RoomView {
  return { code: 'ABC234', phase: game.phase, hostId: 'p1', maxPlayers: 8, availableGames: [], selectedGameId: 'whos-that-pokemon', selectedGameConfig: config, sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'FIXED' }, nextGameVote: null, gamesPlayed: 0, sessionStandings: [], sessionHistory: [], serverNow: Date.now(), game, gamePlayerState: player, members: [
    { id: 'p1', displayName: 'Eru', avatar: { type: 'PRESET', value: 'trainer-berry' }, connected: true, presence: 'CONNECTED', roomRole: 'HOST', role: spectator ? 'SPECTATOR' : 'PLAYER', isHost: true, ready: false, sessionPoints: 5 },
    { id: 'p2', displayName: 'Ana', avatar: { type: 'PRESET', value: 'trainer-aqua' }, connected: true, presence: 'CONNECTED', roomRole: 'MEMBER', role: 'PLAYER', isHost: false, ready: false, sessionPoints: 0 },
  ] } as RoomView;
}
const render = (view: RoomView) => renderToStaticMarkup(createElement(WhosThatPokemonGame, { room: view, selfId: 'p1', onAction: async () => undefined }));
const ANSWER = /Lucario|options\/reveal|targetPokemon/;

describe('¿Quién es ese Pokémon?: privacidad', () => {
  it('nunca pinta la respuesta en la ronda, ni con un lastRound sobrante, ni a quien ya acertó', () => {
    const stale = publicGame('ROUND_ACTIVE', { lastRound: reveal, solvedPlayers: [] });
    expect(render(room(stale, guessing))).not.toMatch(ANSWER);
    expect(render(room({ ...stale, solvedPlayers: [{ playerId: 'p1', solveOrder: 1 }] }, solvedPlayer))).not.toMatch(ANSWER);
    expect(render(room(stale, { ...guessing, canGuess: false }, true))).not.toMatch(ANSWER);
  });

  it('la silueta es una imagen opaca sin nombre: alt genérico y sin title', () => {
    const html = render(room(publicGame('ROUND_ACTIVE', { solvedPlayers: [] }), guessing));
    expect(html).toContain('aria-label="Silueta misteriosa normalizada"');
    expect(html).toContain('/options/shadow/sprite');
    expect(html).toContain('alt="Silueta de un Pokémon misterioso"');
    expect(html).toMatch(/<h1[^>]*>Reconoce su silueta<\/h1>/);
  });

  it('en la revelación sí sale: «¡Era X!», la carta con su sprite y la silueta de la ronda', () => {
    const html = render(room(publicGame('ROUND_RESULTS'), solvedPlayer));
    expect(html).toContain('¡Era Lucario!');
    expect(html).toContain('alt="Lucario"');
    expect(html).toContain(REVEAL_SPRITE);
    expect(html).toContain('Así era su silueta');
  });
});

describe('¿Quién es ese Pokémon?: pantalla', () => {
  it('ronda: buscador con su etiqueta por ronda, marcador, intentos públicos y una sola región viva', () => {
    const html = render(room(publicGame('ROUND_ACTIVE', { solvedPlayers: [] }), guessing));
    expect(html).toContain('aria-label="Buscar respuesta para la ronda 1"');
    expect(html).toContain('Ana probó');
    expect(html).toContain('Raichu');
    expect(html).toContain('Ronda 1 de 10');
    expect(html.match(/role="status"/g)).toHaveLength(1);
  });

  it('acertado: «¡Acertado!» con puesto y puntos, sin buscador; el marcador lo dice en texto', () => {
    const html = render(room(publicGame(), solvedPlayer));
    expect(html).toContain('¡Acertado!');
    expect(html).toContain('1.º en acertar');
    expect(html).toContain('Acertó · 1.º');
    expect(html).not.toContain('Buscar respuesta para la ronda');
    expect(html).toContain('Acierto, 1.º en acertar: 13 puntos esta ronda.');
  });

  it('tras un fallo propio: aviso visible y un anuncio fijo, y el buscador sigue', () => {
    const game = publicGame('ROUND_ACTIVE', { solvedPlayers: [], attempts: [{ playerId: 'p1', guessedPokemon: { id: 'raichu', name: 'Raichu', sprite: '/raichu.png' }, attemptedAt: 1_500 }] });
    const html = render(room(game, { ...guessing, attemptCount: 1, lastAttempt: { result: 'INCORRECT', attemptedAt: 1_500 } }));
    expect(html).toContain('Raichu</span> no era');
    expect(html).toContain('Incorrecto (1 intento): Raichu no era.');
    expect(html).toContain('aria-label="Buscar respuesta para la ronda 1"');
  });

  it('el espectador ve la silueta y el marcador sin buscador', () => {
    const html = render(room(publicGame('ROUND_ACTIVE', { solvedPlayers: [] }), { ...guessing, canGuess: false }, true));
    expect(html).toContain('Estás observando');
    expect(html).toContain('/options/shadow/sprite');
    expect(html).not.toContain('Buscar respuesta para la ronda');
  });

  it('pistas: solo con la opción activa; texto de cada pista', () => {
    const game = publicGame('ROUND_ACTIVE', { solvedPlayers: [], visibleHints: [{ kind: 'GENERATION', value: 4 }, { kind: 'TYPE', value: 'fighting' }] });
    expect(render(room(game, guessing))).not.toContain('Generación 4');
    const html = render(room(game, guessing, false, { ...defaultWhosThatPokemonConfig, hintsEnabled: true }));
    expect(html).toContain('Generación 4');
    expect(html).toContain('Uno de sus tipos es Lucha');
    expect(describeWhosThatHint({ kind: 'EVOLUTION', stage: 2, stages: 3 })).toBe('Evolución intermedia');
  });

  it('revelación: puntos de la ronda por orden de acierto, con tiempo, intentos, el desglose y «No acertó»', () => {
    const html = render(room(publicGame('ROUND_RESULTS'), solvedPlayer));
    expect(html).toContain('Rapidez 10 + orden 3');
    expect(html).toContain('1.0s · 1 intento');
    expect(html).toContain('+13');
    expect(html).toContain('No acertó');
    expect(html.indexOf('Eru')).toBeLessThan(html.indexOf('No acertó'));
    expect(html).toContain('¡Acertaste! 1.º en acertar');
    expect(html).not.toMatch(/🥇|🥈|🥉/);
  });
});

describe('¿Quién es ese Pokémon?: resultados y ajustes', () => {
  it('clasificación con las métricas en texto, récords y acciones del host', () => {
    const html = renderToStaticMarkup(createElement(WhosThatPokemonResults, { room: room(publicGame('GAME_RESULTS'), guessing), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(html).toContain('Clasificación final');
    expect(html).toContain('1 acierto · 0 sin acertar · 1 intento · 100% precisión · media 1.0s · mejor 1.0s · 1 al primer intento');
    expect(html).toContain('Récords de la partida');
    expect(html).toContain('Acierto más rápido');
    expect(html).toContain('Continuar sesión');
    expect(html).toContain('Avatar de Eru');
    expect(html).not.toMatch(/🥇|🥈|🥉/);
  });

  it('sin aciertos, la media y el mejor tiempo son «—» (nunca «media 0.0s»)', () => {
    const html = renderToStaticMarkup(createElement(WhosThatPokemonResults, { room: room(publicGame('GAME_RESULTS'), guessing), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(html).toContain('0 aciertos · 1 sin acertar · 1 intento · 0% precisión · media — · mejor — · 0 al primer intento');
    expect(html).not.toContain('media 0.0s');
  });

  it('ajustes con los controles del catálogo', () => {
    const html = renderToStaticMarkup(createElement(WhosThatPokemonConfigPanel, { config: defaultWhosThatPokemonConfig, disabled: false, onChange: async () => undefined }));
    expect(html).toContain('Tiempo por ronda');
    expect(html).toContain('Número de rondas');
    expect(html).toContain('role="switch"');
    expect(html).toContain('Pistas adicionales');
    expect(html).toContain('Formas regionales');
    // `GenerationSelector` sigue siendo el heredado (F9); el resto, del catálogo.
    expect(html).not.toMatch(/btn-|on-cream|aria-pressed="(true|false)" class="flex min-h-20/);
  });
});

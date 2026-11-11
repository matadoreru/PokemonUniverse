import { defaultGuessFromStatsConfig, type GuessFromStatsPlayerState, type GuessFromStatsPublicState, type RoomView } from '@pokemon-universe/shared/public';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GuessFromStatsConfigPanel } from '../games/guess-from-stats/ConfigPanel';
import { validateGuessFromStatsConfig } from '../games/guess-from-stats/validation';
import { describeStatsHint, statMax, statsAnswerText } from '../games/guess-from-stats/presentation';
import { GuessFromStatsGame } from './GuessFromStatsGame';
import { GuessFromStatsResults } from './GuessFromStatsResults';
import { expectSingleLiveRegion } from './test-support/live-regions';

// «Saltar minijuego» va en la cabecera (`GameSkipSlot` lee la sala): sin votación de salto no pinta nada.
vi.mock('./RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));
vi.mock('../hooks/usePokemonPool', () => ({ usePokemonPool: () => ({ pokemon: [], loading: false, error: '', retry: () => undefined }) }));

const answer = { id: 'gardevoir', name: 'Gardevoir', sprite: '/gardevoir.png', generation: 3, types: ['psychic', 'fairy'] as Array<'psychic' | 'fairy'>, hp: 68, attack: 65, defense: 65, specialAttack: 125, specialDefense: 115, speed: 80, bst: 518 };
const equivalent = { ...answer, id: 'gardevoir-mega', name: 'Mega-Gardevoir', sprite: '/mega.png', types: [...answer.types] };
const visibleStats: GuessFromStatsPublicState['visibleStats'] = [{ key: 'hp', value: 68 }, { key: 'specialAttack', value: 125 }, { key: 'speed', value: 80 }];
const reveal: NonNullable<GuessFromStatsPublicState['lastRound']> = {
  answers: [answer, equivalent], visibleStats, hints: [],
  solves: { p1: { solveOrder: 1, solvedAt: 2_000, elapsedMs: 1_000, points: 4, attempts: 2, submittedPokemon: { id: 'gardevoir-mega', name: 'Mega-Gardevoir', sprite: '/mega.png' } } },
  attemptCounts: { p1: 2, p2: 1 },
};

function publicGame(phase: 'ROUND_ACTIVE' | 'ROUND_RESULTS' | 'GAME_RESULTS' = 'ROUND_ACTIVE', overrides: Partial<GuessFromStatsPublicState> = {}): GuessFromStatsPublicState {
  return {
    gameId: 'guess-from-stats', phase, roundNumber: 1, totalRounds: 10, visibleStats: phase === 'ROUND_ACTIVE' ? visibleStats : [], hints: [],
    attempts: [{ playerId: 'p2', guessedPokemon: { id: 'gallade', name: 'Gallade', sprite: '/gallade.png' }, attemptedAt: 1_500 }],
    solvedPlayers: [], scores: { p1: 4, p2: 0 }, roundStartedAt: 1_000, roundEndsAt: phase === 'ROUND_ACTIVE' ? Date.now() + 30_000 : null,
    nextTransitionAt: phase === 'ROUND_RESULTS' ? Date.now() + 4_000 : null, lastRound: phase === 'ROUND_ACTIVE' ? null : reveal,
    results: phase === 'GAME_RESULTS' ? { winnerId: 'p1', standings: [
      { playerId: 'p1', position: 1, points: 4, won: true, stats: { correct: 1, missed: 0, totalAttempts: 2, firstTry: 0, roundFirsts: 1, solveTimeTotalMs: 1_000, bestTimeMs: 1_000, pointsFromRounds: 4 } },
      { playerId: 'p2', position: 2, points: 0, won: false, stats: { correct: 0, missed: 1, totalAttempts: 1, firstTry: 0, roundFirsts: 0, solveTimeTotalMs: 0, bestTimeMs: 0, pointsFromRounds: 0 } },
    ] } : null,
    ...overrides,
  };
}

const guessing: GuessFromStatsPlayerState = { canGuess: true, solved: false, solveOrder: null, cooldownUntil: null, roundPoints: 0, attemptCount: 0, lastAttempt: null };
const solvedPlayer: GuessFromStatsPlayerState = { canGuess: false, solved: true, solveOrder: 1, cooldownUntil: null, roundPoints: 4, attemptCount: 2, lastAttempt: { result: 'CORRECT', attemptedAt: 2_000 } };
const watching: GuessFromStatsPlayerState = { ...guessing, canGuess: false };

function room(game: GuessFromStatsPublicState, player: GuessFromStatsPlayerState | null, spectator = false): RoomView {
  return { code: 'ABC234', phase: game.phase, hostId: 'p1', maxPlayers: 8, availableGames: [], selectedGameId: 'guess-from-stats', selectedGameConfig: { ...defaultGuessFromStatsConfig, generations: [1, 2, 3] }, sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'ORDER', gameIds: ['guess-from-stats'] }, nextGameVote: null, gamesPlayed: 0, sessionStandings: [], sessionHistory: [], serverNow: Date.now(), game, gamePlayerState: player, members: [
    { id: 'p1', displayName: 'Eru', avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: 'HOST', role: spectator ? 'SPECTATOR' : 'PLAYER', isHost: true, ready: false, sessionPoints: 4 },
    { id: 'p2', displayName: 'Ana', avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: 'MEMBER', role: 'PLAYER', isHost: false, ready: false, sessionPoints: 0 },
  ] } as unknown as RoomView;
}
const render = (view: RoomView, selfId = 'p1') => renderToStaticMarkup(createElement(GuessFromStatsGame, { room: view, selfId, onAction: async () => undefined }));
const ANSWER = /Gardevoir|Mega-Gardevoir|\/gardevoir\.png|\/mega\.png/;

describe('Guess from Stats: privacidad', () => {
  it('nunca pinta las respuestas en la ronda, ni con un lastRound sobrante, ni a quien ya acertó, ni al espectador', () => {
    const stale = publicGame('ROUND_ACTIVE', { lastRound: reveal });
    expect(render(room(stale, guessing))).not.toMatch(ANSWER);
    expect(render(room({ ...stale, solvedPlayers: [{ playerId: 'p1', solveOrder: 1 }] }, solvedPlayer))).not.toMatch(ANSWER);
    expect(render(room(stale, watching, true))).not.toMatch(ANSWER);
    expect(render(room(stale, null))).not.toMatch(ANSWER);
  });

  it('en la revelación salen todas las respuestas válidas, cada una con su ficha completa', () => {
    const html = render(room(publicGame('ROUND_RESULTS'), solvedPlayer));
    expect(html).toContain('¡Valían 2 Pokémon!');
    expect(html).toContain('2 respuestas válidas');
    expect(html).toContain('alt="Gardevoir"');
    expect(html).toContain('alt="Mega-Gardevoir"');
    expect(html).toContain('aria-label="Estadísticas de Gardevoir"');
    expect(html).toContain('aria-label="Estadísticas de Mega-Gardevoir"');
    // Siete filas por ficha (con el total), los tipos con su nombre y el número en texto.
    expect(html.match(/data-testid="stat-row"/g)).toHaveLength(14);
    expect(html).toContain('>Psíquico</span>');
    expect(html).toContain('>Total</span>');
    expect(html).toContain('>518</strong>');
    expect(html).toContain('Todas coinciden exactamente con lo que se mostró.');
  });
});

describe('Guess from Stats: pantalla', () => {
  it('estadísticas con Bar decorativa y el nombre y el número en texto, solo las configuradas', () => {
    const html = render(room(publicGame(), guessing));
    expect(html.match(/data-testid="stat-row"/g)).toHaveLength(3);
    expect(html).toContain('<span class="_label_');
    expect(html).toMatch(/>PS<\/span>/);
    expect(html).toMatch(/>At\. Esp\.<\/span>/);
    expect(html).toContain('>125</strong>');
    expect(html).not.toContain('Def. Esp.');
    // La barra es decorativa (el texto ya lo dice) y su escala es fija: 125 de 255.
    expect(html).toMatch(/aria-hidden="true"><span class="[^"]*" role="meter" aria-label="At. Esp." aria-valuenow="125" aria-valuemin="0" aria-valuemax="255"/);
    expect(statMax('bst')).toBe(780);
    expect(html).toContain('--rows:3;--rows2:2');
    expect(html).toMatch(/<h1[^>]*>Reconoce sus stats<\/h1>/);
  });

  it('ronda: buscador con su etiqueta, marcador, intentos y una sola región viva', () => {
    const html = render(room(publicGame(), guessing));
    expect(html).toContain('aria-label="Buscar respuesta para la ronda 1"');
    expect(html).toContain('¿De quién son estas estadísticas?');
    expect(html).toContain('Ana probó');
    expect(html).toContain('Gallade');
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
    const game = publicGame('ROUND_ACTIVE', { attempts: [{ playerId: 'p1', guessedPokemon: { id: 'gallade', name: 'Gallade', sprite: '/gallade.png' }, attemptedAt: 1_500 }] });
    const html = render(room(game, { ...guessing, attemptCount: 1, lastAttempt: { result: 'INCORRECT', attemptedAt: 1_500 } }));
    expect(html).toContain('Gallade</span> no era');
    expect(html).toContain('Incorrecto (1 intento): Gallade no era.');
    expect(html).toContain('aria-label="Buscar respuesta para la ronda 1"');
  });

  it('el espectador ve las estadísticas y el marcador sin buscador', () => {
    const html = render(room(publicGame(), watching, true));
    expect(html).toContain('Estás observando');
    expect(html).toContain('>125</strong>');
    expect(html).not.toContain('Buscar respuesta para la ronda');
  });

  it('pistas: las que manda el servidor, con su texto', () => {
    const html = render(room(publicGame('ROUND_ACTIVE', { hints: [{ kind: 'TYPES', value: ['psychic', 'fairy'] }, { kind: 'HEIGHT', decimeters: 16 }] }), guessing));
    expect(html).toContain('Tipo Psíquico / Hada');
    expect(html).toContain('Altura 1.6 m');
    expect(render(room(publicGame(), guessing))).not.toContain('data-testid="guess-hint"');
    expect(describeStatsHint({ kind: 'EVOLUTION', value: 'NO_EVOLUTION' })).toBe('No evoluciona');
  });

  it('revelación: lo que eligió cada uno, los puntos y «No acertó»; una sola respuesta, en singular', () => {
    const html = render(room(publicGame('ROUND_RESULTS'), solvedPlayer));
    expect(html).toContain('Eligió Mega-Gardevoir');
    expect(html).toContain('1.0s · 2 intentos');
    expect(html).toContain('+4');
    expect(html).toContain('No acertó');
    expect(html).toContain('Ronda 1 terminada: era Gardevoir o Mega-Gardevoir.');
    expect(html).not.toMatch(/🥇|🥈|🥉/);
    const single = render(room(publicGame('ROUND_RESULTS', { lastRound: { ...reveal, answers: [answer] } }), null), 'p2');
    expect(single).toContain('¡Era Gardevoir!');
    expect(single).toContain('Generación 3');
    expect(single).not.toContain('respuestas válidas');
    expect(single).not.toContain('Valían');
    expect(statsAnswerText(['A', 'B', 'C', 'D'])).toBe('una de 4 respuestas válidas');
  });
});

describe('Guess from Stats: resultados y ajustes', () => {
  it('clasificación con las métricas en texto, récords y acciones del host', () => {
    const html = renderToStaticMarkup(createElement(GuessFromStatsResults, { room: room(publicGame('GAME_RESULTS'), null), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(html).toContain('Clasificación final');
    expect(html).toContain('Guess from Stats · 10 rondas');
    expect(html).toContain('1 acierto · 0 sin acertar · 2 intentos · 50% precisión · media 1.0s · mejor 1.0s · 0 al primer intento');
    expect(html).toContain('Récords de la partida');
    expect(html).toContain('ficha reconocida');
    expect(html).toContain('Continuar sesión');
    expect(html).toContain('Avatar de Eru');
    expect(html).not.toMatch(/🥇|🥈|🥉|btn-/);
  });

  it('ajustes con los controles del catálogo: estadísticas (al menos 2), pistas y tiempos', () => {
    const invalid = { ...defaultGuessFromStatsConfig, stats: { ...defaultGuessFromStatsConfig.stats, attack: false, defense: false, specialAttack: false, specialDefense: false, speed: false } };
    expect(validateGuessFromStatsConfig(invalid)).toContain('2 estadísticas');
    const html = renderToStaticMarkup(createElement(GuessFromStatsConfigPanel, { config: { ...defaultGuessFromStatsConfig, hintsEnabled: true }, disabled: false, onChange: async () => undefined }));
    expect(html).toContain('role="group" aria-label="Stats mostradas"');
    expect(html).toContain('6 activas');
    expect(html).toContain('Total de Stats');
    expect(html).toContain('Pistas adicionales');
    expect(html).toContain('Altura');
    expect(html).toContain('Número de rondas');
    expect(html).not.toContain('role="alert"');
    const few = renderToStaticMarkup(createElement(GuessFromStatsConfigPanel, { config: invalid, disabled: false, onChange: async () => undefined }));
    expect(few).toContain('Selecciona al menos 2 estadísticas.');
    // `GenerationSelector` sigue siendo el heredado (F9); el resto, del catálogo.
    expect(html).not.toMatch(/btn-|on-cream|type="checkbox"|class="chip|text-electric|bg-leaf/);
  });
});

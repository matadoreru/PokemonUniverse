import { defaultUnownTranslatorConfig, type RoomView, type UnownToken, type UnownTranslatorMode, type UnownTranslatorPlayerState, type UnownTranslatorPublicState, type UnownTranslatorRoundResult } from '@pokemon-universe/shared/public';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { UnownTranslatorConfigPanel } from '../games/unown-translator/ConfigPanel';
import s from '../games/unown-translator/UnownTranslator.module.css';
import { UnownTranslatorGame } from './UnownTranslatorGame';
import { UnownTranslatorResults } from './UnownTranslatorResults';

// «Saltar minijuego» lee la sala: sin votación de salto no pinta nada.
vi.mock('./RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));

const NAMES = ['Eru', 'Ana', 'Leo'];
type Phase = 'ROUND_ACTIVE' | 'ROUND_RESULTS' | 'GAME_RESULTS';

/** Cifra un texto con una clave fija (`A` → glifo 25, `B` → 24…): las letras de `known` salen traducidas. */
function tokens(text: string, known: string): UnownToken[] {
  return [...text].map((char) => {
    if (char < 'A' || char > 'Z') return { kind: 'LITERAL', text: char };
    const glyph = 25 - (char.charCodeAt(0) - 65);
    return known.includes(char) ? { kind: 'LETTER', glyph, letter: char } : { kind: 'GLYPH', glyph };
  });
}
const alphabet = (known: string) => [...known].map((letter) => ({ glyph: 25 - (letter.charCodeAt(0) - 65), letter }));

const pokemonRound: UnownTranslatorRoundResult = {
  mode: 'CLASSIC', answer: 'Pikachu', pokemon: { id: 'pikachu', name: 'Pikachu', sprite: '/pikachu.png', nationalDexNumber: 25, types: ['electric'] }, move: null,
  solves: [{ playerId: 'p2', points: 5, hiddenLetters: 4, solvedAt: 5_000 }, { playerId: 'p1', points: 2, hiddenLetters: 1, solvedAt: 9_000 }], missingPlayerIds: ['p3'],
};
const moveRound: UnownTranslatorRoundResult = {
  mode: 'MOVES', answer: 'Patada Salto', pokemon: null, move: { name: 'Patada Salto', type: 'fighting', category: 'physical' },
  solves: [{ playerId: 'p3', points: 3, hiddenLetters: 2, solvedAt: 6_000 }], missingPlayerIds: ['p1', 'p2'],
};

function publicGame(phase: Phase, { mode = 'CLASSIC', text = 'PIKACHU', known = 'PA', round = null }: { mode?: UnownTranslatorMode; text?: string; known?: string; round?: UnownTranslatorRoundResult | null } = {}): UnownTranslatorPublicState {
  const active = phase === 'ROUND_ACTIVE';
  return {
    gameId: 'unown-translator', phase, mode, roundNumber: 2, totalRounds: 5, playerIds: ['p1', 'p2', 'p3'],
    tokens: active ? tokens(text, known) : [], alphabet: alphabet(known), solvedPlayerIds: active ? ['p2'] : [], roundPointsByPlayer: active ? { p2: 5 } : {},
    scores: { p1: 2, p2: 5, p3: 0 }, roundEndsAt: active ? 61_000 : null, nextHintAt: active ? 7_000 : null, nextTransitionAt: active ? 7_000 : 7_000,
    lastRound: round,
    results: phase === 'GAME_RESULTS' ? { winnerId: 'p2', standings: [
      { playerId: 'p2', position: 1, points: 5, won: true, stats: { roundsPlayed: 1, solved: 1, missed: 0, firstSolves: 1, hiddenLettersAtSolve: 4, pointsFromRounds: 5 } },
      { playerId: 'p1', position: 2, points: 2, won: false, stats: { roundsPlayed: 1, solved: 1, missed: 0, firstSolves: 0, hiddenLettersAtSolve: 1, pointsFromRounds: 2 } },
      { playerId: 'p3', position: 3, points: 0, won: false, stats: { roundsPlayed: 1, solved: 0, missed: 1, firstSolves: 0, hiddenLettersAtSolve: 0, pointsFromRounds: 0 } },
    ] } : null,
  };
}

function room(game: UnownTranslatorPublicState, player: UnownTranslatorPlayerState | null): RoomView {
  const members = NAMES.map((displayName, index) => ({ id: `p${index + 1}`, displayName, avatar: { type: 'DEFAULT' as const }, connected: true, presence: 'CONNECTED' as const, roomRole: index === 0 ? 'HOST' as const : 'MEMBER' as const, role: 'PLAYER' as const, isHost: index === 0, ready: false, sessionPoints: game.scores[`p${index + 1}`] ?? 0 }));
  return { code: 'ABC234', phase: game.phase, hostId: 'p1', maxPlayers: 8, availableGames: [{ id: 'unown-translator', name: 'Traductor Unown', icon: '🔣', description: 'Glifos', minPlayers: 1, profileStats: { metrics: [] } }], selectedGameId: 'unown-translator', selectedGameConfig: { ...defaultUnownTranslatorConfig, mode: game.mode }, sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'ORDER', gameIds: ['unown-translator'] }, nextGameVote: null, gamesPlayed: 0, sessionStandings: [], sessionHistory: [], daily: null, serverNow: 1_000, game, gamePlayerState: player, members } as RoomView;
}

const GUESSING: UnownTranslatorPlayerState = { role: 'PLAYER', canGuess: true, solved: false, answer: null, cooldownUntil: null, attemptCount: 0, lastAttempt: null };
const COOLING: UnownTranslatorPlayerState = { role: 'PLAYER', canGuess: true, solved: false, answer: null, cooldownUntil: 4_000, attemptCount: 1, lastAttempt: { outcome: 'INCORRECT', at: 1_000 } };
const SOLVED: UnownTranslatorPlayerState = { role: 'PLAYER', canGuess: false, solved: true, answer: 'Pikachu', cooldownUntil: null, attemptCount: 2, lastAttempt: { outcome: 'CORRECT', at: 5_000 } };

const render = (game: UnownTranslatorPublicState, player: UnownTranslatorPlayerState | null, selfId = 'p3') => renderToStaticMarkup(createElement(UnownTranslatorGame, { room: room(game, player), selfId, onAction: async () => undefined }));
const results = (game: UnownTranslatorPublicState, selfId = 'p2') => renderToStaticMarkup(createElement(UnownTranslatorResults, { room: room(game, null), selfId, onLobby: () => undefined, onEnd: () => undefined }));
/** El trozo del HTML de un bloque marcado con `data-testid` (hasta el siguiente bloque marcado). */
function block(html: string, testId: string): string {
  const start = html.indexOf(`data-testid="${testId}"`);
  if (start < 0) return '';
  const next = html.indexOf('data-testid="unown-', start + testId.length + 13);
  return html.slice(start, next < 0 ? undefined : next);
}
const count = (html: string, text: string | RegExp) => html.match(new RegExp(text, 'g'))?.length ?? 0;

describe('Traductor Unown: pantalla', () => {
  it('el mensaje: un glifo oculto por cada GLYPH y la letra de cada LETTER', () => {
    const html = render(publicGame('ROUND_ACTIVE'), GUESSING);
    const message = block(html, 'unown-message');
    // PIKACHU con P y A conocidas: P, A → letras; I, K, C, H, U → ocultos.
    expect(count(message, 'glifo oculto')).toBe(5);
    expect(count(message, 'aria-label="letra P"')).toBe(1);
    expect(count(message, 'aria-label="letra A"')).toBe(1);
    expect(html).toContain('Descifra el mensaje');
    expect(html).toContain('Siguiente letra en 6 s');
  });

  it('con el bloqueo activo, Enviar está desactivado y sale «No es eso»', () => {
    const html = render(publicGame('ROUND_ACTIVE'), COOLING);
    expect(html).toContain('No es eso');
    const button = html.match(/<button[^>]*type="submit"[^>]*>/)?.[0] ?? '';
    expect(button).toContain('disabled');
    expect(html).toContain('maxLength="40"');
  });

  it('sin bloqueo no sale «No es eso»', () => {
    expect(render(publicGame('ROUND_ACTIVE'), GUESSING)).not.toContain('No es eso');
  });

  it('quien ya acertó ve «¡Descifrado!» con su respuesta y sin campo', () => {
    const html = render(publicGame('ROUND_ACTIVE'), SOLVED);
    expect(html).toContain('¡Descifrado!');
    expect(html).toContain('Pikachu');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('type="submit"');
  });

  it('la leyenda «Alfabeto» tiene los 26 glifos, con la letra de los conocidos', () => {
    const legend = block(render(publicGame('ROUND_ACTIVE'), GUESSING), 'unown-alphabet');
    expect(legend).toContain('Alfabeto');
    expect(count(legend, 'role="img"')).toBe(26);
    expect(count(legend, 'aria-label="letra ')).toBe(2);
    expect(count(legend, 'glifo oculto')).toBe(24);
  });

  it('quién ha acertado, con sus puntos de la ronda', () => {
    const html = render(publicGame('ROUND_ACTIVE'), GUESSING);
    expect(html).toContain('+5');
  });

  it('en plena ronda no pinta la respuesta aunque llegue un lastRound sobrante', () => {
    const html = render(publicGame('ROUND_ACTIVE', { round: pokemonRound }), GUESSING);
    expect(html).not.toContain('Pikachu');
    expect(html).not.toContain('/pikachu.png');
  });

  it('resultados de ronda de Pokémon: la respuesta con su sprite, número y tipos; los aciertos en orden y quién no', () => {
    const html = render(publicGame('ROUND_RESULTS', { round: pokemonRound }), null);
    expect(html).toContain('Pikachu');
    expect(html).toContain('/pikachu.png');
    expect(html).toContain('Nº 025');
    expect(html).toContain('Eléctrico');
    expect(html.indexOf('Ana')).toBeLessThan(html.indexOf('Eru'));
    expect(html).toContain('4 letras ocultas');
    expect(html).toContain('No lo descifró');
  });

  it('resultados de ronda de movimientos: el tipo y la categoría', () => {
    const html = render(publicGame('ROUND_RESULTS', { mode: 'MOVES', round: moveRound }), null);
    expect(html).toContain('Patada Salto');
    expect(html).toContain('Lucha');
    expect(html).toContain('Físico');
    expect(html).not.toContain('<img');
  });

  it('resultados finales: la clasificación y el último mensaje (sprite en Pokémon, tipo en movimientos)', () => {
    const classic = results(publicGame('GAME_RESULTS', { round: pokemonRound }));
    expect(classic).toContain('Clasificación final');
    expect(classic).toContain('/pikachu.png');
    const moves = results(publicGame('GAME_RESULTS', { mode: 'MOVES', round: moveRound }));
    expect(moves).toContain('Lucha');
  });

  it.each([
    ['ROUND_ACTIVE', GUESSING, null],
    ['ROUND_ACTIVE', SOLVED, null],
    ['ROUND_RESULTS', null, pokemonRound],
  ] as const)('%s: hay exactamente una región viva', (phase, player, round) => {
    const html = render(publicGame(phase, { round }), player);
    expect(count(html, 'aria-live')).toBe(1);
    expect(count(html, 'role="alert"')).toBe(0);
  });

  it('longMessageKeepsWordsWhole: cada palabra en su bloque que no se parte', () => {
    const html = render(publicGame('ROUND_ACTIVE', { mode: 'MOVES', text: 'PATADA SALTO GIRATORIA', known: 'AT' }), GUESSING);
    const message = block(html, 'unown-message');
    const words = message.match(new RegExp(`class="[^"]*\\b${s.word}\\b[^"]*"`, 'g')) ?? [];
    expect(s.word).toBeTruthy();
    expect(words).toHaveLength(3);
    // Las 20 letras están dentro de las palabras; el espacio no se pinta como pieza.
    expect(count(message, 'role="img"')).toBe(20);
    // Cada glifo, oculto o traducido, reserva la fila de la letra (`.glyph`): así quedan alineados en la palabra.
    expect(count(message, `class="[^"]*\\b${s.glyph}\\b`)).toBe(20);
    expect(readFileSync(new URL('../games/unown-translator/UnownTranslator.module.css', import.meta.url), 'utf8')).toMatch(/\.glyph\s*\{[^}]*min-height: calc\(var\(--glyph-size\)/);
  });

  it('el panel de ajustes lleva el selector de modo con Pokémon y Movimientos', () => {
    const html = renderToStaticMarkup(createElement(UnownTranslatorConfigPanel, { config: defaultUnownTranslatorConfig, disabled: false, onChange: async () => undefined }));
    expect(html).toContain('Pokémon');
    expect(html).toContain('Movimientos');
  });
});

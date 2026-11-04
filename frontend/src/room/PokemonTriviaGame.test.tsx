import type { PokemonTriviaPlayerState, PokemonTriviaPublicState, PokemonTriviaRoundResult, RoomView } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PokemonTriviaConfigPanel } from '../games/pokemon-trivia/ConfigPanel';
import {
  triviaAnnouncement, triviaCategoryScores, triviaComparedValue, triviaFocusKey, triviaOptionFromKey, triviaPlateKind, triviaRanking, triviaVerdict, triviaVisibleRound,
} from '../games/pokemon-trivia/presentation';
import { PokemonTriviaGame } from './PokemonTriviaGame';
import { PokemonTriviaResults } from './PokemonTriviaResults';

// «Saltar minijuego» lee la sala: sin votación de salto no pinta nada.
vi.mock('./RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));

const options = [
  { id: 'A' as const, pokemon: { id: 'pikachu', name: 'Pikachu', sprite: '/pikachu.png' } },
  { id: 'B' as const, pokemon: { id: 'charmander', name: 'Charmander', sprite: '/charmander.png' } },
  { id: 'C' as const, pokemon: { id: 'squirtle', name: 'Squirtle', sprite: '/squirtle.png' } },
];
const details = (generation: number, attack: number) => ({ nationalDexNumber: 25, generation, types: ['electric'], hp: 35, attack, defense: 40, specialAttack: 50, specialDefense: 50, speed: 90, baseStatTotal: 320, heightDecimeters: 4, weightHectograms: 60 });
const lastRound: PokemonTriviaRoundResult = {
  correctOptionId: 'B', fact: 'Charmander tiene el Ataque más alto de las tres.',
  answers: { p1: { optionId: 'B', answeredAt: 2_000 }, p2: { optionId: 'A', answeredAt: 3_000 } },
  points: { p1: 180, p2: 0 },
  optionDetails: { A: details(1, 55), B: details(1, 52), C: details(1, 48) },
};

function room(game: PokemonTriviaPublicState, playerState: PokemonTriviaPlayerState | null): RoomView {
  return { code: 'ABC234', phase: game.phase, hostId: 'p1', maxPlayers: 8, availableGames: [], selectedGameId: 'pokemon-trivia', selectedGameConfig: { generations: [1], roundSeconds: 20, rounds: 10, optionCount: 3, difficulty: 'NORMAL', questionTypes: ['ATTACK'] }, sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'FIXED' }, nextGameVote: null, gamesPlayed: 0, sessionStandings: [], sessionHistory: [], serverNow: 1_000, game, gamePlayerState: playerState, members: [
    { id: 'p1', displayName: 'Eru', avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: 'HOST', role: 'PLAYER', isHost: true, ready: false, sessionPoints: 0 },
    { id: 'p2', displayName: 'Ana', avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: 'MEMBER', role: 'PLAYER', isHost: false, ready: false, sessionPoints: 0 },
    { id: 's1', displayName: 'Sara', avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: 'MEMBER', role: 'SPECTATOR', isHost: false, ready: false, sessionPoints: 0 },
  ] } as unknown as RoomView;
}

const active: PokemonTriviaPublicState = { gameId: 'pokemon-trivia', phase: 'ROUND_ACTIVE', roundNumber: 1, totalRounds: 10, difficulty: 'NORMAL', prompt: '¿Cuál tiene más Ataque?', questionType: 'ATTACK', options, answeredPlayerIds: [], scores: { p1: 0, p2: 0 }, roundStartedAt: 1_000, roundEndsAt: Date.now() + 20_000, nextTransitionAt: null, lastRound: null, results: null };
const revealed: PokemonTriviaPublicState = { ...active, phase: 'ROUND_RESULTS', roundEndsAt: null, nextTransitionAt: Date.now() + 4_000, lastRound, answeredPlayerIds: ['p1', 'p2'], scores: { p1: 180, p2: 0 } };
const answering: PokemonTriviaPlayerState = { role: 'PLAYER', canAnswer: true, answer: null };
const render = (game: PokemonTriviaPublicState, player: PokemonTriviaPlayerState | null, selfId = 'p1') => renderToStaticMarkup(createElement(PokemonTriviaGame, { room: room(game, player), selfId, onAction: async () => undefined }));

describe('Pokémon Trivia: presentación', () => {
  it('atajos 1–4 por el orden de las opciones; nada con otras teclas', () => {
    expect(triviaOptionFromKey('1', options)).toBe('A');
    expect(triviaOptionFromKey('3', options)).toBe('C');
    expect(triviaOptionFromKey('4', options)).toBeNull();
    expect(triviaOptionFromKey('a', options)).toBeNull();
    expect(triviaOptionFromKey('0', options)).toBeNull();
  });

  it('elige la placa y solo deja ver la ronda en ROUND_RESULTS', () => {
    expect(triviaPlateKind({ game: active, player: answering })).toBe('answer');
    expect(triviaPlateKind({ game: active, player: { ...answering, canAnswer: false, answer: { optionId: 'A', answeredAt: 1 } } })).toBe('locked');
    expect(triviaPlateKind({ game: active, player: null })).toBe('watching');
    expect(triviaPlateKind({ game: active, player: { role: 'SPECTATOR', canAnswer: false, answer: null } })).toBe('watching');
    expect(triviaPlateKind({ game: active, player: { ...answering, canAnswer: false } })).toBe('out');
    expect(triviaPlateKind({ game: revealed, player: answering })).toBe('reveal');
    expect(triviaVisibleRound({ ...active, lastRound })).toBeNull();
    expect(triviaFocusKey('locked', 2)).toBe('locked-2');
    expect(triviaFocusKey('waiting', 2)).toBeNull();
  });

  it('veredicto, anuncio, dato comparado, puestos y aciertos por categoría', () => {
    expect(triviaVerdict(lastRound, options, 'p1', true)).toEqual({ tone: 'ok', text: '¡Correcta! Elegiste 2 · Charmander', points: 180 });
    expect(triviaVerdict(lastRound, options, 'p2', true)).toEqual({ tone: 'bad', text: 'Incorrecta: elegiste 1 · Pikachu', points: 0 });
    expect(triviaVerdict(lastRound, options, 'p3', true).text).toBe('Sin respuesta');
    expect(triviaVerdict(lastRound, options, 's1', false).tone).toBe('info');
    expect(triviaAnnouncement({ kind: 'reveal', game: revealed, player: answering, verdict: triviaVerdict(lastRound, options, 'p1', true) })).toBe('Pregunta 1 resuelta: la correcta era 2 · Charmander. ¡Correcta! Elegiste 2 · Charmander, +180 puntos.');
    expect(triviaAnnouncement({ kind: 'locked', game: active, player: { ...answering, answer: { optionId: 'C', answeredAt: 1 } }, verdict: null })).toBe('Respuesta 3 · Squirtle bloqueada. Esperando al resto.');
    expect(triviaComparedValue('ATTACK', details(1, 52))).toBe('Ataque 52');
    expect(triviaComparedValue('HEIGHT', details(1, 52))).toBe('0,4 m');
    expect(triviaRanking(['p1', 'p2', 'p3'], { p1: 10, p2: 30, p3: 10 })).toEqual([{ id: 'p2', position: 1 }, { id: 'p1', position: 2 }, { id: 'p3', position: 2 }]);
    expect(triviaCategoryScores({ typeAnswers: 3, typeCorrect: 2, attackAnswers: 0, special_attackAnswers: 1, special_attackCorrect: 1 })).toEqual([
      { type: 'TYPE', label: 'Tipos', correct: 2, answers: 3 },
      { type: 'SPECIAL_ATTACK', label: 'Ataque Esp.', correct: 1, answers: 1 },
    ]);
  });
});

describe('Pokémon Trivia: pantalla', () => {
  it('pregunta en un panel y opciones con atajos 1–3, sin revelar la correcta aunque llegue un lastRound viejo', () => {
    const markup = render({ ...active, lastRound }, answering);
    expect(markup).toContain('¿Cuál tiene más Ataque?'); expect(markup).toContain('aria-label="Pregunta"');
    expect(markup).toContain('aria-keyshortcuts="1"'); expect(markup).toContain('aria-keyshortcuts="3"'); expect(markup).toContain('aria-label="2. Charmander"');
    expect(markup).toContain('Pikachu'); expect(markup).toContain('Charmander');
    for (const leak of ['Correcta', 'Incorrecta', 'Charmander tiene el Ataque', 'Ataque 52', 'Gen 1 · PS', 'correctOptionId', 'Nadie la eligió']) expect(markup).not.toContain(leak);
    expect(markup.match(/aria-live/g)).toHaveLength(1);
    expect(markup).not.toContain('role="alert"');
  });

  it('respuesta bloqueada: la propia marcada en texto y el marcador dice quién ha respondido', () => {
    const markup = render({ ...active, answeredPlayerIds: ['p1'] }, { role: 'PLAYER', canAnswer: false, answer: { optionId: 'A', answeredAt: 2_000 } });
    expect(markup).toContain('1 · Pikachu bloqueada'); expect(markup).toContain('Tu respuesta');
    expect(markup).toContain('Respondió'); expect(markup).toContain('Pensando…'); expect(markup).toContain('1 / 2 respuestas');
    expect(markup).not.toContain('aria-keyshortcuts');
  });

  it('revelación: correcta e incorrectas con icono y texto, la ficha, el dato y quién eligió qué', () => {
    const markup = render(revealed, { role: 'PLAYER', canAnswer: false, answer: { optionId: 'B', answeredAt: 2_000 } });
    expect(markup).toContain('Correcta: Charmander'); expect(markup.match(/>Correcta</g)).toHaveLength(1); expect(markup.match(/>Incorrecta</g)).toHaveLength(2);
    expect(markup).toContain('Charmander tiene el Ataque más alto'); expect(markup).toContain('Ataque 52'); expect(markup).toContain('Gen 1 · PS 35'); expect(markup).toContain('aria-label="Ficha de cada opción"');
    expect(markup).toContain('Acertó</span><span'); expect(markup).toContain('Eligió 2 · Charmander'); expect(markup).toContain('Falló</span><span'); expect(markup).toContain('Eligió 1 · Pikachu'); expect(markup).toContain('Nadie la eligió');
    expect(markup).toContain('¡Correcta! Elegiste 2 · Charmander'); expect(markup).toContain('+180');
    expect(markup.match(/aria-live/g)).toHaveLength(1);
  });

  it('espectador sin estado de jugador: observa sin botones', () => {
    const markup = render(active, null, 's1');
    expect(markup).toContain('Estás observando'); expect(markup).not.toContain('aria-keyshortcuts');
  });

  it('ajustes con el catálogo: Segmented, Toggle por categoría y rangos', () => {
    const markup = renderToStaticMarkup(createElement(PokemonTriviaConfigPanel, { config: { generations: [1], roundSeconds: 20, rounds: 10, optionCount: 4, difficulty: 'NORMAL', questionTypes: ['TYPE', 'BST'] }, disabled: false, onChange: async () => undefined }));
    expect(markup).toContain('Categorías de preguntas'); expect(markup).toContain('Velocidad'); expect(markup).toContain('Peso');
    expect(markup.match(/role="radiogroup"/g)).toHaveLength(2); expect(markup.match(/role="switch"/g)).toHaveLength(12); expect(markup).toContain('2 activas');
  });

  it('resultados: precisión, aciertos por categoría, récords y continuar sesión, sin medallas', () => {
    const finished: PokemonTriviaPublicState = { ...active, phase: 'GAME_RESULTS', roundEndsAt: null, results: { winnerId: 'p1', standings: [
      { playerId: 'p1', position: 1, points: 380, won: true, stats: { answers: 2, correct: 2, fastestCorrectMs: 1_800, typeAnswers: 1, typeCorrect: 1, attackAnswers: 1, attackCorrect: 1 } },
      { playerId: 'p2', position: 2, points: 0, won: false, stats: { answers: 2, correct: 0, fastestCorrectMs: 0, typeAnswers: 1, typeCorrect: 0, attackAnswers: 1, attackCorrect: 0 } },
    ] } };
    const markup = renderToStaticMarkup(createElement(PokemonTriviaResults, { room: room(finished, null), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(markup).toContain('Clasificación final'); expect(markup).toContain('Pokémon Trivia · 10 preguntas');
    expect(markup).toContain('2 aciertos de 2 · 100% de precisión'); expect(markup).toContain('Tipos 1/1'); expect(markup).toContain('Ataque 0/1');
    expect(markup).toContain('Más aciertos'); expect(markup).toContain('Acierto más rápido'); expect(markup).toContain('Continuar sesión');
    expect(markup).not.toMatch(/🥇|🥈|🥉/);
  });
});

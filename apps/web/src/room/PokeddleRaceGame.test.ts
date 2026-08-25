import type { PokeddleClueKey, PokeddlePublicBoard, PokeddleRacePlayerState, PokeddleRacePublicState, RoomView } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppHeader } from '../components/Layout';
import { PokeddleBoard } from './PokeddleBoard';
import { formatPokeddleFeedback, getPokeddleColumns, resolveRivalSelection } from './pokeddle-presentation';
import { getPokeddleRivalSummary, getPokeddleRoundStatus, isPokeddleSearchEnabled, PokeddleRaceGame } from './PokeddleRaceGame';
import { getPokeddleTimerUrgency } from './PokeddleRaceTimer';

const allClues: PokeddleClueKey[] = ['generation', 'dexNumber', 'types', 'typeCount', 'hp', 'attack', 'defense', 'specialAttack', 'specialDefense', 'speed', 'height', 'weight'];

function board(playerId = 'p1', solved = false): PokeddlePublicBoard {
  return {
    playerId,
    rows: [
      { round: 1, status: 'GUESS', guessedPokemon: { id: 'charmander', name: 'Charmander', sprite: '/charmander.png' }, correct: false, submittedAt: 10, feedback: {
        generation: { kind: 'NUMERIC', value: 1, result: 'MATCH' }, dexNumber: { kind: 'NUMERIC', value: 4, result: 'HIGHER' }, types: { kind: 'TYPES', value: ['fire'], result: 'PARTIAL' }, typeCount: { kind: 'NUMERIC', value: 1, result: 'HIGHER' }, hp: { kind: 'NUMERIC', value: 39, result: 'HIGHER' }, attack: { kind: 'NUMERIC', value: 52, result: 'LOWER' }, defense: { kind: 'NUMERIC', value: 43, result: 'MATCH' }, specialAttack: { kind: 'NUMERIC', value: 60, result: 'HIGHER' }, specialDefense: { kind: 'NUMERIC', value: 50, result: 'LOWER' }, speed: { kind: 'NUMERIC', value: 65, result: 'LOWER' }, height: { kind: 'NUMERIC', value: 6, result: 'HIGHER' }, weight: { kind: 'NUMERIC', value: 85, result: 'LOWER' },
      } },
      { round: 2, status: 'NO_GUESS', guessedPokemon: null, feedback: null, correct: false, submittedAt: null },
      { round: 3, status: 'GUESS', guessedPokemon: { id: 'lucario', name: 'Lucario', sprite: '/lucario.png' }, correct: solved, submittedAt: 30, feedback: {
        generation: { kind: 'NUMERIC', value: 4, result: 'MATCH' }, dexNumber: { kind: 'NUMERIC', value: 448, result: 'MATCH' }, types: { kind: 'TYPES', value: ['fighting', 'steel'], result: 'EXACT' }, typeCount: { kind: 'NUMERIC', value: 2, result: 'MATCH' }, hp: { kind: 'NUMERIC', value: 70, result: 'MATCH' }, attack: { kind: 'NUMERIC', value: 110, result: 'MATCH' }, defense: { kind: 'NUMERIC', value: 70, result: 'MATCH' }, specialAttack: { kind: 'NUMERIC', value: 115, result: 'MATCH' }, specialDefense: { kind: 'NUMERIC', value: 70, result: 'MATCH' }, speed: { kind: 'NUMERIC', value: 90, result: 'MATCH' }, height: { kind: 'NUMERIC', value: 12, result: 'MATCH' }, weight: { kind: 'NUMERIC', value: 540, result: 'MATCH' },
      } },
    ],
    solved,
    solvedRound: solved ? 3 : null,
    solvedAt: solved ? 30 : null,
    validGuesses: 2,
    missedRounds: 1,
    revealedPokemon: solved ? { id: 'lucario', name: 'Lucario', sprite: '/lucario.png' } : null,
  };
}

function gameState(): PokeddleRacePublicState {
  return { gameId: 'pokeddle-race', phase: 'ROUND_ACTIVE', roundNumber: 4, maxRounds: 10, roundStartedAt: 0, roundEndsAt: null, nextTransitionAt: null, answeredPlayerIds: [], activePlayerIds: ['p1', 'p3'], boards: { p1: board('p1'), p2: board('p2', true), p3: board('p3') }, enabledClues: allClues, results: null };
}

const playerState: PokeddleRacePlayerState = { canGuess: true, hasGuessedThisRound: false, solved: false };

describe('Pokédle feedback presentation', () => {
  it.each([
    ['HIGHER', 'higher', '↑ Mayor'],
    ['LOWER', 'lower', '↓ Menor'],
    ['MATCH', 'match', '= Coincide'],
  ] as const)('represents %s with a distinct semantic and symbol', (result, semantic, label) => {
    expect(formatPokeddleFeedback('attack', { kind: 'NUMERIC', value: 84, result })).toMatchObject({ value: 84, result: label, semantic });
  });

  it('represents partial and absent types without relying on colour', () => {
    expect(formatPokeddleFeedback('types', { kind: 'TYPES', value: ['fire'], result: 'PARTIAL' })).toMatchObject({ result: '~ Parcial', semantic: 'partial' });
    expect(formatPokeddleFeedback('types', { kind: 'TYPES', value: ['water'], result: 'NONE' })).toMatchObject({ result: '× Ninguno', semantic: 'none' });
  });
});

describe('Pokédle responsive board model', () => {
  it('only generates configured columns and omits disabled clues', () => {
    expect(getPokeddleColumns(['generation', 'types', 'attack']).map((column) => column.key)).toEqual(['generation', 'types', 'attack']);
    expect(getPokeddleColumns(['generation', 'types', 'attack']).some((column) => column.key === 'weight')).toBe(false);
  });

  it('uses one clue model for desktop and mobile renderers', () => {
    const markup = renderToStaticMarkup(createElement(PokeddleBoard, { board: board(), clues: ['generation', 'types', 'attack'] }));
    expect(markup.match(/data-clue-key="generation"/g)).toHaveLength(3);
    expect(markup).not.toContain('data-clue-key="weight"');
    expect(markup).toContain('aria-label="Ataque: 52. El objetivo es menor.');
  });

  it('renders missed rounds as compact bands and identifies the latest valid attempt', () => {
    const markup = renderToStaticMarkup(createElement(PokeddleBoard, { board: board(), clues: ['generation'] }));
    expect(markup).toContain('data-row-status="no-guess"');
    expect(markup).toContain('Ronda 2 · Sin respuesta');
    expect(markup).toContain('data-latest="true"');
    expect(markup).toContain('Último');
  });

  it('marks a solved row and exposes exact feedback accessibly', () => {
    const markup = renderToStaticMarkup(createElement(PokeddleBoard, { board: board('p1', true), clues: ['generation', 'types'] }));
    expect(markup).toContain('data-correct="true"');
    expect(markup).toContain('Pokémon encontrado');
    expect(markup).toContain('Coincidencia exacta');
  });
});

describe('Pokédle race interaction state', () => {
  it('uses stable normal, warning and urgent timer states', () => {
    expect(getPokeddleTimerUrgency(11, true)).toBe('normal');
    expect(getPokeddleTimerUrgency(10, true)).toBe('warning');
    expect(getPokeddleTimerUrgency(5, true)).toBe('urgent');
    expect(getPokeddleTimerUrgency(2, false)).toBe('normal');
  });

  it('selects any existing rival and falls back to one complete board', () => {
    expect(resolveRivalSelection(['p2', 'p3'], 'p3')).toBe('p3');
    expect(resolveRivalSelection(['p2', 'p3'], 'missing')).toBe('p2');
    expect(resolveRivalSelection([], null)).toBeNull();
  });

  it('shows resolved rival Pokémon in its summary', () => {
    expect(getPokeddleRivalSummary(board('p2', true), 4, false)).toMatchObject({ status: 'Resuelto · Lucario', detail: 'R3 · 2 intentos' });
  });

  it('locks search after answering and enables it again with next-round state', () => {
    expect(isPokeddleSearchEnabled({ phase: 'ROUND_ACTIVE' }, playerState)).toBe(true);
    expect(isPokeddleSearchEnabled({ phase: 'ROUND_ACTIVE' }, { ...playerState, canGuess: false, hasGuessedThisRound: true })).toBe(false);
    expect(isPokeddleSearchEnabled({ phase: 'ROUND_RESULTS' }, playerState)).toBe(false);
    expect(isPokeddleSearchEnabled({ phase: 'ROUND_ACTIVE' }, { ...playerState, canGuess: true, hasGuessedThisRound: false })).toBe(true);
  });

  it('provides useful round and reconnection statuses', () => {
    expect(getPokeddleRoundStatus({ phase: 'ROUND_ACTIVE' }, playerState, 'CONNECTED').title).toBe('Falta tu intento');
    expect(getPokeddleRoundStatus({ phase: 'ROUND_ACTIVE' }, { ...playerState, hasGuessedThisRound: true }, 'CONNECTED').title).toBe('Intento enviado');
    expect(getPokeddleRoundStatus({ phase: 'ROUND_ACTIVE' }, playerState, 'TEMPORARILY_DISCONNECTED').kind).toBe('disconnected');
  });

  it('mounts only one complete rival board and keeps accessible controls', () => {
    const game = gameState();
    const room = { code: 'ABC234', phase: 'ROUND_ACTIVE', hostId: 'p1', maxPlayers: 8, selectedGameId: 'pokeddle-race', selectedGameConfig: { generations: [1, 2, 3, 4], roundSeconds: 20 }, sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'FIXED' }, nextGameVote: null, gamesPlayed: 0, serverNow: Date.now(), availableGames: [], game, gamePlayerState: playerState, members: ['p1', 'p2', 'p3'].map((id, index) => ({ id, displayName: ['Eru', 'Ana', 'Pedro'][index]!, avatar: { type: 'PRESET', value: 'trainer-berry' }, connected: true, presence: 'CONNECTED', roomRole: index ? 'MEMBER' : 'HOST', role: 'PLAYER', isHost: index === 0, sessionPoints: 0 })) } as RoomView;
    const markup = renderToStaticMarkup(createElement(PokeddleRaceGame, { room, selfId: 'p1', onAction: async () => undefined }));
    expect(markup.match(/data-board-mode="self"/g)).toHaveLength(1);
    expect(markup.match(/data-board-mode="spectator"/g)).toHaveLength(1);
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('role="tabpanel"');
    expect(markup).toContain('aria-label="Buscar Pokémon para la ronda 4"');
    expect(markup).toContain('aria-label="Avatar de Ana"');
  });
});

describe('Global header accessibility', () => {
  it('keeps the brand in a centered grid and exposes profile and logout actions', () => {
    const user = { id: 'p1', displayName: 'Eru', kind: 'USER' as const, email: 'eru@example.com', avatar: { type: 'PRESET' as const, value: 'trainer-berry' as const } };
    const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(AppHeader, { user, onLogout: () => undefined })));
    expect(markup).toContain('data-layout="centered-brand"');
    expect(markup).toContain('aria-label="Pokémon Universe, inicio"');
    expect(markup).toContain('aria-label="Abrir perfil de Eru"');
    expect(markup).toContain('aria-label="Cerrar sesión"');
  });
});

import type { PokemonPaletteGuessPublicState, RoomView } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PokemonPaletteGuessConfigPanel } from '../games/pokemon-palette-guess/ConfigPanel';
import { PokemonPaletteGuessGame } from './PokemonPaletteGuessGame';
import { PokemonPaletteGuessResults } from './PokemonPaletteGuessResults';

const colors = ['#183048', '#d86048', '#f0c030', '#4878c0', '#78a848'];
const active: PokemonPaletteGuessPublicState = { gameId: 'pokemon-palette-guess', phase: 'ROUND_ACTIVE', roundNumber: 1, totalRounds: 10, colors, attempts: [], solvedPlayers: [], scores: { p1: 0 }, roundStartedAt: 1_000, roundEndsAt: 26_000, nextTransitionAt: null, lastRound: null, results: null };
function room(game: PokemonPaletteGuessPublicState, playerState: unknown): RoomView { return { code: 'ABC234', phase: game.phase, hostId: 'p1', maxPlayers: 8, availableGames: [], selectedGameId: 'pokemon-palette-guess', selectedGameConfig: { generations: [1], roundSeconds: 25, rounds: 10, paletteSize: 5 }, sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'FIXED' }, nextGameVote: null, gamesPlayed: 0, sessionStandings: [], sessionHistory: [], serverNow: 1_000, game, gamePlayerState: playerState, members: [{ id: 'p1', displayName: 'Eru', avatar: { type: 'PRESET', value: 'trainer-berry' }, connected: true, presence: 'CONNECTED', roomRole: 'HOST', role: 'PLAYER', isHost: true, ready: false, sessionPoints: 0 }] } as unknown as RoomView; }

describe('Adivina por la Paleta UI', () => {
  it('makes the palette the visual focus without rendering a target identity', () => { const markup = renderToStaticMarkup(createElement(PokemonPaletteGuessGame, { room: room(active, { role: 'PLAYER', canGuess: true, solved: false, solveOrder: null, cooldownUntil: null, roundPoints: 0, attemptCount: 0, lastAttempt: null }), selfId: 'p1', onAction: async () => undefined })); expect(markup).toContain('Paleta de 5 colores'); expect(markup).toContain('background-color:#183048'); expect(markup).not.toContain('Pikachu'); });
  it('renders lobby controls for palette difficulty and rounds', () => { const markup = renderToStaticMarkup(createElement(PokemonPaletteGuessConfigPanel, { config: { generations: [1], roundSeconds: 25, rounds: 10, paletteSize: 5 }, disabled: false, onChange: async () => undefined })); expect(markup).toContain('Colores visibles'); expect(markup).toContain('Menos colores'); expect(markup).toContain('Número de rondas'); });
  it('renders the final ranking and host controls', () => { const finished: PokemonPaletteGuessPublicState = { ...active, phase: 'GAME_RESULTS', roundEndsAt: null, results: { winnerId: 'p1', standings: [{ playerId: 'p1', position: 1, points: 13, won: true, stats: { correct: 1, totalAttempts: 1, firstTry: 1 } }] } }; const markup = renderToStaticMarkup(createElement(PokemonPaletteGuessResults, { room: room(finished, null), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined })); expect(markup).toContain('Resultados · Adivina por la Paleta'); expect(markup).toContain('Continuar sesión'); });
});

import type { PokemonTriviaPublicState, RoomView } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PokemonTriviaConfigPanel } from '../games/pokemon-trivia/ConfigPanel';
import { PokemonTriviaGame } from './PokemonTriviaGame';
import { PokemonTriviaResults } from './PokemonTriviaResults';

const options = [
  { id: 'A' as const, pokemon: { id: 'pikachu', name: 'Pikachu', sprite: '/pikachu.png' } },
  { id: 'B' as const, pokemon: { id: 'charmander', name: 'Charmander', sprite: '/charmander.png' } },
  { id: 'C' as const, pokemon: { id: 'squirtle', name: 'Squirtle', sprite: '/squirtle.png' } },
];

function room(game: PokemonTriviaPublicState, playerState: unknown): RoomView {
  return { code: 'ABC234', phase: game.phase, hostId: 'p1', maxPlayers: 8, availableGames: [], selectedGameId: 'pokemon-trivia', selectedGameConfig: { generations: [1], roundSeconds: 20, rounds: 10, optionCount: 3, difficulty: 'NORMAL', questionTypes: ['TYPE'] }, sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'FIXED' }, nextGameVote: null, gamesPlayed: 0, sessionStandings: [], sessionHistory: [], serverNow: 1_000, game, gamePlayerState: playerState, members: [
    { id: 'p1', displayName: 'Eru', avatar: { type: 'PRESET', value: 'trainer-berry' }, connected: true, presence: 'CONNECTED', roomRole: 'HOST', role: 'PLAYER', isHost: true, ready: false, sessionPoints: 0 },
    { id: 'p2', displayName: 'Ana', avatar: { type: 'PRESET', value: 'trainer-aqua' }, connected: true, presence: 'CONNECTED', roomRole: 'MEMBER', role: 'PLAYER', isHost: false, ready: false, sessionPoints: 0 },
  ] } as unknown as RoomView;
}

const active: PokemonTriviaPublicState = { gameId: 'pokemon-trivia', phase: 'ROUND_ACTIVE', roundNumber: 1, totalRounds: 10, difficulty: 'NORMAL', prompt: '¿Cuál es de tipo Eléctrico?', questionType: 'TYPE', options, answeredPlayerIds: [], scores: { p1: 0, p2: 0 }, roundStartedAt: 1_000, roundEndsAt: 21_000, nextTransitionAt: null, lastRound: null, results: null };

describe('Pokémon Trivia UI', () => {
  it('renders a responsive answer surface without leaking the correct option', () => {
    const markup = renderToStaticMarkup(createElement(PokemonTriviaGame, { room: room(active, { role: 'PLAYER', canAnswer: true, answer: null }), selfId: 'p1', onAction: async () => undefined }));
    expect(markup).toContain('Pokémon Trivia'); expect(markup).toContain('Pikachu'); expect(markup).toContain('Charmander');
    expect(markup).not.toContain('Respuesta correcta'); expect(markup).not.toContain('correctOptionId');
  });

  it('renders all configurable question categories', () => {
    const markup = renderToStaticMarkup(createElement(PokemonTriviaConfigPanel, { config: { generations: [1], roundSeconds: 20, rounds: 10, optionCount: 4, difficulty: 'NORMAL', questionTypes: ['TYPE', 'BST'] }, disabled: false, onChange: async () => undefined }));
    expect(markup).toContain('Categorías de preguntas'); expect(markup).toContain('Velocidad'); expect(markup).toContain('Peso');
  });

  it('renders final standings and host continuation controls', () => {
    const finished: PokemonTriviaPublicState = { ...active, phase: 'GAME_RESULTS', roundEndsAt: null, results: { winnerId: 'p1', standings: [{ playerId: 'p1', position: 1, points: 380, won: true, stats: { answers: 2, correct: 2 } }, { playerId: 'p2', position: 2, points: 0, won: false, stats: { answers: 2, correct: 0 } }] } };
    const markup = renderToStaticMarkup(createElement(PokemonTriviaResults, { room: room(finished, null), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(markup).toContain('Resultados · Pokémon Trivia'); expect(markup).toContain('100% de precisión'); expect(markup).toContain('Continuar sesión');
  });
});

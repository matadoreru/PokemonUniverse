import { defaultGuessFromStatsConfig, type GuessFromStatsPlayerState, type GuessFromStatsPublicState, type RoomView } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GuessFromStatsConfigPanel, validateGuessFromStatsConfig } from '../games/guess-from-stats/ConfigPanel';
import { GuessFromStatsGame } from './GuessFromStatsGame';
import { GuessFromStatsResults } from './GuessFromStatsResults';

function publicGame(phase: 'ROUND_ACTIVE' | 'ROUND_RESULTS' | 'GAME_RESULTS' = 'ROUND_ACTIVE'): GuessFromStatsPublicState {
  const answer = { id: 'gardevoir', name: 'Gardevoir', sprite: '/gardevoir.png', generation: 3, types: ['psychic', 'fairy'] as const, hp: 68, attack: 65, defense: 65, specialAttack: 125, specialDefense: 115, speed: 80, bst: 518 };
  const equivalent = { ...answer, id: 'gardevoir-mega', name: 'Mega-Gardevoir', sprite: '/mega.png' };
  const solve = { solveOrder: 1, solvedAt: 2_000, elapsedMs: 1_000, points: 4, attempts: 2, submittedPokemon: { id: 'gardevoir-mega', name: 'Mega-Gardevoir', sprite: '/mega.png' } };
  return { gameId: 'guess-from-stats', phase, roundNumber: 1, totalRounds: 10, visibleStats: phase === 'ROUND_ACTIVE' ? [{ key: 'hp', value: 68 }, { key: 'specialAttack', value: 125 }, { key: 'speed', value: 80 }] : [], hints: phase === 'ROUND_ACTIVE' ? [{ kind: 'TYPES', value: ['psychic', 'fairy'] }] : [], attempts: [{ playerId: 'p2', guessedPokemon: { id: 'gallade', name: 'Gallade', sprite: '/gallade.png' }, attemptedAt: 1_500 }], solvedPlayers: [{ playerId: 'p1', solveOrder: 1 }], scores: { p1: 4, p2: 0 }, roundStartedAt: 1_000, roundEndsAt: phase === 'ROUND_ACTIVE' ? Date.now() + 30_000 : null, nextTransitionAt: phase === 'ROUND_RESULTS' ? Date.now() + 4_000 : null, lastRound: phase === 'ROUND_ACTIVE' ? null : { answers: [{ ...answer, types: [...answer.types] }, { ...equivalent, types: [...equivalent.types] }], visibleStats: [{ key: 'hp', value: 68 }, { key: 'specialAttack', value: 125 }, { key: 'speed', value: 80 }], hints: [{ kind: 'TYPES', value: ['psychic', 'fairy'] }], solves: { p1: solve }, attemptCounts: { p1: 2, p2: 1 } }, results: phase === 'GAME_RESULTS' ? { winnerId: 'p1', standings: [{ playerId: 'p1', position: 1, points: 4, won: true, stats: { correct: 1, missed: 0, totalAttempts: 2, firstTry: 0, roundFirsts: 1, solveTimeTotalMs: 1_000, bestTimeMs: 1_000, pointsFromRounds: 4 } }, { playerId: 'p2', position: 2, points: 0, won: false, stats: { correct: 0, missed: 1, totalAttempts: 1, firstTry: 0, roundFirsts: 0, solveTimeTotalMs: 0, bestTimeMs: 0, pointsFromRounds: 0 } }] } : null };
}

function room(game: GuessFromStatsPublicState, player: GuessFromStatsPlayerState, spectator = false): RoomView {
  return { code: 'ABC234', phase: game.phase, hostId: 'p1', maxPlayers: 8, availableGames: [], selectedGameId: 'guess-from-stats', selectedGameConfig: { ...defaultGuessFromStatsConfig, generations: [1, 2, 3] }, sessionMode: { type: 'INFINITE' }, gamesPlayed: 0, serverNow: Date.now(), game, gamePlayerState: player, members: [
    { id: 'p1', displayName: 'Eru', avatar: { type: 'PRESET', value: 'trainer-berry' }, connected: true, presence: 'CONNECTED', roomRole: 'HOST', role: spectator ? 'SPECTATOR' : 'PLAYER', isHost: true, sessionPoints: 4 },
    { id: 'p2', displayName: 'Ana', avatar: { type: 'PRESET', value: 'trainer-aqua' }, connected: true, presence: 'CONNECTED', roomRole: 'MEMBER', role: 'PLAYER', isHost: false, sessionPoints: 0 },
  ] };
}

describe('Guess from Stats client', () => {
  it('renders only configured public stats, exact numbers, fixed-scale bars, hints and public failures', () => {
    const game = publicGame(); game.solvedPlayers = [];
    const markup = renderToStaticMarkup(createElement(GuessFromStatsGame, { room: room(game, { canGuess: true, solved: false, solveOrder: null, cooldownUntil: null, roundPoints: 0, attemptCount: 0, lastAttempt: null }), selfId: 'p1', onAction: async () => undefined }));
    expect(markup).toContain('Base Stats'); expect(markup).toContain('>68<'); expect(markup).toContain('>125<'); expect(markup).toContain('>80<'); expect(markup).not.toContain('Def. Esp.');
    expect(markup).toContain('width:26.666'); expect(markup).toContain('Tipo Psíquico'); expect(markup).toContain('Gallade'); expect(markup).toContain('Buscar respuesta para la ronda 1');
    expect(markup).not.toContain('Gardevoir');
  });

  it('locks solved players and supports spectators without revealing their chosen answer', () => {
    const solved = renderToStaticMarkup(createElement(GuessFromStatsGame, { room: room(publicGame(), { canGuess: false, solved: true, solveOrder: 1, cooldownUntil: null, roundPoints: 4, attemptCount: 2, lastAttempt: { result: 'CORRECT', attemptedAt: 2_000 } }), selfId: 'p1', onAction: async () => undefined }));
    expect(solved).toContain('¡Has acertado!'); expect(solved).not.toContain('Buscar respuesta para la ronda'); expect(solved).not.toContain('Gardevoir');
    const spectator = renderToStaticMarkup(createElement(GuessFromStatsGame, { room: room(publicGame(), { canGuess: false, solved: false, solveOrder: null, cooldownUntil: null, roundPoints: 0, attemptCount: 0, lastAttempt: null }, true), selfId: 'p1', onAction: async () => undefined }));
    expect(spectator).toContain('Estás observando'); expect(spectator).not.toContain('Buscar respuesta para la ronda');
  });

  it('reveals every equivalent answer, full stats and the answer chosen by each solver', () => {
    const markup = renderToStaticMarkup(createElement(GuessFromStatsGame, { room: room(publicGame('ROUND_RESULTS'), { canGuess: false, solved: true, solveOrder: 1, cooldownUntil: null, roundPoints: 4, attemptCount: 2, lastAttempt: null }), selfId: 'p1', onAction: async () => undefined }));
    expect(markup).toContain('¡Había 2 respuestas válidas!'); expect(markup).toContain('Gardevoir'); expect(markup).toContain('Mega-Gardevoir'); expect(markup).toContain('Total (BST)'); expect(markup).toContain('Eligió Mega-Gardevoir'); expect(markup).toContain('+4');
  });

  it('uses a singular reveal when only one answer matches the public signature', () => {
    const game = publicGame('ROUND_RESULTS'); game.lastRound!.answers = game.lastRound!.answers.slice(0, 1);
    const markup = renderToStaticMarkup(createElement(GuessFromStatsGame, { room: room(game, { canGuess: false, solved: false, solveOrder: null, cooldownUntil: null, roundPoints: 0, attemptCount: 0, lastAttempt: null }), selfId: 'p2', onAction: async () => undefined }));
    expect(markup).toContain('¡Era Gardevoir!'); expect(markup).not.toContain('respuestas válidas');
  });

  it('validates two stats, exposes accessible toggles and keeps the same-lobby result action', () => {
    const invalid = { ...defaultGuessFromStatsConfig, stats: { ...defaultGuessFromStatsConfig.stats, attack: false, defense: false, specialAttack: false, specialDefense: false, speed: false } };
    expect(validateGuessFromStatsConfig(invalid)).toContain('2 estadísticas');
    const config = renderToStaticMarkup(createElement(GuessFromStatsConfigPanel, { config: defaultGuessFromStatsConfig, disabled: false, onChange: async () => undefined }));
    expect(config).toContain('Stats mostradas'); expect(config).toContain('6 activas'); expect(config).toContain('Total de Stats'); expect(config).toContain('Pistas adicionales'); expect(config).not.toContain('type="range"');
    const results = renderToStaticMarkup(createElement(GuessFromStatsResults, { room: room(publicGame('GAME_RESULTS'), { canGuess: false, solved: false, solveOrder: null, cooldownUntil: null, roundPoints: 0, attemptCount: 0, lastAttempt: null }), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(results).toContain('Clasificación final'); expect(results).toContain('Volver al mismo lobby'); expect(results).toContain('Avatar de Eru');
  });
});

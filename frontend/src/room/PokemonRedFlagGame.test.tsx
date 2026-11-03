import { defaultPokemonRedFlagConfig, type PokemonRedFlagPlayerState, type PokemonRedFlagPublicState, type RoomView } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PokemonRedFlagGame } from './PokemonRedFlagGame';
import { PokemonRedFlagResults } from './PokemonRedFlagResults';

function publicGame(phase: 'ROUND_ACTIVE' | 'VOTING' | 'REVOTE' | 'ROUND_RESULTS' | 'GAME_RESULTS' = 'ROUND_ACTIVE'): PokemonRedFlagPublicState {
  const voting = phase === 'VOTING' || phase === 'REVOTE';
  const answers = [
    { id: 'rf-1-1', authorId: 'p1', text: 'Dice que su ex era un Ditto.', votesReceived: 1, won: false },
    { id: 'rf-1-2', authorId: 'p2', text: 'Comparte ubicación con Hypno.', votesReceived: 2, won: true },
    { id: 'rf-1-3', authorId: 'p3', text: 'Lleva a su madre a todas las citas.', votesReceived: 0, won: false },
  ];
  const lastRound = phase === 'ROUND_RESULTS' || phase === 'GAME_RESULTS' ? {
    flagMode: 'RED' as const,
    pokemon: { id: 'gengar', name: 'Gengar', sprite: '/gengar.png' }, answers,
    voteRounds: [{ number: 1, candidateIds: answers.map((answer) => answer.id), votes: { p1: 'rf-1-2', p2: 'rf-1-1', p3: 'rf-1-2' } }],
    winningAnswerIds: ['rf-1-2'], winnerIds: ['p2'], pointsAwarded: { p1: 0, p2: 3, p3: 0 }, missingPlayerIds: [],
  } : null;
  return {
    gameId: 'pokemon-red-flag', phase, roundNumber: 1, totalRounds: 5, pokemon: { id: 'gengar', name: 'Gengar', sprite: '/gengar.png' }, flagMode: 'RED', playerIds: ['p1', 'p2', 'p3'],
    submittedPlayerIds: ['p1'], revealedAnswers: voting ? answers.map(({ id, text }) => ({ id, text })) : [], votedPlayerIds: voting ? ['p2'] : [],
    voteCandidateIds: phase === 'REVOTE' ? ['rf-1-1', 'rf-1-2'] : voting ? answers.map((answer) => answer.id) : [], voteRoundNumber: phase === 'REVOTE' ? 2 : 1,
    scores: { p1: 0, p2: 3, p3: 0 }, roundEndsAt: phase === 'ROUND_ACTIVE' || voting ? 31_000 : null, nextTransitionAt: phase === 'ROUND_RESULTS' ? 9_000 : null, lastRound,
    results: phase === 'GAME_RESULTS' ? { winnerId: 'p2', standings: [
      { playerId: 'p2', position: 1, points: 3, won: true, stats: { roundsPlayed: 1, answersSubmitted: 1, roundsMissed: 0, votesCast: 1, votesReceived: 2, roundWins: 1, soloWins: 1, sharedWins: 0, pointsFromRounds: 3 } },
      { playerId: 'p1', position: 2, points: 0, won: false, stats: { roundsPlayed: 1, answersSubmitted: 1, roundsMissed: 0, votesCast: 1, votesReceived: 1, roundWins: 0, soloWins: 0, sharedWins: 0, pointsFromRounds: 0 } },
      { playerId: 'p3', position: 3, points: 0, won: false, stats: { roundsPlayed: 1, answersSubmitted: 1, roundsMissed: 0, votesCast: 1, votesReceived: 0, roundWins: 0, soloWins: 0, sharedWins: 0, pointsFromRounds: 0 } },
    ] } : null,
  };
}

function room(game: PokemonRedFlagPublicState, player: PokemonRedFlagPlayerState): RoomView {
  const members = ['Eru', 'Ana', 'Leo'].map((displayName, index) => ({ id: `p${index + 1}`, displayName, avatar: { type: 'DEFAULT' as const }, connected: true, presence: 'CONNECTED' as const, roomRole: index === 0 ? 'HOST' as const : 'MEMBER' as const, role: 'PLAYER' as const, isHost: index === 0, ready: false, sessionPoints: game.scores[`p${index + 1}`] ?? 0 }));
  return { code: 'ABC234', phase: game.phase, hostId: 'p1', maxPlayers: 8, availableGames: [{ id: 'pokemon-red-flag', name: 'Pokémon Red Flag', icon: '🚩', description: 'Red flags', minPlayers: 3, profileStats: { metrics: [] } }], selectedGameId: 'pokemon-red-flag', selectedGameConfig: defaultPokemonRedFlagConfig, sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'FIXED' }, nextGameVote: null, gamesPlayed: 0, sessionStandings: [], sessionHistory: [], serverNow: 1_000, game, gamePlayerState: player, members };
}

describe('Pokémon Red Flag client', () => {
  it('renders the Pokémon and private locked writing flow', () => {
    const active = renderToStaticMarkup(createElement(PokemonRedFlagGame, { room: room(publicGame(), { role: 'PLAYER', canSubmit: true, ownDraft: '', ownAnswer: null, canVote: false, ownVoteAnswerId: null, ownAnswerId: 'rf-1-1' }), selfId: 'p1', onAction: async () => undefined }));
    expect(active).toContain('Gengar'); expect(active).toContain('Escribe su mayor red flag'); expect(active).toContain('Ningún texto ni autor se revela');
    const locked = renderToStaticMarkup(createElement(PokemonRedFlagGame, { room: room(publicGame(), { role: 'PLAYER', canSubmit: false, ownDraft: 'Dice que su ex era un Ditto.', ownAnswer: { id: 'rf-1-1', text: 'Dice que su ex era un Ditto.' }, canVote: false, ownVoteAnswerId: null, ownAnswerId: 'rf-1-1' }), selfId: 'p1', onAction: async () => undefined }));
    expect(locked).toContain('Respuesta bloqueada'); expect(locked).toContain('Solo tú puedes verla');
  });

  it('renders green mode, restores the private draft and keeps the input capped without placeholder', () => {
    const game = publicGame(); game.flagMode = 'GREEN';
    const html = renderToStaticMarkup(createElement(PokemonRedFlagGame, { room: room(game, { role: 'PLAYER', canSubmit: true, ownDraft: 'Siempre escucha.', ownAnswer: null, canVote: false, ownVoteAnswerId: null, ownAnswerId: 'rf-1-1' }), selfId: 'p1', onAction: async () => undefined }));
    expect(html).toContain('Pokémon Green Flag'); expect(html).toContain('Escribe su mejor green flag'); expect(html).toContain('Siempre escucha.'); expect(html).toContain('maxLength="100"');
    expect(html).not.toContain('placeholder=');
  });

  it('renders anonymous voting, identifies only the own card and supports revote', () => {
    const player: PokemonRedFlagPlayerState = { role: 'PLAYER', canSubmit: false, ownDraft: 'Dice que su ex era un Ditto.', ownAnswer: { id: 'rf-1-1', text: 'Dice que su ex era un Ditto.' }, canVote: true, ownVoteAnswerId: null, ownAnswerId: 'rf-1-1' };
    const voting = renderToStaticMarkup(createElement(PokemonRedFlagGame, { room: room(publicGame('VOTING'), player), selfId: 'p1', onAction: async () => undefined }));
    expect(voting).toContain('Respuestas anónimas'); expect(voting).toContain('TUYA'); expect(voting).toContain('Los autores se revelarán después');
    const revote = renderToStaticMarkup(createElement(PokemonRedFlagGame, { room: room(publicGame('REVOTE'), player), selfId: 'p1', onAction: async () => undefined }));
    expect(revote).toContain('Revota entre las empatadas'); expect(revote).toContain('Fuera de la revotación');
  });

  it('reveals authors and renders final statistics after the vote', () => {
    const player: PokemonRedFlagPlayerState = { role: 'PLAYER', canSubmit: false, ownDraft: 'Dice que su ex era un Ditto.', ownAnswer: { id: 'rf-1-1', text: 'Dice que su ex era un Ditto.' }, canVote: false, ownVoteAnswerId: 'rf-1-2', ownAnswerId: 'rf-1-1' };
    const reveal = renderToStaticMarkup(createElement(PokemonRedFlagGame, { room: room(publicGame('ROUND_RESULTS'), player), selfId: 'p1', onAction: async () => undefined }));
    expect(reveal).toContain('Autores revelados'); expect(reveal).toContain('Ana'); expect(reveal).toContain('+3 pts');
    const results = renderToStaticMarkup(createElement(PokemonRedFlagResults, { room: room(publicGame('GAME_RESULTS'), player), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(results).toContain('Las señales más votadas'); expect(results).toContain('2 votos recibidos'); expect(results).toContain('Continuar sesión');
  });
});

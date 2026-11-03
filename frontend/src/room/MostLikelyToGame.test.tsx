import { defaultMostLikelyToConfig, type MostLikelyToPlayerState, type MostLikelyToPokemon, type MostLikelyToPublicState, type RoomView } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MostLikelyToGame } from './MostLikelyToGame';
import { MostLikelyToResults } from './MostLikelyToResults';

const choices: MostLikelyToPokemon[] = [
  { id: 'snorlax', name: 'Snorlax', sprite: '/snorlax.png' },
  { id: 'psyduck', name: 'Psyduck', sprite: '/psyduck.png' },
  { id: 'gengar', name: 'Gengar', sprite: '/gengar.png' },
];

function publicGame(phase: 'ROUND_ACTIVE' | 'VOTING' | 'REVOTE' | 'ROUND_RESULTS' | 'GAME_RESULTS' = 'ROUND_ACTIVE'): MostLikelyToPublicState {
  const voting = phase === 'VOTING' || phase === 'REVOTE';
  const result = phase === 'ROUND_RESULTS' || phase === 'GAME_RESULTS' ? {
    prompt: '¿Qué Pokémon sería más probable que llegase tarde a una cita?',
    answers: choices.map((pokemon, index) => ({ playerId: `p${index + 1}`, pokemon, votesReceived: index === 1 ? 2 : index === 0 ? 1 : 0, won: index === 1 })),
    voteRounds: [{ number: 1, candidateIds: ['p1', 'p2', 'p3'], votes: { p1: 'p2', p2: 'p1', p3: 'p2' } }],
    winnerIds: ['p2'], pointsAwarded: { p1: 0, p2: 3, p3: 0 },
  } : null;
  return {
    gameId: 'most-likely-to', phase, roundNumber: 1, totalRounds: 5,
    prompt: '¿Qué Pokémon sería más probable que llegase tarde a una cita?', playerIds: ['p1', 'p2', 'p3'],
    selectionCompletedIds: ['p1'], revealedAnswers: voting ? choices.map((pokemon, index) => ({ playerId: `p${index + 1}`, pokemon })) : [],
    votedPlayerIds: voting ? ['p2'] : [], voteCandidates: phase === 'REVOTE' ? ['p1', 'p2'] : voting ? ['p1', 'p2', 'p3'] : [], voteRoundNumber: phase === 'REVOTE' ? 2 : 1,
    scores: { p1: 0, p2: 3, p3: 0 }, roundEndsAt: phase === 'ROUND_ACTIVE' ? 46_000 : voting ? 31_000 : null,
    nextTransitionAt: phase === 'ROUND_RESULTS' ? 39_000 : null, lastRound: result,
    results: phase === 'GAME_RESULTS' ? { winnerId: 'p2', standings: [
      { playerId: 'p2', position: 1, points: 3, won: true, stats: { roundsPlayed: 1, answersSubmitted: 1, roundsMissed: 0, votesCast: 1, votesReceived: 2, roundWins: 1, soloWins: 1, sharedWins: 0, pointsFromRounds: 3 } },
      { playerId: 'p1', position: 2, points: 0, won: false, stats: { roundsPlayed: 1, answersSubmitted: 1, roundsMissed: 0, votesCast: 1, votesReceived: 1, roundWins: 0, soloWins: 0, sharedWins: 0, pointsFromRounds: 0 } },
      { playerId: 'p3', position: 3, points: 0, won: false, stats: { roundsPlayed: 1, answersSubmitted: 1, roundsMissed: 0, votesCast: 1, votesReceived: 0, roundWins: 0, soloWins: 0, sharedWins: 0, pointsFromRounds: 0 } },
    ] } : null,
  };
}

function room(game: MostLikelyToPublicState, player: MostLikelyToPlayerState): RoomView {
  const members = ['Eru', 'Ana', 'Leo'].map((displayName, index) => ({ id: `p${index + 1}`, displayName, avatar: { type: 'DEFAULT' as const }, connected: true, presence: 'CONNECTED' as const, roomRole: index === 0 ? 'HOST' as const : 'MEMBER' as const, role: 'PLAYER' as const, isHost: index === 0, ready: false, sessionPoints: game.scores[`p${index + 1}`] ?? 0 }));
  return { code: 'ABC234', phase: game.phase, hostId: 'p1', maxPlayers: 8, availableGames: [{ id: 'most-likely-to', name: 'Most Likely To', icon: '👉', description: 'Votación', minPlayers: 3, profileStats: { metrics: [] } }], selectedGameId: 'most-likely-to', selectedGameConfig: defaultMostLikelyToConfig, sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'FIXED' }, nextGameVote: null, gamesPlayed: 0, sessionStandings: [], sessionHistory: [], serverNow: 1_000, game, gamePlayerState: player, members };
}

describe('Most Likely To client', () => {
  it('renders the private Pokémon search and only public completion state during selection', () => {
    const html = renderToStaticMarkup(createElement(MostLikelyToGame, { room: room(publicGame(), { role: 'PLAYER', canSelect: true, ownChoice: choices[0]!, canVote: false, ownVotePlayerId: null }), selfId: 'p1', onAction: async () => undefined }));
    expect(html).toContain('Tu respuesta secreta'); expect(html).toContain('RESPUESTA GUARDADA'); expect(html).toContain('Snorlax');
    expect(html).toContain('Buscar Pokémon para responder'); expect(html).toContain('Las respuestas no se muestran'); expect(html).not.toContain('Psyduck');
  });

  it('reveals author and Pokémon, forbids the own card and marks revote candidates', () => {
    const player: MostLikelyToPlayerState = { role: 'PLAYER', canSelect: false, ownChoice: choices[0]!, canVote: true, ownVotePlayerId: null };
    const voting = renderToStaticMarkup(createElement(MostLikelyToGame, { room: room(publicGame('VOTING'), player), selfId: 'p1', onAction: async () => undefined }));
    expect(voting).toContain('Vota la mejor respuesta'); expect(voting).toContain('Ana'); expect(voting).toContain('Psyduck'); expect(voting).toContain('Tu respuesta');
    const revote = renderToStaticMarkup(createElement(MostLikelyToGame, { room: room(publicGame('REVOTE'), player), selfId: 'p1', onAction: async () => undefined }));
    expect(revote).toContain('Revotación entre empatados'); expect(revote).toContain('Fuera de la revotación');
  });

  it('reveals the winner, decisive ballots and fixed three points', () => {
    const html = renderToStaticMarkup(createElement(MostLikelyToGame, { room: room(publicGame('ROUND_RESULTS'), { role: 'PLAYER', canSelect: false, ownChoice: choices[0]!, canVote: false, ownVotePlayerId: 'p2' }), selfId: 'p1', onAction: async () => undefined }));
    expect(html).toContain('La respuesta favorita'); expect(html).toContain('2 votos decisivos'); expect(html).toContain('+3'); expect(html).toContain('Ver papeletas reveladas');
  });

  it('renders integrated final statistics and host continuation actions', () => {
    const html = renderToStaticMarkup(createElement(MostLikelyToResults, { room: room(publicGame('GAME_RESULTS'), { role: 'SPECTATOR', canSelect: false, ownChoice: null, canVote: false, ownVotePlayerId: null }), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(html).toContain('Las respuestas favoritas'); expect(html).toContain('2 votos recibidos'); expect(html).toContain('Continuar sesión');
  });
});

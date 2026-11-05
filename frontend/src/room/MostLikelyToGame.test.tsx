import { defaultMostLikelyToConfig, type MostLikelyToPlayerState, type MostLikelyToPokemon, type MostLikelyToPublicState, type MostLikelyToRoundResult, type RoomView } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MostLikelyToConfigPanel } from '../games/most-likely-to/ConfigPanel';
import { mostLikelyAnnouncement, mostLikelyHeading, mostLikelyVerdict } from '../games/most-likely-to/presentation';
import { MostLikelyToGame } from './MostLikelyToGame';
import { MostLikelyToResults } from './MostLikelyToResults';

// «Saltar minijuego» lee la sala: sin votación de salto no pinta nada.
vi.mock('./RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));
vi.mock('../hooks/usePokemonPool', () => ({ usePokemonPool: () => ({ pokemon: [{ id: 'pikachu', name: 'Pikachu', sprite: '/pikachu.png' }], error: '', loading: false, retry: () => undefined }) }));
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { kind: 'GUEST' } }) }));

const LEGACY = /class="[^"]*\b(btn-primary|btn-secondary|btn-ghost|card|chip|label|field|panel|reveal-pop|timer-pulse|text-electric|text-leaf|text-berry|text-aqua|empty-state|status-error)\b/;

const choices: MostLikelyToPokemon[] = [
  { id: 'snorlax', name: 'Snorlax', sprite: '/snorlax.png' },
  { id: 'psyduck', name: 'Psyduck', sprite: '/psyduck.png' },
  { id: 'gengar', name: 'Gengar', sprite: '/gengar.png' },
];
const PROMPT = '¿Qué Pokémon sería más probable que llegase tarde a una cita?';

/** Resultado con segunda vuelta: empate Eru–Ana en la primera (Leo no vota) y Ana gana 2–1 en la segunda. */
const revoteResult: MostLikelyToRoundResult = {
  prompt: PROMPT,
  answers: choices.map((pokemon, index) => ({ playerId: `p${index + 1}`, pokemon, votesReceived: index === 1 ? 2 : index === 0 ? 1 : 0, won: index === 1 })),
  voteRounds: [
    { number: 1, candidateIds: ['p1', 'p2', 'p3'], votes: { p1: 'p2', p2: 'p1' } },
    { number: 2, candidateIds: ['p1', 'p2'], votes: { p1: 'p2', p3: 'p2', p2: 'p1' } },
  ],
  winnerIds: ['p2'], pointsAwarded: { p1: 0, p2: 3, p3: 0 },
};

function publicGame(phase: 'ROUND_ACTIVE' | 'VOTING' | 'REVOTE' | 'ROUND_RESULTS' | 'GAME_RESULTS' = 'ROUND_ACTIVE', lastRound: MostLikelyToRoundResult | null = null): MostLikelyToPublicState {
  const voting = phase === 'VOTING' || phase === 'REVOTE';
  return {
    gameId: 'most-likely-to', phase, roundNumber: 1, totalRounds: 5,
    prompt: PROMPT, playerIds: ['p1', 'p2', 'p3'],
    selectionCompletedIds: ['p1'], revealedAnswers: voting ? choices.map((pokemon, index) => ({ playerId: `p${index + 1}`, pokemon })) : [],
    votedPlayerIds: voting ? ['p2'] : [], voteCandidates: phase === 'REVOTE' ? ['p1', 'p2'] : voting ? ['p1', 'p2', 'p3'] : [], voteRoundNumber: phase === 'REVOTE' ? 2 : 1,
    scores: { p1: 0, p2: 3, p3: 0 }, roundEndsAt: phase === 'ROUND_ACTIVE' ? 46_000 : voting ? 31_000 : null,
    nextTransitionAt: phase === 'ROUND_RESULTS' ? 9_000 : null, lastRound,
    results: phase === 'GAME_RESULTS' ? { winnerId: 'p2', standings: [
      { playerId: 'p2', position: 1, points: 3, won: true, stats: { roundsPlayed: 1, answersSubmitted: 1, roundsMissed: 0, votesCast: 1, votesReceived: 2, roundWins: 1, soloWins: 1, sharedWins: 0, pointsFromRounds: 3 } },
      { playerId: 'p1', position: 2, points: 0, won: false, stats: { roundsPlayed: 1, answersSubmitted: 1, roundsMissed: 0, votesCast: 1, votesReceived: 1, roundWins: 0, soloWins: 0, sharedWins: 0, pointsFromRounds: 0 } },
      { playerId: 'p3', position: 2, points: 0, won: false, stats: { roundsPlayed: 1, answersSubmitted: 1, roundsMissed: 0, votesCast: 1, votesReceived: 0, roundWins: 0, soloWins: 0, sharedWins: 0, pointsFromRounds: 0 } },
    ] } : null,
  };
}

function room(game: MostLikelyToPublicState, player: MostLikelyToPlayerState | null, disconnected: string[] = []): RoomView {
  const members = ['Eru', 'Ana', 'Leo'].map((displayName, index) => {
    const id = `p${index + 1}`;
    const off = disconnected.includes(id);
    return { id, displayName, avatar: { type: 'DEFAULT' as const }, connected: !off, presence: off ? 'TEMPORARILY_DISCONNECTED' as const : 'CONNECTED' as const, roomRole: index === 0 ? 'HOST' as const : 'MEMBER' as const, role: 'PLAYER' as const, isHost: index === 0, ready: false, sessionPoints: game.scores[id] ?? 0 };
  });
  return { code: 'ABC234', phase: game.phase, hostId: 'p1', maxPlayers: 8, availableGames: [{ id: 'most-likely-to', name: 'Most Likely To', icon: '👉', description: 'Votación', minPlayers: 3, profileStats: { metrics: [] } }], selectedGameId: 'most-likely-to', selectedGameConfig: defaultMostLikelyToConfig, sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'ORDER', gameIds: ['most-likely-to'] }, nextGameVote: null, gamesPlayed: 0, sessionStandings: [], sessionHistory: [], serverNow: 1_000, game, gamePlayerState: player, members };
}

const PLAYER_VOTING: MostLikelyToPlayerState = { role: 'PLAYER', canSelect: false, ownChoice: choices[0]!, canVote: true, ownVotePlayerId: null };
const SPECTATOR: MostLikelyToPlayerState = { role: 'SPECTATOR', canSelect: false, ownChoice: null, canVote: false, ownVotePlayerId: null };
const render = (game: MostLikelyToPublicState, player: MostLikelyToPlayerState | null, selfId = 'p1', disconnected: string[] = []) =>
  renderToStaticMarkup(createElement(MostLikelyToGame, { room: room(game, player, disconnected), selfId, onAction: async () => undefined }));
/** Texto de lo que se pinta (sin etiquetas), con los `alt`, `title` y `aria-label`. */
const visible = (html: string) => `${html.replace(/<[^>]+>/g, ' ')} ${[...html.matchAll(/(?:alt|title|aria-label)="([^"]*)"/g)].map((match) => match[1]).join(' ')}`;

describe('Most Likely To: pantalla', () => {
  it('elegir: la pregunta en su panel, el buscador, la respuesta guardada y solo quién ha respondido', () => {
    const html = render(publicGame(), { role: 'PLAYER', canSelect: true, ownChoice: choices[0]!, canVote: false, ownVotePlayerId: null });
    expect(html).toContain(PROMPT);
    expect(html).toContain('Elige tu respuesta');
    expect(html).toContain('Respuesta guardada');
    expect(html).toContain('Guardada<');
    expect(html).toContain('Snorlax');
    // Junto al buscador la placa no lleva descripción: solo el kicker y el título.
    expect(html).not.toContain('Puedes cambiar tu elección mientras siga abierta la fase.');
    expect(html).toContain('Buscar Pokémon para responder');
    expect(html).toContain('Las respuestas no se muestran hasta que termina la selección.');
    expect(html).toContain('Respondió');
    expect(html).toContain('Para responder');
    expect(html).toMatch(/aria-current="step" data-phase="choose"/);
    expect(html.match(/aria-live/g)).toHaveLength(1);
    expect(html).not.toMatch(LEGACY);
  });

  it('privacidad: antes de revelar no hay elecciones de otros ni votos, aunque llegue un `lastRound` sobrante (también en la segunda vuelta)', () => {
    for (const [phase, player] of [['ROUND_ACTIVE', { role: 'PLAYER', canSelect: true, ownChoice: choices[0]!, canVote: false, ownVotePlayerId: null }], ['ROUND_ACTIVE', SPECTATOR]] as const) {
      const text = visible(render(publicGame(phase, revoteResult), player));
      for (const other of ['Psyduck', 'Gengar']) expect(text, `${phase}: sin ${other}`).not.toContain(other);
      expect(text).not.toMatch(/\d+ votos?\b|Votos de|Ganadora|Primera vuelta/);
    }
    for (const phase of ['VOTING', 'REVOTE'] as const) {
      const html = render(publicGame(phase, revoteResult), { ...PLAYER_VOTING, ownVotePlayerId: phase === 'VOTING' ? null : 'p2', canVote: phase === 'VOTING' });
      const text = visible(html);
      expect(text, `${phase}: sin recuentos ni quién votó a quién`).not.toMatch(/\d+ votos?\b|Votos de|Ganadora|Primera vuelta|Gana /);
      expect(html).not.toMatch(/tally-row|tally-votes|tally-summary/);
    }
  });

  it('votar: cartas con autor (la propia no se vota), confirmación y progreso «Votó»/«Pendiente»/«Sin conexión»', () => {
    const html = render(publicGame('VOTING'), PLAYER_VOTING, 'p1', ['p3']);
    expect(html).toContain('Vota la mejor respuesta');
    expect(html).toContain('>Votación<');
    expect(html).toContain('aria-label="Psyduck, respuesta de Ana"');
    expect(html).toContain('Tu respuesta');
    expect((html.match(/aria-pressed=/g) ?? []).length).toBe(2);
    expect(html).toContain('Confirmar voto');
    expect(html).toContain('Votó');
    expect(html).toContain('Pendiente');
    expect(html).toContain('Sin conexión');
    expect(html).toContain('El destino de cada voto es secreto hasta el resultado.');
    expect(html).toContain('Para votar');
    expect(html).not.toMatch(LEGACY);
  });

  it('segunda vuelta: solo los empatados y el voto bloqueado', () => {
    const open = render(publicGame('REVOTE'), PLAYER_VOTING, 'p3');
    expect(open).toContain('Segunda vuelta');
    expect(open).toContain('Para revotar');
    expect(open).toContain('Snorlax');
    expect(open).toContain('Psyduck');
    expect(open).not.toContain('Gengar');
    expect((open.match(/aria-pressed=/g) ?? []).length).toBe(2);
    const locked = render(publicGame('REVOTE'), { ...PLAYER_VOTING, canVote: false, ownVotePlayerId: 'p2' });
    expect(locked).toContain('Voto bloqueado');
    expect(locked).toContain('Tu voto');
    expect(locked).not.toContain('Confirmar voto');
  });

  it('observar: la papeleta sin botones', () => {
    const html = render(publicGame('VOTING'), SPECTATOR, 's1');
    expect(html).toContain('Estás observando');
    expect(html).not.toContain('aria-pressed');
  });

  it('revelar: recuento con las dos vueltas, barras, quién votó a quién, la ganadora y los puntos; «Sin respuesta» para quien no respondió', () => {
    const missing: MostLikelyToRoundResult = { ...revoteResult, answers: revoteResult.answers.slice(0, 2) };
    const html = render(publicGame('ROUND_RESULTS', missing), { role: 'PLAYER', canSelect: false, ownChoice: choices[0]!, canVote: false, ownVotePlayerId: 'p2' });
    expect(html).toContain('La respuesta favorita');
    expect(html).toContain('Gana Psyduck de Ana con 2 votos tras la segunda vuelta.');
    expect(html).toContain('Primera vuelta');
    expect(html).toContain('Segunda vuelta');
    expect(html).toContain('Votos de Eru y Leo');
    expect(html).toContain('Ganadora');
    expect(html).toContain('role="meter"');
    expect(html).toContain('Sin respuesta');
    expect(html).toContain('+3');
    expect(html).toContain('Tu respuesta: 1 voto');
    expect(html).toContain('Siguiente ronda en');
    expect(html).toMatch(/aria-current="step" data-phase="result"/);
    expect(html.match(/aria-live/g)).toHaveLength(1);
    expect(html).not.toMatch(LEGACY);
  });

  it('revelar sin votos: nadie ve «Ganadora» con 0 votos', () => {
    const noVotes: MostLikelyToRoundResult = {
      ...revoteResult, voteRounds: [{ number: 1, candidateIds: ['p1', 'p2'], votes: {} }, { number: 2, candidateIds: ['p1', 'p2'], votes: {} }],
      answers: revoteResult.answers.slice(0, 2).map((answer) => ({ ...answer, votesReceived: 0, won: true })), winnerIds: ['p1', 'p2'], pointsAwarded: { p1: 3, p2: 3, p3: 0 },
    };
    const html = render(publicGame('ROUND_RESULTS', noVotes), SPECTATOR, 's1');
    expect(html).toContain('Victoria compartida');
    expect(html).toContain('Empate sin votos');
    expect(html).not.toContain('Ganadora');
  });
});

describe('Most Likely To: textos', () => {
  it('títulos, región viva y veredicto', () => {
    expect(mostLikelyHeading('ROUND_RESULTS', { ...revoteResult, winnerIds: [] })).toBe('Sin respuesta ganadora');
    expect(mostLikelyHeading('ROUND_RESULTS', { ...revoteResult, winnerIds: ['p1', 'p2'] })).toBe('Victoria compartida');
    const nameOf = (id: string) => ({ p1: 'Eru', p2: 'Ana' })[id] ?? id;
    const base = { roundNumber: 2, ownChoice: null, locked: false, tiedNames: ['Eru', 'Ana'], result: null, nameOf };
    expect(mostLikelyAnnouncement({ ...base, phase: 'REVOTE' })).toBe('Empate: segunda vuelta entre Eru y Ana.');
    expect(mostLikelyAnnouncement({ ...base, phase: 'VOTING', locked: true })).toContain('Voto bloqueado');
    expect(mostLikelyAnnouncement({ ...base, phase: 'ROUND_ACTIVE', ownChoice: 'Snorlax' })).toBe('Respuesta guardada: Snorlax.');
    expect(mostLikelyAnnouncement({ ...base, phase: 'ROUND_RESULTS', result: revoteResult })).toBe('Ronda 2 terminada. Gana Ana con 2 votos tras la segunda vuelta.');
    expect(mostLikelyVerdict(revoteResult, 'p2', true)).toEqual({ tone: 'ok', text: '¡Tu respuesta ganó!', points: 3 });
    expect(mostLikelyVerdict(revoteResult, 'p3', true).text).toBe('Tu respuesta no pasó a la segunda vuelta');
    expect(mostLikelyVerdict({ ...revoteResult, answers: [] }, 'p3', true).text).toBe('No enviaste respuesta');
  });
});

describe('Most Likely To: resultados y ajustes', () => {
  it('clasificación del catálogo con métricas en texto, récords, la regla de los 3 puntos y la acción del host', () => {
    const html = renderToStaticMarkup(createElement(MostLikelyToResults, { room: room(publicGame('GAME_RESULTS'), SPECTATOR), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(html).toContain('Las respuestas favoritas');
    expect(html).toContain('1 victoria · 1 en solitario · 0 compartidas · 2 votos recibidos · 1/1 respuestas');
    expect(html).toContain('Más votos recibidos');
    expect(html).toContain('Cada victoria vale 3 puntos.');
    // Leo y Eru comparten el 2.º puesto a cero: un empate sin puntos no se marca.
    expect(html).not.toContain('Empate');
    expect(html).toContain('Continuar sesión');
    expect(html).not.toMatch(/🥇|🥈|🥉/);
    expect(html).not.toMatch(LEGACY);
  });

  it('ajustes con controles del catálogo (sin botones heredados)', () => {
    const html = renderToStaticMarkup(createElement(MostLikelyToConfigPanel, { config: defaultMostLikelyToConfig, disabled: false, room: room(publicGame(), null), selfId: 'p2', onChange: async () => undefined }));
    expect(html).toContain('Número de rondas');
    expect(html).toContain('Tiempo para responder');
    expect(html).toContain('Tiempo para votar');
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('Situaciones incluidas y listas para jugar.');
    expect(html).toContain('role="switch"');
    expect(html).toContain('Las preguntas personales pertenecen al host.');
    expect(html.slice(html.indexOf('Número de rondas'))).not.toMatch(LEGACY);
  });
});

import { defaultPokemonRedFlagConfig, type PokemonRedFlagPlayerState, type PokemonRedFlagPublicState, type PokemonRedFlagRoundResult, type RoomView } from '@pokemon-universe/shared/public';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PokemonRedFlagConfigPanel } from './ConfigPanel';
import { redFlagAnnouncement, redFlagHeading, redFlagVerdict, sendRedFlagDraft } from './presentation';
import { PokemonRedFlagGame } from './PokemonRedFlagGame';
import { PokemonRedFlagResults } from './PokemonRedFlagResults';
import { expectSingleLiveRegion } from '../../room/test-support/live-regions';
import { member, roomView } from '../../room/test-support/room-view';
import { LEGACY } from '../../styles/legacy-classes';

// «Saltar minijuego» lee la sala: sin votación de salto no pinta nada.
vi.mock('../../room/RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));

const NAMES = ['Eru', 'Ana', 'Leo'];
const LONG = 'Guarda en su Poké Ball una colección de 300 calcetines desparejados y supercalifragilisticoespialidosamente sucios';

const answers = [
  { id: 'rf-1-x', authorId: 'p1', text: 'Dice que su ex era un Ditto.', votesReceived: 1, won: false },
  { id: 'rf-1-y', authorId: 'p2', text: 'Comparte ubicación con Hypno.', votesReceived: 2, won: true },
  { id: 'rf-1-z', authorId: 'p3', text: LONG.slice(0, 100), votesReceived: 0, won: false },
];
/** Resultado con segunda vuelta: empate Eru–Ana en la primera (Leo no vota) y Ana gana 2–1 en la segunda. */
const revoteResult: PokemonRedFlagRoundResult = {
  flagMode: 'RED', pokemon: { id: 'gengar', name: 'Gengar', sprite: '/gengar.png' }, answers,
  voteRounds: [
    { number: 1, candidateIds: ['rf-1-x', 'rf-1-y', 'rf-1-z'], votes: { p1: 'rf-1-y', p2: 'rf-1-x' } },
    { number: 2, candidateIds: ['rf-1-x', 'rf-1-y'], votes: { p1: 'rf-1-y', p3: 'rf-1-y', p2: 'rf-1-x' } },
  ],
  winningAnswerIds: ['rf-1-y'], winnerIds: ['p2'], pointsAwarded: { p1: 0, p2: 3, p3: 0 }, missingPlayerIds: [],
};

type Phase = 'ROUND_ACTIVE' | 'VOTING' | 'REVOTE' | 'ROUND_RESULTS' | 'GAME_RESULTS';
function publicGame(phase: Phase = 'ROUND_ACTIVE', lastRound: PokemonRedFlagRoundResult | null = null): PokemonRedFlagPublicState {
  const voting = phase === 'VOTING' || phase === 'REVOTE';
  return {
    gameId: 'pokemon-red-flag', phase, roundNumber: 1, totalRounds: 5, pokemon: { id: 'gengar', name: 'Gengar', sprite: '/gengar.png' }, flagMode: 'RED', playerIds: ['p1', 'p2', 'p3'],
    submittedPlayerIds: ['p1'], revealedAnswers: voting ? answers.map(({ id, text }) => ({ id, text })) : [], votedPlayerIds: voting ? ['p2'] : [],
    voteCandidateIds: phase === 'REVOTE' ? ['rf-1-x', 'rf-1-y'] : voting ? answers.map((answer) => answer.id) : [], voteRoundNumber: phase === 'REVOTE' ? 2 : 1,
    scores: { p1: 0, p2: 3, p3: 0 }, roundEndsAt: phase === 'ROUND_ACTIVE' || voting ? 31_000 : null, nextTransitionAt: phase === 'ROUND_RESULTS' ? 9_000 : null, lastRound,
    results: phase === 'GAME_RESULTS' ? { winnerId: 'p2', standings: [
      { playerId: 'p2', position: 1, points: 3, won: true, stats: { roundsPlayed: 1, answersSubmitted: 1, roundsMissed: 0, votesCast: 1, votesReceived: 2, roundWins: 1, soloWins: 1, sharedWins: 0, pointsFromRounds: 3 } },
      { playerId: 'p1', position: 2, points: 0, won: false, stats: { roundsPlayed: 1, answersSubmitted: 1, roundsMissed: 0, votesCast: 1, votesReceived: 1, roundWins: 0, soloWins: 0, sharedWins: 0, pointsFromRounds: 0 } },
      { playerId: 'p3', position: 2, points: 0, won: false, stats: { roundsPlayed: 1, answersSubmitted: 1, roundsMissed: 0, votesCast: 1, votesReceived: 0, roundWins: 0, soloWins: 0, sharedWins: 0, pointsFromRounds: 0 } },
    ] } : null,
  };
}

function room(game: PokemonRedFlagPublicState, player: PokemonRedFlagPlayerState | null, disconnected: string[] = []): RoomView {
  const members = NAMES.map((displayName, index) => {
    const id = `p${index + 1}`;
    const off = disconnected.includes(id);
    return member({ id, displayName, connected: !off, presence: off ? 'TEMPORARILY_DISCONNECTED' : 'CONNECTED', roomRole: index === 0 ? 'HOST' : 'MEMBER', isHost: index === 0, sessionPoints: game.scores[id] ?? 0 });
  });
  return roomView({ phase: game.phase, availableGames: [{ id: 'pokemon-red-flag', name: 'La Frase Pokémon', icon: '💬', description: 'Frases', minPlayers: 3, profileStats: { metrics: [] } }], selectedGameId: 'pokemon-red-flag', selectedGameConfig: defaultPokemonRedFlagConfig, game, gamePlayerState: player, members });
}

const WRITING: PokemonRedFlagPlayerState = { role: 'PLAYER', canSubmit: true, ownDraft: '', ownAnswer: null, canVote: false, ownVoteAnswerId: null, ownAnswerId: 'rf-1-x' };
const LOCKED: PokemonRedFlagPlayerState = { role: 'PLAYER', canSubmit: false, ownDraft: answers[0]!.text, ownAnswer: { id: 'rf-1-x', text: answers[0]!.text }, canVote: false, ownVoteAnswerId: null, ownAnswerId: 'rf-1-x' };
const VOTER: PokemonRedFlagPlayerState = { ...LOCKED, canVote: true };
const SPECTATOR: PokemonRedFlagPlayerState = { role: 'SPECTATOR', canSubmit: false, ownDraft: '', ownAnswer: null, canVote: false, ownVoteAnswerId: null, ownAnswerId: null };
const render = (game: PokemonRedFlagPublicState, player: PokemonRedFlagPlayerState | null, selfId = 'p1', disconnected: string[] = []) =>
  renderToStaticMarkup(createElement(PokemonRedFlagGame, { room: room(game, player, disconnected), selfId, onAction: async () => undefined }));
/** Texto de lo que se pinta (sin etiquetas), con los `alt`, `title` y `aria-label`. */
const visible = (html: string) => `${html.replace(/<[^>]+>/g, ' ')} ${[...html.matchAll(/(?:alt|title|aria-label)="([^"]*)"/g)].map((match) => match[1]).join(' ')}`;
/** El subárbol de la papeleta (la lista de opciones): ahí no puede haber nada del autor. */
const ballotHtml = (html: string) => html.slice(html.indexOf('data-testid="ballot-options"'), html.indexOf('</ul>', html.indexOf('data-testid="ballot-options"')));

describe('Pokémon Red Flag: pantalla', () => {
  it('escribir: el Pokémon en su carta, la consigna, el campo con contador y «Bloquear respuesta»; solo quién ha escrito', () => {
    const html = render(publicGame(), WRITING);
    expect(html).toContain('Gengar');
    expect(html).toContain('¿Qué detalle negativo de Gengar haría que salieras corriendo?');
    expect(html).toContain('Lo peor de esta ronda');
    expect(html).toContain('Escribe su peor frase');
    expect(html).toContain('Tu frase para Gengar');
    expect(html).toContain('maxLength="100"');
    expect(html).toContain('0 / 100');
    expect(html).toContain('Bloquear respuesta');
    expect(html).toContain('Se enviará automáticamente al terminar el tiempo si contiene texto.');
    expect(html).toContain('Ningún texto ni autor se revela antes de la votación.');
    expect(html).toContain('Para escribir');
    expect(html).toMatch(/aria-current="step" data-phase="write"/);
    expectSingleLiveRegion(html);
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('placeholder=');
    expect(html).not.toMatch(LEGACY);
  });

  it('green flag: el modo en el chip y la consigna; el borrador privado vuelve al recargar', () => {
    const game = publicGame();
    game.flagMode = 'GREEN';
    const html = render(game, { ...WRITING, ownDraft: 'Siempre escucha.' });
    expect(html).toContain('Lo mejor');
    expect(html).toContain('Escribe su mejor frase');
    expect(html).toContain('¿Qué detalle positivo de Gengar te conquistaría?');
    expect(html).toContain('Siempre escucha.');
    expect(html).toContain('16 / 100');
  });

  it('respuesta bloqueada: la propia entera y solo para quien la escribió', () => {
    const html = render(publicGame(), LOCKED);
    expect(html).toContain('Respuesta bloqueada');
    expect(html).toContain('Dice que su ex era un Ditto.');
    expect(html).toContain('Solo tú puedes verla hasta la votación.');
    expect(html).not.toContain('Bloquear respuesta');
  });

  it('privacidad: antes de revelar no hay textos ajenos al escribir ni autores, votos o recuentos al votar, aunque llegue un `lastRound` sobrante', () => {
    for (const player of [WRITING, LOCKED, SPECTATOR]) {
      const text = visible(render(publicGame('ROUND_ACTIVE', revoteResult), player));
      for (const other of [answers[1]!.text, answers[2]!.text]) expect(text, 'escribir: sin respuestas ajenas').not.toContain(other);
      expect(text).not.toMatch(/\d+ votos?\b|Votos de|Ganadora|Primera vuelta|Autores revelados/);
    }
    for (const phase of ['VOTING', 'REVOTE'] as const) {
      const html = render(publicGame(phase, revoteResult), { ...VOTER, ownVoteAnswerId: phase === 'VOTING' ? null : 'rf-1-y', canVote: phase === 'VOTING' });
      const ballot = ballotHtml(html);
      expect(ballot.length, `${phase}: hay papeleta`).toBeGreaterThan(100);
      // Ni nombres, ni «de X», ni avatares, ni ids de jugador en la papeleta: el voto es anónimo.
      for (const name of NAMES) expect(visible(ballot), `${phase}: sin ${name} en la papeleta`).not.toContain(name);
      expect(ballot).not.toMatch(/\bp[123]\b|<img|authorId|Respuesta de|\bde (Eru|Ana|Leo)\b/);
      const text = visible(html);
      expect(text, `${phase}: sin recuentos ni quién votó a quién`).not.toMatch(/\d+ votos?\b|Votos de|Ganadora|Primera vuelta|Autores revelados|Gana |\+3/);
      expect(html).not.toMatch(/tally-row|tally-votes|tally-summary/);
    }
  });

  it('votar: «Respuesta N» con el texto entero (la propia no se vota), confirmación y progreso', () => {
    const html = render(publicGame('VOTING'), VOTER, 'p1', ['p3']);
    expect(html).toContain('Vota la frase que mejor lo representa');
    expect(html).toContain('>Votación<');
    expect(html).toContain('aria-label="Respuesta 2: Comparte ubicación con Hypno."');
    expect(html).toContain(LONG.slice(0, 100));
    expect(html).toContain('Tu respuesta');
    expect((html.match(/aria-pressed=/g) ?? []).length).toBe(2);
    expect(html).toContain('Confirmar voto');
    expect(html).toContain('Listo');
    expect(html).toContain('Votando…');
    expect(html).toContain('Sin conexión');
    expect(html).toContain('Los votos permanecen secretos hasta el resultado.');
    expect(html).toContain('Para votar');
    expect(html).not.toMatch(LEGACY);
  });

  it('segunda vuelta: solo las empatadas, sin renumerar, y el voto bloqueado', () => {
    const open = render(publicGame('REVOTE'), { ...VOTER, ownAnswerId: 'rf-1-z' }, 'p3');
    expect(open).toContain('Segunda vuelta');
    expect(open).toContain('Para revotar');
    expect(open).toContain('Respuesta 1');
    expect(open).toContain('Respuesta 2');
    expect(open).not.toContain('Respuesta 3');
    expect((open.match(/aria-pressed=/g) ?? []).length).toBe(2);
    const locked = render(publicGame('REVOTE'), { ...VOTER, canVote: false, ownVoteAnswerId: 'rf-1-y' });
    expect(locked).toContain('Voto bloqueado');
    expect(locked).toContain('Tu voto');
    expect(locked).not.toContain('Confirmar voto');
  });

  it('observar: la papeleta sin botones', () => {
    const html = render(publicGame('VOTING'), SPECTATOR, 's1');
    expect(html).toContain('Estás observando');
    expect(html).not.toContain('aria-pressed');
  });

  it('revelar: autores, las dos vueltas, quién votó a quién, la ganadora y los puntos; «Sin respuesta» para quien no escribió', () => {
    const missing: PokemonRedFlagRoundResult = { ...revoteResult, answers: answers.slice(0, 2), missingPlayerIds: ['p3'] };
    const html = render(publicGame('ROUND_RESULTS', missing), { ...LOCKED, ownVoteAnswerId: 'rf-1-y' });
    expect(html).toContain('La frase de la ronda');
    expect(html).toContain('Autores revelados');
    expect(html).toContain('Gana Ana con 2 votos tras la segunda vuelta.');
    expect(html).toContain('Primera vuelta');
    expect(html).toContain('Votos de Eru y Leo');
    expect(html).toContain('Frase ganadora');
    expect(html).toContain('Comparte ubicación con Hypno.');
    expect(html).toContain('Sin respuesta');
    expect(html).toContain('+3');
    expect(html).toContain('Tu respuesta: 1 voto');
    expect(html).toContain('Siguiente ronda en');
    expect(html).toMatch(/aria-current="step" data-phase="result"/);
    expectSingleLiveRegion(html);
    expect(html).not.toMatch(LEGACY);
  });

  it('revelar sin votos: nadie ve «Ganadora» con 0 votos', () => {
    const noVotes: PokemonRedFlagRoundResult = {
      ...revoteResult, voteRounds: [{ number: 1, candidateIds: ['rf-1-x', 'rf-1-y'], votes: {} }],
      answers: answers.slice(0, 2).map((answer) => ({ ...answer, votesReceived: 0, won: true })), winningAnswerIds: ['rf-1-x', 'rf-1-y'], winnerIds: ['p1', 'p2'], pointsAwarded: { p1: 3, p2: 3, p3: 0 },
    };
    const html = render(publicGame('ROUND_RESULTS', noVotes), SPECTATOR, 's1');
    expect(html).toContain('Victoria compartida');
    expect(html).toContain('Empate sin votos');
    expect(html).not.toContain('Frase ganadora');
  });
});

describe('Pokémon Red Flag: borrador', () => {
  it('el borrador se envía sin aviso global (`report: false`); «Bloquear respuesta» sí informa', async () => {
    const onAction = vi.fn(async () => undefined);
    await sendRedFlagDraft(onAction, 'Ronca');
    expect(onAction).toHaveBeenCalledWith({ type: 'UPDATE_RED_FLAG_DRAFT', text: 'Ronca' }, { report: false });
  });
});

describe('Pokémon Red Flag: textos', () => {
  it('títulos, región viva (sin autores antes de revelar) y veredicto', () => {
    expect(redFlagHeading('ROUND_RESULTS', 'RED', { ...revoteResult, winningAnswerIds: [] })).toBe('Sin frase ganadora');
    expect(redFlagHeading('ROUND_RESULTS', 'RED', { ...revoteResult, flagMode: 'GREEN' })).toBe('La frase de la ronda');
    expect(redFlagHeading('ROUND_ACTIVE', 'GREEN', null)).toBe('Escribe su mejor frase');
    const nameOf = (id: string) => ({ 'rf-1-x': 'Eru', 'rf-1-y': 'Ana' })[id] ?? id;
    const base = { roundNumber: 2, answerLocked: false, voteLocked: false, tiedCount: 2, result: null, nameOf };
    expect(redFlagAnnouncement({ ...base, phase: 'REVOTE' })).toBe('Empate: segunda vuelta entre 2 respuestas.');
    expect(redFlagAnnouncement({ ...base, phase: 'VOTING', voteLocked: true })).toContain('Voto bloqueado');
    expect(redFlagAnnouncement({ ...base, phase: 'ROUND_ACTIVE', answerLocked: true })).toContain('Respuesta bloqueada');
    expect(redFlagAnnouncement({ ...base, phase: 'ROUND_RESULTS', result: revoteResult })).toBe('Ronda 2 terminada. Gana Ana con 2 votos tras la segunda vuelta.');
    expect(redFlagVerdict(revoteResult, 'p2', true)).toEqual({ tone: 'ok', text: '¡Tu frase ganó!', points: 3 });
    expect(redFlagVerdict(revoteResult, 'p3', true).text).toBe('Tu respuesta no pasó a la segunda vuelta');
    expect(redFlagVerdict({ ...revoteResult, answers: [] }, 'p3', true).text).toBe('No enviaste respuesta');
  });
});

describe('Pokémon Red Flag: resultados y ajustes', () => {
  it('clasificación del catálogo con métricas en texto, récords, la regla de los 3 puntos y la acción del host', () => {
    const html = renderToStaticMarkup(createElement(PokemonRedFlagResults, { room: room(publicGame('GAME_RESULTS'), SPECTATOR), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(html).toContain('Las frases más votadas');
    expect(html).toContain('1 victoria · 1 en solitario · 0 compartidas · 2 votos recibidos · 1/1 respuestas');
    expect(html).toContain('Más votos recibidos');
    expect(html).toContain('Cada victoria vale 3 puntos, también cuando el empate persiste tras la segunda vuelta.');
    expect(html).not.toContain('Empate');
    expect(html).toContain('Continuar sesión');
    expect(html).not.toMatch(/🥇|🥈|🥉/);
    expect(html).not.toMatch(LEGACY);
  });

  it('ajustes con controles del catálogo (sin botones heredados)', () => {
    const html = renderToStaticMarkup(createElement(PokemonRedFlagConfigPanel, { config: defaultPokemonRedFlagConfig, disabled: false, onChange: async () => undefined }));
    expect(html).toContain('Tono de las frases');
    expect(html).toContain('La frase muestra su lado malo.');
    expect(html).toContain('Número de rondas');
    expect(html).toContain('Tiempo por fase');
    expect(html).toContain('Se aplica por separado a escribir, votar y, si hace falta, revotar.');
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('role="switch"');
    expect(html.slice(html.indexOf('Tono de las frases'))).not.toMatch(LEGACY);
  });
});

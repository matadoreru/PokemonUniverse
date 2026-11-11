import type { PokemonImpostorPlayerState, PokemonImpostorPublicState, RoomView } from '@pokemon-universe/shared/public';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { impostorAnnouncement, impostorClueLine, impostorFocusKey, impostorPhaseTitle, impostorRoundLabel, impostorClueGroupLabel, impostorTallies } from './presentation';
import { PokemonImpostorGame } from './PokemonImpostorGame';
import { impostorResultLine, impostorTeam, PokemonImpostorResults } from './PokemonImpostorResults';
import { expectSingleLiveRegion } from '../../room/test-support/live-regions';
import { member, roomView } from '../../room/test-support/room-view';

// «Saltar minijuego» va dentro de la pantalla (`GameSkipSlot` lee la sala): sin votación de salto no pinta nada.
vi.mock('../../room/RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));
vi.mock('../../hooks/usePokemonPool', () => ({ usePokemonPool: () => ({ pokemon: [], loading: false, error: '', retry: () => undefined }) }));
const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock('../../hooks/usePrefersReducedMotion', () => ({ usePrefersReducedMotion: () => motion.reduced }));

const SECRET = 'Snorlax';

const members: RoomView['members'] = ['Eru', 'Ana', 'Leo', 'Marta'].map((displayName, index) => member({ id: `p${index + 1}`, displayName, roomRole: index === 0 ? 'HOST' : 'MEMBER', isHost: index === 0 }));
const ids = members.map((member) => member.id);

function publicGame(overrides: Partial<PokemonImpostorPublicState> = {}): PokemonImpostorPublicState {
  return {
    gameId: 'pokemon-impostor',
    phase: 'CLUE_PHASE',
    mode: 'CLASSIC',
    playerIds: ids,
    aliveIds: ids,
    eliminatedIds: [],
    spectatorIds: [],
    roundNumber: 1,
    clues: { 1: { p2: { text: 'dormilón', submittedAt: 2_000, status: 'SUBMITTED' } } },
    clueOrder: ['p2', 'p1', 'p3', 'p4'],
    currentClueTurnIndex: 1,
    currentCluePlayerId: 'p1',
    cluePendingIds: ['p1', 'p3', 'p4'],
    voteCompletedIds: [],
    voteCandidateIds: [],
    votingRound: 1,
    roundStartedAt: 1_000,
    roundEndsAt: 16_000,
    nextTransitionAt: null,
    lastVoteResult: null,
    eliminationReveal: null,
    winnerTeam: null,
    finishReason: null,
    results: null,
    ...overrides,
  };
}

function innocent(overrides: Partial<PokemonImpostorPlayerState> = {}): PokemonImpostorPlayerState {
  return {
    role: 'INNOCENT',
    secretPokemon: { name: SECRET, sprite: '/sprites/snorlax.png' },
    revealedRoles: null,
    alive: true,
    canSubmitClue: false,
    ownClue: null,
    canGuessPokemon: false,
    guessUsed: false,
    guessCorrect: null,
    canVote: false,
    ownVote: null,
    ...overrides,
  };
}

function impostor(overrides: Partial<PokemonImpostorPlayerState> = {}): PokemonImpostorPlayerState {
  return innocent({ role: 'IMPOSTOR', secretPokemon: null, canGuessPokemon: true, ...overrides });
}

function room(game: PokemonImpostorPublicState, playerState: PokemonImpostorPlayerState): RoomView {
  return roomView({
    phase: game.phase,
    members,
    selectedGameId: 'pokemon-impostor',
    selectedGameConfig: { generations: [1], impostorCount: 1, clueSeconds: 15, voteSeconds: 20 },
    game,
    gamePlayerState: playerState,
  });
}

function render(game: PokemonImpostorPublicState, playerState: PokemonImpostorPlayerState, selfId = 'p1') {
  return renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(PokemonImpostorGame, { room: room(game, playerState), selfId, onAction: async () => undefined })));
}

function results(game: PokemonImpostorPublicState, playerState: PokemonImpostorPlayerState, selfId = 'p1') {
  return renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(PokemonImpostorResults, { room: room(game, playerState), selfId, onLobby: () => undefined, onEnd: () => undefined })));
}

function elimination(role: 'IMPOSTOR' | 'INNOCENT', overrides: Partial<PokemonImpostorPublicState> = {}) {
  return publicGame({
    phase: 'ELIMINATION',
    aliveIds: ['p1', 'p3', 'p4'],
    eliminatedIds: ['p2'],
    roundEndsAt: null,
    nextTransitionAt: 9_000,
    lastVoteResult: { kind: 'ELIMINATION', votes: {}, tallies: { p2: 3 }, skipVotes: 0, tiedIds: [], eliminatedId: 'p2' },
    eliminationReveal: { playerId: 'p2', role },
    ...overrides,
  });
}

beforeEach(() => {
  motion.reduced = false;
});

describe('Pokémon Impostor: privacidad', () => {
  it('antes de la pausa de 1 s la expulsión no deja nada del rol en el DOM (texto, tono ni clase)', () => {
    const asImpostor = render(elimination('IMPOSTOR'), innocent(), 'p3');
    const asInnocent = render(elimination('INNOCENT'), innocent(), 'p3');
    expect(asImpostor).toBe(asInnocent);
    expect(asImpostor).toContain('Ana');
    expect(asImpostor).not.toMatch(/era (impostor|inocente|IMPOSTOR|INOCENTE)/);
  });

  it('el final de la partida en la expulsión tampoco se adelanta', () => {
    const html = render(elimination('IMPOSTOR', { winnerTeam: 'INNOCENTS' }), innocent(), 'p3');
    expect(html).not.toContain('Partida terminada');
    expect(html).not.toContain('ganan los inocentes');
  });

  it('con reducción de movimiento el rol se monta al momento', () => {
    motion.reduced = true;
    const html = render(elimination('IMPOSTOR'), innocent(), 'p3');
    expect(html).toContain('era IMPOSTOR');
    expect(html).toContain('…era impostor');
  });

  it('el impostor nunca ve el Pokémon secreto; el inocente sí', () => {
    for (const phase of ['ROLE_REVEAL', 'CLUE_PHASE', 'VOTING', 'VOTE_RESULTS'] as const) {
      const game = publicGame({ phase, voteCandidateIds: phase === 'VOTING' ? ids : [], lastVoteResult: phase === 'VOTE_RESULTS' ? { kind: 'SKIPPED', votes: {}, tallies: {}, skipVotes: 4, tiedIds: [], eliminatedId: null } : null });
      expect(render(game, impostor()), phase).not.toContain(SECRET);
      expect(render(game, innocent()), phase).toContain(SECRET);
    }
    expect(render(publicGame({ phase: 'ROLE_REVEAL' }), impostor())).toContain('No conoces el Pokémon');
  });

  it('durante la partida no enseña los roles ajenos aunque el expulsado ya los reciba', () => {
    const html = render(elimination('IMPOSTOR'), innocent({ alive: false, revealedRoles: { p1: 'INNOCENT', p2: 'IMPOSTOR', p3: 'INNOCENT', p4: 'INNOCENT' } }), 'p3');
    expect(html).not.toMatch(/IMPOSTOR/);
  });
});

describe('Pokémon Impostor: aliados', () => {
  it('en el reparto el impostor ve a su aliado; inocente e impostor sin la clave, no', () => {
    const reveal = publicGame({ phase: 'ROLE_REVEAL', roundEndsAt: null, nextTransitionAt: 6_000 });
    const html = render(reveal, impostor({ fellowImpostorIds: ['p2'] }));
    expect(html).toContain('data-testid="impostor-fellows"');
    expect(html).toContain('Otro impostor: <strong>Ana</strong>');
    expect(render(reveal, innocent())).not.toContain('impostor-fellows');
    expect(render(reveal, impostor())).not.toContain('impostor-fellows');
  });

  it('en las pistas lo muestran el panel lateral y la línea del móvil; el expulsado lleva (fuera)', () => {
    const html = render(publicGame(), impostor({ fellowImpostorIds: ['p2'] }));
    expect(html).toContain('data-testid="impostor-fellows"');
    expect(html).toContain('con Ana');
    expect(html).not.toContain('no conoces el Pokémon');
    const fuera = render(publicGame({ aliveIds: ['p1', 'p3', 'p4'], eliminatedIds: ['p2'] }), impostor({ fellowImpostorIds: ['p2'] }));
    expect(fuera).toContain('(fuera)');
  });

  it('la región viva del reparto nombra al aliado', () => {
    const game = publicGame({ phase: 'ROLE_REVEAL' });
    const names = (id: string) => ({ p2: 'Ana' } as Record<string, string>)[id] ?? id;
    expect(impostorAnnouncement(game, impostor({ fellowImpostorIds: ['p2'] }), 'p1', names)).toBe('Reparto de roles: eres impostor, con Ana.');
    expect(impostorAnnouncement(game, impostor(), 'p1', names)).toBe('Reparto de roles: eres impostor.');
  });
});

describe('Pokémon Impostor: pantalla', () => {
  it('reparto de roles: el rol grande y el aviso de privacidad', () => {
    const html = render(publicGame({ phase: 'ROLE_REVEAL', roundEndsAt: null, nextTransitionAt: 6_000 }), impostor());
    expect(html).toContain('Descubre tu rol');
    expect(html).toContain('IMPOSTOR');
    expect(html).toContain('Esta información es privada. La fase de pistas comenzará automáticamente.');
    expect(html).toContain('role="timer"');
  });

  it('pistas: orden con las pistas por ronda y el campo con el contador cuando es tu turno', () => {
    const html = render(publicGame(), innocent({ canSubmitClue: true }));
    expect(html).toContain('Turno de Eru');
    expect(html).toContain('«dormilón»');
    expect(html).toContain('placeholder="Escribe algo relacionado…"');
    expect(html).toContain('0/25 caracteres');
    expect(html).toContain('Enviar pista');
    expect(html).toContain('Tu turno');
    expect(html).not.toContain('Ronda 1</h');
  });

  it('Una palabra: la placa cuenta rondas y vueltas, no vueltas como rondas', () => {
    const base = { mode: 'ONE_WORD' as const };
    expect(impostorRoundLabel({ ...base, phase: 'CLUE_PHASE', roundNumber: 1 })).toBe('Ronda 1 · Vuelta 1');
    expect(impostorRoundLabel({ ...base, phase: 'CLUE_PHASE', roundNumber: 2 })).toBe('Ronda 1 · Vuelta 2');
    expect(impostorRoundLabel({ ...base, phase: 'VOTING', roundNumber: 2 })).toBe('Ronda 1');
    expect(impostorRoundLabel({ ...base, phase: 'CLUE_PHASE', roundNumber: 3 })).toBe('Ronda 2 · Vuelta 1');
    expect(impostorRoundLabel({ ...base, phase: 'VOTE_RESULTS', roundNumber: 4 })).toBe('Ronda 2');
    expect(impostorRoundLabel({ mode: 'CLASSIC', phase: 'CLUE_PHASE', roundNumber: 3 })).toBe('Ronda 3');
    expect(impostorClueGroupLabel('ONE_WORD', 3)).toBe('R2·V1');
    expect(impostorClueGroupLabel('CLASSIC', 3)).toBe('R3');
    const html = render(publicGame({ mode: 'ONE_WORD', clueLap: 2, roundNumber: 4, clues: { 3: {}, 4: {} } }), innocent({ canSubmitClue: true }));
    expect(html).toContain('Ronda 2 · Vuelta 2');
    expect(html).toContain('R2·V1');
  });

  it('Una palabra: indica «Una sola palabra» bajo el campo y Clásico no', () => {
    const oneWord = render(publicGame({ mode: 'ONE_WORD', clueLap: 1 }), innocent({ canSubmitClue: true }));
    expect(oneWord).toContain('Una sola palabra');
    expect(oneWord).toContain('0/25 caracteres');
    expect(render(publicGame(), innocent({ canSubmitClue: true }))).not.toContain('Una sola palabra');
  });

  it('el impostor puede abrir su único intento de adivinar', () => {
    expect(render(publicGame({ currentCluePlayerId: 'p3', currentClueTurnIndex: 2 }), impostor())).toContain('Adivinar Pokémon');
    expect(render(publicGame({ currentCluePlayerId: 'p3', currentClueTurnIndex: 2 }), impostor({ canGuessPokemon: false, guessUsed: true, guessCorrect: false }))).toContain('Ya utilizaste tu intento.');
  });

  it('votación: una carta por candidato con su nombre exacto y «Saltar»; la propia no se puede votar', () => {
    const html = render(publicGame({ phase: 'VOTING', voteCandidateIds: ids, roundEndsAt: 30_000 }), innocent({ canVote: true }));
    for (const member of members) expect(html).toContain(`aria-label="${member.displayName}"`);
    expect(html).toContain('aria-label="Saltar"');
    expect(html).toMatch(/<button[^>]*aria-label="Eru"[^>]*disabled=""/);
    expect(html).toContain('Eres tú');
    expect(html).toContain('Confirmar voto');
    expect(html).toContain('Tres rondas seguidas sin expulsión dan la victoria a los impostores.');
  });

  it('con el voto dado, cartas fijas (sin apagar) y el voto bloqueado', () => {
    const html = render(publicGame({ phase: 'VOTING', voteCandidateIds: ids, voteCompletedIds: ['p1'] }), innocent({ ownVote: { targetId: 'p2', votedAt: 3_000 } }));
    expect(html).not.toMatch(/<button[^>]*aria-label="Ana"/);
    expect(html).toContain('Tu voto está bloqueado.');
    expect(html).toContain('1 / 4 votos');
  });

  it('resultado de la votación: titular, recuento y quién votó a quién', () => {
    const html = render(publicGame({ phase: 'VOTE_RESULTS', roundEndsAt: null, nextTransitionAt: 9_000, lastVoteResult: { kind: 'SKIPPED', votes: { p1: { targetId: 'SKIP', votedAt: 1 } }, tallies: {}, skipVotes: 1, tiedIds: [], eliminatedId: null } }), innocent());
    expect(html).toContain('Se salta la votación: nadie es expulsado');
    expect(html).toContain('Saltar · 1 voto');
    expect(html).toContain('Sin voto');
  });

  it('una sola región viva, siempre montada', () => {
    for (const game of [publicGame(), publicGame({ phase: 'ROLE_REVEAL' }), elimination('IMPOSTOR')]) {
      expectSingleLiveRegion(render(game, innocent()), game.phase);
    }
  });

  it('la expulsión la dice la región de la pantalla (el cut-in solo se ve), con el rol solo tras la pausa', () => {
    const live = (html: string) => /role="status" aria-live="polite">([^<]*)</.exec(html)?.[1] ?? '';
    expect(live(render(elimination('IMPOSTOR'), innocent(), 'p3'))).toBe('Expulsión: Ana.');
    motion.reduced = true;
    expect(live(render(elimination('IMPOSTOR'), innocent(), 'p3'))).toBe('Expulsión: Ana era impostor.');
    expect(live(render(elimination('INNOCENT'), innocent(), 'p3'))).toBe('Expulsión: Ana era inocente.');
  });
});

describe('Pokémon Impostor: textos', () => {
  const nameOf = (id: string) => members.find((member) => member.id === id)?.displayName ?? id;

  it('títulos de fase', () => {
    expect(impostorPhaseTitle({ phase: 'VOTING', currentCluePlayerId: null, votingRound: 2 }, nameOf)).toBe('Votación de desempate');
    expect(impostorPhaseTitle({ phase: 'ELIMINATION', currentCluePlayerId: null, votingRound: 1 }, nameOf)).toBe('Jugador eliminado');
    expect(impostorPhaseTitle({ phase: 'CLUE_PHASE', currentCluePlayerId: null, votingRound: 1 }, nameOf)).toBe('Nadie conectado para dar pistas');
  });

  it('el aviso no repite los titulares visibles ni dice el rol del expulsado', () => {
    const skipped = impostorAnnouncement({ phase: 'VOTE_RESULTS', currentCluePlayerId: null, lastVoteResult: { kind: 'SKIPPED', votes: {}, tallies: {}, skipVotes: 3, tiedIds: [], eliminatedId: null } }, innocent(), 'p1', nameOf);
    expect(skipped).not.toContain('Se salta la votación');
    const out = impostorAnnouncement({ phase: 'VOTE_RESULTS', currentCluePlayerId: null, lastVoteResult: { kind: 'ELIMINATION', votes: {}, tallies: { p2: 3 }, skipVotes: 0, tiedIds: [], eliminatedId: 'p2' } }, innocent(), 'p1', nameOf);
    expect(out).toContain('Ana');
    expect(out).not.toContain('recibió más votos');
    expect(impostorAnnouncement({ phase: 'ELIMINATION', currentCluePlayerId: null, lastVoteResult: null }, innocent(), 'p1', nameOf)).toBe('');
    expect(impostorAnnouncement({ phase: 'CLUE_PHASE', currentCluePlayerId: 'p1', lastVoteResult: null }, innocent({ canSubmitClue: true }), 'p1', nameOf)).toBe('Es tu turno: escribe tu pista.');
  });

  it('claves de foco: turno, pista enviada, intento gastado y voto', () => {
    const clue = { phase: 'CLUE_PHASE' as const, roundNumber: 2, votingRound: 1 };
    expect(impostorFocusKey(clue, innocent({ canSubmitClue: true }))).toBe('turn:2');
    expect(impostorFocusKey(clue, innocent())).toBeNull();
    expect(impostorFocusKey(clue, innocent({ ownClue: { text: 'x', submittedAt: 1, status: 'SUBMITTED' } }))).toBe('clue:2:SUBMITTED:false');
    expect(impostorFocusKey(clue, impostor({ guessUsed: true }))).toBe('clue:2:-:true');
    expect(impostorFocusKey({ phase: 'VOTING', roundNumber: 2, votingRound: 2 }, innocent({ ownVote: { targetId: 'p2', votedAt: 1 } }))).toBe('vote:2:2');
    expect(impostorFocusKey({ phase: 'VOTING', roundNumber: 2, votingRound: 2 }, innocent())).toBeNull();
  });

  it('línea de pista por ronda y recuento ordenado', () => {
    const game = publicGame({ clues: { 1: { p2: { text: 'zz', submittedAt: 1, status: 'SUBMITTED' }, p3: { text: null, submittedAt: null, status: 'TIMEOUT' } } } });
    expect(impostorClueLine(game, 'p2', 1)).toEqual({ text: '«zz»', tone: 'clue' });
    expect(impostorClueLine(game, 'p3', 1)).toEqual({ text: 'Sin pista · tiempo agotado', tone: 'missing' });
    expect(impostorClueLine(game, 'p1', 1).tone).toBe('turn');
    expect(impostorClueLine(game, 'p4', 1).tone).toBe('waiting');
    expect(impostorTallies({ kind: 'TIE', votes: {}, tallies: { p2: 1, p3: 2, p4: 0 }, skipVotes: 1, tiedIds: [], eliminatedId: null }, nameOf).map((tally) => tally.label)).toEqual(['Leo', 'Ana', 'Saltar']);
  });
});

describe('Pokémon Impostor: resultados', () => {
  const standings = ids.map((playerId) => ({ playerId, position: playerId === 'p2' ? 1 : 2, points: playerId === 'p2' ? 1 : 0, won: playerId === 'p2', stats: { cluesSubmitted: 2, survived: playerId === 'p3' ? 0 : 1, pokemonGuessed: 0 } }));
  const finished = publicGame({ phase: 'GAME_RESULTS', winnerTeam: 'IMPOSTORS', finishReason: 'STALEMATE', results: { winnerId: 'p2', standings } });
  const roles = { p1: 'INNOCENT', p2: 'IMPOSTOR', p3: 'INNOCENT', p4: 'INNOCENT' } as const;

  it('equipo ganador, equipos con sus roles, el Pokémon y cómo acabó', () => {
    const html = results(finished, innocent({ revealedRoles: roles }));
    expect(html).toContain('Ganan los impostores');
    expect(html).toContain('Impostores');
    expect(html).toContain('Inocentes');
    expect(html).toContain('Ganan</span>');
    expect(html).toContain(SECRET);
    expect(html).toContain('Tres rondas seguidas sin expulsar a nadie.');
    expect(html).toContain('Continuar sesión');
    expect(results(finished, innocent({ revealedRoles: roles }), 'p2')).toContain('Esperando al host…');
  });

  it('agrupa por rol y resume a cada jugador', () => {
    expect(impostorTeam(ids, roles, 'IMPOSTOR')).toEqual(['p2']);
    expect(impostorTeam(ids, null, 'IMPOSTOR')).toEqual([]);
    expect(impostorResultLine({ cluesSubmitted: 1, survived: 0 })).toBe('1 pista · expulsado');
    expect(impostorResultLine({ cluesSubmitted: 3, survived: 1 })).toBe('3 pistas · llegó al final');
  });
});

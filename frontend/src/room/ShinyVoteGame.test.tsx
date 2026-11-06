import type { RoomView, ShinyVotePlayerState, ShinyVotePublicState } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { shinyCardState } from '../games/shiny-vote/ShinyOptionCard';
import { shinyRanking } from '../games/shiny-vote/ShinyGameSidebar';
import { shinyStatusAnnouncement } from '../games/shiny-vote/ShinyVoteStatus';
import { shouldMoveFocusOnTransition } from './focus-transition';
import { ShinyVoteGame } from './ShinyVoteGame';
import { ShinyVoteResults, shinyStatsLine } from './ShinyVoteResults';

// «Saltar minijuego» va dentro de la pantalla (`GameSkipSlot` lee la sala): sin votación de salto no pinta nada.
vi.mock('./RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));

const members: RoomView['members'] = ['Eru', 'Ana', 'Leo', 'Marta', 'Iris'].map((displayName, index): RoomView['members'][number] => ({
  id: `p${index + 1}`,
  displayName,
  avatar: { type: 'DEFAULT' },
  connected: true,
  presence: 'CONNECTED',
  roomRole: index === 0 ? 'HOST' : 'MEMBER',
  role: 'PLAYER',
  isHost: index === 0,
  ready: false,
  sessionPoints: 0,
}));

const options: ShinyVotePublicState['options'] = ['A', 'B', 'C', 'D'].map((id) => ({
  id: id as 'A' | 'B' | 'C' | 'D',
  pokemonId: 'simisear',
  pokemonName: 'Simisear',
  sprite: `/api/rooms/ABC234/games/token/rounds/1/options/${id}/sprite`,
}));

function publicGame(overrides: Partial<ShinyVotePublicState> = {}): ShinyVotePublicState {
  return {
    gameId: 'shiny-vote',
    phase: 'ROUND_ACTIVE',
    mode: 'CLASSIC',
    roundNumber: 1,
    totalRounds: 10,
    playerIds: members.map((member) => member.id),
    options,
    votes: {},
    votedPlayerIds: [],
    voteVisibility: 'LIVE',
    pendingPlayerIds: members.map((member) => member.id),
    scores: Object.fromEntries(members.map((member) => [member.id, 0])),
    roundStartedAt: 1_000,
    roundEndsAt: 21_000,
    nextTransitionAt: null,
    correctOptionId: null,
    lastRound: null,
    winnerId: null,
    results: null,
    ...overrides,
  };
}

function player(overrides: Partial<ShinyVotePlayerState> = {}): ShinyVotePlayerState {
  return { canVote: true, vote: null, roundResult: null, ...overrides };
}

function room(game: ShinyVotePublicState, playerState: ShinyVotePlayerState | null): RoomView {
  const candidateMode = new Set(game.options.map((option) => option.pokemonId)).size <= 1 ? 'SAME_POKEMON' : 'DIFFERENT_POKEMON';
  return {
    code: 'ABC234',
    phase: game.phase,
    hostId: 'p1',
    maxPlayers: 8,
    members,
    availableGames: [],
    selectedGameId: 'shiny-vote',
    selectedGameConfig: { generations: [1], rounds: 10, roundSeconds: 20, optionCount: game.options.length, candidateMode, voteVisibility: game.voteVisibility, revealSeconds: 4 },
    sessionMode: { type: 'INFINITE' },
    gameSelectionMode: { type: 'ORDER', gameIds: ['shiny-vote'] },
    nextGameVote: null,
    gamesPlayed: 0,
    sessionStandings: [],
    sessionHistory: [],
    daily: null, serverNow: 1_000,
    game,
    gamePlayerState: playerState,
  };
}

function render(game: ShinyVotePublicState, playerState: ShinyVotePlayerState | null = player()) {
  return renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(ShinyVoteGame, { room: room(game, playerState), selfId: 'p1', onAction: async () => undefined })));
}

const revealVotes: ShinyVotePublicState['votes'] = {
  p1: { optionId: 'B', votedAt: 2_000 },
  p2: { optionId: 'A', votedAt: 2_100 },
};

function revealGame(voteVisibility: ShinyVotePublicState['voteVisibility'] = 'LIVE', votes = revealVotes): ShinyVotePublicState {
  const correctPlayerIds = Object.keys(votes).filter((id) => votes[id]?.optionId === 'B');
  return publicGame({
    phase: 'ROUND_RESULTS',
    voteVisibility,
    votes,
    votedPlayerIds: Object.keys(votes),
    pendingPlayerIds: ['p3', 'p4', 'p5'],
    scores: { p1: 4, p2: 0, p3: 0, p4: 0, p5: 0 },
    roundEndsAt: null,
    nextTransitionAt: 4_000,
    correctOptionId: 'B',
    lastRound: { roundNumber: 1, correctOptionId: 'B', votes, correctPlayerIds, missedPlayerIds: members.map((member) => member.id).filter((id) => !correctPlayerIds.includes(id)) },
  });
}

describe('Shiny Quiz UI', () => {
  it('pinta la placa de la ronda y las opciones como cartas del catálogo, accesibles y con atajos', () => {
    const html = render(publicGame());
    expect(html).toContain('Ronda 1 de 10');
    expect(html).toContain('¿Cuál es el shiny verdadero?');
    expect(html).toContain('role="group" aria-label="Opciones de Pokémon"');
    expect(html).toContain('data-count="4"');
    expect(html).toContain('aria-label="Opción A: Simisear"');
    expect(html).toContain('aria-keyshortcuts="A 1"');
    expect(html).toContain('role="timer"');
    expect(html).toContain('Atajos: A–F o 1–6 · Enter confirma');
    expect(html).not.toContain('shiny verdadero,');
    expect(html).not.toContain('Antes / después');
  });

  it('enseña esqueletos que no se pueden votar hasta que cargan los sprites', () => {
    const html = render(publicGame());
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Cargando cartas…');
    expect(html.match(/data-testid="shiny-card-skeleton"/g)).toHaveLength(4);
    // La imagen sigue montada (para que cargue) bajo el esqueleto.
    expect(html).toContain('/api/rooms/ABC234/games/token/rounds/1/options/A/sprite');
    expect(html.match(/<button[^>]*data-shiny-option="[A-D]"[^>]*disabled=""/g)).toHaveLength(4);
  });

  it('nunca pide el sprite normal antes de revelar', () => {
    expect(render(publicGame())).not.toContain('/api/pokemon/');
  });

  it('con los votos al revelar no deja ver a quién ni qué se votó antes de tiempo', () => {
    // Aunque la proyección trajera votos ajenos, ni las cartas ni el marcador los pintan hasta revelar.
    const votes = { p1: { optionId: 'A' as const, votedAt: 2_000 }, p2: { optionId: 'C' as const, votedAt: 2_100 } };
    const hidden = render(publicGame({ voteVisibility: 'REVEAL', votes, votedPlayerIds: ['p1', 'p2'], pendingPlayerIds: ['p3', 'p4', 'p5'] }), player({ canVote: false, vote: votes.p1 }));
    expect(hidden).not.toContain('data-testid="shiny-voters-');
    expect(hidden).not.toMatch(/>\d votos?</);
    expect(hidden).toContain('Votos al revelar');
    expect(hidden).toContain('Elección privada');
    // El marcador solo dice quién ha votado: ni una letra de opción en las franjas.
    expect(hidden.match(/>Votó</g)).toHaveLength(2);
    expect(hidden).not.toContain(': acertó');
    expect(hidden).not.toContain(': falló');
    // Al revelar, los votantes de cada carta y la opción de cada uno en el marcador.
    const revealed = render(revealGame('REVEAL'), player({ canVote: false, vote: revealVotes.p1!, roundResult: { correct: true, points: 4 } }));
    expect(revealed).toContain('data-testid="shiny-voters-A"');
    expect(revealed).toContain('data-testid="shiny-voters-B"');
    expect(revealed).toContain(': acertó');
    expect(revealed).toContain(': falló');
    expect(revealed).not.toContain('Elección privada');
  });

  it('en directo resume los votantes de cada carta con avatares acotados y su insignia', () => {
    const allVotes = Object.fromEntries(members.map((member, index) => [member.id, { optionId: 'A' as const, votedAt: 2_000 + index }]));
    const visible = render(publicGame({ votes: allVotes, votedPlayerIds: members.map((member) => member.id), pendingPlayerIds: [] }), player({ canVote: false, vote: allVotes.p1! }));
    expect(visible).toContain('data-testid="shiny-voters-A"');
    expect(visible).toContain('5 votos');
    expect(visible).toContain('+2');
    expect(visible).toContain('Votos en directo');
    expect(visible).toContain('Todos han votado');
  });

  it('restaura y bloquea un voto confirmado: cartas fijas, sin botones ni confirmar', () => {
    const vote = { optionId: 'B' as const, votedAt: 2_000 };
    const html = render(publicGame({ votes: { p1: vote }, votedPlayerIds: ['p1'], pendingPlayerIds: ['p2', 'p3', 'p4', 'p5'] }), player({ canVote: false, vote }));
    expect(html).toContain('Voto confirmado:');
    // El voto propio se marca con el tic de la esquina del sprite, no con un chip que encogería la carta.
    expect(html).toMatch(/data-shiny-option="B"[^>]*data-own="true"[\s\S]*?data-mark="selected"/);
    expect(html).not.toContain('Tu voto</span>');
    expect(html).toContain('Opción B: Simisear, voto confirmado');
    expect(html).not.toContain('Confirmar voto');
    expect(html).not.toMatch(/<button[^>]*data-shiny-option/);
  });

  it('espectador: sin controles de voto, sin atajos y con su estado', () => {
    const spectatorGame = publicGame({ playerIds: ['p1', 'p2', 'p3', 'p4', 'p5'] });
    const spectatorRoom = { ...room(spectatorGame, null), members: [...members, { ...members[0]!, id: 'watcher', displayName: 'Nora', role: 'SPECTATOR' as const }] };
    const html = renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(ShinyVoteGame, { room: spectatorRoom, selfId: 'watcher', onAction: async () => undefined })));
    expect(html).toContain('Estás viendo la votación como espectador');
    expect(html).not.toContain('Confirmar voto');
    expect(html).not.toContain('Atajos:');
    expect(html).not.toContain('aria-keyshortcuts');
    expect(html).not.toMatch(/<button[^>]*data-shiny-option/);
  });

  it('revela un acierto sin modal: la correcta gira, «+N», antes y después y el veredicto', () => {
    const html = render(revealGame(), player({ canVote: false, vote: { optionId: 'B', votedAt: 2_000 }, roundResult: { correct: true, points: 4 } }));
    expect(html).toContain('Opción B: Simisear, shiny verdadero, tu voto acertado, +4 puntos');
    expect(html).toMatch(/<div data-shiny-option="B" data-correct="true"[^>]* class="[^"]*_flip_/);
    expect(html).toContain('Correcta');
    expect(html).toMatch(/aria-hidden="true">\+4<\/span>/);
    expect(html).not.toContain('aria-busy');
    expect(html.match(/data-testid="shiny-before-after"/g)).toHaveLength(1);
    expect(html).toContain('/api/pokemon/simisear/sprite');
    expect(html).toContain('>Normal</figcaption>');
    expect(html).toContain('>Shiny</figcaption>');
    expect(html).toContain('¡Correcto!');
    expect(html).toContain('Respuesta correcta:');
    expect(html).toContain('Siguiente ronda');
    expect(html).not.toContain('role="dialog"');
  });

  it('enseña un fallo y el tiempo agotado sin esconder el Pokémon; «+0» en la pantalla inferior', () => {
    const wrong = render(revealGame(), player({ canVote: false, vote: { optionId: 'C', votedAt: 2_000 }, roundResult: { correct: false, points: 0 } }));
    expect(wrong).toContain('No era ese shiny');
    expect(wrong).toContain('Opción C: Simisear, tu voto, incorrecta, +0 puntos');
    expect(wrong).toContain('Incorrecta');
    // Sin «+N» flotante ni su sonido en un fallo: el «+0» va en el veredicto.
    expect(wrong).not.toMatch(/aria-hidden="true">\+0<\/span>/);
    expect(wrong).toMatch(/\+0<small> puntos<\/small>/);
    // Solo se apagan los sprites de las incorrectas que no votaste.
    expect(wrong.match(/data-dimmed="true"/g)).toHaveLength(2);
    expect(wrong).toContain('Tu elección:');
    const timeout = render(revealGame('LIVE', { p2: revealVotes.p2! }), player({ canVote: false, vote: null, roundResult: { correct: false, points: 0 } }));
    expect(timeout).toContain('Tiempo agotado');
  });

  it('mantiene los nombres largos dentro de una rejilla de seis opciones', () => {
    const differentOptions: ShinyVotePublicState['options'] = ['A', 'B', 'C', 'D', 'E', 'F'].map((id, index) => ({
      id: id as 'A' | 'B' | 'C' | 'D' | 'E' | 'F',
      pokemonId: `pokemon-${index}`,
      pokemonName: index === 0 ? 'Oricorio Estilo Apasionado' : `Pokémon ${index + 1}`,
      sprite: `/pokemon-${index}.png`,
    }));
    const html = render(publicGame({ options: differentOptions }));
    expect(html).toContain('Pokémon diferentes');
    expect(html).toContain('data-count="6"');
    expect(html).toContain('title="Oricorio Estilo Apasionado"');
    expect(html).toContain('aria-keyshortcuts="F 6"');
  });

  it('deja una superficie de carga estable mientras se prepara la ronda', () => {
    const html = render(publicGame({ phase: 'GAME_STARTING', options: [], roundEndsAt: null }), player({ canVote: false }));
    expect(html).toContain('aria-label="Cargando opciones"');
    expect(html).toContain('Preparando la ronda');
  });

  it('anuncia el estado en una única región status siempre montada y deja el título enfocable por programa', () => {
    const states = [
      render(publicGame()),
      render(publicGame({ votes: { p1: { optionId: 'B', votedAt: 2_000 } }, votedPlayerIds: ['p1'] }), player({ canVote: false, vote: { optionId: 'B', votedAt: 2_000 } })),
      render(revealGame(), player({ canVote: false, vote: { optionId: 'B', votedAt: 2_000 }, roundResult: { correct: true, points: 4 } })),
    ];
    for (const html of states) {
      expect(html.match(/role="status"/g)).toHaveLength(1);
      expect(html).toMatch(/<p class="sr-only" role="status" aria-live="polite">/);
      expect(html).toMatch(/<h2 tabindex="-1" class="[^"]*actionTitle/);
    }
    expect(states[1]).toContain('Voto registrado: opción B. Esperando al resto de entrenadores.');
    expect(states[2]).toContain('Revelación: la respuesta correcta es la B. Has acertado: +4 puntos.');
  });

  it('solo mueve el foco en un cambio real de estado y si el foco se ha perdido', () => {
    const body = {} as Element;
    const button = {} as Element;
    // Al montarse (recarga con voto o en plena revelación) la clave anterior es la misma: no se mueve.
    expect(shouldMoveFocusOnTransition('vote-B', 'vote-B', body, body)).toBe(false);
    expect(shouldMoveFocusOnTransition('reveal-B', 'reveal-B', null, body)).toBe(false);
    // Al votar o al revelar, con el foco perdido: sí.
    expect(shouldMoveFocusOnTransition(null, 'vote-B', body, body)).toBe(true);
    expect(shouldMoveFocusOnTransition('vote-B', 'reveal-B', null, body)).toBe(true);
    // Con el foco en otro control, no se roba; y sin estado con foco, tampoco.
    expect(shouldMoveFocusOnTransition(null, 'vote-B', button, body)).toBe(false);
    expect(shouldMoveFocusOnTransition('vote-B', null, body, body)).toBe(false);
  });

  it('redacta el aviso de cada estado', () => {
    const base = { active: true, loading: false, reveal: false, participant: true, ownVote: null, correctOptionId: null, points: 0 };
    expect(shinyStatusAnnouncement({ ...base, loading: true })).toBe('Cargando cartas…');
    expect(shinyStatusAnnouncement(base)).toBe('Cartas listas: elige una opción.');
    expect(shinyStatusAnnouncement({ ...base, participant: false })).toBe('');
    expect(shinyStatusAnnouncement({ ...base, active: false })).toBe('Preparando la ronda.');
    expect(shinyStatusAnnouncement({ ...base, active: false, reveal: true, correctOptionId: 'C', ownVote: { optionId: 'A', votedAt: 1 } })).toBe('Revelación: la respuesta correcta es la C. Has fallado: +0 puntos.');
    expect(shinyStatusAnnouncement({ ...base, active: false, reveal: true, correctOptionId: 'C' })).toBe('Revelación: la respuesta correcta es la C. Tiempo agotado: +0 puntos.');
    expect(shinyStatusAnnouncement({ ...base, active: false, reveal: true, correctOptionId: 'C', participant: false })).toBe('Revelación: la respuesta correcta es la C.');
  });

  it('elige el estado de la carta del catálogo', () => {
    expect(shinyCardState({ reveal: false, selected: false, correct: false })).toBe('idle');
    expect(shinyCardState({ reveal: false, selected: true, correct: false })).toBe('selected');
    expect(shinyCardState({ reveal: true, selected: true, correct: false })).toBe('wrong');
    expect(shinyCardState({ reveal: true, selected: false, correct: true })).toBe('correct');
    expect(shinyCardState({ reveal: true, selected: false, correct: false })).toBe('idle');
  });

  it('ordena el marcador por puntos y comparte la posición en los empates', () => {
    const byId = new Map(members.map((member) => [member.id, member]));
    expect(shinyRanking({ playerIds: ['p1', 'p2', 'p3'], scores: { p1: 2, p2: 5, p3: 2 } }, byId)).toEqual([
      { id: 'p2', position: 1 },
      { id: 'p1', position: 2 },
      { id: 'p3', position: 2 },
    ]);
  });

  it('conserva la clasificación final propia y los controles del host', () => {
    const finished = publicGame({
      phase: 'GAME_RESULTS',
      roundEndsAt: null,
      winnerId: 'p1',
      results: { winnerId: 'p1', standings: [
        { playerId: 'p1', position: 1, points: 12, won: true, stats: { votes: 3, correctVotes: 3, accuracy: 100 } },
        { playerId: 'p2', position: 2, points: 4, won: false, stats: { votes: 3, correctVotes: 1, accuracy: 33 } },
      ] },
    });
    const html = renderToStaticMarkup(createElement(ShinyVoteResults, { room: room(finished, null), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(html).toContain('Clasificación shiny');
    expect(html).toContain('3 aciertos · 100% de precisión');
    expect(html).toContain('1 acierto · 33% de precisión');
    expect(html).toContain('Ganador');
    expect(html).toContain('Continuar sesión');
    // Récords junto a la clasificación (pantalla ancha, llena en escritorio grande).
    expect(html).toContain('Récords de la partida');
    expect(html).toMatch(/Más aciertos.*shinies encontrados.*>3<\/strong>/);
    expect(html).toMatch(/Mejor precisión.*de aciertos.*>100%<\/strong>/);
    expect(html).toMatch(/class="[^"]*fillLarge/);
    const guest = renderToStaticMarkup(createElement(ShinyVoteResults, { room: room(finished, null), selfId: 'p2', onLobby: () => undefined, onEnd: () => undefined }));
    expect(guest).toContain('Esperando al host…');
    expect(guest).not.toContain('Continuar sesión');
    expect(shinyStatsLine({})).toBe('0 aciertos · 0% de precisión');
  });
});

describe('Shiny Quiz · Supervivencia', () => {
  const three = options.slice(0, 3);
  // p1 y p2 siguen en pie; p3, p4 y p5 cayeron en rondas anteriores.
  function survivalGame(overrides: Partial<ShinyVotePublicState> = {}): ShinyVotePublicState {
    return publicGame({
      mode: 'SURVIVAL',
      roundNumber: 2,
      options: three,
      alive: ['p1', 'p2'],
      pendingPlayerIds: ['p1', 'p2'],
      scores: { p1: 1, p2: 1, p3: 0, p4: 0, p5: 0 },
      roundsSurvived: { p1: 1, p2: 1, p3: 0, p4: 0, p5: 0 },
      ...overrides,
    });
  }

  it('enseña cuántos siguen en pie, el número de candidatos y «Eliminado» para quien cayó', () => {
    const html = render(survivalGame({ votes: { p2: { optionId: 'A', votedAt: 2_000 } }, votedPlayerIds: ['p2'], pendingPlayerIds: ['p1'] }));
    expect(html).toContain('3 candidatos');
    expect(html).toContain('2 en pie');
    expect(html).toContain('1 / 2 votos');
    expect(html.match(/Eliminado/g)).toHaveLength(3);
    expect(html).toMatch(/1<small> rondas<\/small>/);
    expect(html.match(/role="status"/g)).toHaveLength(1);
    // En Clásico, nada de esto.
    const classic = render(publicGame());
    expect(classic).not.toContain('candidatos');
    expect(classic).not.toContain('en pie');
    expect(classic).not.toContain('Eliminado');
  });

  it('quien ya cayó mira la partida: sin confirmar voto y con su placa propia', () => {
    const html = render(survivalGame({ alive: ['p2'], pendingPlayerIds: ['p2'], scores: { p1: 1, p2: 1, p3: 0, p4: 0, p5: 0 }, roundsSurvived: { p1: 1, p2: 1, p3: 0, p4: 0, p5: 0 } }), player({ canVote: false }));
    expect(html).toContain('Estás fuera');
    expect(html).toContain('Superaste 1 ronda. Sigues la partida como espectador.');
    expect(html).not.toContain('Confirmar voto');
    expect(html).not.toContain('Tiempo agotado');
    expect(html).toContain('Estás eliminado: sigues la partida como espectador.');
    expect(html.match(/role="status"/g)).toHaveLength(1);
  });

  it('al revelar dice si sigues en pie o quedas eliminado', () => {
    const right = { p1: { optionId: 'B' as const, votedAt: 2_000 }, p2: { optionId: 'A' as const, votedAt: 2_100 } };
    const wrong = { p1: { optionId: 'A' as const, votedAt: 2_000 }, p2: { optionId: 'B' as const, votedAt: 2_100 } };
    const reveal = (alive: string[], scores: Record<string, number>, votes: ShinyVotePublicState['votes'] = right) => survivalGame({
      phase: 'ROUND_RESULTS', votes, votedPlayerIds: ['p1', 'p2'], pendingPlayerIds: [], roundEndsAt: null, nextTransitionAt: 4_000,
      correctOptionId: 'B', alive, scores, roundsSurvived: scores,
      lastRound: { roundNumber: 2, correctOptionId: 'B', votes, correctPlayerIds: alive, missedPlayerIds: ['p1', 'p2'].filter((id) => !alive.includes(id)) },
    });
    const ok = render(reveal(['p1'], { p1: 2, p2: 1, p3: 0, p4: 0, p5: 0 }), player({ canVote: false, vote: right.p1, roundResult: { correct: true, points: 1 } }));
    expect(ok).toContain('Sigues en pie · 2 rondas superadas');
    expect(ok).toContain('Has acertado: sigues en pie.');
    expect(ok).toContain('Siguiente ronda');
    const out = render(reveal(['p2'], { p1: 1, p2: 2, p3: 0, p4: 0, p5: 0 }, wrong), player({ canVote: false, vote: wrong.p1, roundResult: { correct: false, points: 0 } }));
    expect(out).toContain('Quedas eliminado con 1 ronda superada.');
    expect(out).toContain('Has fallado: quedas eliminado.');
    // Nadie en pie: la siguiente parada son los resultados.
    const none = render(reveal([], { p1: 1, p2: 1, p3: 0, p4: 0, p5: 0 }, wrong), player({ canVote: false, vote: wrong.p1, roundResult: { correct: false, points: 0 } }));
    expect(none).toContain('Resultados finales');
  });

  it('los resultados ordenan por rondas superadas y dicen quién sigue en pie', () => {
    const finished = survivalGame({
      phase: 'GAME_RESULTS', roundNumber: 5, roundEndsAt: null, winnerId: 'p1', alive: [],
      results: { winnerId: 'p1', standings: [
        { playerId: 'p1', position: 1, points: 4, won: true, stats: { votes: 4, correctVotes: 4, accuracy: 100 } },
        { playerId: 'p2', position: 2, points: 1, won: false, stats: { votes: 2, correctVotes: 1, accuracy: 50 } },
      ] },
    });
    const html = renderToStaticMarkup(createElement(ShinyVoteResults, { room: room(finished, null), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(html).toContain('Shiny Quiz · Supervivencia · 5 rondas jugadas');
    expect(html).toContain('4 rondas');
    expect(html).toContain('Cayó en la ronda 5');
    expect(html).toContain('Cayó en la ronda 2');
    expect(html).toContain('Más rondas superadas');
    expect(html).not.toContain('Mejor precisión');
    const standing = renderToStaticMarkup(createElement(ShinyVoteResults, { room: room({ ...finished, alive: ['p1'] }, null), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(standing).toContain('Sigue en pie');
  });
});

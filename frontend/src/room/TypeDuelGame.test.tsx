import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { TypeDuelPlayerState, TypeDuelPublicState, RoomView } from '@pokemon-universe/shared/public';
import { typeDuelAnnouncement, typeDuelCoopAnnouncement, typeDuelCoopRanking, typeDuelCoopRoundTitle, typeDuelCoopStatsLine, typeDuelFocusKey, typeDuelMemberStatus, typeDuelOwnLastAttempt, typeDuelPlateKind, typeDuelRecords, typeDuelStatsLine, typeDuelVerdict, typeGridMove } from '../games/type-duel/presentation';
import { TypeDuelGame } from './TypeDuelGame';
import { TypeDuelResults } from './TypeDuelResults';

// «Saltar minijuego» va dentro de la pantalla (`GameSkipSlot` lee la sala): sin votación de salto no pinta nada.
vi.mock('./RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));
vi.mock('../hooks/usePokemonPool', () => ({ usePokemonPool: () => ({ pokemon: [], loading: false, error: '', retry: () => undefined }) }));

const member = (id: string, displayName: string) => ({ id, displayName, avatar: { type: 'DEFAULT' as const }, connected: true, presence: 'CONNECTED' as const, roomRole: 'MEMBER' as const, role: 'PLAYER' as const, isHost: false, ready: false, sessionPoints: 0 });

type Phase = TypeDuelPublicState['phase'];
const attempt = (playerId: string, pokemonName: string, correct: boolean, attemptedAt: number) => ({ playerId, pokemonId: pokemonName.toLowerCase(), pokemonName, sprite: `/api/pokemon/${pokemonName.toLowerCase()}/sprite`, correct, attemptedAt });

function room(phase: Phase, overrides: Partial<TypeDuelPublicState> = {}, player: Partial<TypeDuelPlayerState> = {}): RoomView {
  const game: TypeDuelPublicState = { gameId: 'type-duel', phase, mode: 'CLASSIC', playerIds: ['p1', 'p2', 'p3'], completedRounds: 0, roundNumber: 1, totalRounds: 3, participants: ['p1', 'p2'], participationCounts: { p1: 1, p2: 1, p3: 0 }, typeSelectionCompletedIds: [], revealedTypes: {}, requiredTypes: null, solutionCount: null, invalidCombinations: 0, finalSelectionCycle: false, attempts: [], scores: { p1: 0, p2: 0, p3: 0 }, roundStartedAt: 1_000, roundEndsAt: 16_000, nextTransitionAt: null, lastRound: null, results: null, ...overrides };
  return { code: 'TEST11', phase, hostId: 'p1', maxPlayers: 8, members: [member('p1', 'Ana'), member('p2', 'Bruno'), member('p3', 'Carla')], availableGames: [], selectedGameId: 'type-duel', selectedGameConfig: { generations: [1], typeSelectSeconds: 15, searchSeconds: 20, rounds: 3 }, gameConfigs: {}, customizedGameIds: [], sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'ORDER', gameIds: ['type-duel'] }, nextGameVote: null, gamesPlayed: 0, sessionStandings: [], sessionHistory: [], game, gamePlayerState: { participant: true, ownType: null, canSelectType: phase === 'SELECTING_TYPES', canAttempt: phase === 'POKEMON_SEARCH', cooldownUntil: 0, ...player }, daily: null, serverNow: 1_000, hostCustomCategoryCount: 0, hostWouldYouRatherPromptCount: 0 } as RoomView;
}

const render = (view: RoomView, selfId = 'p1') => renderToStaticMarkup(<TypeDuelGame room={view} selfId={selfId} onAction={async () => undefined} />);
/** Tipos pintados (insignias y opciones), en orden. */
const typesIn = (html: string) => [...html.matchAll(/data-type="([a-z]+)"/g)].map((m) => m[1]);

describe('TypeDuelGame: privacidad de la elección', () => {
  it('a duelist who has not picked sees the 18 options, all unpressed, and no badge besides them', () => {
    const html = render(room('SELECTING_TYPES', { typeSelectionCompletedIds: ['p2'] }));
    expect(html.match(/aria-label="Elegir tipo [^"]+"/g)).toHaveLength(18);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(18);
    expect(html).not.toContain('aria-pressed="true"');
    // Solo las 18 opciones: el rival ha bloqueado, pero su tipo no está en ningún sitio.
    expect(typesIn(html)).toHaveLength(18);
    expect(html).toContain('Tipo bloqueado');
    expect(html).toContain('Elegid un tipo en secreto');
  });
  it('a locked duelist sees only their own type; the rival slot stays hidden', () => {
    const html = render(room('SELECTING_TYPES', { typeSelectionCompletedIds: ['p1', 'p2'] }, { canSelectType: false, ownType: 'water' }), 'p2');
    expect(new Set(typesIn(html))).toEqual(new Set(['water']));
    expect(html).toContain('aria-label="Tipo oculto"');
    expect(html).toContain('Elegiste');
    expect(html).toContain('El tipo rival sigue oculto.');
    expect(html).not.toContain('Elegir tipo');
  });
  it('a spectator sees no type at all while the duelists pick', () => {
    const html = render(room('SELECTING_TYPES', { typeSelectionCompletedIds: ['p1'] }, { participant: false, canSelectType: false }), 'p3');
    expect(typesIn(html)).toEqual([]);
    expect(html.match(/aria-label="Tipo oculto"/g)).toHaveLength(2);
    expect(html).toContain('Estás observando la selección.');
  });
});

describe('TypeDuelGame: pantalla', () => {
  it('reveals both types in the VS slab with the heading and the solution count', () => {
    const html = render(room('TYPE_REVEAL', { revealedTypes: { p1: 'fire', p2: 'fire' }, requiredTypes: ['fire'], solutionCount: 36, roundEndsAt: null, nextTransitionAt: 3_000 }));
    expect(html).toContain('data-testid="type-duel-versus"');
    expect(html).toMatch(/<h1[^>]*>Duelo de tipos<\/h1>/);
    expect(html).toContain('36 Pokémon tienen esta combinación');
    expect(html).toContain('Monotipo');
  });
  it('gives the duelist the search with its exact label, and the spectator a watching plate', () => {
    const search = room('POKEMON_SEARCH', { revealedTypes: { p1: 'fire', p2: 'water' }, requiredTypes: ['fire', 'water'], solutionCount: 3 });
    expect(render(search)).toContain('Buscar Pokémon con la combinación exacta');
    const spectator = render({ ...search, gamePlayerState: { participant: false, ownType: null, canSelectType: false, canAttempt: false, cooldownUntil: 0 } }, 'p3');
    expect(spectator).not.toContain('Buscar Pokémon con la combinación exacta');
    expect(spectator).toContain('Observas este duelo');
  });
  it('lists public attempts, newest first, with text for each verdict', () => {
    const html = render(room('POKEMON_SEARCH', { revealedTypes: { p1: 'fire', p2: 'water' }, requiredTypes: ['fire', 'water'], solutionCount: 3, attempts: [attempt('p2', 'Charizard', false, 2_000), attempt('p1', 'Pikachu', false, 3_000)] }));
    expect(html.indexOf('Pikachu')).toBeLessThan(html.indexOf('Charizard'));
    expect(html).toContain('No coincide con los tipos');
    // El último intento propio, junto al buscador.
    expect(html).toMatch(/Pikachu<\/span> no coincide/);
  });
  it('shows the round result once, with the winning card, +5 and the host action', () => {
    const lastRound = { reason: 'WINNER' as const, winnerId: 'p1', attempts: [attempt('p1', 'Charmander', true, 3_000)], solutions: [{ id: 'vulpix', name: 'Vulpix', sprite: '/api/pokemon/vulpix/sprite' }], requiredTypes: ['fire' as const], selectedTypes: { p1: 'fire' as const, p2: 'fire' as const }, disconnectedIds: [] };
    const html = render(room('ROUND_RESULTS', { lastRound, revealedTypes: { p1: 'fire', p2: 'fire' }, completedRounds: 1, scores: { p1: 5, p2: 0, p3: 0 }, roundEndsAt: null, nextTransitionAt: 11_000 }));
    expect(html.match(/>Ana gana</g)).toHaveLength(1);
    expect(html).toContain('data-testid="type-duel-result"');
    expect(html).toContain('data-winning-card="true"');
    expect(html).toContain('También podíais haber elegido');
    expect(html).toContain('¡Ganaste el duelo!');
    expect(html).toContain('Siguiente ronda en');
    // «Siguiente ronda»: la etiqueta del tiempo y el botón del host; el rival solo ve la etiqueta.
    expect(html.match(/>Siguiente ronda</g)).toHaveLength(2);
    expect(render(room('ROUND_RESULTS', { lastRound, completedRounds: 1, roundEndsAt: null, nextTransitionAt: 11_000 }), 'p2').match(/>Siguiente ronda</g)).toHaveLength(1);
  });
  it('has a single live region that never repeats the texts the E2E look for', () => {
    for (const view of [room('SELECTING_TYPES'), room('TYPE_REVEAL', { revealedTypes: { p1: 'fire', p2: 'fire' }, requiredTypes: ['fire'], solutionCount: 36 })]) {
      const html = render(view);
      expect(html.match(/role="status"/g)).toHaveLength(1);
      const live = /role="status" aria-live="polite">([^<]*)</.exec(html)?.[1] ?? '';
      for (const text of ['Elegid un tipo en secreto', 'Duelo de tipos', 'Monotipo', 'Tiempo agotado']) expect(live).not.toContain(text);
    }
  });
});

describe('type-duel presentation', () => {
  it('picks the plate from the projected player state', () => {
    expect(typeDuelPlateKind('SELECTING_TYPES', { participant: true, canSelectType: true, ownType: null })).toBe('pick');
    expect(typeDuelPlateKind('SELECTING_TYPES', { participant: true, canSelectType: false, ownType: 'fire' })).toBe('locked');
    expect(typeDuelPlateKind('SELECTING_TYPES', { participant: false, canSelectType: false, ownType: null })).toBe('watching');
    expect(typeDuelPlateKind('POKEMON_SEARCH', { participant: true, canSelectType: false, ownType: 'fire' })).toBe('search');
    expect(typeDuelPlateKind('ROUND_RESULTS', null)).toBe('result');
  });
  it('never exposes a type before the server reveals it', () => {
    const game = { phase: 'SELECTING_TYPES' as const, participants: ['p1', 'p2'] as [string, string], typeSelectionCompletedIds: ['p1'], revealedTypes: {}, lastRound: null };
    expect(typeDuelMemberStatus(game, 'p1')).toEqual({ kind: 'locked' });
    expect(typeDuelMemberStatus(game, 'p2')).toEqual({ kind: 'choosing' });
    expect(typeDuelMemberStatus(game, 'p3')).toEqual({ kind: 'watching' });
    expect(typeDuelMemberStatus({ ...game, phase: 'POKEMON_SEARCH', revealedTypes: { p1: 'fire' } }, 'p1')).toEqual({ kind: 'type', type: 'fire' });
  });
  it('moves through the type grid with arrows, Home and End', () => {
    expect(typeGridMove(0, 'ArrowRight', 6, 18)).toBe(1);
    expect(typeGridMove(0, 'ArrowLeft', 6, 18)).toBe(0);
    expect(typeGridMove(2, 'ArrowDown', 6, 18)).toBe(8);
    expect(typeGridMove(14, 'ArrowDown', 6, 18)).toBe(14);
    expect(typeGridMove(8, 'ArrowUp', 6, 18)).toBe(2);
    expect(typeGridMove(5, 'End', 6, 18)).toBe(17);
    expect(typeGridMove(5, 'Home', 6, 18)).toBe(0);
    expect(typeGridMove(5, 'Enter', 6, 18)).toBeNull();
  });
  it('focus keys, verdicts, last attempt and announcement', () => {
    expect(typeDuelFocusKey('locked', 2, 1)).toBe('locked-2-1');
    expect(typeDuelFocusKey('pick', 2, 0)).toBeNull();
    expect(typeDuelVerdict({ winnerId: 'p1' }, 'p1', true)).toBe('¡Ganaste el duelo!');
    expect(typeDuelVerdict({ winnerId: 'p1' }, 'p2', true)).toBe('Perdiste el duelo');
    expect(typeDuelVerdict({ winnerId: null }, 'p2', true)).toBe('Nadie puntúa');
    expect(typeDuelVerdict(null, 'p3', false)).toBe('Estás observando');
    expect(typeDuelOwnLastAttempt([attempt('p1', 'A', false, 1), attempt('p2', 'B', false, 2), attempt('p1', 'C', true, 3)], 'p1')?.pokemonName).toBe('C');
    expect(typeDuelAnnouncement({ kind: 'locked', roundNumber: 1, ownType: 'water', requiredTypes: null, solutionCount: null, lastAttempt: null, verdict: '' })).toBe('Has bloqueado Agua. Esperando al rival.');
  });
  it('stats line and records (ties together, nobody when nobody won)', () => {
    expect(typeDuelStatsLine({ duelsPlayed: 2, duelsWon: 1, winRate: 50, incorrectAttempts: 1, averageCorrectTimeMs: 4_200 })).toBe('Ganó 1 de 2 · 50% · 1 fallo · media 4.2s');
    expect(typeDuelStatsLine({ duelsPlayed: 0, duelsWon: 0, winRate: 0, incorrectAttempts: 0, averageCorrectTimeMs: 0 })).toBe('No jugó ningún duelo');
    const records = typeDuelRecords([
      { name: 'Ana', stats: { duelsWon: 2, winRate: 100, averageCorrectTimeMs: 3_000 } },
      { name: 'Bruno', stats: { duelsWon: 2, winRate: 67, averageCorrectTimeMs: 5_000 } },
      { name: 'Carla', stats: { duelsWon: 0, winRate: 0, averageCorrectTimeMs: 0 } },
    ]);
    expect(records.wins).toEqual({ value: '2', names: ['Ana', 'Bruno'] });
    expect(records.winRate).toEqual({ value: '100%', names: ['Ana'] });
    expect(records.fastest).toEqual({ value: '3.0s', names: ['Ana'] });
    expect(typeDuelRecords([{ name: 'Ana', stats: { duelsWon: 0 } }])).toEqual({ wins: null, winRate: null, fastest: null });
  });
});

describe('TypeDuelResults', () => {
  it('ranks with the catalogue standings, records and a tie chip', () => {
    const standings = [
      { playerId: 'p1', position: 1, points: 5, stats: { duelsPlayed: 1, duelsWon: 1, winRate: 100, incorrectAttempts: 0, averageCorrectTimeMs: 3_000 } },
      { playerId: 'p2', position: 2, points: 0, stats: { duelsPlayed: 1, duelsWon: 0, winRate: 0, incorrectAttempts: 1, averageCorrectTimeMs: 0 } },
      { playerId: 'p3', position: 2, points: 0, stats: { duelsPlayed: 0, duelsWon: 0, winRate: 0, incorrectAttempts: 0, averageCorrectTimeMs: 0 } },
    ];
    const view = room('GAME_RESULTS', { results: { winnerId: 'p1', standings } as never });
    const html = renderToStaticMarkup(<TypeDuelResults room={view} selfId="p1" onLobby={() => undefined} onEnd={() => undefined} />);
    expect(html).toContain('Clasificación Type Duel');
    expect(html).toContain('Récords de la partida');
    expect(html).toContain('Ganó 1 de 1 · 100% · 0 fallos · media 3.0s');
    expect(html.match(/>Empate</g)).toHaveLength(2);
    expect(html).toContain('Continuar sesión');
  });
});

describe('TypeDuelGame: Cooperativo', () => {
  const find = (pokemonId: string, playerId: string) => ({ pokemonId, playerId, pokemonName: pokemonId[0]!.toUpperCase() + pokemonId.slice(1), sprite: `/api/pokemon/${pokemonId}/sprite` });
  const coop = (phase: Phase, overrides: Partial<TypeDuelPublicState> = {}, player: Partial<TypeDuelPlayerState> = {}) => {
    const view = room(phase, { mode: 'COOP', combination: ['water', 'ground'], solutionCount: 2, found: [], contributions: { p1: 0, p2: 0, p3: 0 }, roundEndsAt: 31_000, ...overrides }, { canAttempt: phase === 'POKEMON_SEARCH', ...player });
    return { ...view, selectedGameConfig: { generations: [1, 2], typeSelectSeconds: 15, searchSeconds: 20, rounds: 3, coopSeconds: 30, mode: 'COOP' } } as RoomView;
  };

  it('shows the combination, the group counter, the own contribution and who found each one', () => {
    const html = render(coop('POKEMON_SEARCH', { found: [find('wooper', 'p2'), find('quagsire', 'p1')], contributions: { p1: 3, p2: 1, p3: 0 } }), 'p1');
    expect(html).toContain('data-testid="type-duel-coop-board"');
    expect(typesIn(html)).toEqual(['water', 'ground']);
    expect(html).toMatch(/<h1[^>]*>Tipo Agua y Tierra<\/h1>/);
    expect(html).toContain('2 de 2</strong>');
    expect(html).toContain('tuyo esta ronda · 3 en la partida');
    expect(html).toContain('Lo encontró Bruno');
    expect(html).toContain('Lo encontraste tú');
    // El último encontrado, arriba.
    expect(html.indexOf('Quagsire')).toBeLessThan(html.indexOf('Wooper'));
    expect(html).toContain('Buscar Pokémon con esos tipos');
    // Sin nada del duelo por parejas.
    expect(html).not.toContain('type-duel-versus');
    expect(html).not.toContain('Duelista');
  });
  it('lets every player search, and a spectator only watches', () => {
    expect(render(coop('POKEMON_SEARCH'), 'p3')).toContain('Buscar Pokémon con esos tipos');
    const spectator = render(coop('POKEMON_SEARCH', {}, { participant: false, canAttempt: false }), 'p9');
    expect(spectator).not.toContain('Buscar Pokémon con esos tipos');
    expect(spectator).toContain('El grupo está buscando');
  });
  it('shows the round result with the missed ones and the host action', () => {
    const lastRound = { reason: 'TIMEOUT' as const, winnerId: null, attempts: [], solutions: [{ id: 'quagsire', name: 'Quagsire', sprite: '/api/pokemon/quagsire/sprite' }], requiredTypes: ['water' as const, 'ground' as const], selectedTypes: {}, disconnectedIds: [] };
    const html = render(coop('ROUND_RESULTS', { lastRound, found: [find('wooper', 'p2')], completedRounds: 1, roundEndsAt: null, nextTransitionAt: 41_000 }));
    expect(html).toContain('data-testid="type-duel-coop-result"');
    expect(html).toContain('Encontrasteis 1 de 2');
    expect(html).toContain('Os faltaron');
    expect(html).toContain('Siguiente ronda en');
    expect(html.match(/>Siguiente ronda</g)).toHaveLength(2);
  });
  it('has exactly one live region, and it never repeats the duplicate message', () => {
    for (const view of [coop('POKEMON_SEARCH'), coop('POKEMON_SEARCH', { attempts: [attempt('p1', 'Wooper', true, 2_000)], found: [find('wooper', 'p1')] })]) {
      const html = render(view);
      expect(html.match(/role="status"/g)).toHaveLength(1);
      expect(html).not.toContain('Ya lo ha encontrado alguien.');
    }
  });
  it('presentation: titles, ranking, announcement and stats line', () => {
    expect(typeDuelCoopRoundTitle('ALL_FOUND', 2, 2)).toBe('¡Los encontrasteis todos!');
    expect(typeDuelCoopRoundTitle('TIMEOUT', 0, 5)).toBe('No encontrasteis ninguno');
    expect(typeDuelCoopRoundTitle('TIMEOUT', 3, 5)).toBe('Encontrasteis 3 de 5');
    expect(typeDuelCoopRanking(['p1', 'p2', 'p3'], { p1: 1, p2: 3, p3: 1 }, (id) => id)).toEqual([
      { id: 'p2', count: 3, position: 1 }, { id: 'p1', count: 1, position: 2 }, { id: 'p3', count: 1, position: 2 },
    ]);
    expect(typeDuelCoopAnnouncement({ phase: 'POKEMON_SEARCH', roundNumber: 2, combination: ['psychic'], found: 0, total: 12, lastAttempt: null, player: true })).toBe('Ronda 2: buscad juntos Pokémon de tipo Psíquico. Hay 12.');
    expect(typeDuelCoopAnnouncement({ phase: 'POKEMON_SEARCH', roundNumber: 2, combination: ['psychic'], found: 1, total: 12, lastAttempt: attempt('p1', 'Abra', true, 1), player: true })).toBe('Abra suma para el grupo: 1 de 12.');
    expect(typeDuelCoopStatsLine({ coopFinds: 3, coopGamesPlayed: 1, groupTotal: 7 })).toBe('Aportó 3 de 7 · 43%');
    expect(typeDuelCoopStatsLine({ coopFinds: 0, coopGamesPlayed: 1, groupTotal: 7 })).toBe('No aportó ningún Pokémon');
  });
  it('results show the group total and each contribution, with no winner', () => {
    const standings = [
      { playerId: 'p1', position: 1, points: 3, stats: { coopFinds: 3, coopGamesPlayed: 1, groupTotal: 7 } },
      { playerId: 'p3', position: 1, points: 3, stats: { coopFinds: 3, coopGamesPlayed: 1, groupTotal: 7 } },
      { playerId: 'p2', position: 3, points: 1, stats: { coopFinds: 1, coopGamesPlayed: 1, groupTotal: 7 } },
    ];
    const view = coop('GAME_RESULTS', { results: { winnerId: null, standings, ranked: false } as never, completedRounds: 3, roundEndsAt: null });
    const html = renderToStaticMarkup(<TypeDuelResults room={view} selfId="p1" onLobby={() => undefined} onEnd={() => undefined} />);
    expect(html).toContain('Resultado del grupo');
    expect(html).toContain('Type Duel · Cooperativo · 3 rondas');
    expect(html).toContain('Total del grupo');
    expect(html).toContain('>7<');
    expect(html).toContain('Pokémon distintos encontrados');
    expect(html).toContain('Aportó 3 de 7 · 43%');
    expect(html).toContain('3 Pokémon');
    expect(html).toContain('Ana, Carla');
    expect(html).not.toContain('Ganador');
    expect(html).not.toContain('duelo');
  });
});

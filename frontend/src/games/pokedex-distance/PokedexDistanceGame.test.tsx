import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { PokedexDistancePlayerState, PokedexDistancePublicState, RoomView } from '@pokemon-universe/shared/public';
import { PokedexDistanceGame } from './PokedexDistanceGame';
import { expectSingleLiveRegion } from '../../room/test-support/live-regions';
import { member, roomView } from '../../room/test-support/room-view';

// «Saltar minijuego» va dentro de la pantalla (`GameSkipSlot` lee la sala): sin votación de salto no pinta nada.
vi.mock('../../room/RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));
vi.mock('../../hooks/usePokemonPool', () => ({ usePokemonPool: () => ({ pokemon: [{ id: 'pikachu', name: 'Pikachu', sprite: '/api/pokemon/pikachu/sprite' }], loading: false, error: '', retry: () => undefined }) }));


function room(overrides: Partial<PokedexDistancePublicState> = {}, player: Partial<PokedexDistancePlayerState> = {}, config: Record<string, unknown> = {}): RoomView {
  const game: PokedexDistancePublicState = {
    gameId: 'pokedex-distance', phase: 'ROUND_ACTIVE', mode: 'CLASSIC', roundNumber: 1, tiebreakDepth: 0, targetDexNumber: 25,
    eligibleIds: ['p1', 'p2'], survivorIds: ['p1', 'p2'], spectatorIds: [], selections: {}, selectedIds: [],
    lockedPokemonIds: [], roundStartedAt: 0, roundEndsAt: 20_000, nextTransitionAt: null, lastRound: null, roundHistory: [], winnerId: null,
    results: null, ...overrides,
  };
  return roomView({ code: 'TEST11', phase: game.phase, members: [member({ id: 'p1', displayName: 'Ana' }), member({ id: 'p2', displayName: 'Bruno', connected: false, presence: 'TEMPORARILY_DISCONNECTED' })], selectedGameId: 'pokedex-distance', selectedGameConfig: { generations: [1], roundSeconds: 20, selectionVisibility: 'HIDDEN', pointsRounds: 10, mode: 'CLASSIC', ...config }, gameConfigs: {}, customizedGameIds: [], game, gamePlayerState: { canSelect: true, selection: null, exactHit: false, ...player }, hostCustomCategoryCount: 0, hostWouldYouRatherPromptCount: 0 });
}

const render = (view: RoomView, selfId = 'p1') => renderToStaticMarkup(<PokedexDistanceGame room={view} selfId={selfId} onAction={async () => undefined} />);
const liveText = (html: string) => /class="sr-only" role="status" aria-live="polite">([^<]*)</.exec(html)?.[1] ?? '';

const lastRound: NonNullable<PokedexDistancePublicState['lastRound']> = {
  targetDexNumber: 25, eligibleIds: ['p1', 'p2'], reason: 'NO_RESPONSE', eliminatedIds: ['p2'], tiedIds: [],
  targetPokemon: { id: 'pikachu', name: 'Pikachu', nationalDexNumber: 25, sprite: '/api/pokemon/pikachu/sprite' },
  selections: { p1: { pokemonId: 'raichu', pokemonName: 'Raichu', sprite: '/api/pokemon/raichu/sprite', dexNumber: 26, distance: 1, selectedAt: 1 } },
};

describe('PokedexDistanceGame: foco y avisos', () => {
  it('tiene una sola región de avisos, montada en todas las fases', () => {
    const locked = { canSelect: false, selection: { pokemonId: 'pikachu', selectedAt: 1 } };
    const views = [room(), room({ selectedIds: ['p1'] }, locked), room({ selectedIds: ['p1'] }, { ...locked, exactHit: true }), room({ phase: 'ROUND_RESULTS', lastRound, roundEndsAt: null, nextTransitionAt: 9_000 })];
    for (const view of views) expectSingleLiveRegion(render(view));
    for (const view of views.slice(0, 2)) expectSingleLiveRegion(render(view, 'p3'), 'espectador');
  });
  it('con la elección bloqueada el título es el destino del foco y el aviso no repite los textos de la pantalla', () => {
    const html = render(room({ selectedIds: ['p1'] }, { canSelect: false, selection: { pokemonId: 'pikachu', selectedAt: 1 } }));
    expect(html).toMatch(/<h2 tabindex="-1"[^>]*>¡Selección confirmada!<\/h2>/);
    expect(liveText(html)).toBe('Has elegido Pikachu: tu elección queda bloqueada hasta la revelación. 1 de 2 ya tiene su elección.');
    for (const text of ['Selección confirmada', 'Resultado de la ronda', 'Estás observando', 'Ya ha elegido']) expect(liveText(html)).not.toContain(text);
  });
  it('en la revelación anuncia el veredicto y marca a los desconectados', () => {
    const html = render(room({ phase: 'ROUND_RESULTS', lastRound, roundEndsAt: null, nextTransitionAt: 9_000 }));
    expect(html).toMatch(/<h2 tabindex="-1"[^>]*>⏱️ Tiempo agotado<\/h2>/);
    expect(liveText(html)).toContain('Te quedaste a 1.');
    expect(liveText(html)).not.toContain('Resultado de la ronda');
    // Bruno (p2) está desconectado: su fila lo dice; la de Ana no.
    expect(html.match(/Sin conexión/g)).toHaveLength(1);
  });
});

describe('PokedexDistanceGame: modo Por puntos', () => {
  const points = { mode: 'POINTS' as const, pointsRound: 2, pointsRounds: 5, scores: { p1: 70, p2: 150 } };
  it('el título lleva el modo, la placa dice la ronda «N de M» y nadie cae', () => {
    // En GAME_STARTING el servidor manda la ronda 0: la placa anuncia ya la primera, nunca «Ronda 0».
    const html = render(room({ ...points, pointsRound: 0, phase: 'GAME_STARTING', roundNumber: 0, eligibleIds: [], roundStartedAt: null, roundEndsAt: null }, { canSelect: false }, { mode: 'POINTS', pointsRounds: 5 }));
    // La placa de la ronda lleva el nombre del modo, en todas las fases.
    expect(html).toMatch(/Ronda 1 de 5<\/span>.*Por puntos/);
    expect(html).not.toContain('Ronda 0');
    expect(render(room(points))).toMatch(/Ronda 2 de 5<\/span>/);
    expect(html).toContain('nadie cae, cada ronda suma puntos');
    expect(html).not.toContain('cae quien quede más lejos');
  });
  it('muestra el marcador de puntos en lugar de quién sigue', () => {
    const html = render(room(points));
    expect(html).toContain('Marcador de la partida');
    expect(html).not.toContain('siguen');
    // Bruno va primero con 150.
    const board = html.slice(html.indexOf('Marcador de la partida'));
    expect(board.indexOf('Bruno')).toBeLessThan(board.indexOf('Ana'));
    expect(html).toContain('150<small> pts</small>');
    expectSingleLiveRegion(html);
  });
  it('en la revelación cada fila lleva sus puntos de la ronda y no hay eliminados', () => {
    const scored = { ...lastRound, reason: 'SCORED' as const, eliminatedIds: [], points: { p1: 99, p2: 0 } };
    const html = render(room({ ...points, phase: 'ROUND_RESULTS', lastRound: scored, roundEndsAt: null, nextTransitionAt: 9_000 }));
    expect(html).toContain('+99 pts');
    expect(html).toContain('+0 pts');
    expect(html).toMatch(/<h2 tabindex="-1"[^>]*>🎯 Puntos de la ronda<\/h2>/);
    expect(html).not.toContain('Eliminado');
    expect(html).not.toContain('Cae quien quedó más lejos');
    expect(liveText(html)).toContain('sumas 99');
  });
  it('en Clásico el título no lleva modo', () => {
    const html = render(room({ phase: 'GAME_STARTING', roundNumber: 0, eligibleIds: [] }, { canSelect: false }));
    expect(html).not.toContain('Por puntos');
    expect(html).toContain('Ronda 0');
  });
});

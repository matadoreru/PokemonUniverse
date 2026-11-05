import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { PokedexDistancePlayerState, PokedexDistancePublicState, RoomView } from '@pokemon-universe/shared';
import { PokedexDistanceGame } from './PokedexDistanceGame';

// «Saltar minijuego» va dentro de la pantalla (`GameSkipSlot` lee la sala): sin votación de salto no pinta nada.
vi.mock('./RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));
vi.mock('../hooks/usePokemonPool', () => ({ usePokemonPool: () => ({ pokemon: [{ id: 'pikachu', name: 'Pikachu', sprite: '/api/pokemon/pikachu/sprite' }], loading: false, error: '', retry: () => undefined }) }));

const member = (id: string, displayName: string, presence: 'CONNECTED' | 'DISCONNECTED' = 'CONNECTED') => ({ id, displayName, avatar: { type: 'DEFAULT' as const }, connected: presence === 'CONNECTED', presence, roomRole: 'MEMBER' as const, role: 'PLAYER' as const, isHost: false, ready: false, sessionPoints: 0 });

function room(overrides: Partial<PokedexDistancePublicState> = {}, player: Partial<PokedexDistancePlayerState> = {}): RoomView {
  const game: PokedexDistancePublicState = {
    gameId: 'pokedex-distance', phase: 'ROUND_ACTIVE', roundNumber: 1, tiebreakDepth: 0, targetDexNumber: 25,
    eligibleIds: ['p1', 'p2'], survivorIds: ['p1', 'p2'], spectatorIds: [], selections: {}, selectedIds: [],
    lockedPokemonIds: [], roundStartedAt: 0, roundEndsAt: 20_000, nextTransitionAt: null, lastRound: null, roundHistory: [], winnerId: null,
    results: null, ...overrides,
  };
  return { code: 'TEST11', phase: game.phase, hostId: 'p1', maxPlayers: 8, members: [member('p1', 'Ana'), member('p2', 'Bruno', 'DISCONNECTED')], availableGames: [], selectedGameId: 'pokedex-distance', selectedGameConfig: { generations: [1], roundSeconds: 20, selectionVisibility: 'HIDDEN' }, gameConfigs: {}, customizedGameIds: [], sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'ORDER', gameIds: ['pokedex-distance'] }, nextGameVote: null, gamesPlayed: 0, sessionStandings: [], sessionHistory: [], game, gamePlayerState: { canSelect: true, selection: null, exactHit: false, ...player }, serverNow: 1_000, hostCustomCategoryCount: 0, hostWouldYouRatherPromptCount: 0 } as RoomView;
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
    const views = [room(), room({ selectedIds: ['p1'] }, { canSelect: false, selection: { pokemonId: 'pikachu', selectedAt: 1 } }), room({ phase: 'ROUND_RESULTS', lastRound, roundEndsAt: null, nextTransitionAt: 9_000 })];
    for (const view of views) expect(render(view).match(/class="sr-only" role="status"/g)).toHaveLength(1);
  });
  it('con la elección bloqueada el título es el destino del foco y el aviso no repite los textos de la pantalla', () => {
    const html = render(room({ selectedIds: ['p1'] }, { canSelect: false, selection: { pokemonId: 'pikachu', selectedAt: 1 } }));
    expect(html).toMatch(/<h2 tabindex="-1"[^>]*>¡Selección confirmada!<\/h2>/);
    expect(liveText(html)).toBe('Has elegido Pikachu: tu elección queda bloqueada hasta la revelación.');
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

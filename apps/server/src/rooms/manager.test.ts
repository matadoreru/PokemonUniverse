import type { AuthUser, Pokemon, PokemonCatalog } from '@pokemon-universe/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config.js', () => ({
  env: { ROOM_MAX_PLAYERS: 8, RECONNECT_GRACE_MS: 30_000 },
}));
const persistGameResults = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('../stats/service.js', () => ({ persistGameResults }));

import { RoomManager } from './manager.js';

const pokemon: Pokemon[] = Array.from({ length: 8 }, (_, index) => ({
  id: `pokemon-${index + 1}`,
  nationalDexNumber: index + 1,
  name: `Pokémon ${index + 1}`,
  generation: 1,
  sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${index + 1}.png`,
}));
const catalog: PokemonCatalog = {
  all: () => pokemon,
  byId: (id) => pokemon.find((entry) => entry.id === id),
  byDexNumber: (number) => pokemon.find((entry) => entry.nationalDexNumber === number),
  forGenerations: (generations) => pokemon.filter((entry) => generations.includes(entry.generation)),
};

function identity(id: string, displayName: string): AuthUser {
  return { id, displayName, kind: 'GUEST' };
}

function socket(id: string) {
  return { id, join: vi.fn(() => Promise.resolve()), leave: vi.fn(() => Promise.resolve()) };
}

function io() {
  const emit = vi.fn();
  return { emit, to: vi.fn(() => ({ emit })) };
}

describe('room multi-game lifecycle', () => {
  beforeEach(() => persistGameResults.mockClear());

  it('plays Pokédex Distance and Shiny Quiz in the same room without leaking game state', () => {
    const transport = io();
    const manager = new RoomManager(transport as any, catalog);
    const host = identity('pedro', 'Pedro');
    const guest = identity('ana', 'Ana');
    const hostSocket = socket('socket-pedro');
    const guestSocket = socket('socket-ana');

    const created = (manager as any).create(hostSocket, host, 8);
    const room = manager.store.get(created.room.code)!;
    (manager as any).join(guestSocket, guest, room.code);

    expect(created.room.availableGames.map((game: { id: string }) => game.id)).toEqual(['pokedex-distance', 'shiny-vote']);
    expect(room.selectedGameId).toBe('pokedex-distance');
    expect(room.members.size).toBe(2);

    (manager as any).updateConfig(host.id, { generations: [1], roundSeconds: 25 });
    (manager as any).selectGame(host.id, 'shiny-vote');
    (manager as any).updateConfig(host.id, { generations: [1], roundSeconds: 15, rounds: 1 });
    (manager as any).selectGame(host.id, 'pokedex-distance');
    expect(room.gameConfigs.get('pokedex-distance')).toEqual({ generations: [1], roundSeconds: 25 });
    expect(room.gameConfigs.get('shiny-vote')).toEqual({ generations: [1], roundSeconds: 15, rounds: 1 });

    const originalMembers = [...room.members.values()];
    (manager as any).startGame(host.id);
    expect(room.game?.gameId).toBe('pokedex-distance');
    expect(room.game?.state.targetDexNumber).toEqual(expect.any(Number));
    expect(room.game?.state.votes).toBeUndefined();
    (manager as any).action(host.id, { type: 'SELECT_POKEMON', pokemonId: 'pokemon-1' });
    (manager as any).action(guest.id, { type: 'SELECT_POKEMON', pokemonId: 'pokemon-8' });
    expect(room.phase).toBe('GAME_RESULTS');

    (manager as any).returnLobby(host.id);
    expect(room.phase).toBe('LOBBY');
    expect(room.game).toBeNull();
    expect([...room.members.values()]).toEqual(originalMembers);
    expect([...room.members.values()].every((member) => member.connected && member.role === 'PLAYER')).toBe(true);

    (manager as any).selectGame(host.id, 'shiny-vote');
    (manager as any).startGame(host.id);
    expect(room.game?.gameId).toBe('shiny-vote');
    expect(room.game?.state.votes).toEqual({});
    expect(room.game?.state.targetDexNumber).toBeUndefined();
    (manager as any).action(host.id, { type: 'VOTE', optionId: 'A' });
    (manager as any).action(guest.id, { type: 'VOTE', optionId: 'B' });
    expect(room.phase).toBe('ROUND_RESULTS');
    room.game!.state.nextTransitionAt = 0;
    (manager as any).tick(room);
    expect(room.phase).toBe('GAME_RESULTS');

    (manager as any).returnLobby(host.id);
    (manager as any).selectGame(host.id, 'pokedex-distance');
    expect(room.phase).toBe('LOBBY');
    expect(room.selectedGameId).toBe('pokedex-distance');
    expect(room.game).toBeNull();
    expect(room.members.get(host.id)?.socketId).toBe('socket-pedro');
    expect(room.members.get(guest.id)?.socketId).toBe('socket-ana');
    expect(persistGameResults).toHaveBeenCalledTimes(2);
  });

  it('allows only the host to change games and rejects unknown ids without altering the registry', () => {
    const manager = new RoomManager(io() as any, catalog);
    const host = identity('host', 'Host');
    const guest = identity('guest', 'Guest');
    const created = (manager as any).create(socket('host-socket'), host, 8);
    const room = manager.store.get(created.room.code)!;
    (manager as any).join(socket('guest-socket'), guest, room.code);

    expect(() => (manager as any).selectGame(guest.id, 'shiny-vote')).toThrow(/Only the host/);
    expect(() => (manager as any).selectGame(host.id, 'missing-game')).toThrow(/Unknown game/);
    expect(room.selectedGameId).toBe('pokedex-distance');
    expect(created.room.availableGames).toHaveLength(2);
  });
});

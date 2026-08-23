import type { AuthUser, Pokemon, PokemonCatalog } from '@pokemon-universe/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  hp: 40 + index, attack: 50 + index, defense: 45 + index, specialAttack: 55 + index, specialDefense: 50 + index, speed: 60 + index, baseStatTotal: 300 + index * 6, types: index === 0 ? ['fire'] : index === 1 ? ['water'] : index === 2 ? ['fire', 'water'] : ['normal'],
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
  return { id, join: vi.fn(() => Promise.resolve()), leave: vi.fn(() => Promise.resolve()), emit: vi.fn() };
}

function io() {
  const emit = vi.fn();
  return { emit, to: vi.fn(() => ({ emit })) };
}

describe('room multi-game lifecycle', () => {
  beforeEach(() => persistGameResults.mockClear());
  afterEach(() => vi.useRealTimers());

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

    expect(created.room.availableGames.map((game: { id: string }) => game.id)).toEqual(['pokedex-distance', 'shiny-vote', 'pokemon-impostor', 'higher-lower', 'type-duel']);
    expect(room.selectedGameId).toBe('pokedex-distance');
    expect(room.members.size).toBe(2);

    (manager as any).updateConfig(host.id, { generations: [1], roundSeconds: 25 });
    (manager as any).selectGame(host.id, 'shiny-vote');
    (manager as any).updateConfig(host.id, { generations: [1], roundSeconds: 15, rounds: 1, candidateMode: 'SAME_POKEMON', optionCount: 4, showVotes: true });
    (manager as any).selectGame(host.id, 'pokedex-distance');
    expect(room.gameConfigs.get('pokedex-distance')).toEqual({ generations: [1], roundSeconds: 25 });
    expect(room.gameConfigs.get('shiny-vote')).toEqual({ generations: [1], roundSeconds: 15, rounds: 1, candidateMode: 'SAME_POKEMON', optionCount: 4, showVotes: true });

    const originalMembers = [...room.members.values()];
    (manager as any).startGame(host.id);
    expect(room.game?.gameId).toBe('pokedex-distance');
    expect(room.game?.state.targetDexNumber).toEqual(expect.any(Number));
    expect(room.game?.state.votes).toBeUndefined();
    (manager as any).action(host.id, { type: 'SELECT_POKEMON', pokemonId: 'pokemon-1' });
    (manager as any).action(guest.id, { type: 'SELECT_POKEMON', pokemonId: 'pokemon-8' });
    expect(room.phase).toBe('ROUND_RESULTS');
    const eliminatedId = room.game!.state.lastRound.eliminatedIds[0];
    expect(room.members.get(eliminatedId)).toMatchObject({ connected: true, presence: 'CONNECTED', role: 'SPECTATOR' });
    room.game!.state.nextTransitionAt = 0;
    (manager as any).tick(room);
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
    expect(created.room.availableGames).toHaveLength(5);
  });

  it('plays Pokémon Impostor privately and keeps the room when switching games', () => {
    const manager = new RoomManager(io() as any, catalog);
    const identities = [identity('pedro', 'Pedro'), identity('ana', 'Ana'), identity('carlos', 'Carlos')];
    const created = (manager as any).create(socket('socket-pedro'), identities[0], 8);
    const room = manager.store.get(created.room.code)!;
    (manager as any).join(socket('socket-ana'), identities[1], room.code);
    (manager as any).join(socket('socket-carlos'), identities[2], room.code);

    (manager as any).selectGame('pedro', 'pokemon-impostor');
    (manager as any).updateConfig('pedro', { generations: [1], impostorCount: 1, clueSeconds: 10, voteSeconds: 10 });
    (manager as any).startGame('pedro');
    expect(room.game?.gameId).toBe('pokemon-impostor');
    const impostorId = Object.entries(room.game!.state.roles).find(([, role]) => role === 'IMPOSTOR')![0];
    const innocentId = identities.map((entry) => entry.id).find((id) => id !== impostorId)!;
    const impostorView = (manager as any).view(room, impostorId);
    const innocentView = (manager as any).view(room, innocentId);
    expect(impostorView.gamePlayerState).toMatchObject({ role: 'IMPOSTOR', secretPokemon: null });
    expect(innocentView.gamePlayerState.secretPokemon).not.toBeNull();
    expect(JSON.stringify(impostorView)).not.toContain('Pokémon 1');

    room.game!.state.nextTransitionAt = 0;
    (manager as any).tick(room);
    while (room.phase === 'CLUE_PHASE') {
      const currentId = room.game!.state.clueOrder[room.game!.state.currentClueTurnIndex];
      (manager as any).action(currentId, { type: 'SUBMIT_CLUE', text: `Pista ${currentId}` });
    }
    for (const person of identities) {
      const targetId = person.id === impostorId ? identities.map((entry) => entry.id).find((id) => id !== impostorId)! : impostorId;
      (manager as any).action(person.id, { type: 'VOTE', targetId });
    }
    expect(room.phase).toBe('VOTE_RESULTS');
    room.game!.state.nextTransitionAt = 0; (manager as any).tick(room);
    expect(room.phase).toBe('ELIMINATION');
    room.game!.state.nextTransitionAt = 0; (manager as any).tick(room);
    expect(room.phase).toBe('GAME_RESULTS');

    (manager as any).returnLobby('pedro');
    (manager as any).selectGame('pedro', 'shiny-vote');
    (manager as any).selectGame('pedro', 'pokedex-distance');
    expect(room.phase).toBe('LOBBY');
    expect(room.selectedGameId).toBe('pokedex-distance');
    expect(room.members.size).toBe(3);
    expect([...room.members.values()].every((member) => member.connected && member.role === 'PLAYER')).toBe(true);
  });

  it('plays Higher or Lower and Type Duel consecutively without recreating the room', () => {
    const manager = new RoomManager(io() as any, catalog); const host = identity('host', 'Host'); const guest = identity('guest', 'Guest');
    const created = (manager as any).create(socket('host-socket'), host, 8); const room = manager.store.get(created.room.code)!; (manager as any).join(socket('guest-socket'), guest, room.code);
    (manager as any).selectGame(host.id, 'higher-lower');
    (manager as any).updateConfig(host.id, { generations: [1], categories: ['ATTACK'], showPreviousValue: true, answerVisibility: 'REALTIME', roundSeconds: 10, rounds: 1 });
    (manager as any).startGame(host.id); (manager as any).action(host.id, { type: 'ANSWER', choice: 'HIGHER' }); (manager as any).action(guest.id, { type: 'ANSWER', choice: 'LOWER' });
    room.game!.state.nextTransitionAt = 0; (manager as any).tick(room); expect(room.phase).toBe('GAME_RESULTS'); (manager as any).returnLobby(host.id);
    (manager as any).selectGame(host.id, 'type-duel'); (manager as any).updateConfig(host.id, { generations: [1], typeSelectSeconds: 5, searchSeconds: 10, rounds: 1 }); (manager as any).startGame(host.id);
    const [first, second] = room.game!.state.participants; (manager as any).action(first, { type: 'SELECT_TYPE', pokemonType: 'fire' }); (manager as any).action(second, { type: 'SELECT_TYPE', pokemonType: 'water' });
    room.game!.state.nextTransitionAt = 0; (manager as any).tick(room); (manager as any).action(first, { type: 'ATTEMPT_POKEMON', pokemonId: 'pokemon-3' });
    room.game!.state.nextTransitionAt = 0; (manager as any).tick(room); expect(room.phase).toBe('GAME_RESULTS'); (manager as any).returnLobby(host.id);
    (manager as any).selectGame(host.id, 'shiny-vote'); (manager as any).selectGame(host.id, 'pokemon-impostor'); (manager as any).selectGame(host.id, 'pokedex-distance');
    expect(room.phase).toBe('LOBBY'); expect(room.members.size).toBe(2); expect(room.selectedGameId).toBe('pokedex-distance');
  });

  it('uses connected required players globally without deleting accepted actions', () => {
    const manager = new RoomManager(io() as any, catalog);
    const people = [identity('host', 'Host'), identity('ana', 'Ana'), identity('carlos', 'Carlos'), identity('marta', 'Marta')];
    const sockets = people.map((person) => socket(`socket-${person.id}`));
    const created = (manager as any).create(sockets[0], people[0], 8);
    const room = manager.store.get(created.room.code)!;
    for (let index = 1; index < people.length; index += 1) (manager as any).join(sockets[index], people[index], room.code);
    (manager as any).selectGame('host', 'shiny-vote');
    (manager as any).updateConfig('host', { generations: [1], roundSeconds: 20, rounds: 1, candidateMode: 'SAME_POKEMON', optionCount: 4, showVotes: false });
    (manager as any).startGame('host');
    (manager as any).action('carlos', { type: 'VOTE', optionId: 'C' });
    (manager as any).disconnect('carlos', 'socket-carlos');
    (manager as any).disconnect('marta', 'socket-marta');
    (manager as any).action('host', { type: 'VOTE', optionId: 'A' });
    const hiddenView = (manager as any).view(room, 'ana');
    expect(hiddenView.game).toMatchObject({ votes: {}, votedPlayerIds: expect.arrayContaining(['carlos', 'host']) });
    expect(JSON.stringify(hiddenView.game)).not.toContain('"optionId":"C"');
    (manager as any).action('ana', { type: 'VOTE', optionId: 'B' });
    expect(room.phase).toBe('ROUND_RESULTS');
    expect(room.game!.state.votes.carlos.optionId).toBe('C');
    expect((manager as any).view(room, 'ana').game.votes.carlos.optionId).toBe('C');
    expect(room.members.get('carlos')).toMatchObject({ connected: false, presence: 'TEMPORARILY_DISCONNECTED', role: 'PLAYER' });
  });

  it('keeps identity during grace, restores it, and transfers host only after expiration', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const manager = new RoomManager(io() as any, catalog);
    const host = identity('host', 'Host'); const guest = identity('guest', 'Guest');
    const created = (manager as any).create(socket('host-1'), host, 8); const room = manager.store.get(created.room.code)!;
    (manager as any).join(socket('guest-1'), guest, room.code);
    (manager as any).disconnect(host.id, 'host-1');
    expect(room.hostId).toBe(host.id);
    expect(room.members.get(host.id)?.presence).toBe('TEMPORARILY_DISCONNECTED');

    const restored = socket('host-2');
    (manager as any).restore(restored, host);
    expect(room.members.get(host.id)).toMatchObject({ connected: true, presence: 'CONNECTED', socketId: 'host-2' });
    expect(restored.emit).toHaveBeenCalledWith('session:restored', expect.objectContaining({ code: room.code }));

    (manager as any).disconnect(host.id, 'host-2');
    vi.advanceTimersByTime(29_999);
    expect(room.hostId).toBe(host.id);
    vi.advanceTimersByTime(1);
    expect(room.hostId).toBe(guest.id);
    expect(room.members.has(host.id)).toBe(false);
    expect(manager.store.roomForPlayer(host.id)).toBeUndefined();
  });

  it('expires an active identity without losing historical game data or blocking the round', () => {
    vi.useFakeTimers(); vi.setSystemTime(20_000);
    const manager = new RoomManager(io() as any, catalog);
    const people = [identity('host', 'Host'), identity('ana', 'Ana'), identity('carlos', 'Carlos')];
    const sockets = people.map((person) => socket(`socket-${person.id}`));
    const created = (manager as any).create(sockets[0], people[0], 8); const room = manager.store.get(created.room.code)!;
    (manager as any).join(sockets[1], people[1], room.code); (manager as any).join(sockets[2], people[2], room.code);
    (manager as any).updateConfig('host', { generations: [1], roundSeconds: 60 });
    (manager as any).startGame('host');
    (manager as any).disconnect('carlos', 'socket-carlos');
    vi.advanceTimersByTime(30_000);
    expect(room.members.get('carlos')).toMatchObject({ presence: 'LEFT', connected: false });
    expect(manager.store.roomForPlayer('carlos')).toBeUndefined();
    (manager as any).action('host', { type: 'SELECT_POKEMON', pokemonId: 'pokemon-1' });
    (manager as any).action('ana', { type: 'SELECT_POKEMON', pokemonId: 'pokemon-2' });
    expect(room.phase).toBe('ROUND_RESULTS');
    expect(room.game!.state).toMatchObject({ lastRound: { reason: 'NO_RESPONSE', eliminatedIds: ['carlos'] } });
    expect(room.members.get('carlos')?.role).toBe('SPECTATOR');
    expect(() => (manager as any).action('carlos', { type: 'SELECT_POKEMON', pokemonId: 'pokemon-3' })).toThrow(/Not in a room|cannot act/);
  });
});

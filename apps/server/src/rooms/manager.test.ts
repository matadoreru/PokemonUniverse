import { getValidTypeChainCandidates, type AuthUser, type LearnsetPokemonCatalog, type PokedexEntryPokemonCatalog, type Pokemon } from '@pokemon-universe/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config.js', () => ({
  env: { ROOM_MAX_PLAYERS: 8, RECONNECT_GRACE_MS: 30_000 },
}));
vi.mock('../http/game-image-cache.js', () => ({ preloadGameImage: vi.fn() }));
const persistGameResults = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('../stats/service.js', () => ({ persistGameResults }));

import { RoomManager } from './manager.js';

const pokemon: Pokemon[] = Array.from({ length: 16 }, (_, index) => ({
  id: `pokemon-${index + 1}`,
  nationalDexNumber: index + 1,
  name: `Pokémon ${index + 1}`,
  generation: 1,
  sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${index + 1}.png`,
  hp: 40 + index, attack: 50 + index, defense: 45 + index, specialAttack: 55 + index, specialDefense: 50 + index, speed: 60 + index, baseStatTotal: 300 + index * 6, types: index === 0 ? ['fire'] : index === 1 ? ['water'] : index === 2 ? ['fire', 'water'] : ['normal'],
  heightDecimeters: 5 + index, weightHectograms: 50 + index, evolutionStage: 1, evolutionStageCount: 1,
  legendaryStatus: 'NORMAL', color: 'brown', abilities: ['run-away'],
}));
const catalog: LearnsetPokemonCatalog & PokedexEntryPokemonCatalog = {
  all: () => pokemon,
  byId: (id) => pokemon.find((entry) => entry.id === id),
  byDexNumber: (number) => pokemon.find((entry) => entry.nationalDexNumber === number),
  forGenerations: (generations) => pokemon.filter((entry) => generations.includes(entry.generation)),
  levelUpMoves: () => [
    { moveId: 'tackle', level: 1, move: { id: 'tackle', name: 'Tackle', type: 'normal', category: 'physical' } },
    { moveId: 'growl', level: 5, move: { id: 'growl', name: 'Growl', type: 'normal', category: 'status' } },
  ],
  evolutionInfo: () => ({ stage: 1, stages: 1 }),
  pokedexEntries: (pokemonId) => [{ pokemonId, text: `${pokemon.find((entry) => entry.id === pokemonId)?.name} habita en lugares tranquilos y acumula energía.`, language: 'es', generation: 1, version: 'yellow', versionLabel: 'Pokémon Amarillo' }],
};

function identity(id: string, displayName: string): AuthUser {
  return { id, displayName, kind: 'GUEST', avatar: { type: 'DEFAULT' } };
}

function socket(id: string) {
  return { id, join: vi.fn(() => Promise.resolve()), leave: vi.fn(() => Promise.resolve()), emit: vi.fn() };
}

function boundSocket(id: string, user: AuthUser) {
  const handlers = new Map<string, (...args: any[]) => void>();
  const result = {
    ...socket(id), data: { identity: user },
    on: vi.fn((event: string, handler: (...args: any[]) => void) => { handlers.set(event, handler); return result; }),
    handlers,
  };
  return result;
}

function io() {
  const emit = vi.fn();
  return { emit, to: vi.fn(() => ({ emit })) };
}

function startReady(manager: RoomManager, room: any, playerId: string): void {
  for (const member of room.members.values()) {
    if (member.presence === 'CONNECTED' && member.identity.id !== room.hostId) (manager as any).setReady(member.identity.id, true);
  }
  (manager as any).startGame(playerId);
}

describe('room multi-game lifecycle', () => {
  beforeEach(() => persistGameResults.mockClear());
  afterEach(() => vi.useRealTimers());

  it('ignores socket events without an acknowledgement callback', () => {
    const manager = new RoomManager(io() as any, catalog); const host = identity('host', 'Host'); const hostSocket = boundSocket('host-socket', host);
    manager.bind(hostSocket as any);

    expect(() => hostSocket.handlers.get('room:create')?.({}, undefined)).not.toThrow();
    expect(manager.store.roomForPlayer(host.id)).toBeUndefined();
  });

  it('loads each registered host preference into new rooms and saves edited games separately', () => {
    const preferences = {
      forUser: vi.fn(() => new Map<string, unknown>([
        ['pokedex-distance', { generations: [1], roundSeconds: 25 }],
        ['shiny-vote', { generations: [1], roundSeconds: 15, rounds: 2, candidateMode: 'SAME_POKEMON', optionCount: 4, showVotes: false }],
      ])),
      save: vi.fn(),
    };
    const manager = new RoomManager(io() as any, catalog, undefined, undefined, undefined, preferences);
    const host: AuthUser = { ...identity('host-user', 'Host'), kind: 'USER', email: 'host@example.com' };
    const created = (manager as any).create(socket('host-socket'), host, 8);
    const room = manager.store.get(created.room.code)!;

    expect(preferences.forUser).toHaveBeenCalledWith(host.id);
    expect(room.gameConfigs.get('pokedex-distance')).toEqual({ generations: [1], roundSeconds: 25 });
    expect(room.gameConfigs.get('shiny-vote')).toMatchObject({ rounds: 2, showVotes: false });

    (manager as any).selectGame(host.id, 'shiny-vote');
    const nextConfig = { ...(room.gameConfigs.get('shiny-vote') as Record<string, unknown>), rounds: 3 };
    (manager as any).updateConfig(host.id, nextConfig);
    expect(preferences.save).toHaveBeenCalledWith(host.id, 'shiny-vote', nextConfig);
    expect(room.gameConfigs.get('pokedex-distance')).toEqual({ generations: [1], roundSeconds: 25 });
  });

  it('does not read or write account preferences for guests', () => {
    const preferences = { forUser: vi.fn(() => new Map()), save: vi.fn() };
    const manager = new RoomManager(io() as any, catalog, undefined, undefined, undefined, preferences);
    const host = identity('guest-host', 'Guest Host');
    const created = (manager as any).create(socket('guest-socket'), host, 8);
    const room = manager.store.get(created.room.code)!;
    (manager as any).updateConfig(host.id, { generations: [1], roundSeconds: 25 });

    expect(preferences.forUser).not.toHaveBeenCalled();
    expect(preferences.save).not.toHaveBeenCalled();
    expect(room.gameConfigs.get('pokedex-distance')).toEqual({ generations: [1], roundSeconds: 25 });
  });

  it('edits and publishes a rotation game without changing the selected minigame', () => {
    const manager = new RoomManager(io() as any, catalog); const host = identity('host', 'Host');
    const created = (manager as any).create(socket('host-socket'), host, 8); const room = manager.store.get(created.room.code)!;
    const nextConfig = { ...(room.gameConfigs.get('shiny-vote') as Record<string, unknown>), rounds: 7 };

    (manager as any).updateGameConfig(host.id, 'shiny-vote', nextConfig);

    expect(room.selectedGameId).toBe('pokedex-distance');
    expect(room.gameConfigs.get('shiny-vote')).toEqual(nextConfig);
    expect((manager as any).view(room, host.id)).toMatchObject({
      selectedGameId: 'pokedex-distance',
      gameConfigs: { 'shiny-vote': nextConfig },
      customizedGameIds: expect.arrayContaining(['shiny-vote']),
    });
  });

  it('blocks a rotation when one included game has incomplete semantic configuration', () => {
    const manager = new RoomManager(io() as any, catalog); const host = identity('host', 'Host'); const guest = identity('guest', 'Ana');
    const created = (manager as any).create(socket('host-socket'), host, 8); const room = manager.store.get(created.room.code)!;
    (manager as any).join(socket('guest-socket'), guest, room.code);
    const pokeddle = room.gameConfigs.get('pokeddle-race') as Record<string, unknown>;
    const clues = Object.fromEntries(Object.keys(pokeddle.clues as Record<string, boolean>).map((key) => [key, false]));
    (manager as any).updateGameConfig(host.id, 'pokeddle-race', { ...pokeddle, clues });
    (manager as any).updateGameSelection(host.id, { type: 'RANDOM', gameIds: ['pokeddle-race', 'shiny-vote'] });
    (manager as any).setReady(guest.id, true);

    expect(() => (manager as any).startGame(host.id)).toThrow(/Pokédle Race: Selecciona al menos una pista/);
  });

  it('audits room and game starts while exposing only an admin-safe live projection', () => {
    const audit = { roomCreated: vi.fn(() => Promise.resolve()), roomClosed: vi.fn(() => Promise.resolve()), gameStarted: vi.fn(() => Promise.resolve()) };
    const manager = new RoomManager(io() as any, catalog, undefined, undefined, audit);
    const host: AuthUser = { ...identity('host-user', 'Host'), kind: 'USER', email: 'host@example.com', role: 'ADMIN' };
    const guest = identity('guest-user', 'Guest');
    const created = (manager as any).create(socket('host-socket'), host, 8);
    const room = manager.store.get(created.room.code)!;
    (manager as any).join(socket('guest-socket'), guest, room.code);

    expect(audit.roomCreated).toHaveBeenCalledWith(expect.objectContaining({ id: room.historyId, code: room.code, hostUserId: host.id }));
    startReady(manager, room, host.id);
    expect(audit.gameStarted).toHaveBeenCalledWith(expect.objectContaining({ roomHistoryId: room.historyId, roomCode: room.code, playerCount: 2 }));

    const snapshot = manager.adminRooms()[0]!;
    expect(snapshot).toMatchObject({ code: room.code, gameId: room.game?.gameId, connectedPlayers: 2 });
    expect(JSON.stringify(snapshot)).not.toContain('targetDexNumber');
    expect(JSON.stringify(snapshot)).not.toContain('host@example.com');

    (manager as any).finalDisconnect(room, host.id, true);
    (manager as any).finalDisconnect(room, guest.id, true);
    expect(audit.roomClosed).toHaveBeenCalledWith(expect.objectContaining({ id: room.historyId, gameResultId: room.game?.resultId }));
  });

  it('rejects mutations from a socket replaced by a newer connection', () => {
    const manager = new RoomManager(io() as any, catalog); const host = identity('host', 'Host'); const first = boundSocket('host-old', host);
    manager.bind(first as any);
    const createAck = vi.fn(); first.handlers.get('room:create')?.({ maxPlayers: 8 }, createAck);
    const room = manager.store.roomForPlayer(host.id)!;

    const current = boundSocket('host-current', host); manager.bind(current as any);
    expect(room.members.get(host.id)?.socketId).toBe('host-current');

    const staleAck = vi.fn(); first.handlers.get('room:leave')?.({}, staleAck);
    expect(staleAck).toHaveBeenCalledWith({ ok: false, error: expect.stringMatching(/sesión más reciente/) });
    expect(manager.store.get(room.code)).toBe(room);

    const currentAck = vi.fn(); current.handlers.get('room:leave')?.({}, currentAck);
    expect(currentAck).toHaveBeenCalledWith({ ok: true });
    expect(manager.store.get(room.code)).toBeUndefined();
  });

  it('plays Pokédex Distance and Shiny Quiz in the same room without leaking game state', async () => {
    const transport = io();
    const manager = new RoomManager(transport as any, catalog);
    const host = identity('pedro', 'Pedro');
    const guest = identity('ana', 'Ana');
    const hostSocket = socket('socket-pedro');
    const guestSocket = socket('socket-ana');

    const created = (manager as any).create(hostSocket, host, 8);
    const room = manager.store.get(created.room.code)!;
    (manager as any).join(guestSocket, guest, room.code);

    expect(created.room.availableGames.map((game: { id: string }) => game.id)).toEqual(['shiny-vote', 'pokemon-impostor', 'type-duel', 'zoomed-pokemon', 'pokemon-team-auction', 'pokemon-red-flag', 'tcg-higher-lower', 'pokedex-distance', 'higher-lower', 'learnset-guess', 'pokeddle-race', 'pokemon-bingo', 'whos-that-pokemon', 'pokedex-entry-guess', 'type-chain', 'guess-from-stats', 'poke-taboo', 'one-of-us-is-fake', 'pokemon-bluff-auction', 'sketchmon', 'pokemon-connections', 'secret-ranking', 'most-likely-to', 'would-you-rather', 'who-is-who-pokemon']);
    expect(room.selectedGameId).toBe('pokedex-distance');
    expect(room.members.size).toBe(2);

    (manager as any).updateConfig(host.id, { generations: [1], roundSeconds: 25 });
    (manager as any).selectGame(host.id, 'shiny-vote');
    (manager as any).updateConfig(host.id, { generations: [1], roundSeconds: 15, rounds: 1, candidateMode: 'SAME_POKEMON', optionCount: 4, showVotes: true });
    (manager as any).selectGame(host.id, 'pokedex-distance');
    expect(room.gameConfigs.get('pokedex-distance')).toEqual({ generations: [1], roundSeconds: 25 });
    expect(room.gameConfigs.get('shiny-vote')).toEqual({ generations: [1], roundSeconds: 15, rounds: 1, candidateMode: 'SAME_POKEMON', optionCount: 4, showVotes: true });

    const originalMembers = [...room.members.values()];
    startReady(manager, room, host.id);
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
    startReady(manager, room, host.id);
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
    await vi.waitFor(() => expect(persistGameResults).toHaveBeenCalledTimes(2));
  });

  it('keeps the TCG comparison price out of Socket.IO and reconnect projections until reveal', () => {
    const transport = io();
    const pricedCards = [
      { id: 'tcg-a', name: 'Pikachu', localId: '1', setId: 'set', setName: 'Set', rarity: 'Rare', imageUrl: 'https://img.test/a.webp', price: '12.3456', currency: 'EUR', provider: 'cardmarket', variant: 'standard' },
      { id: 'tcg-b', name: 'Charizard', localId: '2', setId: 'set', setName: 'Set', rarity: 'Rare', imageUrl: 'https://img.test/b.webp', price: '98.7654', currency: 'EUR', provider: 'cardmarket', variant: 'standard' },
    ];
    const tcgCards = { cardsFor: () => pricedCards, options: () => ({ ready: true, cardCount: 2, sets: [], rarities: [] }) };
    const manager = new RoomManager(transport as any, catalog, undefined, undefined, undefined, undefined, undefined, tcgCards);
    const host = identity('tcg-host', 'Host'); const created = (manager as any).create(socket('tcg-host-socket'), host, 8); const room = manager.store.get(created.room.code)!;
    (manager as any).selectGame(host.id, 'tcg-higher-lower'); (manager as any).updateConfig(host.id, { setIds: [], rarities: [], minPrice: null, maxPrice: null, rounds: 5, roundSeconds: 15 }); startReady(manager, room, host.id);
    const secret = room.game!.state.sequence[1].price as string; const publicView = (manager as any).view(room, host.id);
    expect(publicView.game.currentCard.price).toBeNull(); expect(JSON.stringify(publicView)).not.toContain(JSON.stringify(secret));
    (manager as any).broadcast(room); expect(JSON.stringify(transport.emit.mock.calls)).not.toContain(JSON.stringify(secret));
    const reconnect = boundSocket('tcg-host-reconnected', host); manager.bind(reconnect as any); const restored = reconnect.emit.mock.calls.find(([event]) => event === 'session:restored')?.[1];
    expect(restored.game.currentCard.price).toBeNull(); expect(JSON.stringify(restored)).not.toContain(JSON.stringify(secret));
  });

  it('rejects Members changing games and rejects unknown ids without altering the registry', () => {
    const manager = new RoomManager(io() as any, catalog);
    const host = identity('host', 'Host');
    const guest = identity('guest', 'Guest');
    const created = (manager as any).create(socket('host-socket'), host, 8);
    const room = manager.store.get(created.room.code)!;
    (manager as any).join(socket('guest-socket'), guest, room.code);

    expect(() => (manager as any).selectGame(guest.id, 'shiny-vote')).toThrow(/No tienes permiso/);
    expect(() => (manager as any).selectGame(host.id, 'missing-game')).toThrow(/Unknown game/);
    expect(room.selectedGameId).toBe('pokedex-distance');
    expect(created.room.availableGames).toHaveLength(25);
  });

  it('injects the registered host category snapshot without exposing round secrets', () => {
    const categories = [{ id: 'c1', text: 'Pokémon para una excursión' }, { id: 'c2', text: 'Pokémon para vigilar una casa' }];
    const manager = new RoomManager(io() as any, catalog, { artworkFor: () => null, artworkPokemonIds: () => [] }, (userId) => userId === 'host' ? categories : []);
    const host: AuthUser = { ...identity('host', 'Host'), kind: 'USER', email: 'host@example.com' };
    const created = (manager as any).create(socket('host-socket'), host, 8); const room = manager.store.get(created.room.code)!;
    (manager as any).join(socket('p2-socket'), identity('p2', 'Ana'), room.code);
    (manager as any).join(socket('p3-socket'), identity('p3', 'Carlos'), room.code);
    (manager as any).selectGame(host.id, 'one-of-us-is-fake');
    (manager as any).updateConfig(host.id, { generations: [1], selectionSeconds: 30, discussionSeconds: 180, rounds: 1, fakeKnows: false, categorySource: 'CUSTOM', includeRegionalForms: true });
    expect((manager as any).view(room, host.id).hostCustomCategoryCount).toBe(2);
    startReady(manager, room, host.id);
    const hostView = (manager as any).view(room, host.id);
    expect(hostView.gamePlayerState).toMatchObject({ role: 'PLAYER', myCategory: expect.any(String) });
    expect(hostView.gamePlayerState).not.toHaveProperty('isFake');
    expect(hostView.game).not.toHaveProperty('fakePlayerId'); expect(hostView.game).not.toHaveProperty('mainCategory'); expect(hostView.game).not.toHaveProperty('fakeCategory');
    expect(JSON.stringify(hostView.game)).not.toContain('Pokémon para una excursión');
    expect(JSON.stringify(hostView.game)).not.toContain('Pokémon para vigilar una casa');
  });

  it('broadcasts avatar changes and keeps the lightweight reference in the room', () => {
    const transport = io(); const manager = new RoomManager(transport as any, catalog);
    const host = identity('host', 'Host');
    const created = (manager as any).create(socket('host-socket'), host, 8);
    const room = manager.store.get(created.room.code)!;

    manager.updateIdentityAvatar(host.id, { type: 'PRESET', value: 'trainer-aqua' });

    expect(room.members.get(host.id)?.identity.avatar).toEqual({ type: 'PRESET', value: 'trainer-aqua' });
    expect(transport.to).toHaveBeenCalledWith('host-socket');
    expect(transport.to().emit).toHaveBeenCalledWith('room:state', expect.objectContaining({
      members: [expect.objectContaining({ id: host.id, avatar: { type: 'PRESET', value: 'trainer-aqua' } })],
    }));
  });

  it('centralizes Host, Co-host and Member permissions and broadcasts role changes', () => {
    const transport = io(); const manager = new RoomManager(transport as any, catalog);
    const host = identity('host', 'Host'); const cohost = identity('cohost', 'Pedro'); const member = identity('member', 'Ana');
    const created = (manager as any).create(socket('host-socket'), host, 8); const room = manager.store.get(created.room.code)!;
    (manager as any).join(socket('cohost-socket'), cohost, room.code); (manager as any).join(socket('member-socket'), member, room.code);
    expect(room.members.get(host.id)?.roomRole).toBe('HOST');
    expect(room.members.get(cohost.id)?.roomRole).toBe('MEMBER');
    expect(() => (manager as any).setRoomRole(member.id, cohost.id, 'CO_HOST')).toThrow(/No tienes permiso/);
    expect(() => (manager as any).setRoomRole(host.id, cohost.id, 'HOST')).toThrow();

    (manager as any).setRoomRole(host.id, cohost.id, 'CO_HOST');
    expect(room.members.get(cohost.id)?.roomRole).toBe('CO_HOST');
    expect(transport.to().emit).toHaveBeenCalledWith('room:state', expect.objectContaining({ members: expect.arrayContaining([expect.objectContaining({ id: cohost.id, roomRole: 'CO_HOST' })]) }));
    (manager as any).selectGame(cohost.id, 'shiny-vote');
    (manager as any).updateConfig(cohost.id, { generations: [1], roundSeconds: 20, rounds: 2, candidateMode: 'SAME_POKEMON', optionCount: 4, showVotes: true });
    expect(() => (manager as any).updateConfig(cohost.id, { generations: [1], roundSeconds: 2, rounds: 2, candidateMode: 'SAME_POKEMON', optionCount: 4, showVotes: true })).toThrow();
    (manager as any).updateSession(cohost.id, { type: 'GAME_COUNT', target: 5 });
    expect(room.selectedGameId).toBe('shiny-vote'); expect(room.sessionMode).toEqual({ type: 'GAME_COUNT', target: 5 });
    expect(() => (manager as any).startGame(cohost.id)).toThrow(/No tienes permiso/);
    expect(() => (manager as any).kick(cohost.id, member.id)).toThrow(/No tienes permiso/);
    expect(() => (manager as any).setRoomRole(cohost.id, member.id, 'CO_HOST')).toThrow(/No tienes permiso/);
    expect(() => (manager as any).updateConfig(member.id, room.gameConfigs.get('shiny-vote'))).toThrow(/No tienes permiso/);

    (manager as any).setRoomRole(host.id, cohost.id, 'MEMBER');
    expect(room.members.get(cohost.id)?.roomRole).toBe('MEMBER');
    (manager as any).kick(host.id, member.id);
    expect(room.members.has(member.id)).toBe(false);
  });

  it('requires connected guests to confirm once and preserves readiness across lobby configuration changes', () => {
    const manager = new RoomManager(io() as any, catalog);
    const host = identity('host', 'Host'); const guest = identity('guest', 'Ana');
    const created = (manager as any).create(socket('host-socket'), host, 8); const room = manager.store.get(created.room.code)!;
    (manager as any).join(socket('guest-socket'), guest, room.code);

    expect(() => (manager as any).startGame(host.id)).toThrow(/Falta por confirmar: Ana/);
    expect(() => (manager as any).setReady(host.id, true)).toThrow(/host inicia la partida/);
    expect(() => (manager as any).setReady(guest.id, 'yes')).toThrow(/inválido/);

    (manager as any).setReady(guest.id, true);
    expect(room.members.get(guest.id)?.ready).toBe(true);
    (manager as any).selectGame(host.id, 'shiny-vote');
    expect(room.members.get(guest.id)?.ready).toBe(true);

    const config = room.gameConfigs.get('shiny-vote') as Record<string, unknown>;
    (manager as any).updateConfig(host.id, { ...config, showVotes: false });
    expect(room.members.get(guest.id)?.ready).toBe(true);

    (manager as any).updateSession(host.id, { type: 'GAME_COUNT', target: 5 });
    expect(room.members.get(guest.id)?.ready).toBe(true);

    (manager as any).updateGameSelection(host.id, { type: 'RANDOM', gameIds: ['pokedex-distance', 'shiny-vote'] });
    expect(room.members.get(guest.id)?.ready).toBe(true);

    (manager as any).startGame(host.id);
    expect(room.phase).not.toBe('LOBBY');
    expect([...room.members.values()].every((member) => !member.ready)).toBe(true);
  });

  it('transfers Host manually, makes the old Host Co-host and preserves roles across games and reconnects', () => {
    vi.useFakeTimers(); vi.setSystemTime(5_000);
    const manager = new RoomManager(io() as any, catalog);
    const oldHost = identity('old-host', 'Eru'); const nextHost = identity('next-host', 'Pedro');
    const created = (manager as any).create(socket('old-socket'), oldHost, 8); const room = manager.store.get(created.room.code)!;
    (manager as any).join(socket('next-socket'), nextHost, room.code);
    (manager as any).transferHostManually(oldHost.id, nextHost.id);
    expect(room.hostId).toBe(nextHost.id);
    expect(room.members.get(nextHost.id)?.roomRole).toBe('HOST');
    expect(room.members.get(oldHost.id)?.roomRole).toBe('CO_HOST');
    expect(() => (manager as any).startGame(oldHost.id)).toThrow(/No tienes permiso/);
    (manager as any).selectGame(oldHost.id, 'shiny-vote');
    (manager as any).selectGame(oldHost.id, 'pokedex-distance');
    expect(room.members.get(oldHost.id)?.roomRole).toBe('CO_HOST');

    (manager as any).disconnect(oldHost.id, 'old-socket');
    const restoredSocket = socket('old-restored');
    (manager as any).restore(restoredSocket, oldHost);
    expect(room.members.get(oldHost.id)).toMatchObject({ roomRole: 'CO_HOST', presence: 'CONNECTED', socketId: 'old-restored' });
    startReady(manager, room, nextHost.id);
    (manager as any).action(nextHost.id, { type: 'SELECT_POKEMON', pokemonId: 'pokemon-1' });
    (manager as any).action(oldHost.id, { type: 'SELECT_POKEMON', pokemonId: 'pokemon-2' });
    room.game!.state.nextTransitionAt = 0; (manager as any).tick(room); (manager as any).returnLobby(nextHost.id);
    expect(room.members.get(oldHost.id)?.roomRole).toBe('CO_HOST');
    expect(room.members.get(nextHost.id)?.roomRole).toBe('HOST');
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
    startReady(manager, room, 'pedro');
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
    (manager as any).updateConfig(host.id, { generations: [1], categories: ['ATTACK'], showPreviousValue: true, answerVisibility: 'REALTIME', difficulty: 'NORMAL', roundSeconds: 10, rounds: 1 });
    startReady(manager, room, host.id); (manager as any).action(host.id, { type: 'ANSWER', choice: 'HIGHER' }); (manager as any).action(guest.id, { type: 'ANSWER', choice: 'LOWER' });
    room.game!.state.nextTransitionAt = 0; (manager as any).tick(room); expect(room.phase).toBe('GAME_RESULTS'); (manager as any).returnLobby(host.id);
    (manager as any).selectGame(host.id, 'type-duel'); (manager as any).updateConfig(host.id, { generations: [1], typeSelectSeconds: 5, searchSeconds: 10, rounds: 1 }); startReady(manager, room, host.id);
    const [first, second] = room.game!.state.participants; (manager as any).action(first, { type: 'SELECT_TYPE', pokemonType: 'fire' }); (manager as any).action(second, { type: 'SELECT_TYPE', pokemonType: 'water' });
    room.game!.state.nextTransitionAt = 0; (manager as any).tick(room); (manager as any).action(first, { type: 'ATTEMPT_POKEMON', pokemonId: 'pokemon-3' });
    room.game!.state.nextTransitionAt = 0; (manager as any).tick(room); expect(room.phase).toBe('GAME_RESULTS'); (manager as any).returnLobby(host.id);
    (manager as any).selectGame(host.id, 'learnset-guess');
    (manager as any).updateConfig(host.id, { generations: [1], showLevels: true, showEvolution: true, roundSeconds: 20, rounds: 1 });
    startReady(manager, room, host.id); const answerId = room.game!.state.correctPokemonId;
    expect(JSON.stringify((manager as any).view(room, guest.id))).not.toContain('correctPokemonId');
    (manager as any).action(host.id, { type: 'GUESS_POKEMON', pokemonId: answerId });
    const guestView = (manager as any).view(room, guest.id); expect(guestView.game.solvedPlayers).toEqual([{ playerId: host.id, solveOrder: 1 }]); expect(JSON.stringify(guestView.game)).not.toContain(answerId);
    (manager as any).action(guest.id, { type: 'GUESS_POKEMON', pokemonId: answerId });
    room.game!.state.nextTransitionAt = 0; (manager as any).tick(room); expect(room.phase).toBe('GAME_RESULTS'); (manager as any).returnLobby(host.id);
    (manager as any).selectGame(host.id, 'shiny-vote'); (manager as any).selectGame(host.id, 'pokemon-impostor'); (manager as any).selectGame(host.id, 'pokedex-distance');
    expect(room.phase).toBe('LOBBY'); expect(room.members.size).toBe(2); expect(room.selectedGameId).toBe('pokedex-distance');
  });

  it('plays Pokédle Race privately, restores safe state, and returns to the same lobby and players', () => {
    const manager = new RoomManager(io() as any, catalog); const host = identity('host', 'Host'); const guest = identity('guest', 'Guest');
    const hostSocket = socket('host-socket'); const guestSocket = socket('guest-socket');
    const created = (manager as any).create(hostSocket, host, 8); const room = manager.store.get(created.room.code)!; (manager as any).join(guestSocket, guest, room.code);
    const originalMemberIds = [...room.members.keys()];
    (manager as any).selectGame(host.id, 'pokeddle-race');
    const config = room.gameConfigs.get('pokeddle-race') as Record<string, unknown>; (manager as any).updateConfig(host.id, { ...config, generations: [1], maxRounds: 1 });
    startReady(manager, room, host.id);
    const hostSecret = room.game!.state.secretPokemonIds.host; const guestSecret = room.game!.state.secretPokemonIds.guest;
    expect(hostSecret).not.toBe(guestSecret);
    const unresolved = (manager as any).view(room, host.id); expect(JSON.stringify(unresolved.game)).not.toContain(hostSecret); expect(JSON.stringify(unresolved.gamePlayerState)).not.toContain(hostSecret);
    (manager as any).disconnect(host.id, 'host-socket');
    const restoredSocket = socket('host-restored'); (manager as any).restore(restoredSocket, host);
    const restored = restoredSocket.emit.mock.calls.find(([event]) => event === 'session:restored')?.[1]; expect(JSON.stringify(restored.game)).not.toContain(hostSecret);
    (manager as any).action(host.id, { type: 'GUESS_POKEMON', pokemonId: hostSecret });
    (manager as any).action(guest.id, { type: 'GUESS_POKEMON', pokemonId: guestSecret });
    expect(room.phase).toBe('ROUND_RESULTS'); expect((manager as any).view(room, guest.id).game.boards.host.revealedPokemon.id).toBe(hostSecret);
    room.game!.state.nextTransitionAt = 0; (manager as any).tick(room); expect(room.phase).toBe('GAME_RESULTS');
    (manager as any).returnLobby(host.id); expect(room.phase).toBe('LOBBY'); expect(room.game).toBeNull(); expect([...room.members.keys()]).toEqual(originalMemberIds); expect(room.members.get(host.id)?.socketId).toBe('host-restored');
    (manager as any).selectGame(host.id, 'higher-lower'); expect(room.selectedGameId).toBe('higher-lower'); expect(room.members.size).toBe(2); expect([...room.members.values()].every((member) => member.role === 'PLAYER')).toBe(true);
  });

  it('plays Pokémon Bingo, synchronizes public boards, and returns to the same lobby and roles', () => {
    const manager = new RoomManager(io() as any, catalog); const host = identity('host', 'Host'); const guest = identity('guest', 'Guest');
    const created = (manager as any).create(socket('host-socket'), host, 8); const room = manager.store.get(created.room.code)!; (manager as any).join(socket('guest-socket'), guest, room.code);
    const memberIds = [...room.members.keys()]; (manager as any).selectGame(host.id, 'pokemon-bingo');
    const config = room.gameConfigs.get('pokemon-bingo') as Record<string, unknown>; (manager as any).updateConfig(host.id, { ...config, width: 2, height: 2, generations: [1], durationSeconds: 60 });
    startReady(manager, room, host.id); expect(room.game?.gameId).toBe('pokemon-bingo'); expect(room.phase).toBe('ROUND_ACTIVE');
    const hostBoard = room.game!.state.boards.host; const guestBoard = room.game!.state.boards.guest;
    expect(hostBoard.cells).toHaveLength(4); expect(guestBoard.cells).toHaveLength(4); expect(hostBoard.cells).not.toEqual(guestBoard.cells);
    for (const cell of hostBoard.cells) (manager as any).action(host.id, { type: 'ASSIGN_POKEMON', cellId: cell.id, pokemonId: hostBoard.solutionPokemonIds[cell.id] });
    expect(room.phase).toBe('ROUND_RESULTS'); const publicView = (manager as any).view(room, guest.id); expect(publicView.game.boards.host).toMatchObject({ completed: 4, total: 4 }); expect(JSON.stringify(publicView.game)).not.toContain('solutionPokemonIds');
    room.game!.state.nextTransitionAt = 0; (manager as any).tick(room); expect(room.phase).toBe('GAME_RESULTS'); expect((manager as any).view(room, guest.id).game.boards.guest.cells.every((cell: { possibleSolutions: unknown[] }) => cell.possibleSolutions.length <= 3)).toBe(true);
    (manager as any).returnLobby(host.id); expect(room.phase).toBe('LOBBY'); expect(room.game).toBeNull(); expect([...room.members.keys()]).toEqual(memberIds); expect([...room.members.values()].every((member) => member.role === 'PLAYER')).toBe(true);
    (manager as any).selectGame(host.id, 'shiny-vote'); expect(room.selectedGameId).toBe('shiny-vote');
  });

  it('plays ¿Quién es ese Pokémon? with an opaque silhouette and returns to the same lobby', () => {
    const manager = new RoomManager(io() as any, catalog); const host = identity('host', 'Host'); const guest = identity('guest', 'Guest');
    const hostSocket = socket('host-socket'); const created = (manager as any).create(hostSocket, host, 8); const room = manager.store.get(created.room.code)!;
    (manager as any).join(socket('guest-socket'), guest, room.code); const originalIds = [...room.members.keys()];
    (manager as any).selectGame(host.id, 'whos-that-pokemon');
    (manager as any).updateConfig(host.id, { generations: [1], roundSeconds: 10, rounds: 1, hintsEnabled: false, includeRegionalForms: false });
    startReady(manager, room, host.id); const targetId = room.game!.state.targetPokemonId; const wrongId = pokemon.find((entry) => entry.id !== targetId)!.id;
    const activeView = (manager as any).view(room, guest.id);
    expect(activeView.game).toMatchObject({ gameId: 'whos-that-pokemon', visibleHints: [], solvedPlayers: [] });
    expect(activeView.game.silhouetteSprite).toMatch(/\/options\/shadow\/sprite$/);
    expect(JSON.stringify(activeView)).not.toContain(targetId);
    expect(manager.gameAsset(room.code, room.game!.state.assetToken, 1, 'shadow')).toMatchObject({ transform: 'SILHOUETTE' });
    expect(manager.gameAsset(room.code, room.game!.state.assetToken, 1, 'reveal')).toBeNull();

    (manager as any).action(guest.id, { type: 'GUESS_POKEMON', pokemonId: wrongId });
    expect((manager as any).view(room, host.id).game.attempts[0]).toMatchObject({ playerId: guest.id, guessedPokemon: { id: wrongId } });
    room.game!.state.cooldownUntil.guest = 0;
    (manager as any).action(host.id, { type: 'GUESS_POKEMON', pokemonId: targetId });
    const stillHidden = (manager as any).view(room, guest.id); expect(stillHidden.game.solvedPlayers).toEqual([{ playerId: host.id, solveOrder: 1 }]); expect(JSON.stringify(stillHidden.game)).not.toContain(targetId);
    (manager as any).action(guest.id, { type: 'GUESS_POKEMON', pokemonId: targetId }); expect(room.phase).toBe('ROUND_RESULTS');
    expect((manager as any).view(room, guest.id).game.lastRound.pokemon.name).toBe(pokemon.find((entry) => entry.id === targetId)!.name);
    expect(manager.gameAsset(room.code, room.game!.state.assetToken, 1, 'reveal')).toMatchObject({ transform: 'ORIGINAL' });
    room.game!.state.nextTransitionAt = 0; (manager as any).tick(room); expect(room.phase).toBe('GAME_RESULTS');
    (manager as any).returnLobby(host.id); expect(room.phase).toBe('LOBBY'); expect(room.game).toBeNull(); expect([...room.members.keys()]).toEqual(originalIds);
    expect([...room.members.values()].every((member) => member.role === 'PLAYER')).toBe(true);
    (manager as any).selectGame(host.id, 'pokemon-bingo'); expect(room.selectedGameId).toBe('pokemon-bingo');
  });

  it('plays Pokédex Entry Guess without leaking its target and keeps the room, roles and session', () => {
    const manager = new RoomManager(io() as any, catalog); const host = identity('host', 'Host'); const guest = identity('guest', 'Guest');
    const hostSocket = socket('host-socket'); const created = (manager as any).create(hostSocket, host, 8); const room = manager.store.get(created.room.code)!;
    (manager as any).join(socket('guest-socket'), guest, room.code); const originalIds = [...room.members.keys()];
    (manager as any).selectGame(host.id, 'pokedex-entry-guess');
    const defaults = room.gameConfigs.get('pokedex-entry-guess') as Record<string, unknown>;
    (manager as any).updateConfig(host.id, { ...defaults, generations: [1], roundSeconds: 25, rounds: 1, hintsEnabled: false });
    startReady(manager, room, host.id); const targetId = room.game!.state.roundDeck[0].pokemonId; const wrongId = pokemon.find((entry) => entry.id !== targetId)!.id;
    const active = (manager as any).view(room, guest.id);
    expect(active.game).toMatchObject({ gameId: 'pokedex-entry-guess', hints: [], solvedPlayers: [] });
    expect(active.game.entryText).toContain('???'); expect(JSON.stringify(active)).not.toContain(targetId); expect(JSON.stringify(active)).not.toContain(`/sprites/${targetId}`);
    (manager as any).action(guest.id, { type: 'GUESS_POKEMON', pokemonId: wrongId });
    expect((manager as any).view(room, host.id).game.attempts[0]).toMatchObject({ playerId: guest.id, guessedPokemon: { id: wrongId } });
    room.game!.state.cooldownUntil.guest = 0;
    (manager as any).action(host.id, { type: 'GUESS_POKEMON', pokemonId: targetId });
    const hidden = (manager as any).view(room, guest.id); expect(hidden.game.solvedPlayers).toEqual([{ playerId: host.id, solveOrder: 1 }]); expect(JSON.stringify(hidden)).not.toContain(targetId);
    (manager as any).action(guest.id, { type: 'GUESS_POKEMON', pokemonId: targetId }); expect(room.phase).toBe('ROUND_RESULTS');
    expect((manager as any).view(room, guest.id).game.lastRound.pokemon.name).toBe(pokemon.find((entry) => entry.id === targetId)!.name);
    room.game!.state.nextTransitionAt = 0; (manager as any).tick(room); expect(room.phase).toBe('GAME_RESULTS');
    expect(room.members.get(host.id)?.sessionPoints).toBeGreaterThan(room.members.get(guest.id)?.sessionPoints ?? 0);
    (manager as any).returnLobby(host.id); expect(room.phase).toBe('LOBBY'); expect(room.game).toBeNull(); expect([...room.members.keys()]).toEqual(originalIds);
    expect([...room.members.values()].every((member) => member.role === 'PLAYER')).toBe(true);
    (manager as any).selectGame(host.id, 'higher-lower'); expect(room.selectedGameId).toBe('higher-lower');
  });

  it('plays Type Chain authoritatively, eliminates on timeout and returns to the same lobby', () => {
    const manager = new RoomManager(io() as any, catalog); const host = identity('host', 'Host'); const guest = identity('guest', 'Guest');
    const created = (manager as any).create(socket('host-socket'), host, 8); const room = manager.store.get(created.room.code)!;
    (manager as any).join(socket('guest-socket'), guest, room.code); const originalIds = [...room.members.keys()];
    (manager as any).selectGame(host.id, 'type-chain');
    (manager as any).updateConfig(host.id, { generations: [1], turnSeconds: 10 });
    startReady(manager, room, host.id);

    expect(room.phase).toBe('TURN_ACTIVE'); expect(room.game?.gameId).toBe('type-chain');
    expect([...room.game!.state.turnOrder].sort()).toEqual([...originalIds].sort());
    const firstPlayerId = room.game!.state.currentPlayerId as string;
    const starter = catalog.byId(room.game!.state.chain.at(-1).pokemon.id)!;
    const candidates = getValidTypeChainCandidates({ previousPokemon: starter, allowedPokemon: pokemon, usedPokemonIds: new Set(room.game!.state.usedPokemonIds) });
    expect(candidates.length).toBeGreaterThan(0);

    (manager as any).action(firstPlayerId, { type: 'SUBMIT_POKEMON', pokemonId: starter.id });
    expect((manager as any).view(room, host.id).game.invalidAttempts.at(-1)).toMatchObject({ playerId: firstPlayerId, reason: 'ALREADY_USED' });
    room.game!.state.cooldownUntil[firstPlayerId] = 0;
    (manager as any).action(firstPlayerId, { type: 'SUBMIT_POKEMON', pokemonId: candidates[0]!.id });
    expect(room.game!.state.chain.at(-1).pokemon.id).toBe(candidates[0]!.id);
    expect(room.game!.state.currentPlayerId).not.toBe(firstPlayerId);
    expect(() => (manager as any).action(firstPlayerId, { type: 'SUBMIT_POKEMON', pokemonId: candidates[0]!.id })).toThrow(/No es tu turno/);

    const eliminatedId = room.game!.state.currentPlayerId as string;
    room.game!.state.roundEndsAt = 0; (manager as any).tick(room);
    expect(room.phase).toBe('GAME_RESULTS'); expect(room.game!.state.winnerId).toBe(firstPlayerId);
    expect(room.members.get(eliminatedId)?.role).toBe('SPECTATOR');
    expect(room.members.get(firstPlayerId)?.sessionPoints).toBeGreaterThan(room.members.get(eliminatedId)?.sessionPoints ?? 0);

    (manager as any).returnLobby(host.id); expect(room.phase).toBe('LOBBY'); expect(room.game).toBeNull();
    expect([...room.members.keys()]).toEqual(originalIds); expect([...room.members.values()].every((member) => member.role === 'PLAYER')).toBe(true);
    (manager as any).selectGame(host.id, 'shiny-vote'); expect(room.selectedGameId).toBe('shiny-vote');
  });

  it('plays Guess from Stats without leaking equivalent answers and keeps the same room', () => {
    const manager = new RoomManager(io() as any, catalog); const host = identity('host', 'Host'); const guest = identity('guest', 'Guest');
    const created = (manager as any).create(socket('host-socket'), host, 8); const room = manager.store.get(created.room.code)!;
    (manager as any).join(socket('guest-socket'), guest, room.code); const originalIds = [...room.members.keys()];
    (manager as any).selectGame(host.id, 'guess-from-stats'); const defaults = room.gameConfigs.get('guess-from-stats') as Record<string, unknown>;
    (manager as any).updateConfig(host.id, { ...defaults, generations: [1], roundSeconds: 30, rounds: 1 }); startReady(manager, room, host.id);
    const prepared = room.game!.state.roundDeck[0]; const answerId = prepared.acceptedPokemonIds[0] as string; const wrongId = pokemon.find((entry) => !prepared.acceptedPokemonIds.includes(entry.id))!.id;
    const active = (manager as any).view(room, guest.id); expect(active.game).toMatchObject({ gameId: 'guess-from-stats', visibleStats: expect.any(Array), solvedPlayers: [] });
    expect(JSON.stringify(active)).not.toContain(answerId); expect(JSON.stringify(active)).not.toContain('acceptedPokemonIds'); expect(JSON.stringify(active)).not.toContain('sourcePokemonId');
    (manager as any).action(guest.id, { type: 'GUESS_POKEMON', pokemonId: wrongId }); expect((manager as any).view(room, host.id).game.attempts[0]).toMatchObject({ playerId: guest.id, guessedPokemon: { id: wrongId } });
    room.game!.state.cooldownUntil.guest = 0; (manager as any).action(host.id, { type: 'GUESS_POKEMON', pokemonId: answerId });
    const hidden = (manager as any).view(room, guest.id); expect(hidden.game.solvedPlayers).toEqual([{ playerId: host.id, solveOrder: 1 }]); expect(JSON.stringify(hidden)).not.toContain(answerId);
    (manager as any).action(guest.id, { type: 'GUESS_POKEMON', pokemonId: answerId }); expect(room.phase).toBe('ROUND_RESULTS');
    expect((manager as any).view(room, guest.id).game.lastRound.answers[0].id).toBe(answerId); room.game!.state.nextTransitionAt = 0; (manager as any).tick(room); expect(room.phase).toBe('GAME_RESULTS');
    expect(room.members.get(host.id)?.sessionPoints).toBeGreaterThan(room.members.get(guest.id)?.sessionPoints ?? 0);
    (manager as any).returnLobby(host.id); expect(room.phase).toBe('LOBBY'); expect(room.game).toBeNull(); expect([...room.members.keys()]).toEqual(originalIds); expect([...room.members.values()].every((member) => member.role === 'PLAYER')).toBe(true);
    (manager as any).selectGame(host.id, 'type-chain'); expect(room.selectedGameId).toBe('type-chain');
  });

  it('plays Zoomed Pokémon with one authoritative crop, solve order, reveal and the same lobby', () => {
    const manager = new RoomManager(io() as any, catalog); const host = identity('host', 'Host'); const guest = identity('guest', 'Guest');
    const created = (manager as any).create(socket('host-socket'), host, 8); const room = manager.store.get(created.room.code)!;
    (manager as any).join(socket('guest-socket'), guest, room.code); const originalIds = [...room.members.keys()];
    (manager as any).selectGame(host.id, 'zoomed-pokemon'); const defaults = room.gameConfigs.get('zoomed-pokemon') as Record<string, unknown>;
    (manager as any).updateConfig(host.id, { ...defaults, generations: [1], imageMode: 'MIXED', roundSeconds: 30, rounds: 1, hintsEnabled: false });
    startReady(manager, room, host.id); const targetId = room.game!.state.targetPokemonId as string;
    const hostView = (manager as any).view(room, host.id); const guestView = (manager as any).view(room, guest.id);
    expect(hostView.game).toMatchObject({ gameId: 'zoomed-pokemon', imageUrl: expect.stringContaining('/active/sprite'), focusPoint: { x: 0.5, y: 0.5 }, currentZoomStage: 0 });
    expect(guestView.game.imageUrl).toBe(hostView.game.imageUrl); expect(JSON.stringify(hostView.game)).not.toContain(targetId);
    (manager as any).action(guest.id, { type: 'GUESS_POKEMON', pokemonId: targetId }); const hidden = (manager as any).view(room, host.id);
    expect(hidden.game.solves.guest).toEqual({ solveOrder: 1, zoomStage: 0 }); expect(JSON.stringify(hidden.game)).not.toContain(targetId);
    (manager as any).action(host.id, { type: 'GUESS_POKEMON', pokemonId: targetId }); expect(room.phase).toBe('ROUND_RESULTS');
    const reveal = (manager as any).view(room, host.id); expect(reveal.game.lastRound).toMatchObject({ pokemon: { name: expect.any(String) }, imageUrl: expect.stringContaining('/reveal/sprite'), initialCropUrl: expect.stringContaining('/active/sprite') });
    room.game!.state.nextTransitionAt = 0; (manager as any).tick(room); expect(room.phase).toBe('GAME_RESULTS'); expect(room.members.get(guest.id)!.sessionPoints).toBeGreaterThan(room.members.get(host.id)!.sessionPoints);
    (manager as any).returnLobby(host.id); expect(room.phase).toBe('LOBBY'); expect(room.game).toBeNull(); expect([...room.members.keys()]).toEqual(originalIds);
    (manager as any).selectGame(host.id, 'shiny-vote'); expect(room.selectedGameId).toBe('shiny-vote');
  });

  it('plays Pokémon Connections with private progress, reconnect and synchronized reveal', () => {
    const manager = new RoomManager(io() as any, catalog); const host = identity('host', 'Host'); const guest = identity('guest', 'Guest');
    const hostSocket = socket('host-socket'); const created = (manager as any).create(hostSocket, host, 8); const room = manager.store.get(created.room.code)!;
    (manager as any).join(socket('guest-socket'), guest, room.code); const originalIds = [...room.members.keys()];
    (manager as any).selectGame(host.id, 'pokemon-connections');
    const defaults = room.gameConfigs.get('pokemon-connections') as Record<string, unknown>;
    (manager as any).updateConfig(host.id, { ...defaults, generations: [1], groupSize: 4, pokemonCount: 16, mistakesAllowed: 1, roundSeconds: 120, rounds: 1 });
    startReady(manager, room, host.id); expect(room.phase).toBe('ROUND_ACTIVE'); expect(room.game?.gameId).toBe('pokemon-connections');
    const answers = room.game!.state.answerGroups as Array<{ id: string; label: string; pokemon: Array<{ id: string }> }>;
    const firstIds = answers[0]!.pokemon.map((entry) => entry.id); const firstLabel = answers[0]!.label;
    const active = (manager as any).view(room, guest.id); expect(active.game.board).toHaveLength(16); expect(JSON.stringify(active)).not.toContain(firstLabel); expect(JSON.stringify(active)).not.toContain('answerGroups');
    (manager as any).action(host.id, { type: 'SUBMIT_GROUP', pokemonIds: firstIds });
    const hostView = (manager as any).view(room, host.id); const guestView = (manager as any).view(room, guest.id);
    expect(hostView.gamePlayerState).toMatchObject({ role: 'PLAYER', foundGroups: [{ label: firstLabel }], mistakesUsed: 0 });
    expect(guestView.game.playerProgress.host).toMatchObject({ foundGroups: 1, status: 'PLAYING' }); expect(JSON.stringify(guestView)).not.toContain(firstLabel);

    (manager as any).disconnect(host.id, 'host-socket'); const restoredSocket = socket('host-restored'); (manager as any).restore(restoredSocket, host);
    const restored = restoredSocket.emit.mock.calls.find(([event]) => event === 'session:restored')?.[1];
    expect(restored.gamePlayerState.foundGroups[0].label).toBe(firstLabel);
    for (const group of answers.slice(1)) (manager as any).action(host.id, { type: 'SUBMIT_GROUP', pokemonIds: group.pokemon.map((entry) => entry.id) });
    expect(room.game!.state.progress.host).toMatchObject({ status: 'SOLVED', completionRank: 1, roundPoints: 7 });
    const wrong = [answers[0]!.pokemon[0]!.id, answers[0]!.pokemon[1]!.id, answers[1]!.pokemon[0]!.id, answers[1]!.pokemon[1]!.id];
    (manager as any).action(guest.id, { type: 'SUBMIT_GROUP', pokemonIds: wrong }); expect(room.phase).toBe('ROUND_RESULTS');
    const reveal = (manager as any).view(room, guest.id); expect(reveal.game.lastRound.groups).toHaveLength(4); expect(reveal.game.lastRound.groups[0].label).toBe(firstLabel);
    room.game!.state.nextTransitionAt = 0; (manager as any).tick(room); expect(room.phase).toBe('GAME_RESULTS'); expect(room.members.get(host.id)!.sessionPoints).toBe(7);
    (manager as any).returnLobby(host.id); expect(room.phase).toBe('LOBBY'); expect(room.game).toBeNull(); expect([...room.members.keys()]).toEqual(originalIds);
  });

  it('plays Pokémon Team Auction with public teams, visible bids and unowned lots', () => {
    const manager = new RoomManager(io() as any, catalog); const host = identity('host', 'Host'); const guest = identity('guest', 'Guest');
    const created = (manager as any).create(socket('host-socket'), host, 8); const room = manager.store.get(created.room.code)!;
    (manager as any).join(socket('guest-socket'), guest, room.code); (manager as any).selectGame(host.id, 'pokemon-team-auction');
    const defaults = room.gameConfigs.get('pokemon-team-auction') as Record<string, unknown>;
    (manager as any).updateConfig(host.id, { ...defaults, generations: [1], includeForms: false, initialBudget: 10 }); startReady(manager, room, host.id);
    expect(room.phase).toBe('ROUND_ACTIVE'); expect(room.game!.state.lots).toHaveLength(12);
    const first = room.game!.state.turnOrder[room.game!.state.turnIndex]!; (manager as any).action(first, { type: 'RAISE_BID', amount: 1 });
    const second = room.game!.state.turnOrder[room.game!.state.turnIndex]!; (manager as any).action(second, { type: 'RAISE_BID', amount: 3 });
    const visible = (manager as any).view(room, guest.id); expect(visible.game.currentBid).toBe(3); expect(visible.game.bidHistory).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'BID', amount: 3 })])); expect(visible.game.participants[first].coins).toBe(10);
    (manager as any).action(first, { type: 'PASS_BID' }); expect(room.game!.state.lotHistory[0]).toMatchObject({ winnerId: second, bid: 3 }); expect(room.game!.state.participants[second].coins).toBe(7);
    room.sessionMode = { type: 'GAME_COUNT', target: 1 };
    room.gameSelectionMode = { type: 'RANDOM', gameIds: ['pokemon-team-auction', 'higher-lower'] };
    for (const participant of Object.values(room.game!.state.participants) as Array<{ coins: number }>) participant.coins = 0;
    (manager as any).applyPresenceChange(room);
    expect(room.phase).toBe('GAME_RESULTS');
    const resultView = (manager as any).view(room, host.id); expect(resultView.game.results.standings.map((standing: { playerId: string }) => standing.playerId).sort()).toEqual([guest.id, host.id]); expect(resultView.game.lotHistory.some((lot: { winnerId: string | null }) => lot.winnerId === null)).toBe(true);
    (manager as any).disconnect(guest.id, 'guest-socket'); const restoredSocket = socket('guest-restored'); (manager as any).restore(restoredSocket, guest);
    expect(restoredSocket.emit).toHaveBeenCalledWith('session:restored', expect.objectContaining({ phase: 'GAME_RESULTS', game: expect.objectContaining({ participants: expect.objectContaining({ [host.id]: expect.anything(), [guest.id]: expect.anything() }), results: expect.objectContaining({ standings: expect.arrayContaining([expect.objectContaining({ playerId: host.id }), expect.objectContaining({ playerId: guest.id })]) }) }) }));
    (manager as any).continueSession(host.id); expect(room.phase).toBe('SESSION_RESULTS');
    (manager as any).returnLobby(host.id); expect(room.phase).toBe('LOBBY');
  });

  it('plays Secret Ranking through the room transport without leaking private orders', () => {
    const manager = new RoomManager(io() as any, catalog); const host = identity('host', 'Host'); const guest = identity('guest', 'Guest'); const third = identity('third', 'Third');
    const created = (manager as any).create(socket('host-socket'), host, 8); const room = manager.store.get(created.room.code)!;
    (manager as any).join(socket('guest-socket'), guest, room.code); (manager as any).join(socket('third-socket'), third, room.code);
    (manager as any).selectGame(host.id, 'secret-ranking'); const defaults = room.gameConfigs.get('secret-ranking') as Record<string, unknown>;
    (manager as any).updateConfig(host.id, { ...defaults, generations: [1], rounds: 1, promptSource: 'OFFICIAL', includeForms: false }); startReady(manager, room, host.id);
    expect(room.phase).toBe('ROUND_ACTIVE'); const order = [...room.game!.state.currentPokemonIds];
    (manager as any).action(host.id, { type: 'SUBMIT_RANKING', pokemonIds: order });
    const guestView = (manager as any).view(room, guest.id); expect(guestView.game.submittedPlayerIds).toEqual(['host']); expect(JSON.stringify(guestView.game)).not.toContain(JSON.stringify(order));
    const hostView = (manager as any).view(room, host.id); expect(hostView.gamePlayerState.ownRanking.map((entry: { id: string }) => entry.id)).toEqual(order);
    (manager as any).action(guest.id, { type: 'SUBMIT_RANKING', pokemonIds: [...order].reverse() });
    (manager as any).action(third.id, { type: 'SUBMIT_RANKING', pokemonIds: order }); expect(room.phase).toBe('ROUND_RESULTS');
    const reveal = (manager as any).view(room, guest.id); expect(reveal.game.lastRound.players.host.ranking).toHaveLength(5); expect(reveal.game.lastRound.consensus).toHaveLength(5);
    room.game!.state.nextTransitionAt = 0; (manager as any).tick(room); expect(room.phase).toBe('GAME_RESULTS'); expect((manager as any).view(room, host.id).game.results).toBeTruthy();
  });

  it('plays Most Likely To with private answers and ballots before the synchronized result', () => {
    const manager = new RoomManager(io() as any, catalog); const host = identity('host', 'Host'); const guest = identity('guest', 'Guest'); const third = identity('third', 'Third');
    const created = (manager as any).create(socket('host-socket'), host, 8); const room = manager.store.get(created.room.code)!;
    (manager as any).join(socket('guest-socket'), guest, room.code); (manager as any).join(socket('third-socket'), third, room.code);
    (manager as any).selectGame(host.id, 'most-likely-to'); const defaults = room.gameConfigs.get('most-likely-to') as Record<string, unknown>;
    (manager as any).updateConfig(host.id, { ...defaults, generations: [1], rounds: 1, promptSource: 'OFFICIAL', includeForms: false }); startReady(manager, room, host.id);
    (manager as any).action(host.id, { type: 'SELECT_POKEMON', pokemonId: 'pokemon-1' });
    const hidden = (manager as any).view(room, guest.id); expect(hidden.game.selectionCompletedIds).toEqual(['host']); expect(hidden.game.revealedAnswers).toEqual([]); expect(JSON.stringify(hidden.game)).not.toContain('pokemon-1');
    (manager as any).action(guest.id, { type: 'SELECT_POKEMON', pokemonId: 'pokemon-1' }); (manager as any).action(third.id, { type: 'SELECT_POKEMON', pokemonId: 'pokemon-2' });
    expect(room.phase).toBe('VOTING'); const revealed = (manager as any).view(room, third.id); expect(revealed.game.revealedAnswers).toEqual(expect.arrayContaining([expect.objectContaining({ playerId: 'host', pokemon: expect.objectContaining({ id: 'pokemon-1' }) }), expect.objectContaining({ playerId: 'guest', pokemon: expect.objectContaining({ id: 'pokemon-1' }) })]));
    (manager as any).action(host.id, { type: 'VOTE_ANSWER', playerId: guest.id }); const privateVote = (manager as any).view(room, third.id); expect(privateVote.game.votedPlayerIds).toEqual(['host']); expect(JSON.stringify(privateVote.game)).not.toContain('"host":"guest"');
    (manager as any).action(guest.id, { type: 'VOTE_ANSWER', playerId: host.id }); (manager as any).action(third.id, { type: 'VOTE_ANSWER', playerId: guest.id });
    expect(room.phase).toBe('ROUND_RESULTS'); const result = (manager as any).view(room, host.id); expect(result.game.lastRound.winnerIds).toEqual(['guest']); expect(result.game.lastRound.pointsAwarded.guest).toBe(3);
    room.game!.state.nextTransitionAt = 0; (manager as any).tick(room); expect(room.phase).toBe('GAME_RESULTS'); expect((manager as any).view(room, host.id).game.results.winnerId).toBe('guest');
  });

  it('plays Would You Rather with socket-specific ballots and a synchronized reveal', () => {
    const pairs = [{ id: 'custom-1', optionA: 'Vivir con Gengar', optionB: 'Viajar con Magikarp' }];
    const manager = new RoomManager(io() as any, catalog, undefined, undefined, undefined, undefined, (userId) => userId === 'host' ? pairs : []);
    const host: AuthUser = { ...identity('host', 'Host'), kind: 'USER', email: 'host@example.com' }; const guest = identity('guest', 'Guest'); const third = identity('third', 'Third');
    const created = (manager as any).create(socket('host-socket'), host, 8); const room = manager.store.get(created.room.code)!;
    (manager as any).join(socket('guest-socket'), guest, room.code); (manager as any).join(socket('third-socket'), third, room.code);
    (manager as any).selectGame(host.id, 'would-you-rather'); const defaults = room.gameConfigs.get('would-you-rather') as Record<string, unknown>;
    (manager as any).updateConfig(host.id, { ...defaults, rounds: 1, promptSource: 'CUSTOM' });
    expect((manager as any).view(room, host.id).hostWouldYouRatherPromptCount).toBe(1); startReady(manager, room, host.id);
    (manager as any).action(host.id, { type: 'SUBMIT_BALLOT', preference: 'A', prediction: 'B' });
    const guestView = (manager as any).view(room, guest.id); expect(guestView.game.submittedPlayerIds).toEqual(['host']); expect(JSON.stringify(guestView.game)).not.toContain('"preference"');
    expect((manager as any).view(room, host.id).gamePlayerState.ownBallot).toEqual({ preference: 'A', prediction: 'B' });
    (manager as any).action(guest.id, { type: 'SUBMIT_BALLOT', preference: 'A', prediction: 'A' });
    (manager as any).action(third.id, { type: 'SUBMIT_BALLOT', preference: 'B', prediction: 'A' });
    expect(room.phase).toBe('ROUND_RESULTS'); const result = (manager as any).view(room, guest.id); expect(result.game.lastRound).toMatchObject({ majority: 'A', totals: { A: 2, B: 1 } });
    expect(result.game.lastRound.players).toEqual(expect.arrayContaining([expect.objectContaining({ playerId: 'host', preference: 'A', prediction: 'B', totalPoints: 1 })]));
  });

  it('plays Pokémon Red Flag without revealing texts, authors or ballot targets early', () => {
    const manager = new RoomManager(io() as any, catalog); const host = identity('host', 'Host'); const guest = identity('guest', 'Guest'); const third = identity('third', 'Third');
    const created = (manager as any).create(socket('host-socket'), host, 8); const room = manager.store.get(created.room.code)!;
    (manager as any).join(socket('guest-socket'), guest, room.code); (manager as any).join(socket('third-socket'), third, room.code);
    (manager as any).selectGame(host.id, 'pokemon-red-flag'); const defaults = room.gameConfigs.get('pokemon-red-flag') as Record<string, unknown>;
    (manager as any).updateConfig(host.id, { ...defaults, generations: [1], rounds: 1, includeForms: false }); startReady(manager, room, host.id);
    (manager as any).action(host.id, { type: 'SUBMIT_RED_FLAG', text: 'Dice que su ex era un Ditto.' });
    const hidden = (manager as any).view(room, guest.id); expect(hidden.game.submittedPlayerIds).toEqual(['host']); expect(hidden.game.revealedAnswers).toEqual([]); expect(JSON.stringify(hidden.game)).not.toContain('Ditto');
    expect((manager as any).view(room, host.id).gamePlayerState.ownAnswer.text).toContain('Ditto');
    (manager as any).action(guest.id, { type: 'SUBMIT_RED_FLAG', text: 'Comparte ubicación con Hypno.' });
    (manager as any).action(third.id, { type: 'SUBMIT_RED_FLAG', text: 'Lleva a su madre a todas las citas.' });
    expect(room.phase).toBe('VOTING'); const voting = (manager as any).view(room, third.id); expect(voting.game.revealedAnswers).toHaveLength(3); expect(JSON.stringify(voting.game.revealedAnswers)).not.toContain('authorId');
    const slots = room.game!.state.answerSlots; (manager as any).action(host.id, { type: 'VOTE_RED_FLAG', answerId: slots.guest });
    const privateVote = (manager as any).view(room, third.id); expect(privateVote.game.votedPlayerIds).toEqual(['host']); expect(JSON.stringify(privateVote.game)).not.toContain(`"host":"${slots.guest}"`);
    (manager as any).action(guest.id, { type: 'VOTE_RED_FLAG', answerId: slots.host }); (manager as any).action(third.id, { type: 'VOTE_RED_FLAG', answerId: slots.guest });
    expect(room.phase).toBe('ROUND_RESULTS'); const reveal = (manager as any).view(room, host.id); expect(reveal.game.lastRound.winnerIds).toEqual(['guest']); expect(reveal.game.lastRound.answers.find((answer: { authorId: string }) => answer.authorId === 'guest').text).toContain('Hypno');
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
    startReady(manager, room, 'host');
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
    (manager as any).setReady(guest.id, true);
    (manager as any).disconnect(host.id, 'host-1');
    expect(room.hostId).toBe(host.id);
    expect(room.members.get(host.id)?.presence).toBe('TEMPORARILY_DISCONNECTED');

    const restored = socket('host-2');
    (manager as any).restore(restored, host);
    expect(room.members.get(host.id)).toMatchObject({ connected: true, presence: 'CONNECTED', socketId: 'host-2' });
    expect(room.members.get(guest.id)?.ready).toBe(true);
    expect(restored.emit).toHaveBeenCalledWith('session:restored', expect.objectContaining({ code: room.code }));

    (manager as any).disconnect(host.id, 'host-2');
    vi.advanceTimersByTime(29_999);
    expect(room.hostId).toBe(host.id);
    vi.advanceTimersByTime(1);
    expect(room.hostId).toBe(guest.id);
    expect(room.members.has(host.id)).toBe(false);
    expect(manager.store.roomForPlayer(host.id)).toBeUndefined();
  });

  it('keeps public session history and departed players in the final standings until a new session', () => {
    const manager = new RoomManager(io() as any, catalog);
    const host = identity('host', 'Host'); const guest = identity('guest', 'Ana');
    const hostSocket = socket('host-socket'); const guestSocket = socket('guest-socket');
    const created = (manager as any).create(hostSocket, host, 8); const room = manager.store.get(created.room.code)!;
    (manager as any).join(guestSocket, guest, room.code);
    (manager as any).selectGame(host.id, 'higher-lower');
    (manager as any).updateConfig(host.id, { generations: [1], categories: ['ATTACK'], showPreviousValue: true, answerVisibility: 'REALTIME', difficulty: 'NORMAL', roundSeconds: 10, rounds: 1 });
    (manager as any).setReady(guest.id, true);
    startReady(manager, room, host.id);
    (manager as any).action(host.id, { type: 'ANSWER', choice: 'HIGHER' });
    (manager as any).action(guest.id, { type: 'ANSWER', choice: 'LOWER' });
    room.game!.state.nextTransitionAt = 0; (manager as any).tick(room);
    (manager as any).endSession(host.id);

    expect(room.sessionHistory).toEqual([expect.objectContaining({
      gameNumber: 1, gameId: 'higher-lower', winnerIds: [expect.any(String)], points: expect.objectContaining({ host: expect.any(Number), guest: expect.any(Number) }),
    })]);
    (manager as any).leave(guestSocket, guest.id);
    const finalView = (manager as any).view(room, host.id);
    expect(finalView.members.map((member: { id: string }) => member.id)).toEqual(['host']);
    expect(finalView.sessionStandings).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'guest', displayName: 'Ana' })]));

    (manager as any).returnLobby(host.id);
    expect(room.sessionHistory).toEqual([]);
    expect((manager as any).view(room, host.id).sessionStandings).toEqual([expect.objectContaining({ id: 'host', sessionPoints: 0 })]);
  });

  it('bounds detailed history for infinite sessions while keeping the full game count', () => {
    const manager = new RoomManager(io() as any, catalog);
    const host = identity('host', 'Host'); const guest = identity('guest', 'Ana');
    const created = (manager as any).create(socket('host-socket'), host, 8); const room = manager.store.get(created.room.code)!;
    (manager as any).join(socket('guest-socket'), guest, room.code);
    room.gamesPlayed = 100;
    room.sessionHistory = Array.from({ length: 100 }, (_, index) => ({ gameNumber: index + 1, gameId: 'higher-lower', winnerIds: ['host'], points: { host: 1, guest: 0 } }));
    (manager as any).selectGame(host.id, 'higher-lower');
    (manager as any).updateConfig(host.id, { generations: [1], categories: ['ATTACK'], showPreviousValue: true, answerVisibility: 'REALTIME', difficulty: 'NORMAL', roundSeconds: 10, rounds: 1 });
    startReady(manager, room, host.id);
    (manager as any).action(host.id, { type: 'ANSWER', choice: 'HIGHER' });
    (manager as any).action(guest.id, { type: 'ANSWER', choice: 'LOWER' });
    room.game!.state.nextTransitionAt = 0; (manager as any).tick(room);

    expect(room.gamesPlayed).toBe(101);
    expect(room.sessionHistory).toHaveLength(100);
    expect(room.sessionHistory[0]?.gameNumber).toBe(2);
    expect(room.sessionHistory.at(-1)?.gameNumber).toBe(101);
  });

  it('validates game-selection pools and lets co-hosts configure the rotation', () => {
    const manager = new RoomManager(io() as any, catalog);
    const host = identity('host', 'Host'); const cohost = identity('cohost', 'Ana');
    const created = (manager as any).create(socket('host-socket'), host, 8); const room = manager.store.get(created.room.code)!;
    (manager as any).join(socket('cohost-socket'), cohost, room.code);
    (manager as any).setRoomRole(host.id, cohost.id, 'CO_HOST');

    expect(() => (manager as any).updateGameSelection(cohost.id, { type: 'RANDOM', gameIds: ['higher-lower'] })).toThrow(/2 minijuegos/);
    expect(() => (manager as any).updateGameSelection(cohost.id, { type: 'VOTE', gameIds: ['higher-lower', 'shiny-vote', 'missing'] })).toThrow(/desconocido/);
    (manager as any).updateGameSelection(cohost.id, { type: 'VOTE', gameIds: ['higher-lower', 'shiny-vote', 'pokemon-bingo'] });
    expect(room.gameSelectionMode).toEqual({ type: 'VOTE', gameIds: ['higher-lower', 'shiny-vote', 'pokemon-bingo'] });
  });

  it('rejects rotation games that do not support the connected player count', () => {
    const manager = new RoomManager(io() as any, catalog); const host = identity('host', 'Host');
    const created = (manager as any).create(socket('host-socket'), host, 10); const room = manager.store.get(created.room.code)!;
    for (let index = 1; index <= 8; index += 1) {
      const guest = identity(`guest-${index}`, `Guest ${index}`);
      (manager as any).join(socket(`guest-socket-${index}`), guest, room.code);
    }

    expect(() => (manager as any).updateGameSelection(host.id, { type: 'RANDOM', gameIds: ['pokemon-bingo', 'zoomed-pokemon'] })).toThrow(/Pokémon Bingo no admite 9 jugadores/);
    expect(room.gameSelectionMode).toEqual({ type: 'FIXED' });
  });

  it('selects a compatible random minigame at start and avoids an immediate repeat', () => {
    const manager = new RoomManager(io() as any, catalog);
    const host = identity('host', 'Host');
    const created = (manager as any).create(socket('host-socket'), host, 8); const room = manager.store.get(created.room.code)!;
    (manager as any).selectGame(host.id, 'higher-lower');
    (manager as any).updateGameSelection(host.id, { type: 'RANDOM', gameIds: ['higher-lower', 'shiny-vote'] });

    startReady(manager, room, host.id);

    expect(room.selectedGameId).toBe('shiny-vote');
    expect(room.game?.gameId).toBe('shiny-vote');
  });

  it('continues a fixed session by starting the same minigame without returning to the lobby', () => {
    const manager = new RoomManager(io() as any, catalog); const host = identity('host', 'Host'); const guest = identity('guest', 'Ana');
    const created = (manager as any).create(socket('host-socket'), host, 8); const room = manager.store.get(created.room.code)!;
    (manager as any).join(socket('guest-socket'), guest, room.code);
    (manager as any).selectGame(host.id, 'higher-lower');
    (manager as any).updateConfig(host.id, { generations: [1], categories: ['ATTACK'], showPreviousValue: true, answerVisibility: 'REALTIME', difficulty: 'NORMAL', roundSeconds: 10, rounds: 1 });
    startReady(manager, room, host.id);
    (manager as any).action(host.id, { type: 'ANSWER', choice: 'HIGHER' });
    (manager as any).action(guest.id, { type: 'ANSWER', choice: 'LOWER' });
    room.game!.state.nextTransitionAt = 0; (manager as any).tick(room);
    const firstResultId = room.game!.resultId;

    (manager as any).continueSession(host.id);

    expect(room.phase).toBe('ROUND_ACTIVE');
    expect(room.game).toMatchObject({ gameId: 'higher-lower', resultsApplied: false });
    expect(room.game!.resultId).not.toBe(firstResultId);
    expect(room.gamesPlayed).toBe(1);
    expect(() => (manager as any).continueSession(host.id)).toThrow(/todavía no ha terminado/);
  });

  it('continues a random session by choosing and starting a compatible alternative', () => {
    const manager = new RoomManager(io() as any, catalog); const host = identity('host', 'Host'); const guest = identity('guest', 'Ana');
    const created = (manager as any).create(socket('host-socket'), host, 8); const room = manager.store.get(created.room.code)!;
    (manager as any).join(socket('guest-socket'), guest, room.code);
    (manager as any).selectGame(host.id, 'higher-lower');
    (manager as any).updateConfig(host.id, { generations: [1], categories: ['ATTACK'], showPreviousValue: true, answerVisibility: 'REALTIME', difficulty: 'NORMAL', roundSeconds: 10, rounds: 1 });
    startReady(manager, room, host.id);
    (manager as any).action(host.id, { type: 'ANSWER', choice: 'HIGHER' });
    (manager as any).action(guest.id, { type: 'ANSWER', choice: 'LOWER' });
    room.game!.state.nextTransitionAt = 0; (manager as any).tick(room);
    room.gameSelectionMode = { type: 'RANDOM', gameIds: ['higher-lower', 'shiny-vote'] };

    (manager as any).continueSession(host.id);

    expect(room.selectedGameId).toBe('shiny-vote');
    expect(room.game?.gameId).toBe('shiny-vote');
    expect(room.phase).toBe('ROUND_ACTIVE');
  });

  it('filters next-game vote options against the latest connected player count', () => {
    const manager = new RoomManager(io() as any, catalog); const host = identity('host', 'Host');
    const created = (manager as any).create(socket('host-socket'), host, 10); const room = manager.store.get(created.room.code)!;
    for (let index = 1; index <= 8; index += 1) {
      const guest = identity(`guest-${index}`, `Guest ${index}`);
      (manager as any).join(socket(`guest-socket-${index}`), guest, room.code);
    }
    room.gameSelectionMode = { type: 'VOTE', gameIds: ['pokemon-bingo', 'whos-that-pokemon', 'pokedex-distance', 'higher-lower', 'shiny-vote'] };

    expect((manager as any).beginNextGameVote(room)).toBe(true);
    expect(new Set(room.nextGameVote?.optionGameIds)).toEqual(new Set(['pokedex-distance', 'higher-lower', 'shiny-vote']));
  });

  it('rejects a vote when a new connection makes its minigame incompatible', () => {
    const manager = new RoomManager(io() as any, catalog); const host = identity('host', 'Host');
    const created = (manager as any).create(socket('host-socket'), host, 10); const room = manager.store.get(created.room.code)!;
    for (let index = 1; index <= 7; index += 1) {
      const guest = identity(`guest-${index}`, `Guest ${index}`);
      (manager as any).join(socket(`guest-socket-${index}`), guest, room.code);
    }
    room.gameSelectionMode = { type: 'VOTE', gameIds: ['pokemon-bingo', 'whos-that-pokemon', 'zoomed-pokemon'] };
    expect((manager as any).beginNextGameVote(room)).toBe(true);

    const ninthPlayer = identity('guest-8', 'Guest 8');
    (manager as any).join(socket('guest-socket-8'), ninthPlayer, room.code);

    expect(() => (manager as any).voteNextGame(host.id, 'pokemon-bingo')).toThrow(/ya no admite el número actual/);
  });

  it('keeps a finished session terminal when a stale game timer fires', () => {
    const manager = new RoomManager(io() as any, catalog); const host = identity('host', 'Host');
    const created = (manager as any).create(socket('host-socket'), host, 8); const room = manager.store.get(created.room.code)!;
    (manager as any).selectGame(host.id, 'higher-lower');
    (manager as any).updateConfig(host.id, { generations: [1], categories: ['ATTACK'], showPreviousValue: true, answerVisibility: 'REALTIME', difficulty: 'NORMAL', roundSeconds: 10, rounds: 1 });
    startReady(manager, room, host.id);
    (manager as any).action(host.id, { type: 'ANSWER', choice: 'HIGHER' });
    room.game!.state.nextTransitionAt = 0; (manager as any).tick(room);
    expect(room.phase).toBe('GAME_RESULTS');

    (manager as any).endSession(host.id);
    (manager as any).tick(room);

    expect(room.phase).toBe('SESSION_RESULTS');
  });

  it('runs a private next-game vote, closes early and starts the winner after reveal', () => {
    vi.useFakeTimers(); vi.setSystemTime(50_000);
    const manager = new RoomManager(io() as any, catalog);
    const host = identity('host', 'Host'); const guest = identity('guest', 'Ana');
    const created = (manager as any).create(socket('host-socket'), host, 8); const room = manager.store.get(created.room.code)!;
    (manager as any).join(socket('guest-socket'), guest, room.code);
    (manager as any).selectGame(host.id, 'higher-lower');
    (manager as any).updateConfig(host.id, { generations: [1], categories: ['ATTACK'], showPreviousValue: true, answerVisibility: 'REALTIME', difficulty: 'NORMAL', roundSeconds: 10, rounds: 1 });
    (manager as any).updateGameSelection(host.id, { type: 'VOTE', gameIds: ['higher-lower', 'shiny-vote', 'pokemon-bingo'] });
    startReady(manager, room, host.id);
    (manager as any).action(host.id, { type: 'ANSWER', choice: 'HIGHER' });
    (manager as any).action(guest.id, { type: 'ANSWER', choice: 'LOWER' });
    room.game!.state.nextTransitionAt = 0; (manager as any).tick(room);

    expect(room.phase).toBe('GAME_RESULTS');
    expect(room.nextGameVote).toBeNull();
    expect((manager as any).view(room, guest.id).game.results.standings).toHaveLength(2);
    (manager as any).continueSession(host.id);
    expect(room.phase).toBe('NEXT_GAME_VOTE');
    expect(room.nextGameVote?.optionGameIds).toHaveLength(3);
    expect((manager as any).view(room, guest.id).nextGameVote).toMatchObject({ ownVoteGameId: null, tallies: null, votedPlayerIds: [] });

    const [hostChoice, guestChoice] = room.nextGameVote!.optionGameIds;
    (manager as any).voteNextGame(host.id, hostChoice);
    expect((manager as any).view(room, host.id).nextGameVote.ownVoteGameId).toBe(hostChoice);
    expect((manager as any).view(room, guest.id).nextGameVote).toMatchObject({ ownVoteGameId: null, tallies: null, votedPlayerIds: [host.id] });
    (manager as any).disconnect(host.id, 'host-socket');
    const restoredHostSocket = socket('host-restored');
    (manager as any).restore(restoredHostSocket, host);
    expect(restoredHostSocket.emit).toHaveBeenCalledWith('session:restored', expect.objectContaining({ nextGameVote: expect.objectContaining({ ownVoteGameId: hostChoice }) }));
    (manager as any).voteNextGame(guest.id, guestChoice);

    expect(room.phase).toBe('NEXT_GAME_VOTE_RESULTS');
    expect(room.nextGameVote?.tallies).toMatchObject({ [hostChoice!]: 1, [guestChoice!]: 1 });
    expect([hostChoice, guestChoice]).toContain(room.nextGameVote?.resolvedGameId);

    const winner = room.nextGameVote?.resolvedGameId;
    vi.advanceTimersByTime(3_005);
    expect(room.phase).not.toBe('LOBBY');
    expect(room.game?.gameId).toBe(winner);
    expect(room.nextGameVote).toBeNull();
  });

  it('resolves the next-game vote after 15 seconds even when players abstain', () => {
    vi.useFakeTimers(); vi.setSystemTime(80_000);
    const manager = new RoomManager(io() as any, catalog);
    const host = identity('host', 'Host'); const guest = identity('guest', 'Ana');
    const created = (manager as any).create(socket('host-socket'), host, 8); const room = manager.store.get(created.room.code)!;
    (manager as any).join(socket('guest-socket'), guest, room.code);
    room.gameSelectionMode = { type: 'VOTE', gameIds: ['higher-lower', 'shiny-vote', 'pokemon-bingo'] };
    (manager as any).beginNextGameVote(room);
    (manager as any).schedule(room);

    vi.advanceTimersByTime(15_005);

    expect(room.phase).toBe('NEXT_GAME_VOTE_RESULTS');
    expect(room.nextGameVote?.resolvedGameId).toBeTruthy();
    expect(Object.values(room.nextGameVote?.tallies ?? {})).toEqual([0, 0, 0]);
  });

  it('expires an active identity without losing historical game data or blocking the round', () => {
    vi.useFakeTimers(); vi.setSystemTime(20_000);
    const manager = new RoomManager(io() as any, catalog);
    const people = [identity('host', 'Host'), identity('ana', 'Ana'), identity('carlos', 'Carlos')];
    const sockets = people.map((person) => socket(`socket-${person.id}`));
    const created = (manager as any).create(sockets[0], people[0], 8); const room = manager.store.get(created.room.code)!;
    (manager as any).join(sockets[1], people[1], room.code); (manager as any).join(sockets[2], people[2], room.code);
    (manager as any).updateConfig('host', { generations: [1], roundSeconds: 60 });
    startReady(manager, room, 'host');
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

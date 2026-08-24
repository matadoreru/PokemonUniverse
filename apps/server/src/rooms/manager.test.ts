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

    expect(created.room.availableGames.map((game: { id: string }) => game.id)).toEqual(['pokedex-distance', 'shiny-vote', 'pokemon-impostor', 'higher-lower', 'type-duel', 'learnset-guess', 'pokeddle-race', 'pokemon-bingo', 'whos-that-pokemon', 'pokedex-entry-guess', 'type-chain', 'guess-from-stats', 'zoomed-pokemon']);
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
    expect(created.room.availableGames).toHaveLength(13);
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
    (manager as any).startGame(nextHost.id);
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
    (manager as any).updateConfig(host.id, { generations: [1], categories: ['ATTACK'], showPreviousValue: true, answerVisibility: 'REALTIME', difficulty: 'NORMAL', roundSeconds: 10, rounds: 1 });
    (manager as any).startGame(host.id); (manager as any).action(host.id, { type: 'ANSWER', choice: 'HIGHER' }); (manager as any).action(guest.id, { type: 'ANSWER', choice: 'LOWER' });
    room.game!.state.nextTransitionAt = 0; (manager as any).tick(room); expect(room.phase).toBe('GAME_RESULTS'); (manager as any).returnLobby(host.id);
    (manager as any).selectGame(host.id, 'type-duel'); (manager as any).updateConfig(host.id, { generations: [1], typeSelectSeconds: 5, searchSeconds: 10, rounds: 1 }); (manager as any).startGame(host.id);
    const [first, second] = room.game!.state.participants; (manager as any).action(first, { type: 'SELECT_TYPE', pokemonType: 'fire' }); (manager as any).action(second, { type: 'SELECT_TYPE', pokemonType: 'water' });
    room.game!.state.nextTransitionAt = 0; (manager as any).tick(room); (manager as any).action(first, { type: 'ATTEMPT_POKEMON', pokemonId: 'pokemon-3' });
    room.game!.state.nextTransitionAt = 0; (manager as any).tick(room); expect(room.phase).toBe('GAME_RESULTS'); (manager as any).returnLobby(host.id);
    (manager as any).selectGame(host.id, 'learnset-guess');
    (manager as any).updateConfig(host.id, { generations: [1], showLevels: true, showEvolution: true, roundSeconds: 20, rounds: 1 });
    (manager as any).startGame(host.id); const answerId = room.game!.state.correctPokemonId;
    expect(JSON.stringify((manager as any).view(room, guest.id))).not.toContain('correctPokemonId');
    (manager as any).action(host.id, { type: 'GUESS_POKEMON', pokemonId: answerId });
    const guestView = (manager as any).view(room, guest.id); expect(guestView.game.solvedPlayerIds).toEqual([host.id]); expect(JSON.stringify(guestView.game)).not.toContain(answerId);
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
    (manager as any).startGame(host.id);
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
    (manager as any).startGame(host.id); expect(room.game?.gameId).toBe('pokemon-bingo'); expect(room.phase).toBe('ROUND_ACTIVE');
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
    (manager as any).startGame(host.id); const targetId = room.game!.state.targetPokemonId; const wrongId = pokemon.find((entry) => entry.id !== targetId)!.id;
    const activeView = (manager as any).view(room, guest.id);
    expect(activeView.game).toMatchObject({ gameId: 'whos-that-pokemon', visibleHints: [], solvedPlayerIds: [] });
    expect(activeView.game.silhouetteSprite).toMatch(/\/options\/shadow\/sprite$/);
    expect(JSON.stringify(activeView)).not.toContain(targetId);
    expect(manager.gameAsset(room.code, room.game!.state.assetToken, 1, 'shadow')).toMatchObject({ transform: 'SILHOUETTE' });
    expect(manager.gameAsset(room.code, room.game!.state.assetToken, 1, 'reveal')).toBeNull();

    (manager as any).action(guest.id, { type: 'GUESS_POKEMON', pokemonId: wrongId });
    expect((manager as any).view(room, host.id).game.attempts[0]).toMatchObject({ playerId: guest.id, guessedPokemon: { id: wrongId } });
    room.game!.state.cooldownUntil.guest = 0;
    (manager as any).action(host.id, { type: 'GUESS_POKEMON', pokemonId: targetId });
    const stillHidden = (manager as any).view(room, guest.id); expect(stillHidden.game.solvedPlayerIds).toEqual([host.id]); expect(JSON.stringify(stillHidden.game)).not.toContain(targetId);
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
    (manager as any).startGame(host.id); const targetId = room.game!.state.roundDeck[0].pokemonId; const wrongId = pokemon.find((entry) => entry.id !== targetId)!.id;
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
    (manager as any).startGame(host.id);

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
    (manager as any).updateConfig(host.id, { ...defaults, generations: [1], roundSeconds: 30, rounds: 1 }); (manager as any).startGame(host.id);
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
    (manager as any).startGame(host.id); const targetId = room.game!.state.targetPokemonId as string;
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

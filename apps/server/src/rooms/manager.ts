import { gameRegistry, roomCodeSchema, sessionModeSchema, type AuthUser, type ClientToServerEvents, type PokemonCatalog, type RoomView, type ServerToClientEvents, type SocketAck } from '@pokemon-universe/shared';
import { randomInt } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { env } from '../config.js';
import { persistGameResults } from '../stats/service.js';
import { InMemoryRoomStore } from './store.js';
import type { LiveRoom, RoomMember } from './types.js';

type GameServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, { identity: AuthUser }>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, { identity: AuthUser }>;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function roomCode(): string {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
}

export class RoomManager {
  readonly store = new InMemoryRoomStore();
  constructor(private readonly io: GameServer, private readonly pokemon: PokemonCatalog) {}

  bind(socket: GameSocket): void {
    const identity = socket.data.identity;
    this.restore(socket, identity);
    socket.on('room:create', (payload, ack) => this.guard(ack, () => this.create(socket, identity, payload.maxPlayers)));
    socket.on('room:join', (payload, ack) => this.guard(ack, () => this.join(socket, identity, payload.code)));
    socket.on('room:leave', (_payload, ack) => this.guard(ack, () => this.leave(socket, identity.id)));
    socket.on('room:select-game', (payload, ack) => this.guard(ack, () => this.selectGame(identity.id, payload.gameId)));
    socket.on('room:update-config', (payload, ack) => this.guard(ack, () => this.updateConfig(identity.id, payload.config)));
    socket.on('room:update-session', (payload, ack) => this.guard(ack, () => this.updateSession(identity.id, payload.mode)));
    socket.on('room:kick', (payload, ack) => this.guard(ack, () => this.kick(identity.id, payload.playerId)));
    socket.on('room:start-game', (_payload, ack) => this.guard(ack, () => this.startGame(identity.id)));
    socket.on('room:return-lobby', (_payload, ack) => this.guard(ack, () => this.returnLobby(identity.id)));
    socket.on('room:end-session', (_payload, ack) => this.guard(ack, () => this.endSession(identity.id)));
    socket.on('game:action', (payload, ack) => this.guard(ack, () => this.action(identity.id, payload)));
    socket.on('disconnect', () => this.disconnect(identity.id, socket.id));
  }

  private guard<T = Record<string, never>>(ack: SocketAck<T>, operation: () => T): void {
    try { ack({ ok: true, ...operation() }); } catch (error) { ack({ ok: false, error: error instanceof Error ? error.message : 'Unexpected error' }); }
  }

  private restore(socket: GameSocket, identity: AuthUser): void {
    const room = this.store.roomForPlayer(identity.id);
    const member = room?.members.get(identity.id);
    if (!room || !member) return;
    if (member.disconnectTimer) clearTimeout(member.disconnectTimer);
    member.disconnectTimer = null; member.connected = true; member.socketId = socket.id;
    const host = room.members.get(room.hostId);
    if (host && !host.connected && !host.disconnectTimer) this.transferHost(room);
    void socket.join(room.code);
    socket.emit('session:restored', this.view(room));
    this.broadcast(room);
  }

  private create(socket: GameSocket, identity: AuthUser, requestedMax?: number): { room: RoomView } {
    if (this.store.roomForPlayer(identity.id)) throw new Error('Already in a room');
    let code = roomCode(); while (this.store.get(code)) code = roomCode();
    const module = gameRegistry.list()[0]!;
    const desiredMax = requestedMax ?? env.ROOM_MAX_PLAYERS;
    if (!Number.isInteger(desiredMax) || desiredMax < 2) throw new Error('Room capacity must be an integer of at least 2');
    const maxPlayers = Math.min(desiredMax, 100);
    const room: LiveRoom = {
      code, hostId: identity.id, phase: 'LOBBY', members: new Map(), maxPlayers,
      selectedGameId: module.manifest.id, gameConfig: module.defaultConfig,
      sessionMode: { type: 'INFINITE' }, gamesPlayed: 0, game: null, transitionTimer: null,
    };
    room.members.set(identity.id, this.member(identity, socket.id, 'PLAYER'));
    this.store.save(room); this.store.attachPlayer(identity.id, code); void socket.join(code);
    return { room: this.view(room) };
  }

  private join(socket: GameSocket, identity: AuthUser, rawCode: string): { room: RoomView } {
    const code = roomCodeSchema.parse(rawCode);
    const existing = this.store.roomForPlayer(identity.id);
    if (existing && existing.code !== code) throw new Error('Leave your current room first');
    const room = this.store.get(code); if (!room) throw new Error('Room not found');
    const current = room.members.get(identity.id);
    if (!current && room.members.size >= room.maxPlayers) throw new Error('Room is full');
    if (current) {
      if (current.disconnectTimer) clearTimeout(current.disconnectTimer);
      current.connected = true; current.socketId = socket.id; current.disconnectTimer = null;
    } else {
      room.members.set(identity.id, this.member(identity, socket.id, room.phase === 'LOBBY' ? 'PLAYER' : 'SPECTATOR'));
      this.store.attachPlayer(identity.id, room.code);
    }
    void socket.join(room.code); this.broadcast(room);
    return { room: this.view(room) };
  }

  private member(identity: AuthUser, socketId: string, role: 'PLAYER' | 'SPECTATOR'): RoomMember {
    return { identity, avatarSeed: identity.displayName, connected: true, socketId, role, sessionPoints: 0, joinedAt: Date.now(), disconnectTimer: null };
  }

  private leave(socket: GameSocket, playerId: string): Record<string, never> {
    const room = this.requiredRoom(playerId);
    void socket.leave(room.code);
    this.finalDisconnect(room, playerId, true);
    return {};
  }

  private disconnect(playerId: string, socketId: string): void {
    const room = this.store.roomForPlayer(playerId); const member = room?.members.get(playerId);
    if (!room || !member || member.socketId !== socketId) return;
    member.connected = false; member.socketId = null;
    this.broadcast(room);
    member.disconnectTimer = setTimeout(() => this.finalDisconnect(room, playerId, false), env.RECONNECT_GRACE_MS);
  }

  private finalDisconnect(room: LiveRoom, playerId: string, explicit: boolean): void {
    const member = room.members.get(playerId); if (!member) return;
    if (!explicit && member.connected) return;
    member.disconnectTimer = null;
    const retainedByLiveGame = room.game && room.phase !== 'GAME_RESULTS' && room.phase !== 'SESSION_RESULTS' && member.role === 'PLAYER';
    if (!retainedByLiveGame) room.members.delete(playerId);
    this.store.detachPlayer(playerId);
    if (room.hostId === playerId) this.transferHost(room);
    if (room.members.size === 0) { if (room.transitionTimer) clearTimeout(room.transitionTimer); this.store.delete(room.code); return; }
    this.broadcast(room);
  }

  private transferHost(room: LiveRoom): void {
    const next = [...room.members.values()].filter((member) => member.connected).sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (next) room.hostId = next.identity.id;
  }

  private selectGame(playerId: string, gameId: string): Record<string, never> {
    const room = this.hostRoom(playerId); this.assertLobby(room);
    const module = gameRegistry.get(gameId); if (!module) throw new Error('Unknown game');
    room.selectedGameId = gameId; room.gameConfig = module.defaultConfig; this.broadcast(room); return {};
  }

  private updateConfig(playerId: string, config: unknown): Record<string, never> {
    const room = this.hostRoom(playerId); this.assertLobby(room);
    const module = gameRegistry.get(room.selectedGameId)!; room.gameConfig = module.configSchema.parse(config); this.broadcast(room); return {};
  }

  private updateSession(playerId: string, mode: unknown): Record<string, never> {
    const room = this.hostRoom(playerId); this.assertLobby(room); room.sessionMode = sessionModeSchema.parse(mode); this.broadcast(room); return {};
  }

  private kick(hostId: string, playerId: string): Record<string, never> {
    const room = this.hostRoom(hostId); this.assertLobby(room);
    if (playerId === hostId) throw new Error('Host cannot kick themselves');
    const member = room.members.get(playerId); if (!member) throw new Error('Player not found');
    if (member.socketId) this.io.to(member.socketId).emit('room:kicked', 'El host te ha expulsado de la sala.');
    room.members.delete(playerId); this.store.detachPlayer(playerId); this.broadcast(room); return {};
  }

  private startGame(playerId: string): Record<string, never> {
    const room = this.hostRoom(playerId); this.assertLobby(room);
    for (const [id, member] of room.members) if (!member.connected) { room.members.delete(id); this.store.detachPlayer(id); }
    const players = [...room.members.values()].filter((member) => member.connected).map((member) => ({ id: member.identity.id, displayName: member.identity.displayName }));
    const module = gameRegistry.get(room.selectedGameId)!;
    if (players.length < module.manifest.minPlayers) throw new Error(`Se necesitan al menos ${module.manifest.minPlayers} jugadores.`);
    const context = { players, pokemon: this.pokemon, now: Date.now(), random: Math.random, roomCode: room.code };
    let state = module.createInitialState(module.configSchema.parse(room.gameConfig), context);
    state = module.start(state, context);
    for (const member of room.members.values()) member.role = 'PLAYER';
    room.game = { module, state, startedAt: context.now, resultsApplied: false };
    room.phase = state.phase; this.syncAndBroadcast(room); return {};
  }

  /** Synchronous mutation is the per-room critical section: no await occurs before a selection is committed. */
  private action(playerId: string, payload: unknown): Record<string, never> {
    const room = this.requiredRoom(playerId); const game = room.game;
    if (!game) throw new Error('No game in progress');
    const context = this.context(room);
    const action = game.module.actionSchema.parse(payload);
    const result = game.module.handleAction(game.state, playerId, action, context);
    game.state = result.state;
    if (!result.accepted) throw new Error(result.error ?? 'Action rejected');
    this.syncAndBroadcast(room); return {};
  }

  private tick(room: LiveRoom): void {
    if (!room.game) return;
    room.game.state = room.game.module.handleTimeout(room.game.state, this.context(room));
    this.syncAndBroadcast(room);
  }

  private syncAndBroadcast(room: LiveRoom): void {
    const game = room.game; if (!game) return;
    room.phase = game.state.phase;
    const spectators = new Set<string>(game.state.spectatorIds ?? []);
    for (const member of room.members.values()) if (spectators.has(member.identity.id)) member.role = 'SPECTATOR';
    if (game.module.isFinished(game.state) && !game.resultsApplied) this.finishGame(room);
    this.broadcast(room); this.schedule(room);
  }

  private finishGame(room: LiveRoom): void {
    const game = room.game!; game.resultsApplied = true; room.gamesPlayed += 1;
    const results = game.module.getResults(game.state);
    for (const standing of results.standings) {
      const member = room.members.get(standing.playerId); if (member) member.sessionPoints += standing.points;
    }
    const mode = room.sessionMode;
    const sessionFinished = mode.type === 'GAME_COUNT' ? room.gamesPlayed >= mode.target
      : mode.type === 'POINT_TARGET' ? [...room.members.values()].some((member) => member.sessionPoints >= mode.target)
      : false;
    room.phase = sessionFinished ? 'SESSION_RESULTS' : 'GAME_RESULTS';
    void persistGameResults(room, results, game.startedAt).catch((error) => console.error('Failed to persist game results', error));
  }

  private returnLobby(playerId: string): Record<string, never> {
    const room = this.hostRoom(playerId);
    if (room.phase !== 'GAME_RESULTS' && room.phase !== 'SESSION_RESULTS') throw new Error('Game has not finished');
    const resetSession = room.phase === 'SESSION_RESULTS';
    for (const [id, member] of room.members) {
      if (!member.connected) { room.members.delete(id); this.store.detachPlayer(id); continue; }
      member.role = 'PLAYER'; if (resetSession) member.sessionPoints = 0;
    }
    if (resetSession) room.gamesPlayed = 0;
    room.game = null; room.phase = 'LOBBY'; this.broadcast(room); return {};
  }

  private endSession(playerId: string): Record<string, never> {
    const room = this.hostRoom(playerId);
    if (room.phase !== 'LOBBY' && room.phase !== 'GAME_RESULTS') throw new Error('Cannot end the session during a game');
    room.phase = 'SESSION_RESULTS'; this.broadcast(room); return {};
  }

  private schedule(room: LiveRoom): void {
    if (room.transitionTimer) clearTimeout(room.transitionTimer);
    const state = room.game?.state; if (!state || room.phase === 'GAME_RESULTS' || room.phase === 'SESSION_RESULTS') return;
    const deadline = state.roundEndsAt ?? state.nextTransitionAt;
    if (typeof deadline !== 'number') return;
    room.transitionTimer = setTimeout(() => this.tick(room), Math.max(0, deadline - Date.now() + 5));
  }

  private context(room: LiveRoom) {
    return { players: [...room.members.values()].map((member) => ({ id: member.identity.id, displayName: member.identity.displayName })), pokemon: this.pokemon, now: Date.now(), random: Math.random, roomCode: room.code };
  }

  shinyOptionSprite(code: string, assetToken: string, roundNumber: number, optionId: string): string | null {
    const room = this.store.get(code);
    const state = room?.game?.state;
    if (!room || room.selectedGameId !== 'shiny-vote' || !state || state.assetToken !== assetToken || state.roundNumber !== roundNumber) return null;
    const option = state.options?.find((entry: { id: string }) => entry.id === optionId);
    return typeof option?.sprite === 'string' ? option.sprite : null;
  }

  private view(room: LiveRoom): RoomView {
    return {
      code: room.code, phase: room.phase, hostId: room.hostId, maxPlayers: room.maxPlayers,
      members: [...room.members.values()].map((member) => ({
        id: member.identity.id, displayName: member.identity.displayName, avatarSeed: member.avatarSeed,
        connected: member.connected, role: member.role, isHost: member.identity.id === room.hostId, sessionPoints: member.sessionPoints,
      })),
      selectedGameId: room.selectedGameId, gameConfig: room.gameConfig, sessionMode: room.sessionMode,
      gamesPlayed: room.gamesPlayed,
      game: room.game ? room.game.module.getPublicState(room.game.state, this.context(room)) : null,
      serverNow: Date.now(),
    };
  }

  private broadcast(room: LiveRoom): void { this.io.to(room.code).emit('room:state', this.view(room)); }
  private requiredRoom(playerId: string): LiveRoom { const room = this.store.roomForPlayer(playerId); if (!room) throw new Error('Not in a room'); return room; }
  private hostRoom(playerId: string): LiveRoom { const room = this.requiredRoom(playerId); if (room.hostId !== playerId) throw new Error('Only the host can do that'); return room; }
  private assertLobby(room: LiveRoom): void { if (room.phase !== 'LOBBY') throw new Error('This setting can only be changed in the lobby'); }
}

import { assignableRoomRoleSchema, gameRegistry, hasRoomPermission, roomCodeSchema, sessionModeSchema, type AssignableRoomRole, type AuthUser, type AvatarRef, type ClientToServerEvents, type PokemonCatalog, type RoomPermission, type RoomRole, type RoomView, type ServerToClientEvents, type SocketAck } from '@pokemon-universe/shared';
import { randomInt, randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { env } from '../config.js';
import { preloadGameImage } from '../http/game-image-cache.js';
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
    socket.on('room:set-role', (payload, ack) => this.guard(ack, () => this.setRoomRole(identity.id, payload.playerId, payload.role)));
    socket.on('room:transfer-host', (payload, ack) => this.guard(ack, () => this.transferHostManually(identity.id, payload.playerId)));
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
    member.identity = identity; member.disconnectTimer = null; member.connected = true; member.presence = 'CONNECTED'; member.socketId = socket.id;
    const host = room.members.get(room.hostId);
    if (host && !host.connected && !host.disconnectTimer) this.transferHost(room);
    void socket.join(room.code);
    socket.emit('session:restored', this.view(room, identity.id));
    this.applyPresenceChange(room);
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
      selectedGameId: module.manifest.id,
      gameConfigs: new Map(gameRegistry.list().map((game) => [game.manifest.id, game.configSchema.parse(game.defaultConfig)])),
      sessionMode: { type: 'INFINITE' }, gamesPlayed: 0, game: null, transitionTimer: null,
    };
    room.members.set(identity.id, this.member(identity, socket.id, 'PLAYER', 'HOST'));
    this.store.save(room); this.store.attachPlayer(identity.id, code); void socket.join(code);
    return { room: this.view(room, identity.id) };
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
      const expiredDuringGame = current.presence === 'LEFT' && room.game !== null;
      current.connected = true;
      current.identity = identity;
      current.presence = 'CONNECTED';
      current.socketId = socket.id;
      current.disconnectTimer = null;
      if (expiredDuringGame) current.role = 'SPECTATOR';
      this.store.attachPlayer(identity.id, room.code);
    } else {
      room.members.set(identity.id, this.member(identity, socket.id, room.phase === 'LOBBY' ? 'PLAYER' : 'SPECTATOR', 'MEMBER'));
      this.store.attachPlayer(identity.id, room.code);
    }
    void socket.join(room.code); this.applyPresenceChange(room);
    return { room: this.view(room, identity.id) };
  }

  private member(identity: AuthUser, socketId: string, role: 'PLAYER' | 'SPECTATOR', roomRole: RoomRole): RoomMember {
    return { identity, connected: true, presence: 'CONNECTED', roomRole, socketId, role, sessionPoints: 0, joinedAt: Date.now(), disconnectTimer: null };
  }

  updateIdentityAvatar(userId: string, avatar: AvatarRef): void {
    const room = this.store.roomForPlayer(userId); const member = room?.members.get(userId);
    if (!room || !member) return;
    member.identity = { ...member.identity, avatar }; this.broadcast(room);
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
    member.connected = false; member.presence = 'TEMPORARILY_DISCONNECTED'; member.socketId = null;
    this.applyPresenceChange(room);
    member.disconnectTimer = setTimeout(() => this.finalDisconnect(room, playerId, false), env.RECONNECT_GRACE_MS);
  }

  private finalDisconnect(room: LiveRoom, playerId: string, explicit: boolean): void {
    const member = room.members.get(playerId); if (!member) return;
    if (!explicit && member.connected) return;
    member.disconnectTimer = null;
    member.connected = false;
    member.presence = 'LEFT';
    member.socketId = null;
    const historicalPlayerIds: unknown = room.game?.state.playerIds ?? room.game?.state.initialPlayerIds;
    const retainedByLiveGame = room.game
      && room.phase !== 'GAME_RESULTS'
      && room.phase !== 'SESSION_RESULTS'
      && Array.isArray(historicalPlayerIds)
      && historicalPlayerIds.includes(playerId);
    if (!retainedByLiveGame) room.members.delete(playerId);
    this.store.detachPlayer(playerId);
    if (room.hostId === playerId) this.transferHost(room);
    if (![...room.members.values()].some((candidate) => candidate.presence !== 'LEFT')) { if (room.transitionTimer) clearTimeout(room.transitionTimer); this.store.delete(room.code); return; }
    this.applyPresenceChange(room);
  }

  private transferHost(room: LiveRoom): void {
    const next = [...room.members.values()].filter((member) => member.presence === 'CONNECTED').sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (!next) return;
    for (const member of room.members.values()) if (member.roomRole === 'HOST') member.roomRole = 'MEMBER';
    next.roomRole = 'HOST';
    room.hostId = next.identity.id;
  }

  private selectGame(playerId: string, gameId: string): Record<string, never> {
    const room = this.permissionRoom(playerId, 'CHANGE_GAME'); this.assertLobby(room);
    const module = gameRegistry.get(gameId); if (!module) throw new Error('Unknown game');
    room.selectedGameId = gameId;
    if (!room.gameConfigs.has(gameId)) room.gameConfigs.set(gameId, module.configSchema.parse(module.defaultConfig));
    this.broadcast(room); return {};
  }

  private updateConfig(playerId: string, config: unknown): Record<string, never> {
    const room = this.permissionRoom(playerId, 'EDIT_GAME_CONFIG'); this.assertLobby(room);
    const module = gameRegistry.get(room.selectedGameId)!;
    room.gameConfigs.set(room.selectedGameId, module.configSchema.parse(config));
    this.broadcast(room); return {};
  }

  private updateSession(playerId: string, mode: unknown): Record<string, never> {
    const room = this.permissionRoom(playerId, 'EDIT_SESSION'); this.assertLobby(room); room.sessionMode = sessionModeSchema.parse(mode); this.broadcast(room); return {};
  }

  private setRoomRole(actorId: string, playerId: string, requestedRole: AssignableRoomRole): Record<string, never> {
    const room = this.permissionRoom(actorId, 'MANAGE_ROLES'); this.assertLobby(room);
    const role = assignableRoomRoleSchema.parse(requestedRole);
    if (playerId === room.hostId) throw new Error('El Host no puede cambiar su propio rol.');
    const member = room.members.get(playerId); if (!member || member.presence === 'LEFT') throw new Error('Jugador no encontrado.');
    member.roomRole = role; this.broadcast(room); return {};
  }

  private transferHostManually(actorId: string, playerId: string): Record<string, never> {
    const room = this.permissionRoom(actorId, 'TRANSFER_HOST'); this.assertLobby(room);
    if (playerId === actorId) throw new Error('Ya eres el Host.');
    const target = room.members.get(playerId);
    if (!target || target.presence !== 'CONNECTED') throw new Error('Solo puedes transferir el Host a un jugador conectado.');
    const priorHost = room.members.get(room.hostId);
    if (priorHost) priorHost.roomRole = 'CO_HOST';
    target.roomRole = 'HOST'; room.hostId = playerId; this.broadcast(room); return {};
  }

  private kick(actorId: string, playerId: string): Record<string, never> {
    const room = this.permissionRoom(actorId, 'KICK_MEMBER'); this.assertLobby(room);
    if (playerId === actorId || playerId === room.hostId) throw new Error('El Host no puede expulsarse a sí mismo.');
    const member = room.members.get(playerId); if (!member) throw new Error('Player not found');
    if (member.socketId) this.io.to(member.socketId).emit('room:kicked', 'El host te ha expulsado de la sala.');
    room.members.delete(playerId); this.store.detachPlayer(playerId); this.broadcast(room); return {};
  }

  private startGame(playerId: string): Record<string, never> {
    const room = this.permissionRoom(playerId, 'START_GAME'); this.assertLobby(room);
    const players = [...room.members.values()].filter((member) => member.presence === 'CONNECTED').map((member) => ({ id: member.identity.id, displayName: member.identity.displayName, connected: true, active: true }));
    const module = gameRegistry.get(room.selectedGameId)!;
    if (players.length < module.manifest.minPlayers) throw new Error(`Se necesitan al menos ${module.manifest.minPlayers} jugadores.`);
    const context = { players, pokemon: this.pokemon, now: Date.now(), random: Math.random, roomCode: room.code, hostId: room.hostId, preloadImage: preloadGameImage };
    const config = module.configSchema.parse(room.gameConfigs.get(room.selectedGameId));
    let state = module.createInitialState(config, context);
    state = module.start(state, context);
    for (const member of room.members.values()) member.role = member.presence === 'CONNECTED' ? 'PLAYER' : 'SPECTATOR';
    room.game = { resultId: randomUUID(), gameId: module.manifest.id, module, config, state, startedAt: context.now, resultsApplied: false };
    room.phase = state.phase; this.syncAndBroadcast(room); return {};
  }

  /** Synchronous mutation is the per-room critical section: no await occurs before a selection is committed. */
  private action(playerId: string, payload: unknown): Record<string, never> {
    const room = this.requiredRoom(playerId); const game = room.game;
    if (!game) throw new Error('No game in progress');
    const member = room.members.get(playerId);
    if (!member || member.presence !== 'CONNECTED' || member.role !== 'PLAYER') throw new Error('You cannot act in the current game');
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

  private applyPresenceChange(room: LiveRoom): void {
    const game = room.game;
    if (game?.module.handlePresenceChange) {
      game.state = game.module.handlePresenceChange(game.state, this.context(room));
      this.syncAndBroadcast(room);
      return;
    }
    this.broadcast(room);
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
    void persistGameResults(room, results, game.resultId, game.startedAt, game.gameId, game.config).catch((error) => console.error('Failed to persist game results', error));
  }

  private returnLobby(playerId: string): Record<string, never> {
    const room = this.permissionRoom(playerId, 'START_GAME');
    if (room.phase !== 'GAME_RESULTS' && room.phase !== 'SESSION_RESULTS') throw new Error('Game has not finished');
    const resetSession = room.phase === 'SESSION_RESULTS';
    for (const [id, member] of room.members) {
      if (member.presence === 'LEFT') { room.members.delete(id); this.store.detachPlayer(id); continue; }
      member.role = 'PLAYER'; if (resetSession) member.sessionPoints = 0;
    }
    if (resetSession) room.gamesPlayed = 0;
    room.game = null; room.phase = 'LOBBY'; this.broadcast(room); return {};
  }

  private endSession(playerId: string): Record<string, never> {
    const room = this.permissionRoom(playerId, 'END_SESSION');
    if (room.phase !== 'LOBBY' && room.phase !== 'GAME_RESULTS') throw new Error('Cannot end the session during a game');
    room.phase = 'SESSION_RESULTS'; this.broadcast(room); return {};
  }

  private schedule(room: LiveRoom): void {
    if (room.transitionTimer) clearTimeout(room.transitionTimer);
    const state = room.game?.state; if (!state || room.phase === 'GAME_RESULTS' || room.phase === 'SESSION_RESULTS') return;
    const deadlines = [state.roundEndsAt, state.nextTransitionAt].filter((value): value is number => typeof value === 'number');
    if (!deadlines.length) return;
    const deadline = Math.min(...deadlines);
    room.transitionTimer = setTimeout(() => this.tick(room), Math.max(0, deadline - Date.now() + 5));
  }

  private context(room: LiveRoom) {
    return { players: [...room.members.values()].map((member) => ({
      id: member.identity.id,
      displayName: member.identity.displayName,
      connected: member.presence === 'CONNECTED',
      active: member.role === 'PLAYER' && member.presence !== 'LEFT',
    })), pokemon: this.pokemon, now: Date.now(), random: Math.random, roomCode: room.code, hostId: room.hostId, preloadImage: preloadGameImage };
  }

  gameAsset(code: string, assetToken: string, roundNumber: number, assetId: string): string | null {
    const room = this.store.get(code);
    const game = room?.game;
    if (!room || !game?.module.resolveAsset) return null;
    return game.module.resolveAsset(game.state, { assetToken, roundNumber, assetId }, this.context(room));
  }

  private view(room: LiveRoom, playerId: string): RoomView {
    const context = this.context(room);
    return {
      code: room.code, phase: room.phase, hostId: room.hostId, maxPlayers: room.maxPlayers,
      members: [...room.members.values()].map((member) => ({
        id: member.identity.id, displayName: member.identity.displayName, avatar: member.identity.avatar,
        connected: member.connected, presence: member.presence, roomRole: member.roomRole, role: member.role, isHost: member.identity.id === room.hostId, sessionPoints: member.sessionPoints,
      })),
      availableGames: gameRegistry.manifests(),
      selectedGameId: room.selectedGameId, selectedGameConfig: room.gameConfigs.get(room.selectedGameId), sessionMode: room.sessionMode,
      gamesPlayed: room.gamesPlayed,
      game: room.game ? room.game.module.getPublicState(room.game.state, context) : null,
      gamePlayerState: room.game ? room.game.module.getPlayerState(room.game.state, playerId, context) : null,
      serverNow: Date.now(),
    };
  }

  private broadcast(room: LiveRoom): void {
    for (const member of room.members.values()) {
      if (member.socketId) this.io.to(member.socketId).emit('room:state', this.view(room, member.identity.id));
    }
  }
  private requiredRoom(playerId: string): LiveRoom { const room = this.store.roomForPlayer(playerId); if (!room) throw new Error('Not in a room'); return room; }
  private permissionRoom(playerId: string, permission: RoomPermission): LiveRoom {
    const room = this.requiredRoom(playerId); const member = room.members.get(playerId);
    if (!member || !hasRoomPermission(member.roomRole, permission)) throw new Error('No tienes permiso para realizar esta acción.');
    return room;
  }
  private assertLobby(room: LiveRoom): void { if (room.phase !== 'LOBBY') throw new Error('This setting can only be changed in the lobby'); }
}

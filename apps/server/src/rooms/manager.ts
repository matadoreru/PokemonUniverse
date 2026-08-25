import { assignableRoomRoleSchema, gameRegistry, gameSelectionModeSchema, hasRoomPermission, roomCodeSchema, sessionModeSchema, supportsPlayerCount, type AssignableRoomRole, type AuthUser, type AvatarRef, type ClientToServerEvents, type GameAssetResolution, type PokemonCatalog, type PokemonVisualCatalog, type RoomPermission, type RoomRole, type RoomView, type ServerToClientEvents, type SocketAck } from '@pokemon-universe/shared';
import { randomInt, randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { env } from '../config.js';
import { preloadGameImage } from '../http/game-image-cache.js';
import { persistGameResults } from '../stats/service.js';
import { InMemoryRoomStore } from './store.js';
import { gameRetainsPlayer, markLeft, markTemporarilyDisconnected, oldestConnectedMember, restoreMember } from './presence.js';
import { cancelTimer, earliestDeadline, scheduleDeadline } from './timers.js';
import type { LiveRoom, RoomMember } from './types.js';

type GameServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, { identity: AuthUser }>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, { identity: AuthUser }>;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const NEXT_GAME_VOTE_MS = 15_000;
const NEXT_GAME_VOTE_RESULT_MS = 3_000;

function roomCode(): string {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
}

export class RoomManager {
  readonly store = new InMemoryRoomStore();
  constructor(
    private readonly io: GameServer,
    private readonly pokemon: PokemonCatalog,
    private readonly pokemonVisuals: PokemonVisualCatalog = { artworkFor: () => null, artworkPokemonIds: () => [] },
  ) {}

  bind(socket: GameSocket): void {
    const identity = socket.data.identity;
    this.restore(socket, identity);
    const currentSocket = <T = Record<string, never>>(ack: SocketAck<T>, operation: () => T): void => {
      this.guard(ack, () => {
        this.assertActiveSocket(identity.id, socket.id);
        return operation();
      });
    };
    socket.on('room:create', (payload, ack) => this.guard(ack, () => this.create(socket, identity, payload.maxPlayers)));
    socket.on('room:join', (payload, ack) => this.guard(ack, () => this.join(socket, identity, payload.code)));
    socket.on('room:leave', (_payload, ack) => currentSocket(ack, () => this.leave(socket, identity.id)));
    socket.on('room:select-game', (payload, ack) => currentSocket(ack, () => this.selectGame(identity.id, payload.gameId)));
    socket.on('room:update-config', (payload, ack) => currentSocket(ack, () => this.updateConfig(identity.id, payload.config)));
    socket.on('room:update-session', (payload, ack) => currentSocket(ack, () => this.updateSession(identity.id, payload.mode)));
    socket.on('room:update-game-selection', (payload, ack) => currentSocket(ack, () => this.updateGameSelection(identity.id, payload.mode)));
    socket.on('room:vote-next-game', (payload, ack) => currentSocket(ack, () => this.voteNextGame(identity.id, payload.gameId)));
    socket.on('room:set-role', (payload, ack) => currentSocket(ack, () => this.setRoomRole(identity.id, payload.playerId, payload.role)));
    socket.on('room:transfer-host', (payload, ack) => currentSocket(ack, () => this.transferHostManually(identity.id, payload.playerId)));
    socket.on('room:kick', (payload, ack) => currentSocket(ack, () => this.kick(identity.id, payload.playerId)));
    socket.on('room:start-game', (_payload, ack) => currentSocket(ack, () => this.startGame(identity.id)));
    socket.on('room:continue-session', (_payload, ack) => currentSocket(ack, () => this.continueSession(identity.id)));
    socket.on('room:return-lobby', (_payload, ack) => currentSocket(ack, () => this.returnLobby(identity.id)));
    socket.on('room:end-session', (_payload, ack) => currentSocket(ack, () => this.endSession(identity.id)));
    socket.on('game:action', (payload, ack) => currentSocket(ack, () => this.action(identity.id, payload)));
    socket.on('disconnect', () => this.disconnect(identity.id, socket.id));
  }

  private guard<T = Record<string, never>>(ack: SocketAck<T> | undefined, operation: () => T): void {
    if (typeof ack !== 'function') return;
    try { ack({ ok: true, ...operation() }); } catch (error) { ack({ ok: false, error: error instanceof Error ? error.message : 'Unexpected error' }); }
  }

  private assertActiveSocket(playerId: string, socketId: string): void {
    const member = this.store.roomForPlayer(playerId)?.members.get(playerId);
    if (member && member.socketId !== socketId) throw new Error('Esta conexión ha sido reemplazada por una sesión más reciente.');
  }

  private restore(socket: GameSocket, identity: AuthUser): void {
    const room = this.store.roomForPlayer(identity.id);
    const member = room?.members.get(identity.id);
    if (!room || !member) return;
    restoreMember(member, identity, socket.id);
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
      sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'FIXED' }, nextGameVote: null,
      gamesPlayed: 0, game: null, transitionTimer: null,
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
      const expiredDuringGame = current.presence === 'LEFT' && room.game !== null;
      restoreMember(current, identity, socket.id);
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
    markTemporarilyDisconnected(member);
    this.applyPresenceChange(room);
    member.disconnectTimer = setTimeout(() => this.finalDisconnect(room, playerId, false), env.RECONNECT_GRACE_MS);
  }

  private finalDisconnect(room: LiveRoom, playerId: string, explicit: boolean): void {
    const member = room.members.get(playerId); if (!member) return;
    if (!explicit && member.connected) return;
    markLeft(member);
    const retainedByLiveGame = gameRetainsPlayer(room, playerId);
    if (!retainedByLiveGame) room.members.delete(playerId);
    this.store.detachPlayer(playerId);
    if (room.hostId === playerId) this.transferHost(room);
    if (![...room.members.values()].some((candidate) => candidate.presence !== 'LEFT')) { room.transitionTimer = cancelTimer(room.transitionTimer); this.store.delete(room.code); return; }
    this.applyPresenceChange(room);
  }

  private transferHost(room: LiveRoom): void {
    const next = oldestConnectedMember(room);
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

  private updateGameSelection(playerId: string, mode: unknown): Record<string, never> {
    const room = this.permissionRoom(playerId, 'EDIT_GAME_SELECTION'); this.assertLobby(room);
    const parsed = gameSelectionModeSchema.parse(mode);
    if (parsed.type !== 'FIXED') {
      const playerCount = this.connectedPlayerCount(room);
      for (const gameId of parsed.gameIds) {
        const game = gameRegistry.get(gameId); if (!game) throw new Error(`Minijuego desconocido: ${gameId}`);
        if (!supportsPlayerCount(game.manifest, playerCount)) throw new Error(`${game.manifest.name} no admite ${playerCount} jugadores conectados.`);
      }
    }
    room.gameSelectionMode = parsed; this.broadcast(room); return {};
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

  private randomItem<T>(items: readonly T[]): T {
    const item = items[Math.floor(Math.random() * items.length)];
    if (item === undefined) throw new Error('No hay minijuegos disponibles.');
    return item;
  }

  private shuffled<T>(items: readonly T[]): T[] {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
    }
    return result;
  }

  private connectedPlayerCount(room: LiveRoom): number {
    return [...room.members.values()].filter((member) => member.presence === 'CONNECTED').length;
  }

  private playableGameIds(room: LiveRoom, gameIds: readonly string[]): string[] {
    const playerCount = this.connectedPlayerCount(room);
    return gameIds.filter((gameId) => {
      const manifest = gameRegistry.get(gameId)?.manifest;
      return Boolean(manifest && supportsPlayerCount(manifest, playerCount));
    });
  }

  private assertRotationReady(room: LiveRoom): void {
    const mode = room.gameSelectionMode; if (mode.type === 'FIXED') return;
    const playableCount = this.playableGameIds(room, mode.gameIds).length;
    const minimum = mode.type === 'VOTE' ? 3 : 2;
    if (playableCount < minimum) throw new Error(`La rotación ${mode.type === 'VOTE' ? 'por votación' : 'aleatoria'} necesita al menos ${minimum} minijuegos compatibles con el número actual de jugadores.`);
  }

  private selectRandomGame(room: LiveRoom): void {
    if (room.gameSelectionMode.type !== 'RANDOM') return;
    const playable = this.playableGameIds(room, room.gameSelectionMode.gameIds);
    if (playable.length === 0) throw new Error('Ningún minijuego aleatorio admite el número actual de jugadores.');
    const alternatives = playable.filter((gameId) => gameId !== room.selectedGameId);
    room.selectedGameId = this.randomItem(alternatives.length > 0 ? alternatives : playable);
  }

  private startGame(playerId: string): Record<string, never> {
    const room = this.permissionRoom(playerId, 'START_GAME'); this.assertLobby(room);
    this.assertRotationReady(room);
    this.selectRandomGame(room);
    this.launchGame(room); return {};
  }

  private launchGame(room: LiveRoom): void {
    const players = [...room.members.values()].filter((member) => member.presence === 'CONNECTED').map((member) => ({ id: member.identity.id, displayName: member.identity.displayName, connected: true, active: true }));
    const module = gameRegistry.get(room.selectedGameId)!;
    if (players.length < module.manifest.minPlayers) throw new Error(`Se necesitan al menos ${module.manifest.minPlayers} jugadores.`);
    if (module.manifest.maxPlayers && players.length > module.manifest.maxPlayers) throw new Error(`Este juego admite un máximo de ${module.manifest.maxPlayers} jugadores.`);
    const context = { players, pokemon: this.pokemon, pokemonVisuals: this.pokemonVisuals, now: Date.now(), random: Math.random, roomCode: room.code, hostId: room.hostId, preloadImage: preloadGameImage };
    const config = module.configSchema.parse(room.gameConfigs.get(room.selectedGameId));
    let state = module.createInitialState(config, context);
    state = module.start(state, context);
    for (const member of room.members.values()) member.role = member.presence === 'CONNECTED' ? 'PLAYER' : 'SPECTATOR';
    room.game = { resultId: randomUUID(), gameId: module.manifest.id, participantIds: players.map((player) => player.id), module, config, state, startedAt: context.now, resultsApplied: false };
    room.phase = state.phase; this.syncAndBroadcast(room);
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

  private eligibleNextGameVoterIds(room: LiveRoom): string[] {
    return [...room.members.values()].filter((member) => member.presence === 'CONNECTED').map((member) => member.identity.id);
  }

  private beginNextGameVote(room: LiveRoom): boolean {
    if (room.gameSelectionMode.type !== 'VOTE') return false;
    const optionGameIds = this.shuffled(this.playableGameIds(room, room.gameSelectionMode.gameIds)).slice(0, 3);
    if (optionGameIds.length < 3) return false;
    room.nextGameVote = {
      optionGameIds,
      votes: {}, endsAt: Date.now() + NEXT_GAME_VOTE_MS, resolvedGameId: null, tallies: null, nextTransitionAt: null,
    };
    room.phase = 'NEXT_GAME_VOTE';
    return true;
  }

  private resolveNextGameVote(room: LiveRoom): void {
    const vote = room.nextGameVote; if (!vote || room.phase !== 'NEXT_GAME_VOTE') return;
    const tallies = Object.fromEntries(vote.optionGameIds.map((gameId) => [gameId, 0]));
    for (const gameId of Object.values(vote.votes)) tallies[gameId] = (tallies[gameId] ?? 0) + 1;
    const playable = this.playableGameIds(room, vote.optionGameIds);
    if (playable.length === 0) { this.resetToLobby(room, false); return; }
    const maximum = Math.max(...playable.map((gameId) => tallies[gameId] ?? 0));
    const tiedGameIds = playable.filter((gameId) => tallies[gameId] === maximum);
    const resolvedGameId = this.randomItem(tiedGameIds);
    vote.endsAt = null; vote.resolvedGameId = resolvedGameId; vote.tallies = tallies;
    vote.nextTransitionAt = Date.now() + NEXT_GAME_VOTE_RESULT_MS;
    room.selectedGameId = resolvedGameId; room.phase = 'NEXT_GAME_VOTE_RESULTS';
  }

  private voteNextGame(playerId: string, gameId: string): Record<string, never> {
    const room = this.requiredRoom(playerId); const vote = room.nextGameVote;
    if (!vote || room.phase !== 'NEXT_GAME_VOTE') throw new Error('No hay una votación de minijuegos activa.');
    const member = room.members.get(playerId);
    if (!member || member.presence !== 'CONNECTED') throw new Error('No puedes votar en este momento.');
    if (vote.endsAt !== null && Date.now() >= vote.endsAt) {
      this.resolveNextGameVote(room); this.broadcast(room); this.schedule(room);
      throw new Error('La votación ha terminado.');
    }
    if (!vote.optionGameIds.includes(gameId)) throw new Error('Ese minijuego no es una opción válida.');
    const manifest = gameRegistry.get(gameId)?.manifest;
    if (!manifest || !supportsPlayerCount(manifest, this.connectedPlayerCount(room))) throw new Error('Ese minijuego ya no admite el número actual de jugadores.');
    if (vote.votes[playerId]) throw new Error('Tu voto ya está bloqueado.');
    vote.votes[playerId] = gameId;
    const eligibleIds = this.eligibleNextGameVoterIds(room);
    if (eligibleIds.every((id) => Boolean(vote.votes[id]))) this.resolveNextGameVote(room);
    this.broadcast(room); this.schedule(room); return {};
  }

  private tick(room: LiveRoom): void {
    if (room.phase === 'NEXT_GAME_VOTE') {
      this.resolveNextGameVote(room); this.broadcast(room); this.schedule(room); return;
    }
    if (room.phase === 'NEXT_GAME_VOTE_RESULTS') {
      this.resetToLobby(room, false);
      try { this.launchGame(room); }
      catch { this.broadcast(room); this.schedule(room); }
      return;
    }
    if (room.phase === 'LOBBY' || room.phase === 'GAME_RESULTS' || room.phase === 'SESSION_RESULTS') return;
    if (!room.game) return;
    room.game.state = room.game.module.handleTimeout(room.game.state, this.context(room));
    this.syncAndBroadcast(room);
  }

  private applyPresenceChange(room: LiveRoom): void {
    if (room.nextGameVote) {
      if (room.phase === 'NEXT_GAME_VOTE') {
        const eligibleIds = this.eligibleNextGameVoterIds(room);
        if (eligibleIds.every((id) => Boolean(room.nextGameVote?.votes[id]))) this.resolveNextGameVote(room);
      }
      this.broadcast(room); this.schedule(room); return;
    }
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
    if (!sessionFinished && room.gameSelectionMode.type === 'VOTE') this.beginNextGameVote(room);
    void persistGameResults(room, results, game.resultId, game.startedAt, game.gameId, game.config).catch((error) => console.error('Failed to persist game results', error));
  }

  private resetToLobby(room: LiveRoom, resetSession: boolean): void {
    for (const [id, member] of room.members) {
      if (member.presence === 'LEFT') { room.members.delete(id); this.store.detachPlayer(id); continue; }
      member.role = 'PLAYER'; if (resetSession) member.sessionPoints = 0;
    }
    if (resetSession) room.gamesPlayed = 0;
    room.game = null; room.nextGameVote = null; room.phase = 'LOBBY';
  }

  private returnLobby(playerId: string): Record<string, never> {
    const room = this.permissionRoom(playerId, 'START_GAME');
    if (room.phase !== 'GAME_RESULTS' && room.phase !== 'SESSION_RESULTS') throw new Error('Game has not finished');
    const resetSession = room.phase === 'SESSION_RESULTS';
    this.resetToLobby(room, resetSession); this.broadcast(room); return {};
  }

  private continueSession(playerId: string): Record<string, never> {
    const room = this.permissionRoom(playerId, 'START_GAME');
    if (room.phase !== 'GAME_RESULTS') throw new Error('La partida todavía no ha terminado.');
    this.resetToLobby(room, false);
    if (room.gameSelectionMode.type === 'VOTE') { this.broadcast(room); return {}; }
    try {
      this.assertRotationReady(room);
      this.selectRandomGame(room);
      this.launchGame(room);
      return {};
    } catch (error) {
      this.broadcast(room);
      throw error;
    }
  }

  private endSession(playerId: string): Record<string, never> {
    const room = this.permissionRoom(playerId, 'END_SESSION');
    if (room.phase !== 'LOBBY' && room.phase !== 'GAME_RESULTS' && room.phase !== 'NEXT_GAME_VOTE' && room.phase !== 'NEXT_GAME_VOTE_RESULTS') throw new Error('Cannot end the session during a game');
    room.transitionTimer = cancelTimer(room.transitionTimer); room.nextGameVote = null;
    room.phase = 'SESSION_RESULTS'; this.broadcast(room); return {};
  }

  private schedule(room: LiveRoom): void {
    room.transitionTimer = cancelTimer(room.transitionTimer);
    const scheduleCurrent = (deadline: number) => {
      const timer = scheduleDeadline(deadline, () => {
        if (room.transitionTimer !== timer) return;
        room.transitionTimer = null;
        this.tick(room);
      });
      room.transitionTimer = timer;
    };
    if (room.phase === 'NEXT_GAME_VOTE' || room.phase === 'NEXT_GAME_VOTE_RESULTS') {
      const deadline = room.phase === 'NEXT_GAME_VOTE' ? room.nextGameVote?.endsAt : room.nextGameVote?.nextTransitionAt;
      if (deadline !== null && deadline !== undefined) scheduleCurrent(deadline);
      return;
    }
    const state = room.game?.state; if (!state || room.phase === 'GAME_RESULTS' || room.phase === 'SESSION_RESULTS') return;
    const deadline = earliestDeadline([state.roundEndsAt, state.nextTransitionAt]);
    if (deadline === null) return;
    scheduleCurrent(deadline);
  }

  private context(room: LiveRoom) {
    return { players: [...room.members.values()].map((member) => ({
      id: member.identity.id,
      displayName: member.identity.displayName,
      connected: member.presence === 'CONNECTED',
      active: member.role === 'PLAYER' && member.presence !== 'LEFT',
    })), pokemon: this.pokemon, pokemonVisuals: this.pokemonVisuals, now: Date.now(), random: Math.random, roomCode: room.code, hostId: room.hostId, preloadImage: preloadGameImage };
  }

  gameAsset(code: string, assetToken: string, roundNumber: number, assetId: string): string | GameAssetResolution | null {
    const room = this.store.get(code);
    const game = room?.game;
    if (!room || !game?.module.resolveAsset) return null;
    return game.module.resolveAsset(game.state, { assetToken, roundNumber, assetId }, this.context(room));
  }

  private view(room: LiveRoom, playerId: string): RoomView {
    const context = this.context(room);
    const connectedVoterIds = this.eligibleNextGameVoterIds(room);
    const acceptedVoterIds = Object.keys(room.nextGameVote?.votes ?? {});
    const eligibleVoterIds = [...new Set([...connectedVoterIds, ...acceptedVoterIds])];
    const nextGameVote = room.nextGameVote ? {
      options: room.nextGameVote.optionGameIds.map((gameId) => gameRegistry.get(gameId)!.manifest),
      eligibleVoterIds,
      votedPlayerIds: acceptedVoterIds,
      ownVoteGameId: room.nextGameVote.votes[playerId] ?? null,
      endsAt: room.nextGameVote.endsAt,
      resolvedGameId: room.nextGameVote.resolvedGameId,
      tallies: room.nextGameVote.tallies,
      nextTransitionAt: room.nextGameVote.nextTransitionAt,
    } : null;
    return {
      code: room.code, phase: room.phase, hostId: room.hostId, maxPlayers: room.maxPlayers,
      members: [...room.members.values()].map((member) => ({
        id: member.identity.id, displayName: member.identity.displayName, avatar: member.identity.avatar,
        connected: member.connected, presence: member.presence, roomRole: member.roomRole, role: member.role, isHost: member.identity.id === room.hostId, sessionPoints: member.sessionPoints,
      })),
      availableGames: gameRegistry.manifests(),
      selectedGameId: room.selectedGameId, selectedGameConfig: room.gameConfigs.get(room.selectedGameId), sessionMode: room.sessionMode,
      gameSelectionMode: room.gameSelectionMode, nextGameVote,
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

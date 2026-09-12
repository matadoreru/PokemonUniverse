import type { GameSelectionMode, RoomView, SessionMode, SetGameSkipVoteRequest } from '@pokemon-universe/shared/public';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { useAuth } from '../auth/AuthContext';
import { createSocket, type GameSocket } from '../lib/socket';
import { OptimisticRoomProjection, runOptimisticLobbyMutation, type OptimisticLobbyUpdate } from './optimistic-room';
import { sendCommand, type CommandEvent, type CommandPayload } from './send-command';
import { attachWhoIsWhoCursorChannel } from './who-is-who-cursor-channel';

interface RoomContextValue {
  room: RoomView | null;
  connected: boolean;
  error: string | null;
  clearError(): void;
  createRoom(): Promise<RoomView>;
  joinRoom(code: string): Promise<RoomView>;
  leaveRoom(): Promise<void>;
  selectGame(gameId: string): Promise<void>;
  updateConfig(config: unknown): Promise<void>;
  updateGameConfig(gameId: string, config: unknown): Promise<void>;
  updateSession(mode: SessionMode): Promise<void>;
  updateGameSelection(mode: GameSelectionMode): Promise<void>;
  voteNextGame(gameId: string): Promise<void>;
  setRoomRole(playerId: string, role: 'CO_HOST' | 'MEMBER'): Promise<void>;
  transferHost(playerId: string): Promise<void>;
  kick(playerId: string): Promise<void>;
  setReady(ready: boolean): Promise<void>;
  startGame(): Promise<void>;
  continueSession(): Promise<void>;
  returnLobby(): Promise<void>;
  endSession(): Promise<void>;
  setGameSkipVote(request: SetGameSkipVoteRequest): Promise<void>;
  gameAction(action: unknown): Promise<void>;
}

const RoomContext = createContext<RoomContextValue | null>(null);

export function RoomProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const socketRef = useRef<GameSocket | null>(null);
  const projectionRef = useRef(new OptimisticRoomProjection());
  const continuationRef = useRef<Promise<void> | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const projection = projectionRef.current;
    if (!user) { socketRef.current?.disconnect(); socketRef.current = null; setRoom(projection.setAuthoritative(null, true)); return; }
    const socket = createSocket(); socketRef.current = socket;
    const detachCursorChannel = attachWhoIsWhoCursorChannel(socket);
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => { setConnected(false); setRoom(projection.clearPending()); });
    socket.on('room:state', (nextRoom) => setRoom(projection.setAuthoritative(nextRoom)));
    socket.on('session:restored', (nextRoom) => setRoom(projection.setAuthoritative(nextRoom, true)));
    socket.on('room:kicked', (message) => { setRoom(projection.setAuthoritative(null, true)); setError(message); });
    socket.on('error:message', setError);
    socket.on('connect_error', (event) => setError(event.message));
    return () => { detachCursorChannel(); socket.disconnect(); socketRef.current = null; projection.setAuthoritative(null, true); };
  }, [user?.id]);

  const emit = useCallback(async <E extends CommandEvent,>(event: E, payload: CommandPayload<E>) => {
    const socket = socketRef.current;
    if (!socket) throw new Error('Sin conexión con el servidor');
    setError(null);
    try { return await sendCommand(socket, event, payload); }
    catch (error) {
      if (socketRef.current === socket) setError(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }, []);

  const optimisticEmit = useCallback(<E extends CommandEvent,>(event: E, payload: CommandPayload<E>, update: OptimisticLobbyUpdate) => (
    runOptimisticLobbyMutation(projectionRef.current, setRoom, update, () => emit(event, payload))
  ), [emit]);

  const value = useMemo<RoomContextValue>(() => ({
    room, connected, error, clearError: () => setError(null),
    async createRoom() { const response = await emit('room:create', {}); setRoom(projectionRef.current.setAuthoritative(response.room, true)); return response.room; },
    async joinRoom(code) { const response = await emit('room:join', { code }); setRoom(projectionRef.current.setAuthoritative(response.room, true)); return response.room; },
    async leaveRoom() { await emit('room:leave', {}); setRoom(projectionRef.current.setAuthoritative(null, true)); },
    async selectGame(gameId) { await emit('room:select-game', { gameId }); },
    async updateConfig(config) {
      const gameId = projectionRef.current.view()?.selectedGameId;
      if (!gameId) { await emit('room:update-config', { config }); return; }
      await optimisticEmit('room:update-config', { config }, { kind: 'config', gameId, config });
    },
    async updateGameConfig(gameId, config) {
      await optimisticEmit('room:update-game-config', { gameId, config }, { kind: 'config', gameId, config });
    },
    async updateSession(mode) { await optimisticEmit('room:update-session', { mode }, { kind: 'session', mode }); },
    async updateGameSelection(mode) { await optimisticEmit('room:update-game-selection', { mode }, { kind: 'game-selection', mode }); },
    async voteNextGame(gameId) { await emit('room:vote-next-game', { gameId }); },
    async setRoomRole(playerId, role) { await emit('room:set-role', { playerId, role }); },
    async transferHost(playerId) { await emit('room:transfer-host', { playerId }); },
    async kick(playerId) { await emit('room:kick', { playerId }); },
    async setReady(ready) { await emit('room:set-ready', { ready }); },
    async startGame() { await emit('room:start-game', {}); },
    async continueSession() {
      if (continuationRef.current) return continuationRef.current;
      const request = emit('room:continue-session', {}).then(() => undefined);
      continuationRef.current = request;
      try { await request; }
      finally { if (continuationRef.current === request) continuationRef.current = null; }
    },
    async returnLobby() { await emit('room:return-lobby', {}); },
    async endSession() { await emit('room:end-session', {}); },
    async setGameSkipVote(request) { await emit('game:skip-vote:set', request); },
    async gameAction(action) {
      const gameInstanceId = room?.gameSkipState?.gameInstanceId;
      if (!gameInstanceId) throw new Error('No hay un minijuego activo.');
      const actionEpoch = room?.gameActionEpoch;
      if (!actionEpoch) throw new Error('Actualiza la conexión para recuperar la ronda.');
      await emit('game:action', { gameInstanceId, actionEpoch, action });
    },
  }), [connected, emit, error, optimisticEmit, room]);
  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoom(): RoomContextValue {
  const value = useContext(RoomContext); if (!value) throw new Error('useRoom must be inside RoomProvider'); return value;
}

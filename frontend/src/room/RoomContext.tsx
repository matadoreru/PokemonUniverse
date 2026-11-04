import type { GameSelectionMode, RoomView, SessionMode, SetGameSkipVoteRequest, SkipGameIntroRequest } from '@pokemon-universe/shared/public';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { useAuth } from '../auth/AuthContext';
import type { CommandEvent, CommandPayload, RealtimeClient } from '../lib/realtime';
import { createRealtime } from '../lib/socket';
import { commandRequest, gameActionPayload, requestCommand, roomErrorReporter, type GameActionOptions } from './room-command';
import { roomActionErrorMessage } from './roomCode';
import { OptimisticRoomProjection, runOptimisticLobbyMutation, type OptimisticLobbyUpdate } from './optimistic-room';
import { attachWhoIsWhoCursorChannel } from './who-is-who-cursor-channel';

interface RoomContextValue {
  room: RoomView | null;
  connected: boolean;
  error: string | null;
  clearError(): void;
  /** Sin aviso global: su único uso (Jugar) enseña el error en su pantalla. */
  createRoom(): Promise<RoomView>;
  /** Sin aviso global: su único uso (Jugar) enseña el error en el campo del código. */
  joinRoom(code: string): Promise<RoomView>;
  /** Con aviso global salvo `{ reportError: false }` (Jugar, que enseña el error en su panel). */
  leaveRoom(options?: { reportError?: boolean }): Promise<void>;
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
  skipIntro(request: SkipGameIntroRequest): Promise<void>;
  /** Con aviso global salvo `{ report: false }` (los borradores de Red Flag: teclear no borra el error de un envío). */
  gameAction(action: unknown, options?: GameActionOptions): Promise<void>;
}

const RoomContext = createContext<RoomContextValue | null>(null);

export function RoomProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const socketRef = useRef<RealtimeClient | null>(null);
  const projectionRef = useRef(new OptimisticRoomProjection());
  const continuationRef = useRef<Promise<void> | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const projection = projectionRef.current;
    if (!user) { socketRef.current?.disconnect(); socketRef.current = null; setRoom(projection.setAuthoritative(null, true)); return; }
    const socket = createRealtime(); socketRef.current = socket;
    const detachCursorChannel = attachWhoIsWhoCursorChannel(socket);
    // `error` only comes with an authentication close of `/ws` (4401), never with a plain disconnect.
    socket.onConnection((isConnected, connectionError) => {
      setConnected(isConnected);
      if (!isConnected) setRoom(projection.clearPending());
      if (connectionError !== undefined) setError(connectionError);
    });
    socket.on('room:state', (nextRoom) => setRoom(projection.setAuthoritative(nextRoom)));
    socket.on('session:restored', (nextRoom) => setRoom(projection.setAuthoritative(nextRoom, true)));
    socket.on('room:kicked', (message) => { setRoom(projection.setAuthoritative(null, true)); setError(message); });
    socket.on('error:message', setError);
    return () => { detachCursorChannel(); socket.disconnect(); socketRef.current = null; projection.setAuthoritative(null, true); };
  }, [user?.id]);

  /**
   * Regla de los errores de la sala: el fallo de una orden al servidor sale solo en el aviso global, ya en español
   * (`roomActionErrorMessage`); las pantallas solo lo capturan para soltar su botón. En línea una pantalla enseña solo
   * lo que valida ella antes de enviar. Con `report = false` el fallo no pasa al aviso global (ni lo limpia): lo enseña
   * quien llama (Jugar, en su campo).
   */
  const emit = useCallback(async <E extends CommandEvent,>(event: E, payload: CommandPayload<E> | (() => CommandPayload<E>), report = true) => {
    const socket = socketRef.current;
    // Sin socket, `socketRef.current === socket` (los dos nulos): «Sin conexión» también sale en el aviso global.
    return requestCommand(commandRequest(socket, event, payload), roomErrorReporter(report, setError, roomActionErrorMessage, () => socketRef.current === socket));
  }, []);

  const optimisticEmit = useCallback(<E extends CommandEvent,>(event: E, payload: CommandPayload<E>, update: OptimisticLobbyUpdate) => (
    runOptimisticLobbyMutation(projectionRef.current, setRoom, update, () => emit(event, payload))
  ), [emit]);

  const value = useMemo<RoomContextValue>(() => ({
    room, connected, error, clearError: () => setError(null),
    async createRoom() { const response = await emit('room:create', {}, false); setRoom(projectionRef.current.setAuthoritative(response.room, true)); return response.room; },
    async joinRoom(code) { const response = await emit('room:join', { code }, false); setRoom(projectionRef.current.setAuthoritative(response.room, true)); return response.room; },
    async leaveRoom(options) { await emit('room:leave', {}, options?.reportError ?? true); setRoom(projectionRef.current.setAuthoritative(null, true)); },
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
    async skipIntro(request) { await emit('game:intro:skip', request); },
    // Las guardas (sin minijuego activo, sin época) van dentro de la petición: su fallo también sale en el aviso global.
    async gameAction(action, options) { await emit('game:action', () => gameActionPayload(room, action), options?.report ?? true); },
  }), [connected, emit, error, optimisticEmit, room]);
  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoom(): RoomContextValue {
  const value = useContext(RoomContext); if (!value) throw new Error('useRoom must be inside RoomProvider'); return value;
}

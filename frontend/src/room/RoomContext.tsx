import type { ChatMessage, GameSelectionMode, RoomView, ServerToClientEvents, SessionMode, SetGameSkipVoteRequest } from '@pokemon-universe/shared/public';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { useAuth } from '../auth/AuthContext';
import type { CommandEvent, CommandPayload, RealtimeClient } from '../lib/realtime';
import { createRealtime } from '../lib/socket';
import { commandRequest, gameActionPayload, requestCommand, roomErrorReporter, type GameActionOptions } from './room-command';
import { roomActionErrorMessage } from './roomCode';
import { applyDeleted, applyHistory, applyMessage, EMPTY_CHAT, syncInstance, type ChatState } from './chat/chat-state';
import { OptimisticRoomProjection, runOptimisticLobbyMutation, type OptimisticLobbyUpdate } from './optimistic-room';
import { SessionAttachment } from './session-attachment';
import { attachWhoIsWhoCursorChannel } from './who-is-who-cursor-channel';

/** Avisos del `/ws` de la cuenta (no son de la sala): los escuchan los proveedores y pantallas con `subscribe`. */
export type FriendSocketEvent = 'friends:presence' | 'friends:changed' | 'friends:invite' | 'achievements:unlocked' | 'daily:recorded';
const FRIEND_SOCKET_EVENTS: readonly FriendSocketEvent[] = ['friends:presence', 'friends:changed', 'friends:invite', 'achievements:unlocked', 'daily:recorded'];
type FriendListener = (payload: never) => void;

interface RoomContextValue {
  room: RoomView | null;
  connected: boolean;
  error: string | null;
  clearError(): void;
  /** Sin aviso global: su único uso (Jugar) enseña el error en su pantalla. */
  createRoom(): Promise<RoomView>;
  /** Sin aviso global salvo `{ reportError: true }` (Jugar enseña el error en el campo del código; «Unirse» de una invitación, en el aviso). */
  joinRoom(code: string, options?: { reportError?: boolean }): Promise<RoomView>;
  /** Con aviso global salvo `{ reportError: false }` (Jugar, que enseña el error en su panel). */
  leaveRoom(options?: { reportError?: boolean }): Promise<void>;
  /**
   * `daily:start`: crea la sala del reto de hoy y arranca la partida (el servidor sabe qué juego toca). Sin aviso global:
   * Jugar enseña el error en el panel del reto. Si la sala actual es un reto ya en resultados, antes la cierra sin aviso.
   */
  startDaily(): Promise<RoomView>;
  selectGame(gameId: string): Promise<void>;
  updateConfig(config: unknown): Promise<void>;
  updateGameConfig(gameId: string, config: unknown): Promise<void>;
  updateSession(mode: SessionMode): Promise<void>;
  updateGameSelection(mode: GameSelectionMode): Promise<void>;
  /** Los modos que se juegan de `gameId` en la sesión (al menos uno): opciones al azar o por votación, turnos por orden. */
  updateAllowedModes(gameId: string, modes: string[]): Promise<void>;
  /** `optionId`: el id de la opción de voto (un par juego y modo). */
  voteNextGame(optionId: string): Promise<void>;
  setRoomRole(playerId: string, role: 'CO_HOST' | 'MEMBER'): Promise<void>;
  transferHost(playerId: string): Promise<void>;
  kick(playerId: string): Promise<void>;
  setReady(ready: boolean): Promise<void>;
  startGame(): Promise<void>;
  continueSession(): Promise<void>;
  returnLobby(): Promise<void>;
  endSession(): Promise<void>;
  setGameSkipVote(request: SetGameSkipVoteRequest): Promise<void>;
  /** `room:invite`, con aviso global: el lobby solo captura para soltar su botón. */
  inviteFriend(userId: string): Promise<void>;
  /**
   * Escucha un aviso de amigos del `/ws`. Sobrevive a que se recree el socket (cambio de cuenta): la suscripción es del
   * proveedor, que reenvía desde el socket actual. Devuelve la función para dejar de escuchar.
   */
  subscribe<E extends FriendSocketEvent>(event: E, listener: ServerToClientEvents[E]): () => void;
  /**
   * Engancha esta pestaña a la sesión de sala (`session:attach`) ahora y en cada reconexión, hasta llamar a la función
   * devuelta. Lo usa solo `RoomSessionLayout`: otra página con el `/ws` abierto no le quita el asiento a la de la sala.
   */
  holdRoomSession(): () => void;
  /** Con aviso global salvo `{ report: false }` (los borradores de Red Flag: teclear no borra el error de un envío). */
  gameAction(action: unknown, options?: GameActionOptions): Promise<void>;
  /** Últimos mensajes del chat de la sala, por `seq`. Vive aquí (por encima del `Lobby`) para sobrevivir a las partidas. */
  chat: ChatMessage[];
  /** Sube con cada `room:chat:history` aplicado: el anunciador distingue así el historial de los mensajes en vivo. */
  chatHistoryVersion: number;
  /** Las tres órdenes del chat, con aviso global (las pantallas capturan con `ignoreFailure`). */
  sendChat(text: string): Promise<void>;
  deleteChatMessage(seq: number): Promise<void>;
  setChatMute(playerId: string, muted: boolean): Promise<void>;
}

const RoomContext = createContext<RoomContextValue | null>(null);

/**
 * `active`: abre el `/ws`. La raíz de la aplicación lo abre en toda página para una cuenta registrada (amigos e
 * invitaciones, spec «esté en la pantalla que esté») y para un invitado solo en `/play` y `/room`. Sin sesión, nunca.
 */
export function RoomProvider({ children, active = true }: PropsWithChildren<{ active?: boolean }>) {
  const { user, syncLevel } = useAuth();
  const socketRef = useRef<RealtimeClient | null>(null);
  const projectionRef = useRef(new OptimisticRoomProjection());
  const continuationRef = useRef<Promise<void> | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [chat, setChat] = useState<ChatState>(EMPTY_CHAT);
  const [chatHistoryVersion, setChatHistoryVersion] = useState(0);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const friendListenersRef = useRef(new Map<FriendSocketEvent, Set<FriendListener>>());
  const attachmentRef = useRef(new SessionAttachment());

  /**
   * Fija la instancia del chat en el mismo manejador que fija la sala (nunca desde un efecto): si el historial de la
   * sala B llegara con el estado aún en A, se descartaría. Un snapshot sin instancia (antiguo) no toca el chat.
   */
  const syncChat = useCallback((view: RoomView | null) => {
    if (view && view.roomInstanceId === undefined) return;
    setChat((state) => syncInstance(state, view?.roomInstanceId ?? null));
  }, []);

  useEffect(() => {
    const projection = projectionRef.current;
    const attachment = attachmentRef.current;
    // Sin socket (sesión cerrada o invitado fuera de las rutas de sala) no queda sala: su último error tampoco sigue.
    if (!user || !active) { attachment.clear(); socketRef.current?.disconnect(); socketRef.current = null; setConnected(false); setRoom(projection.setAuthoritative(null, true)); syncChat(null); setError(null); return; }
    const socket = createRealtime(); socketRef.current = socket;
    const detachCursorChannel = attachWhoIsWhoCursorChannel(socket);
    // `error` only comes with an authentication close of `/ws` (4401), never with a plain disconnect.
    socket.onConnection((isConnected, connectionError) => {
      // Antes de publicar `connected`: el enganche sale el primero por la conexión nueva, antes que cualquier comando.
      if (isConnected) attachment.opened(socket); else attachment.closed(socket);
      setConnected(isConnected);
      if (!isConnected) setRoom(projection.clearPending());
      if (connectionError !== undefined) setError(connectionError);
    });
    socket.on('room:state', (nextRoom) => { const view = projection.setAuthoritative(nextRoom); setRoom(view); syncChat(view); });
    socket.on('session:restored', (nextRoom) => { const view = projection.setAuthoritative(nextRoom, true); setRoom(view); syncChat(view); });
    socket.on('room:kicked', (message) => { attachment.clear(); setRoom(projection.setAuthoritative(null, true)); syncChat(null); setError(message); });
    socket.on('room:chat:history', (payload) => { setChat((state) => applyHistory(state, payload)); setChatHistoryVersion((version) => version + 1); });
    socket.on('room:chat:message', (payload) => setChat((state) => applyMessage(state, payload)));
    socket.on('room:chat:deleted', (payload) => setChat((state) => applyDeleted(state, payload)));
    socket.on('error:message', setError);
    for (const event of FRIEND_SOCKET_EVENTS) {
      socket.on(event, ((payload: never) => { for (const listener of [...(friendListenersRef.current.get(event) ?? [])]) listener(payload); }) as ServerToClientEvents[typeof event]);
    }
    return () => { attachment.closed(socket); detachCursorChannel(); socket.disconnect(); socketRef.current = null; projection.setAuthoritative(null, true); syncChat(null); };
  }, [user?.id, active, syncChat]);

  // El nivel propio llega en vivo en `room:state` (sube al terminar cada partida): la cabecera lo sigue.
  const selfLevel = room?.members.find((member) => member.id === user?.id)?.level;
  useEffect(() => { if (typeof selfLevel === 'number') syncLevel(selfLevel); }, [selfLevel, syncLevel]);

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

  const subscribe = useCallback(<E extends FriendSocketEvent,>(event: E, listener: ServerToClientEvents[E]) => {
    const listeners = friendListenersRef.current;
    const set = listeners.get(event) ?? new Set<FriendListener>();
    listeners.set(event, set);
    const entry = listener as unknown as FriendListener;
    set.add(entry);
    return () => { set.delete(entry); };
  }, []);

  const holdRoomSession = useCallback(() => attachmentRef.current.hold(), []);

  const leave = useCallback(async (report: boolean) => {
    await emit('room:leave', {}, report); attachmentRef.current.clear(); setRoom(projectionRef.current.setAuthoritative(null, true)); syncChat(null); setError(null);
  }, [emit, syncChat]);

  const value = useMemo<RoomContextValue>(() => ({
    room, connected, error, clearError: () => setError(null),
    async createRoom() { const response = await emit('room:create', {}, false); const view = projectionRef.current.setAuthoritative(response.room, true); setRoom(view); syncChat(view); return response.room; },
    async joinRoom(code, options) { const response = await emit('room:join', { code }, options?.reportError ?? false); const view = projectionRef.current.setAuthoritative(response.room, true); setRoom(view); syncChat(view); return response.room; },
    // Fuera de la sala, su error ya no viene a cuento (con `reportError: false` el aviso no se limpió al empezar).
    async leaveRoom(options) { await leave(options?.reportError ?? true); },
    async startDaily() {
      const current = projectionRef.current.view();
      if (current?.daily && current.phase === 'GAME_RESULTS') await leave(false);
      const response = await emit('daily:start', {}, false); const view = projectionRef.current.setAuthoritative(response.room, true); setRoom(view); syncChat(view); return response.room;
    },
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
    async updateAllowedModes(gameId, modes) { await optimisticEmit('room:update-allowed-modes', { gameId, modes }, { kind: 'allowed-modes', gameId, modes }); },
    async voteNextGame(optionId) { await emit('room:vote-next-game', { optionId }); },
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
    async inviteFriend(userId) { await emit('room:invite', { userId }); },
    subscribe,
    holdRoomSession,
    // Las guardas (sin minijuego activo, sin época) van dentro de la petición: su fallo también sale en el aviso global.
    async gameAction(action, options) { await emit('game:action', () => gameActionPayload(room, action), options?.report ?? true); },
    chat: chat.messages,
    chatHistoryVersion,
    async sendChat(text) { await emit('room:chat:send', { text }); },
    async deleteChatMessage(seq) { await emit('room:chat:delete', { seq }); },
    async setChatMute(playerId, muted) { await emit('room:chat:mute', { playerId, muted }); },
  }), [chat.messages, chatHistoryVersion, connected, emit, error, holdRoomSession, leave, optimisticEmit, room, subscribe, syncChat]);
  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoom(): RoomContextValue {
  const value = useContext(RoomContext); if (!value) throw new Error('useRoom must be inside RoomProvider'); return value;
}

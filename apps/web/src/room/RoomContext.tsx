import type { RoomView, SessionMode } from '@pokemon-universe/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { useAuth } from '../auth/AuthContext';
import { createSocket, type GameSocket } from '../lib/socket';

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
  updateSession(mode: SessionMode): Promise<void>;
  setRoomRole(playerId: string, role: 'CO_HOST' | 'MEMBER'): Promise<void>;
  transferHost(playerId: string): Promise<void>;
  kick(playerId: string): Promise<void>;
  startGame(): Promise<void>;
  returnLobby(): Promise<void>;
  endSession(): Promise<void>;
  gameAction(action: unknown): Promise<void>;
}

const RoomContext = createContext<RoomContextValue | null>(null);
type Ack<T = Record<string, never>> = ({ ok: true } & T) | { ok: false; error: string };

export function RoomProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const socketRef = useRef<GameSocket | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { socketRef.current?.disconnect(); socketRef.current = null; setRoom(null); return; }
    const socket = createSocket(); socketRef.current = socket;
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('room:state', setRoom);
    socket.on('session:restored', setRoom);
    socket.on('room:kicked', (message) => { setRoom(null); setError(message); });
    socket.on('error:message', setError);
    socket.on('connect_error', (event) => setError(event.message));
    return () => { socket.disconnect(); socketRef.current = null; };
  }, [user?.id]);

  const emit = useCallback(<T,>(event: string, payload: unknown): Promise<T> => new Promise((resolve, reject) => {
    const socket = socketRef.current; if (!socket) { reject(new Error('Sin conexión con el servidor')); return; }
    (socket.emit as (...args: any[]) => void)(event, payload, (response: Ack<T>) => {
      if (response.ok) resolve(response as T); else { setError(response.error); reject(new Error(response.error)); }
    });
  }), []);

  const value = useMemo<RoomContextValue>(() => ({
    room, connected, error, clearError: () => setError(null),
    async createRoom() { const response = await emit<{ room: RoomView }>('room:create', {}); setRoom(response.room); return response.room; },
    async joinRoom(code) { const response = await emit<{ room: RoomView }>('room:join', { code }); setRoom(response.room); return response.room; },
    async leaveRoom() { await emit('room:leave', {}); setRoom(null); },
    async selectGame(gameId) { await emit('room:select-game', { gameId }); },
    async updateConfig(config) { await emit('room:update-config', { config }); },
    async updateSession(mode) { await emit('room:update-session', { mode }); },
    async setRoomRole(playerId, role) { await emit('room:set-role', { playerId, role }); },
    async transferHost(playerId) { await emit('room:transfer-host', { playerId }); },
    async kick(playerId) { await emit('room:kick', { playerId }); },
    async startGame() { await emit('room:start-game', {}); },
    async returnLobby() { await emit('room:return-lobby', {}); },
    async endSession() { await emit('room:end-session', {}); },
    async gameAction(action) { await emit('game:action', action); },
  }), [connected, emit, error, room]);
  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoom(): RoomContextValue {
  const value = useContext(RoomContext); if (!value) throw new Error('useRoom must be inside RoomProvider'); return value;
}

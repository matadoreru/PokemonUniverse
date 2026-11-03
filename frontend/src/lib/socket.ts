import type { ClientToServerEvents, ServerToClientEvents } from '@pokemon-universe/shared/public';
import { io, type Socket } from 'socket.io-client';
import { socketUrl } from './api';
import type { RealtimeClient } from './realtime';
import { SocketIoRealtime } from './realtime-socketio';
import { WebSocketRealtime } from './realtime-ws';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export function createSocket(): GameSocket { return io(socketUrl, { withCredentials: true, autoConnect: true }); }

/** `VITE_REALTIME=java` uses the native WebSocket of the Java backend; anything else keeps Socket.IO (Node). */
export function createRealtime(): RealtimeClient {
  if (import.meta.env.VITE_REALTIME === 'java') return new WebSocketRealtime(`${socketUrl.replace(/^http/, 'ws')}/ws`);
  return new SocketIoRealtime(createSocket());
}

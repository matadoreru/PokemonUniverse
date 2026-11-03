import { socketUrl } from './api';
import type { RealtimeClient } from './realtime';
import { WebSocketRealtime } from './realtime-ws';

/** URL del WebSocket de salas del backend Java a partir del origen de la página o de `VITE_API_URL`. */
export function roomSocketUrl(origin: string): string { return `${origin.replace(/^http/, 'ws')}/ws`; }

/** Canal de salas: el WebSocket nativo `/ws` del backend Java. */
export function createRealtime(): RealtimeClient { return new WebSocketRealtime(roomSocketUrl(socketUrl)); }

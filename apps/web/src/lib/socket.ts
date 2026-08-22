import type { ClientToServerEvents, ServerToClientEvents } from '@pokemon-universe/shared';
import { io, type Socket } from 'socket.io-client';
import { socketUrl } from './api';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export function createSocket(): GameSocket { return io(socketUrl, { withCredentials: true, autoConnect: true }); }

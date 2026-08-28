import type { WhoIsWhoCursorEvent, WhoIsWhoCursorPosition } from '@pokemon-universe/shared';
import type { GameSocket } from '../lib/socket';

export type TeamCursorMessage = { type: 'MOVE'; cursor: WhoIsWhoCursorEvent } | { type: 'CLEAR'; playerId: string } | { type: 'RESET' };
type Listener = (message: TeamCursorMessage) => void;
const listeners = new Set<Listener>();
let socket: GameSocket | null = null;

export function attachWhoIsWhoCursorChannel(next: GameSocket): () => void {
  socket = next;
  const move = (cursor: WhoIsWhoCursorEvent) => listeners.forEach((listener) => listener({ type: 'MOVE', cursor }));
  const clear = ({ playerId }: { playerId: string }) => listeners.forEach((listener) => listener({ type: 'CLEAR', playerId }));
  const reset = () => listeners.forEach((listener) => listener({ type: 'RESET' }));
  next.on('who-is-who:cursor', move); next.on('who-is-who:cursor-clear', clear); next.on('who-is-who:cursors-reset', reset);
  return () => { next.off('who-is-who:cursor', move); next.off('who-is-who:cursor-clear', clear); next.off('who-is-who:cursors-reset', reset); if (socket === next) socket = null; reset(); };
}

export function subscribeWhoIsWhoCursors(listener: Listener): () => void { listeners.add(listener); return () => listeners.delete(listener); }
export function sendWhoIsWhoCursor(position: WhoIsWhoCursorPosition): void { socket?.emit('who-is-who:cursor', position); }
export function clearWhoIsWhoCursor(): void { socket?.emit('who-is-who:cursor-clear', {}); }


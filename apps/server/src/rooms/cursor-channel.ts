import { whoIsWhoCursorPositionSchema, type ServerToClientEvents } from '@pokemon-universe/shared';
import type { LiveRoom } from './types.js';

type CursorEvent = 'who-is-who:cursor' | 'who-is-who:cursor-clear' | 'who-is-who:cursors-reset';
type Emit = <T extends CursorEvent>(socketId: string, event: T, ...args: Parameters<ServerToClientEvents[T]>) => void;

/** Ephemeral transport, authorized exclusively by the engine's channel projection. */
export class CursorChannel {
  private readonly rates = new Map<string, { startedAt: number; count: number }>();
  constructor(private readonly emit: Emit) {}

  update(room: LiveRoom, playerId: string, payload: unknown): void {
    const member = room.members.get(playerId);
    const channel = room.game?.module.getCursorChannel?.(room.game.state, playerId);
    if (!channel || member?.presence !== 'CONNECTED' || member.role !== 'PLAYER') throw new Error('No puedes compartir cursor en este momento.');
    const position = whoIsWhoCursorPositionSchema.parse(payload);
    if (position.pokemonId && !channel.targetIds.includes(position.pokemonId)) throw new Error('Ese Pokémon no está en el tablero.');
    const now = Date.now(); const key = `${room.code}:${playerId}`; const rate = this.rates.get(key);
    if (!rate || now - rate.startedAt >= 1_000) this.rates.set(key, { startedAt: now, count: 1 });
    else { if (rate.count >= 30) throw new Error('Demasiadas actualizaciones de cursor.'); rate.count += 1; }
    for (const id of channel.playerIds) {
      const target = room.members.get(id);
      if (id !== playerId && target?.presence === 'CONNECTED' && target.socketId) this.emit(target.socketId, 'who-is-who:cursor', { playerId, ...position, updatedAt: now });
    }
  }

  clear(room: LiveRoom, playerId: string): void {
    this.rates.delete(`${room.code}:${playerId}`);
    const channel = room.game?.module.getCursorChannel?.(room.game.state, playerId);
    for (const id of channel?.playerIds ?? []) {
      const target = room.members.get(id);
      if (id !== playerId && target?.socketId) this.emit(target.socketId, 'who-is-who:cursor-clear', { playerId });
    }
  }

  reset(room: LiveRoom): void {
    for (const key of this.rates.keys()) if (key.startsWith(`${room.code}:`)) this.rates.delete(key);
    for (const member of room.members.values()) if (member.socketId) this.emit(member.socketId, 'who-is-who:cursors-reset');
  }
}

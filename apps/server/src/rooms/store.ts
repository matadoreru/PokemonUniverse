import type { LiveRoom } from './types.js';

/** Single-process owner. Multi-node deployment requires serializable state, ownership and durable timers before changing storage. */
export class InMemoryRoomStore {
  private readonly rooms = new Map<string, LiveRoom>();
  private readonly playerRooms = new Map<string, string>();
  get(code: string): LiveRoom | undefined { return this.rooms.get(code); }
  list(): LiveRoom[] { return [...this.rooms.values()]; }
  roomForPlayer(playerId: string): LiveRoom | undefined {
    const code = this.playerRooms.get(playerId);
    return code ? this.rooms.get(code) : undefined;
  }
  save(room: LiveRoom): void { this.rooms.set(room.code, room); }
  attachPlayer(playerId: string, roomCode: string): void { this.playerRooms.set(playerId, roomCode); }
  detachPlayer(playerId: string, expectedRoomCode: string): void {
    if (this.playerRooms.get(playerId) === expectedRoomCode) this.playerRooms.delete(playerId);
  }
  delete(code: string): void {
    const room = this.rooms.get(code);
    if (room) for (const id of room.members.keys()) this.detachPlayer(id, code);
    this.rooms.delete(code);
  }
}

import type { LiveRoom } from './types.js';

/** Process-local adapter. Replace this boundary with Redis + distributed locks for multi-node deployments. */
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
  detachPlayer(playerId: string): void { this.playerRooms.delete(playerId); }
  delete(code: string): void {
    const room = this.rooms.get(code);
    if (room) for (const id of room.members.keys()) this.playerRooms.delete(id);
    this.rooms.delete(code);
  }
}

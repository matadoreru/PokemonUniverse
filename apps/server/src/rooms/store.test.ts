import { describe, expect, it } from 'vitest';
import { InMemoryRoomStore } from './store.js';
import type { LiveRoom } from './types.js';

describe('room reconnect index', () => {
  it('restores the exact room state by stable authenticated identity', () => {
    const store = new InMemoryRoomStore();
    const room = { code: 'PIKA42', members: new Map(), game: { state: { selections: { user: { pokemonId: 'pikachu' } } } } } as unknown as LiveRoom;
    store.save(room);
    store.attachPlayer('user', room.code);
    expect(store.roomForPlayer('user')).toBe(room);
    expect(store.roomForPlayer('user')?.game?.state).toEqual({ selections: { user: { pokemonId: 'pikachu' } } });
  });
});


it('keeps the new association when an old room detaches or deletes its historical roster', () => {
  const store = new InMemoryRoomStore();
  const oldRoom = { code: 'OLD', members: new Map([['user', {}]]) } as unknown as LiveRoom;
  const newRoom = { code: 'NEW', members: new Map([['user', {}]]) } as unknown as LiveRoom;
  store.save(oldRoom); store.save(newRoom);
  store.attachPlayer('user', 'NEW');
  store.detachPlayer('user', 'OLD');
  expect(store.roomForPlayer('user')).toBe(newRoom);
  store.delete('OLD');
  expect(store.roomForPlayer('user')).toBe(newRoom);
  store.detachPlayer('user', 'NEW');
  expect(store.roomForPlayer('user')).toBeUndefined();
});

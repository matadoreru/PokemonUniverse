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
    expect(store.roomForPlayer('user')?.game?.state.selections.user.pokemonId).toBe('pikachu');
  });
});

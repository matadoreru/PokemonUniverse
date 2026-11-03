import type { RoomMemberView } from '@pokemon-universe/shared/public';
import { describe, expect, it } from 'vitest';
import { presenceChange } from './PlayerList';

const m = (id: string, presence: 'CONNECTED' | 'DISCONNECTED' | 'LEFT' = 'CONNECTED') => ({ id, presence }) as RoomMemberView;

describe('presenceChange', () => {
  it('detecta entradas y salidas de otros', () => {
    expect(presenceChange([m('a')], [m('a'), m('b')], 'a')).toBe('join');
    expect(presenceChange([m('a'), m('b')], [m('a'), m('b', 'DISCONNECTED')], 'a')).toBe('leave');
    expect(presenceChange([m('a'), m('b')], [m('a'), m('b')], 'a')).toBeNull();
  });
  it('ignora lo que cambia por la conexión del propio jugador', () => {
    expect(presenceChange([m('a', 'DISCONNECTED')], [m('a'), m('b')], 'a')).toBeNull();
    expect(presenceChange([m('a'), m('b')], [m('a', 'DISCONNECTED'), m('b')], 'a')).toBeNull();
  });
});

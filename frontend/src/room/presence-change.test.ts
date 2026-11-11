import type { RoomMemberView } from '@pokemon-universe/shared/public';
import { describe, expect, it } from 'vitest';
import { presenceChange } from './PlayerList';
import { member } from './test-support/room-view';

const m = (id: string, presence: RoomMemberView['presence'] = 'CONNECTED') => member({ id, displayName: id, presence });

describe('presenceChange', () => {
  it('detecta entradas y salidas de otros', () => {
    expect(presenceChange([m('a')], [m('a'), m('b')], 'a')).toBe('join');
    expect(presenceChange([m('a'), m('b')], [m('a'), m('b', 'TEMPORARILY_DISCONNECTED')], 'a')).toBe('leave');
    expect(presenceChange([m('a'), m('b')], [m('a'), m('b')], 'a')).toBeNull();
  });
  it('ignora lo que cambia por la conexión del propio jugador', () => {
    expect(presenceChange([m('a', 'TEMPORARILY_DISCONNECTED')], [m('a'), m('b')], 'a')).toBeNull();
    expect(presenceChange([m('a'), m('b')], [m('a', 'TEMPORARILY_DISCONNECTED'), m('b')], 'a')).toBeNull();
  });
});

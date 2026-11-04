import type { RoomMemberView } from '@pokemon-universe/shared/public';
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS } from './player-color';
import { joinNames, sessionPodium } from './session-results';

const member = (id: string): RoomMemberView => ({ id, displayName: id, avatar: { type: 'DEFAULT' }, connected: true, presence: 'CONNECTED', roomRole: 'MEMBER', role: 'PLAYER', isHost: false, ready: false, sessionPoints: 0 });
const standing = (id: string, displayName: string, sessionPoints: number) => ({ id, displayName, avatar: { type: 'DEFAULT' as const }, sessionPoints });

describe('sessionPodium', () => {
  it('shares positions on ties, orders by name and colours by room order', () => {
    const podium = sessionPodium({
      gamesPlayed: 3,
      members: [member('c'), member('a'), member('b')],
      sessionStandings: [standing('a', 'Eru', 8), standing('b', 'Ana', 8), standing('c', 'Leo', 5), standing('gone', 'Zoe', 1)],
    }, 'a');
    expect(podium.standings.map((s) => [s.name, s.position])).toEqual([['Ana', 1], ['Eru', 1], ['Leo', 3], ['Zoe', 4]]);
    expect(podium.standings.map((s) => s.color)).toEqual([PLAYER_COLORS[2], PLAYER_COLORS[1], PLAYER_COLORS[0], undefined]);
    expect(podium.champions.map((s) => s.name)).toEqual(['Ana', 'Eru']);
    expect(podium).toMatchObject({ tied: true, won: true, title: 'Campeones de la sesión', subtitle: '3 partidas disputadas' });
  });

  it('crowns a single champion and tells the rest they did not win', () => {
    const podium = sessionPodium({ gamesPlayed: 1, members: [], sessionStandings: [standing('a', 'Eru', 2), standing('b', 'Ana', 5)] }, 'a');
    expect(podium).toMatchObject({ tied: false, won: false, title: 'Campeón de la sesión', subtitle: '1 partida disputada' });
    expect(podium.champions.map((s) => s.id)).toEqual(['b']);
  });

  it('has no champion before any game is played', () => {
    const podium = sessionPodium({ gamesPlayed: 0, members: [], sessionStandings: [standing('a', 'Eru', 0), standing('b', 'Ana', 0)] }, 'a');
    expect(podium.champions).toEqual([]);
    expect(podium).toMatchObject({ won: false, title: 'Sesión terminada' });
  });
});

describe('joinNames', () => {
  it('joins with commas and «y»', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['Ana'])).toBe('Ana');
    expect(joinNames(['Ana', 'Eru'])).toBe('Ana y Eru');
    expect(joinNames(['Ana', 'Eru', 'Leo'])).toBe('Ana, Eru y Leo');
  });
});

import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS } from '../lib/player-color';
import { sessionPodium } from './session-results';
import { member } from './test-support/room-view';

const standing = (id: string, displayName: string, sessionPoints: number) => ({ id, displayName, avatar: { type: 'DEFAULT' as const }, sessionPoints });

describe('sessionPodium', () => {
  it('shares positions on ties, orders by name and colours by room order', () => {
    const podium = sessionPodium({
      gamesPlayed: 3,
      members: [member({ id: 'c', displayName: 'c' }), member({ id: 'a', displayName: 'a' }), member({ id: 'b', displayName: 'b' })],
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

  it('crowns nobody when games were played but nobody scored', () => {
    const podium = sessionPodium({ gamesPlayed: 2, members: [], sessionStandings: [standing('a', 'Eru', 0), standing('b', 'Ana', 0)] }, 'a');
    expect(podium.champions).toEqual([]);
    expect(podium).toMatchObject({ tied: false, won: false, title: 'Sesión sin ganador', subtitle: '2 partidas disputadas' });
  });
});

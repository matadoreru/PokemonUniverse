import type { RoomMemberView, RoomView } from '@pokemon-universe/shared/public';
import { describe, expect, it } from 'vitest';
import { validatePokemonImpostorConfig } from './validation';

function member(id: string, presence: RoomMemberView['presence'] = 'CONNECTED'): RoomMemberView {
  return {
    id, displayName: id, avatar: { type: 'DEFAULT' }, connected: presence === 'CONNECTED', presence,
    roomRole: id === 'p1' ? 'HOST' : 'MEMBER', role: 'PLAYER', isHost: id === 'p1', ready: true, sessionPoints: 0,
  };
}

function roomWith(members: RoomMemberView[]): RoomView {
  return {
    code: 'ABC234', phase: 'LOBBY', hostId: 'p1', maxPlayers: 8, members, availableGames: [],
    selectedGameId: 'pokemon-impostor', selectedGameConfig: { impostorCount: 2 },
    sessionMode: { type: 'INFINITE' }, gameSelectionMode: { type: 'FIXED' }, nextGameVote: null,
    gamesPlayed: 0, sessionStandings: [], sessionHistory: [], game: null, gamePlayerState: null, serverNow: 1_000,
  };
}

describe('validatePokemonImpostorConfig', () => {
  it('flags too many impostors for four connected players', () => {
    const room = roomWith(['p1', 'p2', 'p3', 'p4'].map((id) => member(id)));
    expect(validatePokemonImpostorConfig({ impostorCount: 2 }, room)).toBe('Demasiados impostores: con 4 jugadores el máximo es 1.');
  });

  it('accepts two impostors with five connected players', () => {
    const room = roomWith(['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => member(id)));
    expect(validatePokemonImpostorConfig({ impostorCount: 2 }, room)).toBeNull();
  });

  it('counts only connected members', () => {
    const room = roomWith([...['p1', 'p2', 'p3', 'p4'].map((id) => member(id)), member('p5', 'TEMPORARILY_DISCONNECTED')]);
    expect(validatePokemonImpostorConfig({ impostorCount: 2 }, room)).toBe('Demasiados impostores: con 4 jugadores el máximo es 1.');
  });

  it('skips the check without a room', () => {
    expect(validatePokemonImpostorConfig({ impostorCount: 2 })).toBeNull();
  });
});

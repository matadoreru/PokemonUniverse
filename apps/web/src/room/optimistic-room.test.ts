import type { RoomView } from '@pokemon-universe/shared';
import { describe, expect, it } from 'vitest';
import { OptimisticRoomProjection, runOptimisticLobbyMutation } from './optimistic-room';

function room(overrides: Partial<RoomView> = {}): RoomView {
  return {
    code: 'ABC234', phase: 'LOBBY', hostId: 'host', maxPlayers: 8, members: [], availableGames: [],
    selectedGameId: 'shiny-vote', selectedGameConfig: { showVotes: true }, sessionMode: { type: 'INFINITE' },
    gameSelectionMode: { type: 'FIXED' }, nextGameVote: null, gamesPlayed: 0, game: null,
    gamePlayerState: null, serverNow: 1_000, ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

describe('optimistic lobby room projection', () => {
  it('publishes a configuration change before the server acknowledgement', async () => {
    const projection = new OptimisticRoomProjection();
    projection.setAuthoritative(room());
    const acknowledgement = deferred<void>();
    const published: Array<RoomView | null> = [];

    const mutation = runOptimisticLobbyMutation(
      projection,
      (nextRoom) => published.push(nextRoom),
      { kind: 'config', gameId: 'shiny-vote', config: { showVotes: false } },
      () => acknowledgement.promise,
    );

    expect(published.at(-1)?.selectedGameConfig).toEqual({ showVotes: false });
    projection.setAuthoritative(room({ selectedGameConfig: { showVotes: false }, serverNow: 1_020 }));
    acknowledgement.resolve();
    await mutation;
    expect(published.at(-1)?.selectedGameConfig).toEqual({ showVotes: false });
  });

  it('does not regress to an older server broadcast while a newer edit is pending', async () => {
    const projection = new OptimisticRoomProjection();
    projection.setAuthoritative(room({ selectedGameConfig: { rounds: 5 } }));
    const firstAck = deferred<void>(); const secondAck = deferred<void>();
    const published: Array<RoomView | null> = [];
    const publish = (nextRoom: RoomView | null) => { published.push(nextRoom); };

    const first = runOptimisticLobbyMutation(projection, publish, { kind: 'config', gameId: 'shiny-vote', config: { rounds: 10 } }, () => firstAck.promise);
    const second = runOptimisticLobbyMutation(projection, publish, { kind: 'config', gameId: 'shiny-vote', config: { rounds: 15 } }, () => secondAck.promise);
    expect(published.at(-1)?.selectedGameConfig).toEqual({ rounds: 15 });

    publish(projection.setAuthoritative(room({ selectedGameConfig: { rounds: 10 }, serverNow: 1_010 })));
    firstAck.resolve(); await first;
    expect(published.at(-1)?.selectedGameConfig).toEqual({ rounds: 15 });

    publish(projection.setAuthoritative(room({ selectedGameConfig: { rounds: 15 }, serverNow: 1_020 })));
    secondAck.resolve(); await second;
    expect(published.at(-1)?.selectedGameConfig).toEqual({ rounds: 15 });
  });

  it('rolls back a rejected edit to the latest authoritative state', async () => {
    const authoritative = room({ sessionMode: { type: 'GAME_COUNT', target: 5 } });
    const projection = new OptimisticRoomProjection(); projection.setAuthoritative(authoritative);
    const acknowledgement = deferred<void>();
    const published: Array<RoomView | null> = [];

    const mutation = runOptimisticLobbyMutation(
      projection,
      (nextRoom) => { published.push(nextRoom); },
      { kind: 'session', mode: { type: 'GAME_COUNT', target: 10 } },
      () => acknowledgement.promise,
    );
    expect(published.at(-1)?.sessionMode).toEqual({ type: 'GAME_COUNT', target: 10 });

    acknowledgement.reject(new Error('Configuración rechazada'));
    await expect(mutation).rejects.toThrow('Configuración rechazada');
    expect(published.at(-1)?.sessionMode).toEqual({ type: 'GAME_COUNT', target: 5 });
  });

  it('never overlays lobby edits onto an authoritative active game', () => {
    const projection = new OptimisticRoomProjection(); projection.setAuthoritative(room());
    projection.begin({ kind: 'game-selection', mode: { type: 'RANDOM', gameIds: ['one', 'two'] } });
    expect(projection.view()?.gameSelectionMode).toEqual({ type: 'RANDOM', gameIds: ['one', 'two'] });
    const active = room({ phase: 'ROUND_ACTIVE', gameSelectionMode: { type: 'FIXED' } });
    expect(projection.setAuthoritative(active)).toBe(active);
  });

  it('does not apply a pending config to a different selected game', () => {
    const projection = new OptimisticRoomProjection(); projection.setAuthoritative(room());
    projection.begin({ kind: 'config', gameId: 'shiny-vote', config: { showVotes: false } });
    const changedGame = room({ selectedGameId: 'higher-lower', selectedGameConfig: { rounds: 5 } });
    expect(projection.setAuthoritative(changedGame)).toBe(changedGame);
  });

  it('drops unconfirmed edits when the socket disconnects', () => {
    const authoritative = room({ selectedGameConfig: { showVotes: true } });
    const projection = new OptimisticRoomProjection(); projection.setAuthoritative(authoritative);
    projection.begin({ kind: 'config', gameId: 'shiny-vote', config: { showVotes: false } });
    expect(projection.view()?.selectedGameConfig).toEqual({ showVotes: false });
    expect(projection.clearPending()).toBe(authoritative);
  });
});

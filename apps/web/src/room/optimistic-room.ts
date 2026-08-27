import type { GameSelectionMode, RoomView, SessionMode } from '@pokemon-universe/shared';

export type OptimisticLobbyUpdate =
  | { kind: 'config'; gameId: string; config: unknown }
  | { kind: 'session'; mode: SessionMode }
  | { kind: 'game-selection'; mode: GameSelectionMode };

interface PendingUpdate {
  id: number;
  update: OptimisticLobbyUpdate;
}

function applyUpdate(room: RoomView, update: OptimisticLobbyUpdate): RoomView {
  if (room.phase !== 'LOBBY') return room;
  if (update.kind === 'config') {
    const gameConfigs = { ...room.gameConfigs, [update.gameId]: update.config };
    const customizedGameIds = [...new Set([...(room.customizedGameIds ?? []), update.gameId])];
    return room.selectedGameId === update.gameId
      ? { ...room, gameConfigs, customizedGameIds, selectedGameConfig: update.config }
      : { ...room, gameConfigs, customizedGameIds };
  }
  if (update.kind === 'session') return { ...room, sessionMode: update.mode };
  return { ...room, gameSelectionMode: update.mode };
}

/** Keeps pending lobby edits visible while the server validates and broadcasts them. */
export class OptimisticRoomProjection {
  private authoritative: RoomView | null = null;
  private pending: PendingUpdate[] = [];
  private nextId = 1;

  setAuthoritative(room: RoomView | null, clearPending = false): RoomView | null {
    this.authoritative = room;
    if (clearPending) this.pending = [];
    return this.view();
  }

  begin(update: OptimisticLobbyUpdate): number {
    const id = this.nextId++;
    this.pending.push({ id, update });
    return id;
  }

  finish(id: number): RoomView | null {
    this.pending = this.pending.filter((candidate) => candidate.id !== id);
    return this.view();
  }

  clearPending(): RoomView | null {
    this.pending = [];
    return this.view();
  }

  view(): RoomView | null {
    return this.authoritative && this.pending.reduce((room, pending) => applyUpdate(room, pending.update), this.authoritative);
  }
}

export async function runOptimisticLobbyMutation<T>(
  projection: OptimisticRoomProjection,
  publish: (room: RoomView | null) => void,
  update: OptimisticLobbyUpdate,
  operation: () => Promise<T>,
): Promise<T> {
  const id = projection.begin(update);
  publish(projection.view());
  try { return await operation(); }
  finally { publish(projection.finish(id)); }
}

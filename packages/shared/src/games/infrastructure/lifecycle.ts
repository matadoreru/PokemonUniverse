import type { GamePhase } from '../contracts.js';

export interface GameLifecycle {
  phase: GamePhase;
  nextDeadline: number | null;
  actionEpoch: string;
  spectatorIds: readonly string[];
}

/** Explicit common lifecycle vocabulary; no transport reads the opaque state. */
export function timedGameLifecycle(state: {
  phase: GamePhase;
  roundEndsAt?: number | null;
  nextTransitionAt?: number | null;
  roundStartedAt?: number | null;
  roundNumber?: number;
  turnNumber?: number;
  turnIndex?: number;
  currentLotIndex?: number;
  voteRoundNumber?: number;
  currentTeam?: string;
  spectatorIds?: readonly string[];
}): GameLifecycle {
  const deadlines = [state.roundEndsAt, state.nextTransitionAt].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return {
    phase: state.phase,
    nextDeadline: deadlines.length ? Math.min(...deadlines) : null,
    actionEpoch: JSON.stringify([state.phase, state.roundNumber, state.roundStartedAt, state.turnNumber, state.turnIndex, state.currentLotIndex, state.voteRoundNumber, state.currentTeam]),
    spectatorIds: state.spectatorIds ?? [],
  };
}

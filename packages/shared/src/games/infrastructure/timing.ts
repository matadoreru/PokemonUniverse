import { allConnectedRequiredCompleted, type GameContext, type GamePhase } from '../contracts.js';

export interface TimedGameState {
  phase: GamePhase;
  roundEndsAt: number | null;
  nextTransitionAt: number | null;
}

export function deadlineReached(now: number, deadline: number | null): boolean {
  return deadline !== null && now >= deadline;
}

export function cooldownRemainingMs(now: number, cooldownUntil: number | null | undefined): number {
  return Math.max(0, (cooldownUntil ?? 0) - now);
}

export function cooldownMessage(now: number, cooldownUntil: number | null | undefined): string {
  return `Espera ${Math.ceil(cooldownRemainingMs(now, cooldownUntil) / 100) / 10}s antes de volver a intentar.`;
}

export function setPlayerCooldown(
  cooldowns: Readonly<Record<string, number>>,
  playerId: string,
  now: number,
  durationMs: number,
): Record<string, number> {
  return { ...cooldowns, [playerId]: now + durationMs };
}

export interface TimedRoundStrategy<TState extends TimedGameState> {
  beginNext(state: TState, context: GameContext): TState;
  resolveActive(state: TState, context: GameContext): TState;
  finish(state: TState, context: GameContext): TState;
  isComplete(state: TState): boolean;
  tickActive?(state: TState, context: GameContext): TState;
  activePhase?: GamePhase;
  resultsPhase?: GamePhase;
}

/** Shared active → reveal → next/finish lifecycle. Games inject only their state transitions. */
export function advanceTimedRound<TState extends TimedGameState>(
  state: TState,
  context: GameContext,
  strategy: TimedRoundStrategy<TState>,
): TState {
  const activePhase = strategy.activePhase ?? 'ROUND_ACTIVE';
  const resultsPhase = strategy.resultsPhase ?? 'ROUND_RESULTS';
  if (state.phase === resultsPhase && deadlineReached(context.now, state.nextTransitionAt)) {
    return strategy.isComplete(state) ? strategy.finish(state, context) : strategy.beginNext(state, context);
  }
  if (state.phase !== activePhase) return state;
  if (deadlineReached(context.now, state.roundEndsAt)) return strategy.resolveActive(state, context);
  return strategy.tickActive?.(state, context) ?? state;
}

/** Presence changes use the same completion rule as actions without exposing game secrets. */
export function resolveWhenRequiredPlayersComplete<TState extends TimedGameState>(
  state: TState,
  context: GameContext,
  playerIds: readonly string[],
  completed: (playerId: string) => boolean,
  resolve: (state: TState, context: GameContext) => TState,
  activePhase: GamePhase = 'ROUND_ACTIVE',
): TState {
  return state.phase === activePhase && allConnectedRequiredCompleted(context, playerIds, completed)
    ? resolve(state, context)
    : state;
}

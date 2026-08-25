import { describe, expect, it } from 'vitest';
import { advanceTimedRound, cooldownMessage, cooldownRemainingMs, deadlineReached, setPlayerCooldown } from './timing.js';

describe('timed game infrastructure', () => {
  it('handles nullable deadlines and cooldown maps consistently', () => {
    expect(deadlineReached(10, null)).toBe(false);
    expect(deadlineReached(10, 10)).toBe(true);
    expect(cooldownRemainingMs(1_250, 2_000)).toBe(750);
    expect(cooldownMessage(1_250, 2_000)).toBe('Espera 0.8s antes de volver a intentar.');
    expect(setPlayerCooldown({ other: 1 }, 'player', 1_000, 500)).toEqual({ other: 1, player: 1_500 });
  });

  it('delegates lifecycle transitions to the supplied strategy', () => {
    type State = { phase: 'ROUND_ACTIVE' | 'ROUND_RESULTS' | 'GAME_RESULTS'; roundEndsAt: number | null; nextTransitionAt: number | null; rounds: number };
    const context = { players: [], pokemon: {} as never, now: 100, random: () => 0 };
    const strategy = {
      resolveActive: (state: State): State => ({ ...state, phase: 'ROUND_RESULTS', roundEndsAt: null, nextTransitionAt: 120 }),
      beginNext: (state: State): State => ({ ...state, phase: 'ROUND_ACTIVE', rounds: state.rounds + 1, roundEndsAt: 200, nextTransitionAt: null }),
      finish: (state: State): State => ({ ...state, phase: 'GAME_RESULTS', roundEndsAt: null, nextTransitionAt: null }),
      isComplete: (state: State) => state.rounds >= 2,
    };
    const active: State = { phase: 'ROUND_ACTIVE', roundEndsAt: 100, nextTransitionAt: null, rounds: 1 };
    const revealed = advanceTimedRound(active, context, strategy);
    expect(revealed.phase).toBe('ROUND_RESULTS');
    expect(advanceTimedRound({ ...revealed, nextTransitionAt: 100, rounds: 2 }, context, strategy).phase).toBe('GAME_RESULTS');
  });
});

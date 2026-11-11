import type { LearnsetMoveHint } from '@pokemon-universe/shared/public';
import { describe, expect, it } from 'vitest';
import { revealedLearnsetFlags } from './learnset-reveal';

const hint = (moveId: string, level: number | null): LearnsetMoveHint => ({ moveId, name: moveId, level, type: 'normal', category: 'status' });

describe('revealedLearnsetFlags', () => {
  it('marks a repeated move only as many times as it was revealed when levels are hidden', () => {
    const learnset = [hint('growl', null), hint('tackle', null), hint('growl', null)];
    expect(revealedLearnsetFlags(learnset, [hint('growl', null), hint('tackle', null)])).toEqual([true, true, false]);
  });

  it('marks each entry by its own level when levels are visible', () => {
    const learnset = [hint('growl', 1), hint('tackle', 5), hint('growl', 20)];
    expect(revealedLearnsetFlags(learnset, [hint('growl', 20)])).toEqual([false, false, true]);
    expect(revealedLearnsetFlags(learnset, [hint('growl', 1), hint('tackle', 5)])).toEqual([true, true, false]);
  });

  it('does not depend on the order of the revealed moves', () => {
    const learnset = [hint('growl', null), hint('tackle', null), hint('growl', null)];
    expect(revealedLearnsetFlags(learnset, [hint('tackle', null), hint('growl', null)])).toEqual([true, true, false]);
  });

  it('ignores revealed entries that are not in the learnset', () => {
    const learnset = [hint('growl', 1), hint('tackle', 5)];
    expect(revealedLearnsetFlags(learnset, [hint('ember', 7), hint('tackle', 5)])).toEqual([false, true]);
  });
});

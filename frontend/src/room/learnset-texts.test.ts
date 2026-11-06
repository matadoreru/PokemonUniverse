import { describe, expect, it } from 'vitest';
import { learnsetLastWarningAnnouncement, learnsetLastWarningText, learnsetRevealStatus, learnsetScoreboard, learnsetSolvedAnnouncement, learnsetStakeText, learnsetGroupProgress, learnsetManualStakeText } from './learnset-texts';

describe('learnsetLastWarningText', () => {
  it('tells the only missing player the real seconds left', () => {
    expect(learnsetLastWarningText(true, false, 10)).toBe('¡Último aviso! Solo faltas tú: 10 segundos.');
    expect(learnsetLastWarningText(true, false, 4)).toBe('¡Último aviso! Solo faltas tú: 4 segundos.');
  });

  it('tells everyone else the real seconds left', () => {
    expect(learnsetLastWarningText(true, true, 10)).toBe('Último aviso: la ronda se cierra en 10 segundos.');
    expect(learnsetLastWarningText(true, true, 3)).toBe('Último aviso: la ronda se cierra en 3 segundos.');
  });

  it('uses the singular for one second', () => {
    expect(learnsetLastWarningText(true, false, 1)).toBe('¡Último aviso! Solo faltas tú: 1 segundo.');
    expect(learnsetLastWarningText(true, true, 1)).toBe('Último aviso: la ronda se cierra en 1 segundo.');
  });

  it('falls back to neutral wording when no seconds are left to count', () => {
    expect(learnsetLastWarningText(true, false, 0)).toBe('¡Último aviso! Se acaba pronto.');
    expect(learnsetLastWarningText(true, true, Number.NaN)).toBe('¡Último aviso! Se acaba pronto.');
  });

  it('shows nothing without a last warning', () => {
    expect(learnsetLastWarningText(false, false, 10)).toBeNull();
    expect(learnsetLastWarningText(false, true, 10)).toBeNull();
  });
});

describe('learnsetStakeText', () => {
  it('values a guess on the initial hints with the first-solver bonus', () => {
    expect(learnsetStakeText([{ stage: 0 }, { stage: 0 }], 0)).toBe('Ahora vale 7 pts');
  });

  it('uses the highest visible stage, the next solve order and the singular for one point', () => {
    expect(learnsetStakeText([{ stage: 0 }, { stage: 1 }, { stage: 2 }, { stage: 3 }, { stage: 4 }], 2)).toBe('Ahora vale 1 pt');
    expect(learnsetStakeText([{ stage: 0 }, { stage: 2 }, { stage: 1 }], 1)).toBe('Ahora vale 4 pts');
  });

  it('keeps the minimum plus the order bonus once the hints run out, and survives no groups', () => {
    expect(learnsetStakeText([{ stage: 6 }], 0)).toBe('Ahora vale 3 pts');
    expect(learnsetStakeText([], 0)).toBe('Ahora vale 7 pts');
  });
});

describe('learnsetRevealStatus', () => {
  it('marks a solve as solved even if the player has since disconnected', () => {
    expect(learnsetRevealStatus(true, true)).toBe('solved');
    expect(learnsetRevealStatus(true, false)).toBe('solved');
  });

  it('tells a connected miss from a disconnected one', () => {
    expect(learnsetRevealStatus(false, true)).toBe('missed');
    expect(learnsetRevealStatus(false, false)).toBe('offline');
  });
});

describe('learnsetSolvedAnnouncement', () => {
  it('names who has just solved', () => {
    expect(learnsetSolvedAnnouncement('Misty')).toBe('Misty ha acertado');
  });
});

describe('learnsetScoreboard', () => {
  it('ranks players by score, then by name, and leaves spectators out', () => {
    const members = [
      { id: 'c', displayName: 'Brock', role: 'PLAYER' },
      { id: 'a', displayName: 'Misty', role: 'PLAYER' },
      { id: 's', displayName: 'Oak', role: 'SPECTATOR' },
      { id: 'b', displayName: 'Ash', role: 'PLAYER' },
    ] as const;
    expect(learnsetScoreboard(members, { a: 7, c: 0 }).map((entry) => [entry.member.id, entry.points])).toEqual([['a', 7], ['b', 0], ['c', 0]]);
  });
});

describe('learnsetLastWarningAnnouncement', () => {
  it('is a fixed text without the countdown, only during the warning', () => {
    expect(learnsetLastWarningAnnouncement(false, false)).toBeNull();
    expect(learnsetLastWarningAnnouncement(true, false)).toBe('¡Último aviso! Solo faltas tú: la ronda se cierra en unos segundos.');
    expect(learnsetLastWarningAnnouncement(true, true)).not.toMatch(/\d/);
  });
});

describe('Revelación manual', () => {
  it('values a solve with max(1, total − visible + 1) × 10', () => {
    expect(learnsetManualStakeText(5, 1)).toBe('Ahora vale 50 pts');
    expect(learnsetManualStakeText(5, 5)).toBe('Ahora vale 10 pts');
  });
  it('counts the unlocked groups', () => {
    expect(learnsetGroupProgress(1, 7)).toBe('1 de 7 grupos');
    expect(learnsetGroupProgress(1, 1)).toBe('1 de 1 grupo');
  });
});

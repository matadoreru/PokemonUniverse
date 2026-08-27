import { describe, expect, it } from 'vitest';
import { allEligibleRunoffVotersCompleted, eligibleRunoffVoterIds, leadingRunoffCandidateIds, recordRunoffVoteRound } from './runoff-voting.js';

describe('shared runoff voting', () => {
  it('excludes disconnected voters and players with no legal candidate', () => {
    const connected = new Set(['p1', 'p2', 'p3']);
    expect(eligibleRunoffVoterIds(['p1', 'p2', 'p3', 'p4'], ['p1'], (id) => connected.has(id), (voter, candidate) => voter !== candidate)).toEqual(['p2', 'p3']);
  });

  it('records immutable rounds and narrows ties without carrying prior ballots', () => {
    const votes = { p1: 'p2', p2: 'p1', p3: 'p2', p4: 'p1' };
    expect(leadingRunoffCandidateIds(['p1', 'p2', 'p3'], votes)).toEqual(['p1', 'p2']);
    expect(recordRunoffVoteRound(1, ['p1', 'p2', 'p3'], votes)).toEqual({ number: 1, candidateIds: ['p1', 'p2', 'p3'], votes });
    expect(allEligibleRunoffVotersCompleted(['p1', 'p2'], {})).toBe(false);
    expect(allEligibleRunoffVotersCompleted(['p1', 'p2'], { p1: 'p2', p2: 'p1' })).toBe(true);
  });
});

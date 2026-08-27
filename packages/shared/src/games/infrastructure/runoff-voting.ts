export interface RunoffVoteRound {
  number: number;
  candidateIds: string[];
  votes: Record<string, string>;
}

export function eligibleRunoffVoterIds(
  playerIds: readonly string[],
  candidateIds: readonly string[],
  isRequired: (playerId: string) => boolean,
  canVoteFor: (playerId: string, candidateId: string) => boolean,
): string[] {
  return playerIds.filter((playerId) => isRequired(playerId) && candidateIds.some((candidateId) => canVoteFor(playerId, candidateId)));
}

export function allEligibleRunoffVotersCompleted(
  eligiblePlayerIds: readonly string[],
  votes: Readonly<Record<string, string>>,
): boolean {
  return eligiblePlayerIds.every((playerId) => Boolean(votes[playerId]));
}

export function recordRunoffVoteRound(
  number: number,
  candidateIds: readonly string[],
  votes: Readonly<Record<string, string>>,
): RunoffVoteRound {
  return { number, candidateIds: [...candidateIds], votes: { ...votes } };
}

export function leadingRunoffCandidateIds(
  candidateIds: readonly string[],
  votes: Readonly<Record<string, string>>,
): string[] {
  if (candidateIds.length === 0) return [];
  const tallies = Object.fromEntries(candidateIds.map((candidateId) => [candidateId, 0]));
  for (const candidateId of Object.values(votes)) {
    if (candidateId in tallies) tallies[candidateId] = (tallies[candidateId] ?? 0) + 1;
  }
  const maximum = Math.max(...Object.values(tallies));
  return candidateIds.filter((candidateId) => tallies[candidateId] === maximum);
}

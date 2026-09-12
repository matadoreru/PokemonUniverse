import type { GameSkipStateView } from '@pokemon-universe/shared';
import type { LiveRoom } from './types.js';

export function eligibleGameSkipVoterIds(room: LiveRoom): string[] {
  const game = room.game;
  if (!game || game.finishReason !== null) return [];
  return game.participantIds.filter((playerId) => {
    const member = room.members.get(playerId);
    return Boolean(member && member.presence !== 'LEFT' && !game.departedParticipantIds.has(playerId));
  });
}

export function reconcileGameSkipVotes(room: LiveRoom): string[] {
  const game = room.game;
  const eligibleIds = eligibleGameSkipVoterIds(room);
  if (!game) return eligibleIds;
  const eligible = new Set(eligibleIds);
  for (const playerId of game.skipVoterIds) if (!eligible.has(playerId)) game.skipVoterIds.delete(playerId);
  return eligibleIds;
}

export function hasUnanimousGameSkip(room: LiveRoom, eligibleIds = reconcileGameSkipVotes(room)): boolean {
  const votes = room.game?.skipVoterIds;
  return Boolean(votes && eligibleIds.length > 0 && eligibleIds.every((playerId) => votes.has(playerId)));
}

export function gameSkipStateView(room: LiveRoom, playerId: string): GameSkipStateView | null {
  const game = room.game;
  if (!game || game.finishReason !== null || room.phase === 'GAME_RESULTS') return null;
  const eligibleIds = eligibleGameSkipVoterIds(room);
  const voterIds = eligibleIds.filter((eligibleId) => game.skipVoterIds.has(eligibleId));
  const member = room.members.get(playerId);
  return {
    gameInstanceId: game.resultId,
    voterIds,
    votes: voterIds.length,
    requiredVotes: eligibleIds.length,
    currentUserVoted: game.skipVoterIds.has(playerId),
    canVote: Boolean(member?.presence === 'CONNECTED' && eligibleIds.includes(playerId)),
  };
}

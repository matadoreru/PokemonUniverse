import type { ShinyOptionId, ShinyVoteAction } from '@pokemon-universe/shared';

const SHORTCUTS: Readonly<Record<string, ShinyOptionId>> = {
  '1': 'A',
  a: 'A',
  '2': 'B',
  b: 'B',
  '3': 'C',
  c: 'C',
  '4': 'D',
  d: 'D',
  '5': 'E',
  e: 'E',
  '6': 'F',
  f: 'F',
};

export function shinyOptionFromShortcut(key: string, optionIds: readonly ShinyOptionId[]): ShinyOptionId | null {
  const optionId = SHORTCUTS[key.toLowerCase()];
  return optionId && optionIds.includes(optionId) ? optionId : null;
}

export function updateShinyDraft(current: ShinyOptionId | null, requested: ShinyOptionId, canVote: boolean): ShinyOptionId | null {
  return canVote ? requested : current;
}

export function createShinyVoteAction(optionId: ShinyOptionId | null, canVote: boolean, submitting: boolean): ShinyVoteAction | null {
  return optionId && canVote && !submitting ? { type: 'VOTE', optionId } : null;
}

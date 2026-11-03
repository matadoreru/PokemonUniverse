import { describe, expect, it } from 'vitest';
import { createShinyVoteAction, shinyOptionFromShortcut, updateShinyDraft } from './interaction';

describe('Shiny Quiz interactions', () => {
  it('selects and changes the draft before confirmation', () => {
    const selected = updateShinyDraft(null, 'A', true);
    expect(selected).toBe('A');
    expect(updateShinyDraft(selected, 'C', true)).toBe('C');
  });

  it('keeps the current choice when voting is locked', () => {
    expect(updateShinyDraft('B', 'D', false)).toBe('B');
  });

  it('only creates a confirmation action for an enabled selection', () => {
    expect(createShinyVoteAction('B', true, false)).toEqual({ type: 'VOTE', optionId: 'B' });
    expect(createShinyVoteAction(null, true, false)).toBeNull();
    expect(createShinyVoteAction('B', false, false)).toBeNull();
    expect(createShinyVoteAction('B', true, true)).toBeNull();
  });

  it('maps letter and number shortcuts only to options in the round', () => {
    expect(shinyOptionFromShortcut('1', ['A', 'B', 'C', 'D'])).toBe('A');
    expect(shinyOptionFromShortcut('b', ['A', 'B', 'C', 'D'])).toBe('B');
    expect(shinyOptionFromShortcut('D', ['A', 'B', 'C', 'D'])).toBe('D');
    expect(shinyOptionFromShortcut('5', ['A', 'B', 'C', 'D'])).toBeNull();
  });
});

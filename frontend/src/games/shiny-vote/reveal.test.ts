import { describe, expect, it } from 'vitest';
import { SHINY_BEFORE_AFTER, SHINY_CARDS_LOADING, SHINY_REVEAL_DURATION_LABEL, shinyCardsReady, shinyRevealSecondsLabel, shinyRoundFeedback } from './reveal';

describe('shinyCardsReady', () => {
  it('shinyCardsReadyAfterTimeoutEvenIfImagesFail', () => {
    expect(shinyCardsReady(0, 4, 4_000)).toBe(true);
  });

  it('waits while some cards are still loading', () => {
    expect(shinyCardsReady(3, 4, 100)).toBe(false);
    expect(shinyCardsReady(3, 4, 3_999)).toBe(false);
  });

  it('is ready as soon as every card has loaded', () => {
    expect(shinyCardsReady(4, 4, 0)).toBe(true);
  });

  it('honours a custom timeout and an empty round', () => {
    expect(shinyCardsReady(0, 4, 1_000, 1_000)).toBe(true);
    expect(shinyCardsReady(0, 0, 0)).toBe(true);
  });
});

describe('shinyRoundFeedback', () => {
  it('is null before the reveal', () => {
    expect(shinyRoundFeedback(null, true)).toBeNull();
    expect(shinyRoundFeedback(null, false)).toBeNull();
  });

  it('shows the points in leaf on a hit', () => {
    expect(shinyRoundFeedback({ correct: true, points: 3 }, true)).toEqual({ label: '+3' });
  });

  it('shows +0 in berry on a miss or without a vote', () => {
    expect(shinyRoundFeedback({ correct: false, points: 0 }, true)).toEqual({ label: '+0' });
    expect(shinyRoundFeedback({ correct: false, points: 0 }, false)).toEqual({ label: '+0' });
  });
});

describe('textos de la revelación', () => {
  it('names the loading state, the before/after strip and the reveal range', () => {
    expect(SHINY_CARDS_LOADING).toBe('Cargando cartas…');
    expect(SHINY_BEFORE_AFTER).toEqual({ title: 'Antes / después', normal: 'Normal', shiny: 'Shiny', missing: 'Sin sprite' });
    expect(SHINY_REVEAL_DURATION_LABEL).toBe('Duración de la revelación');
    expect(shinyRevealSecondsLabel(4)).toBe('4 segundos');
  });
});

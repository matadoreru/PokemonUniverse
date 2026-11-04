import { describe, expect, it } from 'vitest';
import { feedbackHref } from './feedback-target';

describe('feedbackHref', () => {
  it('sin contexto lleva a la página de feedback a secas', () => {
    expect(feedbackHref(null)).toBe('/feedback');
    expect(feedbackHref({ game: null, room: undefined })).toBe('/feedback');
  });

  it('dentro de una sala añade el minijuego y el código', () => {
    expect(feedbackHref({ game: 'pokedex-distance', room: 'ABC234' })).toBe('/feedback?game=pokedex-distance&room=ABC234');
    expect(feedbackHref({ room: 'ABC234' })).toBe('/feedback?room=ABC234');
  });
});

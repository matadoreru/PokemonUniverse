import { describe, expect, it } from 'vitest';
import { SHINY_VOTE_VISIBILITY_LABEL, shinyVisibilityChip, shinyVisibilityLabels, shinyVotersVisible } from './vote-visibility';

describe('shinyVotersVisible', () => {
  it('oculta los votos de los demás hasta revelar por defecto', () => {
    expect(shinyVotersVisible('REVEAL', false)).toBe(false);
    expect(shinyVotersVisible('REVEAL', true)).toBe(true);
  });
  it('los muestra siempre en directo', () => {
    expect(shinyVotersVisible('LIVE', false)).toBe(true);
    expect(shinyVotersVisible('LIVE', true)).toBe(true);
  });
});

describe('shinyVisibilityChip', () => {
  it('nombra el modo en la cabecera de la partida', () => {
    expect(shinyVisibilityChip('LIVE')).toBe('Votos en directo');
    expect(shinyVisibilityChip('REVEAL')).toBe('Votos al revelar');
  });
});

describe('etiquetas del panel', () => {
  it('nombra el grupo y los dos modos', () => {
    expect(SHINY_VOTE_VISIBILITY_LABEL).toBe('Votos de otros jugadores');
    expect(shinyVisibilityLabels).toEqual({ REVEAL: 'Al revelar', LIVE: 'En directo' });
  });
});

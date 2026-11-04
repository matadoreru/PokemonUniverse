import { describe, expect, it } from 'vitest';
import { shouldRefocusSubmit } from './focus-transition';

describe('foco tras un rechazo (papeleta, Red Flag, Secret Ranking)', () => {
  const busy = { epoch: 2, busy: true };
  it('vuelve al botón de envío si se rechaza en la misma época con el foco en el body', () => {
    expect(shouldRefocusSubmit(busy, { epoch: 2, busy: false, open: true }, true)).toBe(true);
  });
  it('no lo mueve si el foco ya está en otro sitio, si cambia la época, si se aceptó o si no estaba ocupado', () => {
    expect(shouldRefocusSubmit(busy, { epoch: 2, busy: false, open: true }, false)).toBe(false);
    expect(shouldRefocusSubmit(busy, { epoch: 3, busy: false, open: true }, true)).toBe(false);
    expect(shouldRefocusSubmit(busy, { epoch: 2, busy: false, open: false }, true)).toBe(false);
    expect(shouldRefocusSubmit({ epoch: 2, busy: false }, { epoch: 2, busy: false, open: true }, true)).toBe(false);
    expect(shouldRefocusSubmit(busy, { epoch: 2, busy: true, open: true }, true)).toBe(false);
  });
});

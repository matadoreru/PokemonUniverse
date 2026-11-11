import { describe, expect, it } from 'vitest';
import { LIVE_VISIBILITY_WARNING } from './live-visibility';

describe('LIVE_VISIBILITY_WARNING', () => {
  it('avisa de que el modo en directo permite copiar', () => {
    expect(LIVE_VISIBILITY_WARNING).toBe('Permite copiar: los demás ven tu elección al momento.');
  });
});

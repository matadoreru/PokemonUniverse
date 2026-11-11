import { describe, expect, it } from 'vitest';
import { liveRegions } from './live-regions';

describe('liveRegions', () => {
  it('cuenta elementos con rol vivo o aria-live, no atributos', () => {
    expect(liveRegions('<p class="sr-only" role="status" aria-live="polite">Hola</p>')).toHaveLength(1);
    expect(liveRegions('<div role="alert">x</div><ul role="log"></ul><span aria-live="assertive"></span>')).toHaveLength(3);
  });
  it('no cuenta aria-live="off" ni otros roles', () => {
    expect(liveRegions('<div role="status" aria-live="off"></div><div role="region" aria-label="status"></div><p>role="status"</p>')).toHaveLength(0);
  });
});

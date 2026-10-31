import { describe, expect, it } from 'vitest';
import { mulberry32 } from './prng.js';

describe('mulberry32', () => {
  it('reproduce la secuencia fijada que el lado Java debe reproducir', () => {
    const random = mulberry32(42);
    expect([random(), random(), random()]).toEqual([0.6011037519201636, 0.44829055899754167, 0.8524657934904099]);
  });

  it('distingue semillas distintas', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

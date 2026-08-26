import { describe, expect, it } from 'vitest';
import { extractSpanishAbilityName } from './ability-source.js';

describe('Spanish ability name acquisition', () => {
  it('selects the official Spanish name without rewriting it', () => {
    expect(extractSpanishAbilityName([
      { name: 'Inner Focus', language: { name: 'en' } },
      { name: '  Foco Interno  ', language: { name: 'es' } },
    ])).toBe('Foco Interno');
  });

  it('does not fall back to an English name', () => {
    expect(extractSpanishAbilityName([
      { name: 'Overgrow', language: { name: 'en' } },
    ])).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { rateLimitDisabled } from './rate-limit.js';

describe('rateLimitDisabled', () => {
  it('desactiva el limitador fuera de producción', () => {
    expect(rateLimitDisabled({ NODE_ENV: 'development', RATE_LIMIT_DISABLED: true })).toBe(true);
  });
  it('ignora el interruptor en producción', () => {
    expect(rateLimitDisabled({ NODE_ENV: 'production', RATE_LIMIT_DISABLED: true })).toBe(false);
  });
  it('mantiene el limitador si el interruptor está apagado', () => {
    expect(rateLimitDisabled({ NODE_ENV: 'development', RATE_LIMIT_DISABLED: false })).toBe(false);
  });
});

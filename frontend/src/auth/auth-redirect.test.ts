import { describe, expect, it } from 'vitest';
import { authRedirectState, authRedirectTarget } from './auth-redirect';

describe('authRedirectTarget', () => {
  it('returns to the protected route that sent the visitor to log in, with its search', () => {
    expect(authRedirectTarget(authRedirectState({ pathname: '/play', search: '?sala=PIKA42' }))).toBe('/play?sala=PIKA42');
    expect(authRedirectTarget({ from: '/profile' })).toBe('/profile');
  });

  it('falls back to /play without a safe internal path', () => {
    expect(authRedirectTarget(null)).toBe('/play');
    expect(authRedirectTarget(undefined)).toBe('/play');
    expect(authRedirectTarget({ from: 42 })).toBe('/play');
    expect(authRedirectTarget({ from: 'https://evil.example' })).toBe('/play');
    expect(authRedirectTarget({ from: '//evil.example' })).toBe('/play');
    expect(authRedirectTarget({ from: '/\\evil.example' })).toBe('/play');
    expect(authRedirectTarget({ from: '/auth?mode=guest' })).toBe('/play');
  });
});

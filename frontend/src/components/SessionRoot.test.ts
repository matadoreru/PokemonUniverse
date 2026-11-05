import { describe, expect, it } from 'vitest';
import { socketActive } from './SessionRoot';

describe('socketActive', () => {
  it('una cuenta registrada abre el /ws en toda página; un invitado, solo en las rutas de sala; sin sesión, nunca', () => {
    for (const path of ['/', '/profile', '/feedback', '/play', '/room']) expect(socketActive('USER', path)).toBe(true);
    expect(socketActive('GUEST', '/play')).toBe(true);
    expect(socketActive('GUEST', '/room')).toBe(true);
    expect(socketActive('GUEST', '/')).toBe(false);
    expect(socketActive('GUEST', '/changelog')).toBe(false);
    expect(socketActive(undefined, '/play')).toBe(false);
  });
});

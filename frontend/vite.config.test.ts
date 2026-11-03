import { describe, expect, it } from 'vitest';
import { proxyFor } from './vite.config';

const JAVA = 'http://localhost:8080';

/** Destino que Vite elegiría para `url`: la primera clave que encaja, en orden (las que empiezan por `^` son regex). */
function targetFor(url: string): unknown {
  const proxy = proxyFor();
  const key = Object.keys(proxy).find((k) => (k.startsWith('^') ? new RegExp(k).test(url) : url.startsWith(k)));
  return key === undefined ? undefined : proxy[key];
}

describe('proxyFor', () => {
  it('sends every /api route to the Java backend', () => {
    const urls = [
      '/api/health', '/api/games', '/api/pokemon?limit=5', '/api/changelog', '/api/feedback',
      '/api/auth/login', '/api/auth/me', '/api/auth/avatars/abc.webp', '/api/auth/guest/custom-avatar', '/api/auth/profile/avatar/preset',
      '/api/rooms/ABC234/rounds/1/image', '/api/categories/abc', '/api/would-you-rather-prompts/import',
      '/api/tcg/options', '/api/admin/rooms?page=2', '/api/settings/higher-lower', '/api/whatever/new',
    ];
    for (const url of urls) expect(targetFor(url), url).toBe(JAVA);
  });

  it('proxies the room WebSocket /ws to Java with upgrades', () => {
    expect(targetFor('/ws')).toEqual({ target: 'ws://localhost:8080', ws: true });
  });

  it('has no Node targets left', () => {
    const proxy = proxyFor();
    expect(Object.keys(proxy)).not.toContain('/socket.io');
    expect(JSON.stringify(proxy)).not.toContain('3001');
  });
});

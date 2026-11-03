import { describe, expect, it } from 'vitest';
import { proxyFor } from './vite.config';

describe('proxyFor', () => {
  it('routes round assets to the Java backend before /api when realtime is java', () => {
    const proxy = proxyFor('java');
    const keys = Object.keys(proxy);
    expect(proxy['^/api/rooms/']).toBe('http://localhost:8080');
    expect(keys.indexOf('^/api/rooms/')).toBeGreaterThanOrEqual(0);
    expect(keys.indexOf('^/api/rooms/')).toBeLessThan(keys.indexOf('/api'));
  });

  it('keeps round assets on Node otherwise', () => {
    for (const realtime of [undefined, 'node']) {
      const proxy = proxyFor(realtime);
      expect(Object.keys(proxy)).not.toContain('^/api/rooms/');
      expect(proxy['/api']).toBe('http://localhost:3001');
    }
  });

  it('routes /api/health to the Java backend in every mode', () => {
    for (const realtime of [undefined, 'node', 'java']) {
      const proxy = proxyFor(realtime);
      const key = Object.keys(proxy).find((k) => new RegExp(k).test('/api/health'));
      expect(key).not.toBe('/api');
      expect(proxy[key as string]).toBe('http://localhost:8080');
      expect(Object.keys(proxy).indexOf(key as string)).toBeLessThan(Object.keys(proxy).indexOf('/api'));
    }
  });

  it('routes /api/categories to Java only when realtime is java', () => {
    const urls = ['/api/categories', '/api/categories/abc', '/api/categories?x=1'];
    const java = proxyFor('java');
    for (const url of urls) {
      const key = Object.keys(java).find((k) => new RegExp(k).test(url));
      expect(java[key as string]).toBe('http://localhost:8080');
      expect(Object.keys(java).indexOf(key as string)).toBeLessThan(Object.keys(java).indexOf('/api'));
    }
    expect(Object.keys(java).find((k) => k.startsWith('^') && new RegExp(k).test('/api/categoriesx'))).toBeUndefined();
    for (const realtime of [undefined, 'node']) {
      const proxy = proxyFor(realtime);
      for (const url of urls) expect(Object.keys(proxy).find((k) => k.startsWith('^') && new RegExp(k).test(url))).toBeUndefined();
    }
  });

  it('routes /api/would-you-rather-prompts to Java only when realtime is java', () => {
    const urls = ['/api/would-you-rather-prompts', '/api/would-you-rather-prompts/import', '/api/would-you-rather-prompts/abc', '/api/would-you-rather-prompts?x=1'];
    const java = proxyFor('java');
    for (const url of urls) {
      const key = Object.keys(java).find((k) => new RegExp(k).test(url));
      expect(java[key as string]).toBe('http://localhost:8080');
      expect(Object.keys(java).indexOf(key as string)).toBeLessThan(Object.keys(java).indexOf('/api'));
    }
    expect(Object.keys(java).find((k) => k.startsWith('^') && new RegExp(k).test('/api/would-you-rather-promptsx'))).toBeUndefined();
    for (const realtime of [undefined, 'node']) {
      const proxy = proxyFor(realtime);
      for (const url of urls) expect(Object.keys(proxy).find((k) => k.startsWith('^') && new RegExp(k).test(url))).toBeUndefined();
    }
  });

  it('routes /api/tcg/ to Java only when realtime is java', () => {
    const urls = ['/api/tcg/options', '/api/tcg/eligibility', '/api/tcg/options?x=1'];
    const java = proxyFor('java');
    for (const url of urls) {
      const key = Object.keys(java).find((k) => new RegExp(k).test(url));
      expect(java[key as string]).toBe('http://localhost:8080');
      expect(Object.keys(java).indexOf(key as string)).toBeLessThan(Object.keys(java).indexOf('/api'));
    }
    expect(Object.keys(java).find((k) => k.startsWith('^') && new RegExp(k).test('/api/tcgx'))).toBeUndefined();
    for (const realtime of [undefined, 'node']) {
      const proxy = proxyFor(realtime);
      for (const url of urls) expect(Object.keys(proxy).find((k) => k.startsWith('^') && new RegExp(k).test(url))).toBeUndefined();
    }
  });

  it('routes avatar writes to Java only when realtime is java', () => {
    const urls = ['/api/auth/guest/custom-avatar', '/api/auth/guest/custom-avatar?displayName=Ana', '/api/auth/profile/avatar', '/api/auth/profile/avatar/preset', '/api/auth/profile/avatar/custom'];
    const java = proxyFor('java');
    for (const url of urls) {
      const key = Object.keys(java).find((k) => new RegExp(k).test(url));
      expect(java[key as string]).toBe('http://localhost:8080');
      expect(Object.keys(java).indexOf(key as string)).toBeLessThan(Object.keys(java).indexOf('/api'));
    }
    for (const url of ['/api/auth/profile/avatarx', '/api/auth/guest/custom-avatarx']) {
      expect(Object.keys(java).find((k) => k.startsWith('^') && new RegExp(k).test(url))).toBeUndefined();
    }
    for (const realtime of [undefined, 'node']) {
      const proxy = proxyFor(realtime);
      for (const url of urls) expect(Object.keys(proxy).find((k) => k.startsWith('^') && new RegExp(k).test(url))).toBeUndefined();
    }
  });

  it('routes /api/admin/ to Java only when realtime is java', () => {
    const urls = ['/api/admin/summary', '/api/admin/rooms?page=2&search=ash', '/api/admin/data-sync/pokemon', '/api/admin/changelog/abc', '/api/admin/feedback/abc/status'];
    const java = proxyFor('java');
    for (const url of urls) {
      const key = Object.keys(java).find((k) => new RegExp(k).test(url));
      expect(java[key as string]).toBe('http://localhost:8080');
      expect(Object.keys(java).indexOf(key as string)).toBeLessThan(Object.keys(java).indexOf('/api'));
    }
    expect(Object.keys(java).find((k) => k.startsWith('^') && new RegExp(k).test('/api/adminx'))).toBeUndefined();
    for (const realtime of [undefined, 'node']) {
      const proxy = proxyFor(realtime);
      for (const url of urls) expect(Object.keys(proxy).find((k) => k.startsWith('^') && new RegExp(k).test(url))).toBeUndefined();
    }
  });
});

import { describe, expect, it, vi } from 'vitest';
import { parseRoomLinkCode, roomJoinUrl, shareRoomLink, type ShareEnvironment } from './room-link';

describe('parseRoomLinkCode', () => {
  it('accepts a room code in any case and with spaces', () => {
    expect(parseRoomLinkCode('PIKA42')).toBe('PIKA42');
    expect(parseRoomLinkCode('pika42')).toBe('PIKA42');
    expect(parseRoomLinkCode('  pi ka 42 ')).toBe('PIKA42');
    expect(parseRoomLinkCode('Pika\t42')).toBe('PIKA42');
  });

  it('ignores anything that is not a valid code', () => {
    expect(parseRoomLinkCode(null)).toBeNull();
    expect(parseRoomLinkCode(undefined)).toBeNull();
    expect(parseRoomLinkCode('')).toBeNull();
    expect(parseRoomLinkCode('PIKA4')).toBeNull();
    expect(parseRoomLinkCode('PIKA423')).toBeNull();
    // 0 y 1 no existen en los códigos (`^[A-Z2-9]{6}$`), ni los guiones ni las letras con tilde.
    expect(parseRoomLinkCode('PIKA10')).toBeNull();
    expect(parseRoomLinkCode('PIK-42')).toBeNull();
    expect(parseRoomLinkCode('PIKÁ42')).toBeNull();
    expect(parseRoomLinkCode('<script>')).toBeNull();
  });
});

describe('roomJoinUrl', () => {
  it('points to /play with the code in ?sala=', () => {
    expect(roomJoinUrl('PIKA42', 'https://pokemon.example')).toBe('https://pokemon.example/play?sala=PIKA42');
  });
});

describe('shareRoomLink', () => {
  const env = (overrides: Partial<ShareEnvironment> = {}): ShareEnvironment => ({ touch: false, writeText: vi.fn(() => Promise.resolve()), ...overrides });

  it('copies the full URL on desktop, even if the browser can share', async () => {
    const share = vi.fn(() => Promise.resolve());
    const desktop = env({ share });
    expect(await shareRoomLink('PIKA42', 'https://pu.test', desktop)).toBe('copied');
    expect(desktop.writeText).toHaveBeenCalledWith('https://pu.test/play?sala=PIKA42');
    expect(share).not.toHaveBeenCalled();
  });

  it('opens the share sheet on touch screens with navigator.share', async () => {
    const share = vi.fn(() => Promise.resolve());
    const touch = env({ touch: true, share });
    expect(await shareRoomLink('PIKA42', 'https://pu.test', touch)).toBe('shared');
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://pu.test/play?sala=PIKA42' }));
    expect(touch.writeText).not.toHaveBeenCalled();
  });

  it('closing the share sheet copies nothing; another share failure falls back to the clipboard', async () => {
    const cancelled = env({ touch: true, share: () => Promise.reject(new DOMException('cancelado', 'AbortError')) });
    expect(await shareRoomLink('PIKA42', 'https://pu.test', cancelled)).toBe('cancelled');
    expect(cancelled.writeText).not.toHaveBeenCalled();
    const broken = env({ touch: true, share: () => Promise.reject(new DOMException('no', 'NotAllowedError')) });
    expect(await shareRoomLink('PIKA42', 'https://pu.test', broken)).toBe('copied');
  });

  it('touch without navigator.share copies, and a rejected clipboard is a failure', async () => {
    expect(await shareRoomLink('PIKA42', 'https://pu.test', env({ touch: true }))).toBe('copied');
    expect(await shareRoomLink('PIKA42', 'https://pu.test', env({ writeText: () => Promise.reject(new Error('denied')) }))).toBe('failed');
  });
});

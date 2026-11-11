import { describe, expect, it } from 'vitest';
import { avatarRefSchema } from './avatar.js';

describe('avatar definitions', () => {
  it('accepts the default and uploaded avatars', () => {
    expect(avatarRefSchema.parse({ type: 'DEFAULT' })).toEqual({ type: 'DEFAULT' });
    const custom = { type: 'CUSTOM', value: '0123456789abcdef0123456789abcdef0123.webp', version: 2 };
    expect(avatarRefSchema.parse(custom)).toEqual(custom);
  });

  it('rejects former preset avatars and unsafe custom filenames', () => {
    expect(avatarRefSchema.safeParse({ type: 'PRESET', value: 'trainer-aqua' }).success).toBe(false);
    expect(avatarRefSchema.safeParse({ type: 'CUSTOM', value: '../avatar.webp', version: 1 }).success).toBe(false);
  });
});

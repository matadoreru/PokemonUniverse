import { describe, expect, it } from 'vitest';
import { AVATAR_PRESETS, avatarPreset, avatarRefSchema, DEFAULT_AVATAR } from './avatar.js';

describe('avatar definitions', () => {
  it('provides a safe default and centrally registered presets', () => {
    expect(avatarRefSchema.parse(DEFAULT_AVATAR)).toEqual({ type: 'DEFAULT' });
    expect(AVATAR_PRESETS).toHaveLength(4);
    for (const preset of AVATAR_PRESETS) expect(avatarPreset(preset.id)).toBe(preset);
  });

  it('rejects unknown presets and unsafe custom filenames', () => {
    expect(avatarRefSchema.safeParse({ type: 'PRESET', value: 'unknown' }).success).toBe(false);
    expect(avatarRefSchema.safeParse({ type: 'CUSTOM', value: '../avatar.webp', version: 1 }).success).toBe(false);
  });
});

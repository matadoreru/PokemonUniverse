import { z } from 'zod';

export const AVATAR_PRESETS = [
  { id: 'trainer-berry', label: 'Entrenador Berry', asset: '/avatars/presets/trainer-berry.webp' },
  { id: 'trainer-aqua', label: 'Entrenadora Aqua', asset: '/avatars/presets/trainer-aqua.webp' },
  { id: 'trainer-electric', label: 'Entrenador Electric', asset: '/avatars/presets/trainer-electric.webp' },
  { id: 'trainer-violet', label: 'Entrenador Violet', asset: '/avatars/presets/trainer-violet.webp' },
] as const;

export type AvatarPresetId = (typeof AVATAR_PRESETS)[number]['id'];
export const avatarPresetIdSchema = z.enum(AVATAR_PRESETS.map((preset) => preset.id) as [AvatarPresetId, ...AvatarPresetId[]]);

export const avatarRefSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('DEFAULT') }).strict(),
  z.object({ type: z.literal('PRESET'), value: avatarPresetIdSchema }).strict(),
  z.object({ type: z.literal('CUSTOM'), value: z.string().regex(/^[0-9a-f-]{36}\.webp$/), version: z.number().int().nonnegative() }).strict(),
]);
export type AvatarRef = z.infer<typeof avatarRefSchema>;
export const DEFAULT_AVATAR: AvatarRef = { type: 'DEFAULT' };

export function avatarPreset(id: string): (typeof AVATAR_PRESETS)[number] | undefined {
  return AVATAR_PRESETS.find((preset) => preset.id === id);
}

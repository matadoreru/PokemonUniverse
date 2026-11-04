import { z } from 'zod';

// Un avatar es la inicial (DEFAULT) o una imagen subida (CUSTOM); los predefinidos ya no existen.
export const avatarRefSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('DEFAULT') }).strict(),
  z.object({ type: z.literal('CUSTOM'), value: z.string().regex(/^[0-9a-f-]{36}\.webp$/), version: z.number().int().nonnegative() }).strict(),
]);
export type AvatarRef = z.infer<typeof avatarRefSchema>;
export const DEFAULT_AVATAR: AvatarRef = { type: 'DEFAULT' };

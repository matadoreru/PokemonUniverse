import { z } from 'zod';
import { avatarPresetIdSchema, type AvatarRef } from './avatar.js';
import { displayNameSchema } from './room.js';

export const userRoleSchema = z.enum(['USER', 'ADMIN']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const registerSchema = z.object({
  username: z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(10).max(128),
});
export const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(128) });
export const guestSchema = z.object({ displayName: displayNameSchema, avatarPresetId: avatarPresetIdSchema.optional() });

export interface AuthUser {
  id: string;
  displayName: string;
  kind: 'USER' | 'GUEST';
  email?: string;
  role?: UserRole;
  avatar: AvatarRef;
}

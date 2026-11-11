import { z } from 'zod';
import type { AvatarRef } from './avatar.js';

export const userRoleSchema = z.enum(['USER', 'ADMIN']);
export type UserRole = z.infer<typeof userRoleSchema>;

export interface AuthUser {
  id: string;
  displayName: string;
  kind: 'USER' | 'GUEST';
  email?: string;
  role?: UserRole;
  avatar: AvatarRef;
}

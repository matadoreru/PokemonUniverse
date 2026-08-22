import { z } from 'zod';
import { displayNameSchema } from './room.js';

export const registerSchema = z.object({
  username: z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(10).max(128),
});
export const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(128) });
export const guestSchema = z.object({ displayName: displayNameSchema });

export interface AuthUser {
  id: string;
  displayName: string;
  kind: 'USER' | 'GUEST';
  email?: string;
}
